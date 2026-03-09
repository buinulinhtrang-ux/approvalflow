-- ============================================================
-- Script 09: Workflow V2 — Parallel Approval + Conditional Branching
--
-- Thêm:
--   1. form_type_code vào workflow_templates (gắn template với 1 loại form)
--   2. branch_conditions vào workflow_steps (mảng điều kiện rẽ nhánh)
--   3. Cập nhật engine: xử lý parallel group + branch conditions
--
-- branch_conditions format (JSONB array):
--   [
--     {
--       "field": "amount",           -- 'amount'|'is_urgent'|'department'|'form_data.xxx'
--       "op": "<",                   -- '<' | '<=' | '>' | '>=' | '=' | '!='
--       "value": 5000000,            -- số, chuỗi, hoặc boolean
--       "action": "SKIP",            -- 'SKIP' | 'GOTO' | 'APPROVE' | 'REJECT'
--       "goto_order": 4,             -- bắt buộc khi action = 'GOTO'
--       "label": "Nhỏ hơn 5 triệu"  -- tùy chọn, chỉ để hiển thị
--     }
--   ]
--
-- Parallel group:
--   - Các bước có cùng parallel_group chạy đồng thời
--   - require_all = TRUE  → phải được tất cả phê duyệt
--   - require_all = FALSE → chỉ cần 1 người phê duyệt là đủ
-- ============================================================


-- ── 1. Thêm cột mới vào bảng hiện có ────────────────────────

ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS form_type_code TEXT REFERENCES form_types(code);

COMMENT ON COLUMN workflow_templates.form_type_code IS
  'Gắn template với 1 loại biểu mẫu — dùng để populate dropdown field khi cấu hình điều kiện';

ALTER TABLE workflow_steps
  ADD COLUMN IF NOT EXISTS branch_conditions JSONB DEFAULT '[]';

COMMENT ON COLUMN workflow_steps.branch_conditions IS
  'Mảng điều kiện rẽ nhánh — đánh giá theo thứ tự; điều kiện khớp đầu tiên được áp dụng.
   Nếu rỗng/null → kiểm tra skip_condition (backward compat).
   Format: [{"field","op","value","action","goto_order?","label?"}]';


-- ── 2. workflow_evaluate_conditions ─────────────────────────
-- Đánh giá mảng branch_conditions, trả về điều kiện khớp đầu tiên.
-- Trả về NULL nếu không có điều kiện nào khớp.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION workflow_evaluate_conditions(
  p_conditions  JSONB,
  p_request     requests
) RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_cond    JSONB;
  v_field   TEXT;
  v_op      TEXT;
  v_value   TEXT;
  v_actual  TEXT;
  v_match   BOOLEAN;
BEGIN
  -- NULL / rỗng → không có điều kiện
  IF p_conditions IS NULL OR jsonb_typeof(p_conditions) != 'array'
     OR jsonb_array_length(p_conditions) = 0 THEN
    RETURN NULL;
  END IF;

  FOR v_cond IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
    v_field  := v_cond->>'field';
    v_op     := v_cond->>'op';
    v_value  := v_cond->>'value';

    -- Lấy giá trị thực từ request
    v_actual := CASE v_field
      WHEN 'amount'     THEN p_request.amount::TEXT
      WHEN 'is_urgent'  THEN p_request.is_urgent::TEXT
      WHEN 'form_type'  THEN p_request.form_type
      WHEN 'department' THEN p_request.department
      ELSE
        CASE WHEN v_field LIKE 'form_data.%'
          THEN p_request.form_data->>(substring(v_field FROM 11))
          ELSE NULL
        END
    END;

    IF v_actual IS NULL THEN
      CONTINUE; -- giá trị không tồn tại → không khớp
    END IF;

    BEGIN
      v_match := CASE v_op
        WHEN '<'  THEN v_actual::NUMERIC <  v_value::NUMERIC
        WHEN '<=' THEN v_actual::NUMERIC <= v_value::NUMERIC
        WHEN '>'  THEN v_actual::NUMERIC >  v_value::NUMERIC
        WHEN '>=' THEN v_actual::NUMERIC >= v_value::NUMERIC
        WHEN '='  THEN lower(v_actual)   =  lower(v_value)
        WHEN '!=' THEN lower(v_actual)   != lower(v_value)
        ELSE false
      END;
    EXCEPTION WHEN OTHERS THEN
      v_match := false;
    END;

    IF v_match THEN
      RETURN v_cond; -- Trả về điều kiện đã khớp
    END IF;
  END LOOP;

  RETURN NULL; -- Không có điều kiện nào khớp
