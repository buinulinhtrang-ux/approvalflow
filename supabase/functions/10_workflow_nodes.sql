-- ============================================================
-- Script 10: Workflow Node Editor — Visual Graph + Branch Routing
--
-- Thêm:
--   1. nodes JSONB vào workflow_templates — lưu đồ thị trực quan
--   2. Cập nhật workflow_evaluate_conditions — hỗ trợ condition_groups (AND/OR)
--   3. Cập nhật workflow_initialize — __GATEWAY__ sentinel auto-skip
--   4. Cập nhật admin_save_template — thêm tham số p_nodes
--   5. Cập nhật admin_get_all_templates — trả về nodes
--
-- condition_groups format (mới):
--   {
--     "condition_groups": [          ← OR between groups
--       { "conditions": [            ← AND within group
--           { "field":"amount", "op":">=", "value":1000000 }
--       ]}
--     ],
--     "action": "GOTO",
--     "goto_order": 3,
--     "label": "Giá trị cao"
--   }
--
-- Empty condition_groups = always match (nhánh mặc định)
-- __GATEWAY__ = bước ảo để định tuyến nhánh, tự SKIPPED
-- ============================================================


-- ── 1. Thêm cột nodes vào workflow_templates ─────────────────

ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS nodes JSONB DEFAULT NULL;

COMMENT ON COLUMN workflow_templates.nodes IS
  'V3 Node Editor: Đồ thị trực quan của workflow — nguồn chân lý cho giao diện.
   Flat workflow_steps được tạo tự động từ đây khi lưu.
   NULL = template cũ (dùng form-based editor).
   Format: { "nodes": [ ApproverNode | BranchNode, ... ] }';


-- ── 2. workflow_evaluate_conditions — hỗ trợ condition_groups ─
-- Backward compatible: vẫn nhận format cũ { field, op, value, action }
-- Format mới: { condition_groups: [{conditions:[...]}], action, goto_order?, label? }
-- Always-match: condition_groups rỗng HOẶC không có trường field (cũ)
CREATE OR REPLACE FUNCTION workflow_evaluate_conditions(
  p_conditions  JSONB,
  p_request     requests
) RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_cond       JSONB;
  v_field      TEXT;
  v_op         TEXT;
  v_value      TEXT;
  v_actual     TEXT;
  v_match      BOOLEAN;
  -- For condition_groups format
  v_group      JSONB;
  v_citem      JSONB;
  v_grp_match  BOOLEAN;
  v_any_group  BOOLEAN;
BEGIN
  IF p_conditions IS NULL
     OR jsonb_typeof(p_conditions) != 'array'
     OR jsonb_array_length(p_conditions) = 0
  THEN
    RETURN NULL;
  END IF;

  FOR v_cond IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP

    -- ── Format mới: có key condition_groups ──────────────────
    IF v_cond ? 'condition_groups' THEN

      -- Empty condition_groups = always match (nhánh mặc định)
      IF jsonb_array_length(COALESCE(v_cond->'condition_groups', '[]'::JSONB)) = 0 THEN
        RETURN v_cond;
      END IF;

      -- OR between groups
      v_any_group := false;
      FOR v_group IN SELECT * FROM jsonb_array_elements(v_cond->'condition_groups') LOOP

        -- AND within group
        v_grp_match := true;
        FOR v_citem IN SELECT * FROM jsonb_array_elements(v_group->'conditions') LOOP
          v_field  := v_citem->>'field';
          v_op     := v_citem->>'op';
          v_value  := v_citem->>'value';

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
            v_grp_match := false;
            EXIT;
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

          IF NOT v_match THEN
            v_grp_match := false;
            EXIT;
          END IF;
        END LOOP;

        IF v_grp_match THEN
          v_any_group := true;
          EXIT;
        END IF;
      END LOOP;

      IF v_any_group THEN
        RETURN v_cond;
      END IF;

    -- ── Format cũ: có key field ───────────────────────────────
    ELSE
      v_field := v_cond->>'field';

      -- No field = always match (old-format default)
      IF v_field IS NULL OR v_field = '' THEN
        RETURN v_cond;
      END IF;

      v_op    := v_cond->>'op';
      v_value := v_cond->>'value';

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
        CONTINUE;
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
        RETURN v_cond;
      END IF;
    END IF;

  END LOOP;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION workflow_evaluate_conditions IS
  'V3: Đánh giá branch_conditions — hỗ trợ cả format cũ (field/op/value) và format mới
   (condition_groups với AND trong group, OR giữa các group).
   Empty condition_groups = always match (nhánh mặc định).';


