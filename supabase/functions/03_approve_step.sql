-- ============================================================
-- Phase 2 — Script 03: approve_step — Core Approval Engine
-- Chạy SAU 02_workflow_initialize.sql
--
-- approve_step(step_instance_id, approver_id, action, comment):
--   1. Validate: step phải IN_PROGRESS, approver phải có quyền
--   2. Cập nhật step instance
--   3. Ghi audit log
--   4. APPROVED → tìm bước tiếp theo hoặc đánh dấu request APPROVED
--   5. REJECTED → xử lý theo on_reject (RETURN_REQUESTER / CANCEL_REQUEST / RETURN_PREV_STEP)
-- ============================================================


CREATE OR REPLACE FUNCTION approve_step(
  p_step_instance_id  BIGINT,
  p_approver_id       BIGINT,
  p_action            TEXT,           -- 'APPROVED' hoặc 'REJECTED'
  p_comment           TEXT DEFAULT NULL
) RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_inst            request_step_instances%ROWTYPE;
  v_request         requests%ROWTYPE;
  v_step            workflow_steps%ROWTYPE;
  v_approver        users%ROWTYPE;
  v_is_delegated    BOOLEAN   := false;
  v_next_order      INTEGER;
  v_prev_inst_id    BIGINT;
  v_prev_order      INTEGER;