END;
$$;

COMMENT ON FUNCTION workflow_evaluate_conditions IS
  'Đánh giá mảng branch_conditions, trả về điều kiện khớp đầu tiên (JSONB) hoặc NULL';


-- ── 3. workflow_initialize (cập nhật: hỗ trợ branch_conditions + GOTO) ───
CREATE OR REPLACE FUNCTION workflow_initialize(p_request_id BIGINT)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_request       requests%ROWTYPE;
  v_template_id   BIGINT;
  v_step          workflow_steps%ROWTYPE;
  v_condition     JSONB;
  v_first_active  INTEGER := NULL;
  v_jump_to       INTEGER := NULL;  -- GOTO: bỏ qua tất cả bước cho đến step_order này
  v_auto_approve  BOOLEAN := false;
  v_auto_reject   BOOLEAN := false;
  v_actor_name    TEXT;
  v_step_status   TEXT;
BEGIN
  -- ── 1. Load + lock request ────────────────────────────────
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request không tồn tại: %', p_request_id;
  END IF;
  IF v_request.status NOT IN ('PENDING', 'DRAFT') THEN
    RAISE EXCEPTION 'Request % đang ở trạng thái % — không thể khởi tạo lại', p_request_id, v_request.status;
  END IF;

  -- ── 2. Tìm workflow template ──────────────────────────────
  SELECT active_template_id INTO v_template_id FROM form_types WHERE code = v_request.form_type;
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy workflow template cho form_type: %', v_request.form_type;
  END IF;

  -- ── 3. Cập nhật request ───────────────────────────────────
  UPDATE requests
  SET workflow_template_id = v_template_id,
      status               = 'IN_REVIEW',
      current_step_order   = 0,
      updated_at           = now()
  WHERE id = p_request_id;

  -- ── 4. Tạo step instances ─────────────────────────────────
  FOR v_step IN
    SELECT * FROM workflow_steps
    WHERE template_id = v_template_id
    ORDER BY step_order
  LOOP

    -- Nếu đang ở trong vùng GOTO (bỏ qua bước trung gian)
    IF v_jump_to IS NOT NULL AND v_step.step_order < v_jump_to THEN
      INSERT INTO request_step_instances (request_id, step_id, step_order, step_name, status)
      VALUES (p_request_id, v_step.id, v_step.step_order, v_step.step_name, 'SKIPPED');
      CONTINUE;
    END IF;

    -- Đã đến bước GOTO target → reset
    IF v_jump_to IS NOT NULL AND v_step.step_order >= v_jump_to THEN
      v_jump_to := NULL;
    END IF;

    -- Đánh giá branch_conditions (hoặc skip_condition nếu không có branch_conditions)
    v_condition := NULL;
    IF v_step.branch_conditions IS NOT NULL
       AND jsonb_typeof(v_step.branch_conditions) = 'array'
       AND jsonb_array_length(v_step.branch_conditions) > 0 THEN
      -- Dùng branch_conditions mới
      v_condition := workflow_evaluate_conditions(v_step.branch_conditions, v_request);
    ELSIF v_step.skip_condition IS NOT NULL THEN
      -- Backward compat: skip_condition cũ → wrap thành SKIP condition
      IF workflow_evaluate_skip(v_step.skip_condition, v_request) THEN
        v_condition := jsonb_build_object('action', 'SKIP');
      END IF;
    END IF;

    -- Xử lý theo điều kiện khớp
    IF v_condition IS NOT NULL THEN
      CASE v_condition->>'action'

        WHEN 'SKIP' THEN
          v_step_status := 'SKIPPED';

        WHEN 'GOTO' THEN
          -- Bỏ qua bước hiện tại + tất cả bước trung gian đến goto_order
          v_step_status := 'SKIPPED';
          v_jump_to := (v_condition->>'goto_order')::INTEGER;

        WHEN 'APPROVE' THEN
          -- Tự động phê duyệt ngay
          v_step_status   := 'SKIPPED';
          v_auto_approve  := true;

        WHEN 'REJECT' THEN
          -- Tự động từ chối ngay
          v_step_status  := 'SKIPPED';
          v_auto_reject  := true;

        ELSE
          v_step_status := 'PENDING';
      END CASE;
    ELSE
      v_step_status := 'PENDING';
    END IF;

    INSERT INTO request_step_instances (request_id, step_id, step_order, step_name, status)
    VALUES (p_request_id, v_step.id, v_step.step_order, v_step.step_name, v_step_status);

    -- Ghi nhận bước đầu tiên cần xử lý
    IF v_step_status = 'PENDING' AND v_first_active IS NULL AND NOT v_auto_approve AND NOT v_auto_reject THEN
      v_first_active := v_step.step_order;
    END IF;

    -- Nếu đã xác định auto_approve/reject thì thoát vòng lặp
    IF v_auto_approve OR v_auto_reject THEN
      -- Mark tất cả bước còn lại là SKIPPED (sẽ handle bên ngoài)
      -- Không cần INSERT vì loop sẽ CONTINUE một lần nữa
      EXIT;
    END IF;
  END LOOP;

  -- Với auto_approve/reject: các bước chưa insert cần được tạo SKIPPED
  IF v_auto_approve OR v_auto_reject THEN
    -- Insert những bước chưa được tạo (sau EXIT)
    FOR v_step IN
      SELECT ws.* FROM workflow_steps ws
      WHERE ws.template_id = v_template_id
        AND ws.step_order > COALESCE(
          (SELECT MAX(rsi.step_order) FROM request_step_instances rsi WHERE rsi.request_id = p_request_id),
          0
        )
      ORDER BY ws.step_order
    LOOP
      INSERT INTO request_step_instances (request_id, step_id, step_order, step_name, status)
      VALUES (p_request_id, v_step.id, v_step.step_order, v_step.step_name, 'SKIPPED');
    END LOOP;
  END IF;

  -- ── 5. Kích hoạt hoặc tự hoàn thành ─────────────────────
  SELECT name INTO v_actor_name FROM users WHERE id = v_request.requester_id;

  IF v_auto_approve THEN
    UPDATE requests SET status = 'APPROVED', updated_at = now() WHERE id = p_request_id;
    INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
    VALUES (p_request_id, 'COMPLETE', v_request.requester_id, COALESCE(v_actor_name, 'System'),
            '{"auto_approved": true, "reason": "branch_condition_approve"}'::JSONB);

  ELSIF v_auto_reject THEN
    UPDATE requests SET status = 'REJECTED', updated_at = now() WHERE id = p_request_id;
    INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
    VALUES (p_request_id, 'REJECT', v_request.requester_id, COALESCE(v_actor_name, 'System'),
            '{"auto_rejected": true, "reason": "branch_condition_reject"}'::JSONB);

  ELSIF v_first_active IS NOT NULL THEN
    PERFORM workflow_activate_step(p_request_id, v_first_active);

  ELSE
    -- Tất cả bước bị skip → APPROVED
    UPDATE requests SET status = 'APPROVED', updated_at = now() WHERE id = p_request_id;
    INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
    VALUES (p_request_id, 'COMPLETE', v_request.requester_id, COALESCE(v_actor_name, 'System'),
            '{"auto_approved": true, "reason": "all_steps_skipped"}'::JSONB);
  END IF;

