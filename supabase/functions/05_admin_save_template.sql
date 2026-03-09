-- ============================================================
-- Phase 2 — Script 05: admin_save_template
-- Chạy SAU 04_create_request.sql
--
-- admin_save_template(p_template JSONB, p_steps JSONB):
--   - Tạo mới hoặc cập nhật workflow template
--   - Replace toàn bộ steps (chỉ khi template chưa có request active)
--   - Nếu template đang có request active → chỉ cập nhật metadata
--
-- p_template = { id?: number, name: string, description?: string }
-- p_steps    = [{ step_order, step_name, approver_type, approver_value?,
--                  deadline_hours?, reminder_hours?, on_timeout?,
--                  on_reject?, skip_condition?, parallel_group?, require_all? }]
--
-- Trả về: { id: number, warning?: string }
-- ============================================================


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
  -- ── Validate đầu vào ───────────────────────────────────────
  IF NULLIF(trim(p_template->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Tên workflow template không được để trống';
  END IF;

  IF p_steps IS NULL OR jsonb_typeof(p_steps) != 'array' OR jsonb_array_length(p_steps) = 0 THEN
    RAISE EXCEPTION 'Workflow template phải có ít nhất 1 bước';
  END IF;

  -- ── Xử lý template (tạo mới hoặc update) ─────────────────
  IF (p_template->>'id') IS NOT NULL AND (p_template->>'id')::BIGINT > 0 THEN
    -- UPDATE existing template
    v_template_id := (p_template->>'id')::BIGINT;

    IF NOT EXISTS (SELECT 1 FROM workflow_templates WHERE id = v_template_id) THEN
      RAISE EXCEPTION 'Workflow template không tồn tại: %', v_template_id;
    END IF;

    UPDATE workflow_templates
    SET
      name        = trim(p_template->>'name'),
      description = NULLIF(trim(p_template->>'description'), ''),
      updated_at  = now()
    WHERE id = v_template_id;

    -- Kiểm tra xem template có request đang active không
    SELECT EXISTS (
      SELECT 1
      FROM requests r
      WHERE r.workflow_template_id = v_template_id
        AND r.status IN ('PENDING', 'IN_REVIEW')
    ) INTO v_has_active;

    IF v_has_active THEN
      -- Không thể thay đổi steps — chỉ update metadata đã làm ở trên
      RETURN jsonb_build_object(
        'id',      v_template_id,
        'warning', 'Template đang được dùng trong yêu cầu đang xử lý — chỉ cập nhật tên và mô tả. Để thay đổi cấu hình bước, hãy tạo template mới.'
      );
    END IF;

    -- Không có active request → xóa steps cũ và tạo lại
    DELETE FROM workflow_steps WHERE template_id = v_template_id;

  ELSE
    -- INSERT new template
    INSERT INTO workflow_templates (name, description)
    VALUES (
      trim(p_template->>'name'),
      NULLIF(trim(p_template->>'description'), '')
    )
    RETURNING id INTO v_template_id;
  END IF;

  -- ── Insert steps mới ───────────────────────────────────────
  FOR v_step IN SELECT * FROM jsonb_array_elements(p_steps)
  LOOP
    v_sort := v_sort + 1;

    -- Validate approver_type
    IF (v_step->>'approver_type') NOT IN (
      'FIXED_ROLE', 'FIXED_USER', 'DYNAMIC_MANAGER',
      'DYNAMIC_DEPT_HEAD', 'REQUESTER_SELECT'
    ) THEN
      RAISE EXCEPTION 'approver_type không hợp lệ: % (bước %)',
                      v_step->>'approver_type', v_sort;
    END IF;

    -- FIXED_ROLE và FIXED_USER bắt buộc có approver_value
    IF (v_step->>'approver_type') IN ('FIXED_ROLE', 'FIXED_USER')
       AND NULLIF(trim(v_step->>'approver_value'), '') IS NULL
    THEN
      RAISE EXCEPTION 'approver_value bắt buộc khi approver_type là % (bước %)',
                      v_step->>'approver_type', v_sort;
    END IF;

    INSERT INTO workflow_steps (
      template_id,
      step_order,
      step_name,
      approver_type,
      approver_value,
      parallel_group,
      require_all,
      deadline_hours,
      reminder_hours,
      on_timeout,
      escalate_to_role,
      skip_condition,
      on_reject
    ) VALUES (
      v_template_id,
      COALESCE((v_step->>'step_order')::INTEGER,    v_sort),
      COALESCE(NULLIF(trim(v_step->>'step_name'), ''), 'Bước ' || v_sort),
      v_step->>'approver_type',
      NULLIF(trim(v_step->>'approver_value'), ''),
      NULLIF(v_step->>'parallel_group', '')::INTEGER,
      COALESCE((v_step->>'require_all')::BOOLEAN,    true),
      COALESCE((v_step->>'deadline_hours')::INTEGER, 48),
      NULLIF(v_step->>'reminder_hours', '')::INTEGER,
      COALESCE(NULLIF(v_step->>'on_timeout',  ''), 'ESCALATE'),
      NULLIF(trim(v_step->>'escalate_to_role'), ''),
      CASE
        WHEN v_step->'skip_condition' IS NOT NULL
          AND v_step->>'skip_condition' != 'null'
        THEN v_step->'skip_condition'
        ELSE NULL
      END,
      COALESCE(NULLIF(v_step->>'on_reject', ''), 'RETURN_REQUESTER')
    );
  END LOOP;

  v_result := jsonb_build_object('id', v_template_id);
  RETURN v_result;

END;
$$;

COMMENT ON FUNCTION admin_save_template IS
  'Admin: tạo mới hoặc cập nhật workflow template và các bước của nó';