-- ── 3. workflow_initialize — xử lý __GATEWAY__ sentinel ──────
-- Thêm safety net: nếu bước __GATEWAY__ không match điều kiện nào
-- (không thể xảy ra nếu luôn có điều kiện mặc định) → force SKIP
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
  v_jump_to       INTEGER := NULL;
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
    RAISE EXCEPTION 'Request % đang ở trạng thái % — không thể khởi tạo lại',
                    p_request_id, v_request.status;
  END IF;

  -- ── 2. Tìm workflow template ──────────────────────────────
  SELECT active_template_id INTO v_template_id
  FROM form_types WHERE code = v_request.form_type;
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

    -- Nếu đang trong vùng GOTO
    IF v_jump_to IS NOT NULL AND v_step.step_order < v_jump_to THEN
      INSERT INTO request_step_instances (request_id, step_id, step_order, step_name, status)
      VALUES (p_request_id, v_step.id, v_step.step_order, v_step.step_name, 'SKIPPED');
      CONTINUE;
    END IF;

    IF v_jump_to IS NOT NULL AND v_step.step_order >= v_jump_to THEN
      v_jump_to := NULL;
    END IF;

    -- Đánh giá branch_conditions
    v_condition := NULL;
    IF v_step.branch_conditions IS NOT NULL
       AND jsonb_typeof(v_step.branch_conditions) = 'array'
       AND jsonb_array_length(v_step.branch_conditions) > 0
    THEN
      v_condition := workflow_evaluate_conditions(v_step.branch_conditions, v_request);
    ELSIF v_step.skip_condition IS NOT NULL THEN
      IF workflow_evaluate_skip(v_step.skip_condition, v_request) THEN
        v_condition := jsonb_build_object('action', 'SKIP');
      END IF;
    END IF;

    -- Xử lý theo kết quả
    IF v_condition IS NOT NULL THEN
      CASE v_condition->>'action'
        WHEN 'SKIP' THEN
          v_step_status := 'SKIPPED';
        WHEN 'GOTO' THEN
          v_step_status := 'SKIPPED';
          v_jump_to := (v_condition->>'goto_order')::INTEGER;
        WHEN 'APPROVE' THEN
          v_step_status  := 'SKIPPED';
          v_auto_approve := true;
        WHEN 'REJECT' THEN
          v_step_status := 'SKIPPED';
          v_auto_reject := true;
        ELSE
          v_step_status := 'PENDING';
      END CASE;
    ELSE
      v_step_status := 'PENDING';
    END IF;

    -- Safety net: __GATEWAY__ không bao giờ được ở trạng thái PENDING
    IF v_step.approver_value = '__GATEWAY__' AND v_step_status = 'PENDING' THEN
      v_step_status := 'SKIPPED';
    END IF;

    INSERT INTO request_step_instances (request_id, step_id, step_order, step_name, status)
    VALUES (p_request_id, v_step.id, v_step.step_order, v_step.step_name, v_step_status);

    IF v_step_status = 'PENDING' AND v_first_active IS NULL
       AND NOT v_auto_approve AND NOT v_auto_reject
    THEN
      v_first_active := v_step.step_order;
    END IF;

    IF v_auto_approve OR v_auto_reject THEN
      EXIT;
    END IF;
  END LOOP;

  -- Với auto_approve/reject: insert các bước còn lại là SKIPPED
  IF v_auto_approve OR v_auto_reject THEN
    FOR v_step IN
      SELECT ws.* FROM workflow_steps ws
      WHERE ws.template_id = v_template_id
        AND ws.step_order > COALESCE(
          (SELECT MAX(rsi.step_order) FROM request_step_instances rsi
           WHERE rsi.request_id = p_request_id), 0)
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
            '{"auto_approved":true,"reason":"branch_condition_approve"}'::JSONB);

  ELSIF v_auto_reject THEN
    UPDATE requests SET status = 'REJECTED', updated_at = now() WHERE id = p_request_id;
    INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
    VALUES (p_request_id, 'REJECT', v_request.requester_id, COALESCE(v_actor_name, 'System'),
            '{"auto_rejected":true,"reason":"branch_condition_reject"}'::JSONB);

  ELSIF v_first_active IS NOT NULL THEN
    PERFORM workflow_activate_step(p_request_id, v_first_active);

  ELSE
    UPDATE requests SET status = 'APPROVED', updated_at = now() WHERE id = p_request_id;
    INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
    VALUES (p_request_id, 'COMPLETE', v_request.requester_id, COALESCE(v_actor_name, 'System'),
            '{"auto_approved":true,"reason":"all_steps_skipped"}'::JSONB);
  END IF;

END;
$$;