END;
$$;

COMMENT ON FUNCTION workflow_initialize IS
  'V2: Khởi tạo luồng phê duyệt với hỗ trợ branch_conditions (SKIP/GOTO/APPROVE/REJECT) và parallel groups';


-- ── 4. workflow_activate_step (cập nhật: kích hoạt parallel siblings) ───
CREATE OR REPLACE FUNCTION workflow_activate_step(
  p_request_id  BIGINT,
  p_step_order  INTEGER
) RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_request       requests%ROWTYPE;
  v_step          workflow_steps%ROWTYPE;
  v_to_id         BIGINT  := NULL;
  v_role          TEXT    := NULL;
  v_deadline      TIMESTAMPTZ;
  v_lookup_id     BIGINT;
  v_sibling_order INTEGER;
BEGIN
  SELECT * INTO v_request FROM requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request không tồn tại: %', p_request_id;
  END IF;

  SELECT ws.* INTO v_step
  FROM workflow_steps ws
  JOIN request_step_instances rsi ON rsi.step_id = ws.id
  WHERE rsi.request_id = p_request_id
    AND rsi.step_order = p_step_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy workflow step cho step_order % của request %', p_step_order, p_request_id;
  END IF;

  -- ── Resolve approver ──────────────────────────────────────
  CASE v_step.approver_type
    WHEN 'FIXED_ROLE' THEN
      v_to_id := NULL;
      v_role  := v_step.approver_value;

    WHEN 'FIXED_USER' THEN
      v_to_id := v_step.approver_value::BIGINT;
      v_role  := NULL;

    WHEN 'DYNAMIC_MANAGER' THEN
      SELECT manager_id INTO v_lookup_id FROM users WHERE id = v_request.requester_id;
      IF v_lookup_id IS NOT NULL THEN
        v_to_id := v_lookup_id;
        v_role  := NULL;
      ELSE
        v_to_id := NULL;
        v_role  := 'MANAGER';
      END IF;

    WHEN 'DYNAMIC_DEPT_HEAD' THEN
      SELECT id INTO v_lookup_id
      FROM users
      WHERE department = v_request.department AND role = 'MANAGER' AND is_active = true
      LIMIT 1;
      IF v_lookup_id IS NOT NULL THEN
        v_to_id := v_lookup_id;
        v_role  := NULL;
      ELSE
        v_to_id := NULL;
        v_role  := 'MANAGER';
      END IF;

    WHEN 'REQUESTER_SELECT' THEN
      v_to_id := NULL;
      v_role  := 'REQUESTER_SELECT';

    ELSE
      v_to_id := NULL;
      v_role  := NULL;
  END CASE;

  -- ── Tính deadline ─────────────────────────────────────────
  v_deadline := now() + MAKE_INTERVAL(hours => CASE
    WHEN v_request.is_urgent THEN GREATEST(1, v_step.deadline_hours / 2)
    ELSE v_step.deadline_hours
  END);

  -- ── Kích hoạt step instance ───────────────────────────────
  UPDATE request_step_instances
  SET
    status         = 'IN_PROGRESS',
    assigned_to_id = v_to_id,
    assigned_role  = v_role,
    assigned_at    = now(),
    deadline_at    = v_deadline
  WHERE request_id = p_request_id
    AND step_order = p_step_order
    AND status     = 'PENDING';

  -- Không raise exception nếu không tìm thấy (idempotent — có thể đã được activate bởi parallel sibling)
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- ── Cập nhật current_step_order ───────────────────────────
  UPDATE requests
  SET current_step_order = GREATEST(current_step_order, p_step_order),
      updated_at         = now()
  WHERE id = p_request_id;

  -- ── Kích hoạt các bước song song cùng parallel_group ─────
  IF v_step.parallel_group IS NOT NULL THEN
    FOR v_sibling_order IN
      SELECT DISTINCT rsi.step_order
      FROM request_step_instances rsi
      JOIN workflow_steps ws ON ws.id = rsi.step_id
      WHERE rsi.request_id = p_request_id
        AND ws.parallel_group = v_step.parallel_group
        AND rsi.status = 'PENDING'
        AND rsi.step_order != p_step_order
    LOOP
      PERFORM workflow_activate_step(p_request_id, v_sibling_order);
    END LOOP;
  END IF;