BEGIN
  -- ── 1. Load và lock step instance ─────────────────────────
  SELECT * INTO v_inst
  FROM request_step_instances
  WHERE id = p_step_instance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step instance không tồn tại: %', p_step_instance_id;
  END IF;

  IF v_inst.status != 'IN_PROGRESS' THEN
    RAISE EXCEPTION 'Bước này không ở trạng thái IN_PROGRESS (hiện tại: %)',
                    v_inst.status;
  END IF;

  -- Validate action
  IF p_action NOT IN ('APPROVED', 'REJECTED') THEN
    RAISE EXCEPTION 'Action không hợp lệ: %. Phải là APPROVED hoặc REJECTED', p_action;
  END IF;

  -- ── 2. Load request và workflow step ──────────────────────
  SELECT * INTO v_request FROM requests WHERE id = v_inst.request_id FOR UPDATE;
  SELECT * INTO v_step    FROM workflow_steps WHERE id = v_inst.step_id;
  SELECT * INTO v_approver FROM users WHERE id = p_approver_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approver không tồn tại: %', p_approver_id;
  END IF;

  IF NOT v_approver.is_active THEN
    RAISE EXCEPTION 'Tài khoản người duyệt đã bị vô hiệu hoá';
  END IF;

  -- ── 3. Kiểm tra quyền phê duyệt ───────────────────────────
  IF v_inst.assigned_to_id IS NOT NULL THEN
    -- Bước assign cho user cụ thể
    IF v_inst.assigned_to_id != p_approver_id THEN
      -- Kiểm tra ủy quyền: delegator → delegatee
      IF EXISTS (
        SELECT 1 FROM delegations d
        WHERE d.delegator_id  = v_inst.assigned_to_id
          AND d.delegatee_id  = p_approver_id
          AND d.is_active     = true
          AND now() BETWEEN d.valid_from AND d.valid_until
          AND (d.scope_form_types IS NULL
               OR v_request.form_type = ANY(d.scope_form_types))
          AND (d.max_amount IS NULL
               OR v_request.amount <= d.max_amount)
      ) THEN
        v_is_delegated := true;
      ELSE
        RAISE EXCEPTION 'Bạn (user_id=%) không có quyền phê duyệt bước này (assigned_to=%)',
                        p_approver_id, v_inst.assigned_to_id;
      END IF;
    END IF;

  ELSIF v_inst.assigned_role IS NOT NULL AND v_inst.assigned_role != 'REQUESTER_SELECT' THEN
    -- Bước assign theo role — kiểm tra user có đúng role không
    IF v_approver.role != v_inst.assigned_role THEN
      RAISE EXCEPTION 'Bạn cần có role % để phê duyệt bước này (role hiện tại: %)',
                      v_inst.assigned_role, v_approver.role;
    END IF;
  END IF;

  -- ── 4. Cập nhật step instance ──────────────────────────────
  UPDATE request_step_instances
  SET
    status       = p_action,
    acted_at     = now(),
    acted_by_id  = p_approver_id,
    comment      = p_comment,
    is_delegated = v_is_delegated
  WHERE id = p_step_instance_id;

  -- ── 5. Ghi audit log ──────────────────────────────────────
  INSERT INTO audit_log (
    request_id, event_type, actor_id, actor_name,
    target_id, new_value
  ) VALUES (
    v_request.id,
    CASE p_action WHEN 'APPROVED' THEN 'APPROVE' ELSE 'REJECT' END,
    p_approver_id,
    v_approver.name,
    p_step_instance_id,
    jsonb_build_object(
      'step_order',    v_inst.step_order,
      'step_name',     v_inst.step_name,
      'comment',       p_comment,
      'is_delegated',  v_is_delegated
    )
  );

  -- ── 6. Xử lý tiếp theo dựa vào action ──────────────────────

  IF p_action = 'APPROVED' THEN
    -- Tìm bước PENDING tiếp theo (bước SKIPPED đã được lọc ra từ đầu)
    SELECT step_order INTO v_next_order
    FROM request_step_instances
    WHERE request_id = v_request.id
      AND step_order > v_inst.step_order
      AND status     = 'PENDING'
    ORDER BY step_order
    LIMIT 1;

    IF v_next_order IS NOT NULL THEN
      -- Còn bước tiếp → activate
      PERFORM workflow_activate_step(v_request.id, v_next_order);
    ELSE
      -- Tất cả bước đã xong → APPROVED hoàn toàn
      UPDATE requests
      SET status     = 'APPROVED',
          updated_at = now()
      WHERE id = v_request.id;

      INSERT INTO audit_log (request_id, event_type, actor_id, actor_name)
      VALUES (v_request.id, 'COMPLETE', p_approver_id, v_approver.name);
    END IF;

  ELSIF p_action = 'REJECTED' THEN

    CASE v_step.on_reject

      -- ── RETURN_REQUESTER: đánh dấu REJECTED, người tạo xem lại ──
      WHEN 'RETURN_REQUESTER' THEN
        UPDATE requests
        SET status     = 'REJECTED',
            updated_at = now()
        WHERE id = v_request.id;

        -- Hủy các bước còn lại
        UPDATE request_step_instances
        SET status = 'CANCELLED'
        WHERE request_id = v_request.id
          AND status IN ('PENDING', 'IN_PROGRESS')
          AND id != p_step_instance_id;

        INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
        VALUES (
          v_request.id, 'REJECT', p_approver_id, v_approver.name,
          jsonb_build_object('on_reject', 'RETURN_REQUESTER', 'step', v_inst.step_name)
        );

      -- ── CANCEL_REQUEST: hủy request ngay lập tức ─────────────
      WHEN 'CANCEL_REQUEST' THEN
        UPDATE requests
        SET status           = 'CANCELLED',
            cancelled_at     = now(),
            cancelled_reason = 'Từ chối tại bước: ' || v_inst.step_name,
            updated_at       = now()
        WHERE id = v_request.id;

        UPDATE request_step_instances
        SET status = 'CANCELLED'
        WHERE request_id = v_request.id
          AND status IN ('PENDING', 'IN_PROGRESS')
          AND id != p_step_instance_id;

        INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
        VALUES (
          v_request.id, 'CANCEL', p_approver_id, v_approver.name,
          jsonb_build_object('on_reject', 'CANCEL_REQUEST', 'step', v_inst.step_name)
        );

      -- ── RETURN_PREV_STEP: trả về bước trước để duyệt lại ─────
      WHEN 'RETURN_PREV_STEP' THEN
        -- Tìm bước đã APPROVED gần nhất trước bước hiện tại
        SELECT id, step_order
        INTO v_prev_inst_id, v_prev_order
        FROM request_step_instances
        WHERE request_id = v_request.id
          AND step_order < v_inst.step_order
          AND status     = 'APPROVED'
        ORDER BY step_order DESC
        LIMIT 1;

        IF v_prev_inst_id IS NOT NULL THEN
          -- Reset bước trước về PENDING để workflow_activate_step có thể activate
          UPDATE request_step_instances
          SET
            status      = 'PENDING',
            acted_at    = NULL,
            acted_by_id = NULL,
            comment     = NULL,
            assigned_at = NULL,
            deadline_at = NULL
          WHERE id = v_prev_inst_id;

          -- Activate lại bước trước
          PERFORM workflow_activate_step(v_request.id, v_prev_order);

          INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
          VALUES (
            v_request.id, 'REJECT', p_approver_id, v_approver.name,
            jsonb_build_object(
              'on_reject',      'RETURN_PREV_STEP',
              'from_step',      v_inst.step_name,
              'return_to_step', v_prev_order
            )
          );
        ELSE
          -- Không có bước trước → fallback RETURN_REQUESTER
          UPDATE requests
          SET status     = 'REJECTED',
              updated_at = now()
          WHERE id = v_request.id;

          UPDATE request_step_instances
          SET status = 'CANCELLED'
          WHERE request_id = v_request.id
            AND status IN ('PENDING', 'IN_PROGRESS')
            AND id != p_step_instance_id;

          INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
          VALUES (
            v_request.id, 'REJECT', p_approver_id, v_approver.name,
            jsonb_build_object(
              'on_reject', 'RETURN_PREV_STEP',
              'fallback',  'RETURN_REQUESTER — no previous step found'
            )
          );
        END IF;

      ELSE
        -- Mặc định: RETURN_REQUESTER
        UPDATE requests
        SET status     = 'REJECTED',
            updated_at = now()
        WHERE id = v_request.id;

        UPDATE request_step_instances
        SET status = 'CANCELLED'
        WHERE request_id = v_request.id
          AND status IN ('PENDING', 'IN_PROGRESS')
          AND id != p_step_instance_id;

    END CASE;

  END IF;

END;
$$;

COMMENT ON FUNCTION approve_step IS
  'Core approval engine — xử lý quyết định phê duyệt / từ chối, advance workflow, ghi audit log';
