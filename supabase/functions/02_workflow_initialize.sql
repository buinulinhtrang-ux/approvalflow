-- ============================================================
-- Phase 2 — Script 02: Workflow Initialize
-- Chạy SAU 01_helpers.sql
--
-- workflow_initialize(p_request_id):
--   1. Lấy workflow template từ form_type của request
--   2. Tạo tất cả step_instances (PENDING hoặc SKIPPED)
--   3. Kích hoạt bước đầu tiên không bị skip
--   4. Nếu tất cả bước bị skip → tự động APPROVED
-- ============================================================


CREATE OR REPLACE FUNCTION workflow_initialize(p_request_id BIGINT)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_request       requests%ROWTYPE;
  v_template_id   BIGINT;
  v_step          workflow_steps%ROWTYPE;
  v_should_skip   BOOLEAN;
  v_first_active  INTEGER := NULL;   -- step_order đầu tiên không bị skip
  v_actor_name    TEXT;
BEGIN
  -- ── 1. Load request (lock để tránh race condition) ────────
  SELECT * INTO v_request
  FROM requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request không tồn tại: %', p_request_id;
  END IF;

  IF v_request.status NOT IN ('PENDING', 'DRAFT') THEN
    RAISE EXCEPTION 'Request % đã ở trạng thái % — không thể khởi tạo workflow lại',
                    p_request_id, v_request.status;
  END IF;

  -- ── 2. Tìm workflow template cho form_type này ─────────────
  SELECT active_template_id INTO v_template_id
  FROM form_types
  WHERE code = v_request.form_type;

  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy workflow template cho form_type: %',
                    v_request.form_type;
  END IF;

  -- ── 3. Cập nhật request: gán template + chuyển sang IN_REVIEW
  UPDATE requests
  SET
    workflow_template_id = v_template_id,
    status               = 'IN_REVIEW',
    current_step_order   = 0,
    updated_at           = now()
  WHERE id = p_request_id;

  -- ── 4. Tạo step instances cho toàn bộ các bước ───────────
  --    Đánh giá skip_condition ngay tại thời điểm khởi tạo
  FOR v_step IN
    SELECT *
    FROM workflow_steps
    WHERE template_id = v_template_id
    ORDER BY step_order
  LOOP
    -- Evaluate skip condition với dữ liệu request hiện tại
    v_should_skip := workflow_evaluate_skip(v_step.skip_condition, v_request);

    INSERT INTO request_step_instances (
      request_id,
      step_id,
      step_order,
      step_name,
      status
    ) VALUES (
      p_request_id,
      v_step.id,
      v_step.step_order,
      v_step.step_name,
      CASE WHEN v_should_skip THEN 'SKIPPED' ELSE 'PENDING' END
    );

    -- Ghi nhận bước đầu tiên cần xử lý
    IF NOT v_should_skip AND v_first_active IS NULL THEN
      v_first_active := v_step.step_order;
    END IF;
  END LOOP;

  -- ── 5. Kích hoạt bước đầu tiên (hoặc tự duyệt nếu tất cả skip)
  IF v_first_active IS NOT NULL THEN
    -- Activate bước đầu tiên không bị skip
    PERFORM workflow_activate_step(p_request_id, v_first_active);
  ELSE
    -- Tất cả bước đều bị skip → tự động APPROVED
    UPDATE requests
    SET status     = 'APPROVED',
        updated_at = now()
    WHERE id = p_request_id;

    -- Lấy tên actor để ghi audit
    SELECT name INTO v_actor_name FROM users WHERE id = v_request.requester_id;

    INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
    VALUES (
      p_request_id,
      'COMPLETE',
      v_request.requester_id,
      COALESCE(v_actor_name, 'System'),
      '{"auto_approved": true, "reason": "all_steps_skipped"}'::JSONB
    );
  END IF;

END;
$$;

COMMENT ON FUNCTION workflow_initialize IS
  'Khởi tạo luồng phê duyệt cho một request: tạo step instances và activate bước đầu tiên';