END;
$$;

COMMENT ON FUNCTION workflow_activate_step IS
  'V2: Kích hoạt bước workflow (PENDING → IN_PROGRESS), resolve approver, kích hoạt parallel siblings';


-- ── 5. approve_step (cập nhật: hỗ trợ parallel group completion) ────────
CREATE OR REPLACE FUNCTION approve_step(
  p_step_instance_id  BIGINT,
  p_approver_id       BIGINT,
  p_action            TEXT,
  p_comment           TEXT DEFAULT NULL
) RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_inst              request_step_instances%ROWTYPE;
  v_request           requests%ROWTYPE;
  v_step              workflow_steps%ROWTYPE;
  v_approver          users%ROWTYPE;
  v_is_delegated      BOOLEAN   := false;
  v_next_order        INTEGER;
  v_prev_inst_id      BIGINT;
  v_prev_order        INTEGER;
  v_parallel_pending  INTEGER   := 0;
  v_max_parallel_ord  INTEGER;
BEGIN
  -- ── 1. Load và lock step instance ─────────────────────────
  SELECT * INTO v_inst FROM request_step_instances WHERE id = p_step_instance_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step instance không tồn tại: %', p_step_instance_id;
  END IF;
  IF v_inst.status != 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Bước này không ở trạng thái IN_PROGRESS (hiện tại: %)', v_inst.status;
  END IF;
  IF p_action NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Action không hợp lệ: %. Phải là APPROVED hoặc REJECTED', p_action;
  END IF;

  -- ── 2. Load request, step, approver ───────────────────────
  SELECT * INTO v_request  FROM requests       WHERE id = v_inst.request_id  FOR UPDATE;
  SELECT * INTO v_step     FROM workflow_steps WHERE id = v_inst.step_id;
  SELECT * INTO v_approver FROM users          WHERE id = p_approver_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approver không tồn tại: %', p_approver_id;
  END IF;
  IF NOT v_approver.is_active THEN
    RAISE EXCEPTION 'Tài khoản người duyệt đã bị vô hiệu hoá';
  END IF;

  -- ── 3. Kiểm tra quyền phê duyệt ───────────────────────────
  IF v_inst.assigned_to_id IS NOT NULL THEN
    IF v_inst.assigned_to_id != p_approver_id THEN
      IF EXISTS (
        SELECT 1 FROM delegations d
        WHERE d.delegator_id = v_inst.assigned_to_id
          AND d.delegatee_id = p_approver_id
          AND d.is_active    = true
          AND now() BETWEEN d.valid_from AND d.valid_until
          AND (d.scope_form_types IS NULL OR v_request.form_type = ANY(d.scope_form_types))
          AND (d.max_amount IS NULL OR v_request.amount <= d.max_amount)
      ) THEN
        v_is_delegated := true;
      ELSE
        RAISE EXCEPTION 'Bạn (user_id=%) không có quyền phê duyệt bước này (assigned_to=%)',
                        p_approver_id, v_inst.assigned_to_id;
      END IF;
    END IF;
  ELSIF v_inst.assigned_role IS NOT NULL AND v_inst.assigned_role != 'REQUESTER_SELECT' THEN
    IF v_approver.role != v_inst.assigned_role THEN
      RAISE EXCEPTION 'Bạn cần có role % để phê duyệt bước này (role hiện tại: %)',
                      v_inst.assigned_role, v_approver.role;
    END IF;
  END IF;

  -- ── 4. Cập nhật step instance ──────────────────────────────
  UPDATE request_step_instances
  SET status = p_action, acted_at = now(), acted_by_id = p_approver_id,
      comment = p_comment, is_delegated = v_is_delegated
  WHERE id = p_step_instance_id;

  -- ── 5. Ghi audit log ──────────────────────────────────────
  INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, target_id, new_value)
  VALUES (
    v_request.id,
    CASE p_action WHEN 'APPROVED' THEN 'APPROVE' ELSE 'REJECT' END,
    p_approver_id, v_approver.name, p_step_instance_id,
    jsonb_build_object('step_order', v_inst.step_order, 'step_name', v_inst.step_name,
                       'comment', p_comment, 'is_delegated', v_is_delegated,
                       'parallel_group', v_step.parallel_group)
  );

  -- ── 6. Xử lý tiếp theo ─────────────────────────────────────

  IF p_action = 'APPROVED' THEN

    -- ── Kiểm tra parallel group ──────────────────────────────
    IF v_step.parallel_group IS NOT NULL THEN

      IF v_step.require_all THEN
        -- Cần tất cả: kiểm tra còn bước nào IN_PROGRESS trong cùng group không
        SELECT COUNT(*) INTO v_parallel_pending
        FROM request_step_instances rsi
        JOIN workflow_steps ws ON ws.id = rsi.step_id
        WHERE rsi.request_id = v_request.id
          AND ws.parallel_group = v_step.parallel_group
          AND rsi.status = 'IN_PROGRESS'
          AND rsi.id != p_step_instance_id;

        IF v_parallel_pending > 0 THEN
          RETURN; -- Còn approver khác trong group chưa xử lý
        END IF;
      ELSE
        -- Chỉ cần 1: hủy các bước còn lại trong group
        UPDATE request_step_instances
        SET status = 'CANCELLED'
        FROM workflow_steps ws
        WHERE request_step_instances.step_id = ws.id
          AND request_step_instances.request_id = v_request.id
          AND ws.parallel_group = v_step.parallel_group
          AND request_step_instances.status = 'IN_PROGRESS'
          AND request_step_instances.id != p_step_instance_id;
      END IF;

      -- Tìm bước tiếp theo sau toàn bộ parallel group
      SELECT MAX(rsi.step_order) INTO v_max_parallel_ord
      FROM request_step_instances rsi
      JOIN workflow_steps ws ON ws.id = rsi.step_id
      WHERE rsi.request_id = v_request.id
        AND ws.parallel_group = v_step.parallel_group;

      SELECT MIN(rsi.step_order) INTO v_next_order
      FROM request_step_instances rsi
      JOIN workflow_steps ws ON ws.id = rsi.step_id
      WHERE rsi.request_id = v_request.id
        AND rsi.status = 'PENDING'
        AND rsi.step_order > v_max_parallel_ord
        AND (ws.parallel_group IS NULL OR ws.parallel_group != v_step.parallel_group);

    ELSE
      -- Sequential: tìm bước PENDING tiếp theo
      SELECT step_order INTO v_next_order
      FROM request_step_instances
      WHERE request_id = v_request.id
        AND step_order > v_inst.step_order
        AND status = 'PENDING'
      ORDER BY step_order
      LIMIT 1;
    END IF;

    IF v_next_order IS NOT NULL THEN
      PERFORM workflow_activate_step(v_request.id, v_next_order);
    ELSE
      -- Tất cả xong → APPROVED
      UPDATE requests SET status = 'APPROVED', updated_at = now() WHERE id = v_request.id;
      INSERT INTO audit_log (request_id, event_type, actor_id, actor_name)
      VALUES (v_request.id, 'COMPLETE', p_approver_id, v_approver.name);
    END IF;

  ELSIF p_action = 'REJECTED' THEN

    CASE v_step.on_reject

      WHEN 'RETURN_REQUESTER' THEN
        UPDATE requests SET status = 'REJECTED', updated_at = now() WHERE id = v_request.id;
        UPDATE request_step_instances SET status = 'CANCELLED'
        WHERE request_id = v_request.id AND status IN ('PENDING', 'IN_PROGRESS') AND id != p_step_instance_id;
        INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
        VALUES (v_request.id, 'REJECT', p_approver_id, v_approver.name,
                jsonb_build_object('on_reject', 'RETURN_REQUESTER', 'step', v_inst.step_name));

      WHEN 'CANCEL_REQUEST' THEN
        UPDATE requests SET status = 'CANCELLED', cancelled_at = now(),
                            cancelled_reason = 'Từ chối tại bước: ' || v_inst.step_name,
                            updated_at = now()
        WHERE id = v_request.id;
        UPDATE request_step_instances SET status = 'CANCELLED'
        WHERE request_id = v_request.id AND status IN ('PENDING', 'IN_PROGRESS') AND id != p_step_instance_id;
        INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
        VALUES (v_request.id, 'CANCEL', p_approver_id, v_approver.name,
                jsonb_build_object('on_reject', 'CANCEL_REQUEST', 'step', v_inst.step_name));

      WHEN 'RETURN_PREV_STEP' THEN
        SELECT id, step_order INTO v_prev_inst_id, v_prev_order
        FROM request_step_instances
        WHERE request_id = v_request.id AND step_order < v_inst.step_order AND status = 'APPROVED'
        ORDER BY step_order DESC LIMIT 1;

        IF v_prev_inst_id IS NOT NULL THEN
          UPDATE request_step_instances
          SET status = 'PENDING', acted_at = NULL, acted_by_id = NULL,
              comment = NULL, assigned_at = NULL, deadline_at = NULL
          WHERE id = v_prev_inst_id;
          PERFORM workflow_activate_step(v_request.id, v_prev_order);
          INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
          VALUES (v_request.id, 'REJECT', p_approver_id, v_approver.name,
                  jsonb_build_object('on_reject', 'RETURN_PREV_STEP',
                                     'from_step', v_inst.step_name, 'return_to_step', v_prev_order));
        ELSE
          UPDATE requests SET status = 'REJECTED', updated_at = now() WHERE id = v_request.id;
          UPDATE request_step_instances SET status = 'CANCELLED'
          WHERE request_id = v_request.id AND status IN ('PENDING', 'IN_PROGRESS') AND id != p_step_instance_id;
          INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
          VALUES (v_request.id, 'REJECT', p_approver_id, v_approver.name,
                  jsonb_build_object('on_reject', 'RETURN_PREV_STEP', 'fallback', 'no previous step'));
        END IF;

      ELSE
        UPDATE requests SET status = 'REJECTED', updated_at = now() WHERE id = v_request.id;
        UPDATE request_step_instances SET status = 'CANCELLED'
        WHERE request_id = v_request.id AND status IN ('PENDING', 'IN_PROGRESS') AND id != p_step_instance_id;
    END CASE;

  END IF;