COMMENT ON FUNCTION workflow_initialize IS
  'V3: Khởi tạo workflow — hỗ trợ condition_groups (AND/OR) và __GATEWAY__ sentinel';


-- ── 4. admin_save_template — thêm p_nodes ────────────────────
-- Phải DROP vì thay đổi số tham số
DROP FUNCTION IF EXISTS admin_save_template(JSONB, JSONB);

CREATE OR REPLACE FUNCTION admin_save_template(
  p_template  JSONB,
  p_steps     JSONB,
  p_nodes     JSONB DEFAULT NULL
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

  -- ── Tạo mới hoặc update ───────────────────────────────────
  IF (p_template->>'id') IS NOT NULL AND (p_template->>'id')::BIGINT > 0 THEN
    v_template_id := (p_template->>'id')::BIGINT;
    IF NOT EXISTS (SELECT 1 FROM workflow_templates WHERE id = v_template_id) THEN
      RAISE EXCEPTION 'Workflow template không tồn tại: %', v_template_id;
    END IF;

    UPDATE workflow_templates
    SET name           = trim(p_template->>'name'),
        description    = NULLIF(trim(p_template->>'description'), ''),
        form_type_code = NULLIF(trim(p_template->>'form_type_code'), ''),
        nodes          = p_nodes,
        updated_at     = now()
    WHERE id = v_template_id;

    SELECT EXISTS (
      SELECT 1 FROM requests r
      WHERE r.workflow_template_id = v_template_id
        AND r.status IN ('PENDING', 'IN_REVIEW')
    ) INTO v_has_active;

    IF v_has_active THEN
      RETURN jsonb_build_object(
        'id', v_template_id,
        'warning', 'Template đang được dùng trong yêu cầu đang xử lý — chỉ cập nhật tên và mô tả. Tạo template mới để thay đổi cấu hình bước.'
      );
    END IF;

    DELETE FROM workflow_steps WHERE template_id = v_template_id;
  ELSE
    INSERT INTO workflow_templates (name, description, form_type_code, nodes)
    VALUES (
      trim(p_template->>'name'),
      NULLIF(trim(p_template->>'description'), ''),
      NULLIF(trim(p_template->>'form_type_code'), ''),
      p_nodes
    )
    RETURNING id INTO v_template_id;
  END IF;

  -- ── Insert steps ──────────────────────────────────────────
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps) LOOP
    v_sort := v_sort + 1;

    -- Bước __GATEWAY__ bỏ qua validation approver_type bình thường
    IF (v_step->>'approver_value') != '__GATEWAY__' THEN
      IF (v_step->>'approver_type') NOT IN (
        'FIXED_ROLE', 'FIXED_USER', 'DYNAMIC_MANAGER', 'DYNAMIC_DEPT_HEAD', 'REQUESTER_SELECT'
      ) THEN
        RAISE EXCEPTION 'approver_type không hợp lệ: % (bước %)', v_step->>'approver_type', v_sort;
      END IF;

      IF (v_step->>'approver_type') IN ('FIXED_ROLE', 'FIXED_USER')
         AND (v_step->>'approver_value') != '__GATEWAY__'
         AND NULLIF(trim(v_step->>'approver_value'), '') IS NULL
      THEN
        RAISE EXCEPTION 'approver_value bắt buộc khi approver_type là % (bước %)',
                        v_step->>'approver_type', v_sort;
      END IF;
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
        WHEN v_step->'skip_condition' IS NOT NULL
          AND v_step->>'skip_condition' != 'null'
        THEN v_step->'skip_condition'
        ELSE NULL
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
  'V3: Lưu workflow template với hỗ trợ nodes JSONB và __GATEWAY__ steps';


-- ── 5. admin_get_all_templates — trả về nodes ────────────────
DROP FUNCTION IF EXISTS admin_get_all_templates();

CREATE OR REPLACE FUNCTION admin_get_all_templates()
RETURNS TABLE (
  id             BIGINT,
  name           TEXT,
  description    TEXT,
  form_type_code TEXT,
  is_active      BOOLEAN,
  step_count     BIGINT,
  nodes          JSONB
)
SECURITY DEFINER
LANGUAGE sql AS $$
  SELECT
    t.id,
    t.name,
    t.description,
    t.form_type_code,
    t.is_active,
    COUNT(s.id)  AS step_count,
    t.nodes
  FROM workflow_templates t
  LEFT JOIN workflow_steps s ON s.template_id = t.id
  GROUP BY t.id, t.name, t.description, t.form_type_code, t.is_active, t.nodes
  ORDER BY t.id;
$$;

COMMENT ON FUNCTION admin_get_all_templates IS
  'V3: Admin — danh sách templates bao gồm nodes JSONB cho visual editor';
