-- ============================================================
-- Phase 5 — Escalation tự động
-- Chạy file này trong Supabase SQL Editor
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- Function: workflow_escalate
-- Xử lý 1 step instance đã quá hạn theo on_timeout policy
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION workflow_escalate(p_step_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_inst    request_step_instances%ROWTYPE;
  v_step    workflow_steps%ROWTYPE;
  v_req     requests%ROWTYPE;
  v_system_user_id BIGINT;
BEGIN
  -- Lấy step instance
  SELECT * INTO v_inst
  FROM request_step_instances
  WHERE id = p_step_id AND status = 'IN_PROGRESS';

  IF NOT FOUND THEN RETURN; END IF;

  -- Chưa quá hạn thì bỏ qua
  IF v_inst.deadline_at IS NULL OR v_inst.deadline_at > now() THEN RETURN; END IF;

  -- Lấy định nghĩa bước và request
  SELECT * INTO v_step FROM workflow_steps WHERE id = v_inst.step_id;
  SELECT * INTO v_req  FROM requests       WHERE id = v_inst.request_id;

  -- Ghi audit log ESCALATE
  INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, metadata)
  VALUES (
    v_inst.request_id,
    'ESCALATE',
    NULL,
    'System',
    jsonb_build_object(
      'step_id',        v_inst.id,
      'step_name',      v_inst.step_name,
      'on_timeout',     v_step.on_timeout,
      'deadline_at',    v_inst.deadline_at
    )
  );

  CASE v_step.on_timeout

    -- ── AUTO_APPROVE ──────────────────────────────────────────
    WHEN 'AUTO_APPROVE' THEN
      -- Lấy user system (ADMIN đầu tiên) để ghi acted_by
      SELECT id INTO v_system_user_id FROM users WHERE role = 'ADMIN' LIMIT 1;

      UPDATE request_step_instances SET
        status      = 'APPROVED',
        acted_at    = now(),
        acted_by_id = v_system_user_id,
        comment     = '[Tự động phê duyệt do quá hạn]'
      WHERE id = v_inst.id;

      -- Kích hoạt bước tiếp theo (nếu có)
      DECLARE
        v_next_inst request_step_instances%ROWTYPE;
      BEGIN
        SELECT * INTO v_next_inst
        FROM request_step_instances
        WHERE request_id = v_inst.request_id
          AND step_order > v_inst.step_order
          AND status = 'PENDING'
        ORDER BY step_order ASC
        LIMIT 1;

        IF FOUND THEN
          PERFORM workflow_activate_step(v_next_inst.id, v_inst.request_id);
          UPDATE requests SET current_step_order = v_next_inst.step_order
          WHERE id = v_inst.request_id;
        ELSE
          -- Không còn bước → hoàn thành
          UPDATE requests SET status = 'APPROVED' WHERE id = v_inst.request_id;
        END IF;
      END;

    -- ── AUTO_REJECT ───────────────────────────────────────────
    WHEN 'AUTO_REJECT' THEN
      SELECT id INTO v_system_user_id FROM users WHERE role = 'ADMIN' LIMIT 1;

      UPDATE request_step_instances SET
        status      = 'REJECTED',
        acted_at    = now(),
        acted_by_id = v_system_user_id,
        comment     = '[Tự động từ chối do quá hạn]'
      WHERE id = v_inst.id;

      -- Hủy tất cả bước còn lại
      UPDATE request_step_instances
      SET status = 'CANCELLED'
      WHERE request_id = v_inst.request_id AND status IN ('PENDING', 'IN_PROGRESS');

      UPDATE requests SET status = 'REJECTED' WHERE id = v_inst.request_id;

    -- ── ESCALATE (mặc định) ──────────────────────────────────
    ELSE
      -- Đổi bước hiện tại → ESCALATED
      UPDATE request_step_instances SET
        status       = 'ESCALATED',
        escalated_at = now()
      WHERE id = v_inst.id;

      -- Nếu có escalate_to_role thì tạo bước mới cùng step_order + assign cho role đó
      IF v_step.escalate_to_role IS NOT NULL THEN
        INSERT INTO request_step_instances (
          request_id, step_id, step_order, step_name,
          status, assigned_role, assigned_at,
          deadline_at
        ) VALUES (
          v_inst.request_id,
          v_inst.step_id,
          v_inst.step_order,
          v_inst.step_name || ' [Leo thang]',
          'IN_PROGRESS',
          v_step.escalate_to_role,
          now(),
          now() + v_step.deadline_hours * interval '1 hour'
        );
      END IF;

  END CASE;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────
-- Function: workflow_check_escalations
-- Gọi workflow_escalate cho tất cả bước quá hạn
-- Hàm này được pg_cron gọi định kỳ
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION workflow_check_escalations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_rec   RECORD;
BEGIN
  FOR v_rec IN
    SELECT id
    FROM request_step_instances
    WHERE status = 'IN_PROGRESS'
      AND deadline_at IS NOT NULL
      AND deadline_at < now()
    ORDER BY deadline_at ASC
  LOOP
    PERFORM workflow_escalate(v_rec.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────
-- pg_cron setup
-- Yêu cầu: Supabase project phải có pg_cron extension được bật
-- Chạy các lệnh sau riêng biệt trong Supabase SQL Editor:
-- ─────────────────────────────────────────────────────────────

-- Bước 1: Bật extension (nếu chưa có)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Bước 2: Cấu hình job chạy mỗi 30 phút
-- SELECT cron.schedule(
--   'check-escalations',          -- Tên job (unique)
--   '*/30 * * * *',               -- Mỗi 30 phút
--   $$ SELECT workflow_check_escalations(); $$
-- );

-- Bước 3: Kiểm tra job đã được tạo
-- SELECT * FROM cron.job;

-- Bước 4: Xem lịch sử chạy
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- Để xóa job (nếu cần):
-- SELECT cron.unschedule('check-escalations');