END;
$$;

COMMENT ON FUNCTION approve_step IS
  'V2: Core approval engine — xử lý phê duyệt/từ chối với hỗ trợ parallel group và branch conditions';


-- ── 6. admin_save_template (cập nhật: lưu branch_conditions + form_type_code) ─
CREATE OR REPLACE FUNCTION admin_save_template(
  p_template  JSONB,
  p_steps     JSONB
) RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_template_id   BIGINT;
  v_step          JSONB;
  v_sort          INTEGER := 0;
  v_has_active    BOOLEAN := false;
  v_result        JSONB;
BEGIN
  IF NULLIF(trim(p_template->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Tên workflow template không được để trống';
  END IF;
  IF p_steps IS NULL OR jsonb_typeof(p_steps) != 'array' OR jsonb_array_length(p_steps) = 0 THEN
    RAISE EXCEPTION 'Workflow template phải có ít nhất 1 bước';
  END IF;

  -- ── Tạo mới hoặc update template ─────────────────────────
  IF (p_template->>'id') IS NOT NULL AND (p_template->>'id')::BIGINT > 0 THEN
    v_template_id := (p_template->>'id')::BIGINT;
    IF NOT EXISTS (SELECT 1 FROM workflow_templates WHERE id = v_template_id) THEN
      RAISE EXCEPTION 'Workflow template không tồn tại: %', v_template_id;
    END IF;

    UPDATE workflow_templates
    SET name           = trim(p_template->>'name'),
        description    = NULLIF(trim(p_template->>'description'), ''),
        form_type_code = NULLIF(trim(p_template->>'form_type_code'), ''),
        updated_at     = now()
    WHERE id = v_template_id;

    SELECT EXISTS (
      SELECT 1 FROM requests r
      WHERE r.workflow_template_id = v_template_id AND r.status IN ('PENDING', 'IN_REVIEW')
    ) INTO v_has_active;

    IF v_has_active THEN
      RETURN jsonb_build_object(
        'id', v_template_id,
        'warning', 'Template đang được dùng trong yêu cầu đang xử lý — chỉ cập nhật tên và mô tả. Tạo template mới để thay đổi cấu hình bước.'
      );
    END IF;

    DELETE FROM workflow_steps WHERE template_id = v_template_id;

  ELSE
    INSERT INTO workflow_templates (name, description, form_type_code)
    VALUES (
      trim(p_template->>'name'),
      NULLIF(trim(p_template->>'description'), ''),
      NULLIF(trim(p_template->>'form_type_code'), '')
    )
    RETURNING id INTO v_template_id;
  END IF;

  -- ── Insert steps mới ───────────────────────────────────────
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    v_sort := v_sort + 1;

    IF (v_step->>'approver_type') NOT IN (
      'FIXED_ROLE', 'FIXED_USER', 'DYNAMIC_MANAGER', 'DYNAMIC_DEPT_HEAD', 'REQUESTER_SELECT'
    ) THEN
      RAISE EXCEPTION 'approver_type không hợp lệ: % (bước %)', v_step->>'approver_type', v_sort;
    END IF;

    IF (v_step->>'approver_type') IN ('FIXED_ROLE', 'FIXED_USER')
       AND NULLIF(trim(v_step->>'approver_value'), '') IS NULL THEN
      RAISE EXCEPTION 'approver_value bắt buộc khi approver_type là % (bước %)', v_step->>'approver_type', v_sort;
    END IF;

    INSERT INTO workflow_steps (
      template_id, step_order, step_name,
      approver_type, approver_value,
      parallel_group, require_all,
      deadline_hours, reminder_hours,
      on_timeout, escalate_to_role,
      skip_condition, branch_conditions,
      on_reject
    ) VALUES (
      v_template_id,
      COALESCE((v_step->>'step_order')::INTEGER, v_sort),
      COALESCE(NULLIF(trim(v_step->>'step_name'), ''), 'Bước ' || v_sort),
      v_step->>'approver_type',
      NULLIF(trim(v_step->>'approver_value'), ''),
      NULLIF(v_step->>'parallel_group', '')::INTEGER,
      COALESCE((v_step->>'require_all')::BOOLEAN, true),
      COALESCE((v_step->>'deadline_hours')::INTEGER, 48),
      NULLIF(v_step->>'reminder_hours', '')::INTEGER,
      COALESCE(NULLIF(v_step->>'on_timeout', ''), 'ESCALATE'),
      NULLIF(trim(v_step->>'escalate_to_role'), ''),
      CASE
        WHEN v_step->'skip_condition' IS NOT NULL AND v_step->>'skip_condition' != 'null'
        THEN v_step->'skip_condition' ELSE NULL
      END,
      CASE
        WHEN v_step->'branch_conditions' IS NOT NULL
          AND jsonb_typeof(v_step->'branch_conditions') = 'array'
        THEN v_step->'branch_conditions'
        ELSE '[]'::JSONB
      END,
      COALESCE(NULLIF(v_step->>'on_reject', ''), 'RETURN_REQUESTER')
    );
  END LOOP;

  RETURN jsonb_build_object('id', v_template_id);
END;
$$;

COMMENT ON FUNCTION admin_save_template IS
  'V2: Admin — tạo/cập nhật workflow template với branch_conditions và form_type_code';


-- ── 7. admin_get_all_templates (cập nhật: trả về form_type_code) ─────────
-- Phải DROP trước vì return type thay đổi (thêm cột form_type_code)
DROP FUNCTION IF EXISTS admin_get_all_templates();

CREATE OR REPLACE FUNCTION admin_get_all_templates()
RETURNS TABLE (
  id             BIGINT,
  name           TEXT,
  description    TEXT,
  form_type_code TEXT,
  is_active      BOOLEAN,
  step_count     BIGINT
)
SECURITY DEFINER
LANGUAGE sql AS $$
  SELECT
    t.id,
    t.name,
    t.description,
    t.form_type_code,
    t.is_active,
    COUNT(s.id) AS step_count
  FROM workflow_templates t
  LEFT JOIN workflow_steps s ON s.template_id = t.id
  GROUP BY t.id, t.name, t.description, t.form_type_code, t.is_active
  ORDER BY t.id;
$$;
