-- ============================================================
-- Phase 3 — Script 07: Admin Utility Functions
-- Chạy SAU 06_sync_employees.sql
--
-- Các RPC function hỗ trợ Admin UI:
--   - admin_update_form_type_template  → đổi workflow template cho form type
--   - admin_save_resource              → tạo / cập nhật tài nguyên (phòng, xe)
--   - admin_toggle_resource            → bật / tắt tài nguyên
--   - admin_get_all_resources          → lấy TẤT CẢ resources (kể cả inactive, bypass RLS)
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- Đổi workflow template đang active cho một form type
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_update_form_type_template(
  p_code        TEXT,
  p_template_id BIGINT     -- NULL = gỡ template
) RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM form_types WHERE code = p_code) THEN
    RAISE EXCEPTION 'Loại biểu mẫu không tồn tại: %', p_code;
  END IF;

  IF p_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM workflow_templates
    WHERE id = p_template_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Workflow template không tồn tại hoặc đã bị vô hiệu hoá: %', p_template_id;
  END IF;

  UPDATE form_types
  SET
    active_template_id = p_template_id,
    updated_at         = now()
  WHERE code = p_code;
END;
$$;

COMMENT ON FUNCTION admin_update_form_type_template IS
  'Admin: thay đổi workflow template đang áp dụng cho một loại biểu mẫu';


-- ─────────────────────────────────────────────────────────────
-- Tạo mới hoặc cập nhật tài nguyên (phòng họp / xe)
-- p_resource = {
--   id?:          number (nếu null/0 → tạo mới)
--   type:         'ROOM' | 'VEHICLE' | 'OTHER'
--   name:         string
--   code?:        string
--   capacity?:    number
--   location?:    string
--   description?: string
--   properties:   object
--   is_active?:   boolean
-- }
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_save_resource(p_resource JSONB)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_id   BIGINT;
  v_type TEXT;
BEGIN
  -- Validate type
  v_type := UPPER(COALESCE(NULLIF(p_resource->>'type', ''), ''));
  IF v_type NOT IN ('ROOM', 'VEHICLE', 'OTHER') THEN
    RAISE EXCEPTION 'Loại tài nguyên không hợp lệ: %. Phải là ROOM, VEHICLE hoặc OTHER', v_type;
  END IF;

  IF NULLIF(trim(p_resource->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Tên tài nguyên không được để trống';
  END IF;

  IF (p_resource->>'id') IS NOT NULL AND (p_resource->>'id')::BIGINT > 0 THEN
    -- UPDATE
    v_id := (p_resource->>'id')::BIGINT;

    IF NOT EXISTS (SELECT 1 FROM resources WHERE id = v_id) THEN
      RAISE EXCEPTION 'Tài nguyên không tồn tại: %', v_id;
    END IF;

    UPDATE resources
    SET
      type        = v_type,
      name        = trim(p_resource->>'name'),
      code        = NULLIF(trim(p_resource->>'code'),        ''),
      capacity    = NULLIF(p_resource->>'capacity',          '')::INTEGER,
      location    = NULLIF(trim(p_resource->>'location'),    ''),
      description = NULLIF(trim(p_resource->>'description'), ''),
      properties  = COALESCE(p_resource->'properties', '{}'),
      is_active   = COALESCE((p_resource->>'is_active')::BOOLEAN, is_active)
    WHERE id = v_id;

  ELSE
    -- INSERT
    INSERT INTO resources (
      type, name, code, capacity, location, description, properties, is_active
    ) VALUES (
      v_type,
      trim(p_resource->>'name'),
      NULLIF(trim(p_resource->>'code'),        ''),
      NULLIF(p_resource->>'capacity',          '')::INTEGER,
      NULLIF(trim(p_resource->>'location'),    ''),
      NULLIF(trim(p_resource->>'description'), ''),
      COALESCE(p_resource->'properties', '{}'),
      COALESCE((p_resource->>'is_active')::BOOLEAN, true)
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('id', v_id);
END;
$$;

COMMENT ON FUNCTION admin_save_resource IS
  'Admin: tạo mới hoặc cập nhật tài nguyên (phòng họp, xe công ty)';


-- ─────────────────────────────────────────────────────────────
-- Bật / tắt tài nguyên (soft delete)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_toggle_resource(
  p_id        BIGINT,
  p_is_active BOOLEAN
) RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE resources
  SET is_active = p_is_active
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tài nguyên không tồn tại: %', p_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION admin_toggle_resource IS
  'Admin: bật hoặc tắt một tài nguyên (phòng họp, xe)';


-- ─────────────────────────────────────────────────────────────
-- Lấy TẤT CẢ resources (kể cả inactive) — bypass RLS
-- Dùng riêng cho Admin ResourceManager
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_all_resources()
RETURNS SETOF resources
SECURITY DEFINER
LANGUAGE sql AS $$
  SELECT * FROM resources
  ORDER BY type ASC, name ASC;
$$;

COMMENT ON FUNCTION admin_get_all_resources IS
  'Admin: lấy toàn bộ resources kể cả đã vô hiệu hoá (bypass RLS)';


-- ─────────────────────────────────────────────────────────────
-- Lấy TẤT CẢ form types (kể cả inactive) — bypass RLS
-- Dùng riêng cho Admin FormTypeManager
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_all_form_types()
RETURNS SETOF form_types
SECURITY DEFINER
LANGUAGE sql AS $$
  SELECT * FROM form_types
  ORDER BY sort_order ASC;
$$;

COMMENT ON FUNCTION admin_get_all_form_types IS
  'Admin: lấy toàn bộ form types kể cả đã vô hiệu hoá (bypass RLS)';


-- ─────────────────────────────────────────────────────────────
-- Lấy TẤT CẢ workflow templates (kể cả inactive) — bypass RLS
-- Dùng riêng cho Admin FormTypeManager khi dropdown chọn template
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_get_all_templates()
RETURNS TABLE (
  id          BIGINT,
  name        TEXT,
  description TEXT,
  is_active   BOOLEAN,
  created_at  TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ,
  step_count  BIGINT
)
SECURITY DEFINER
LANGUAGE sql AS $$
  SELECT
    wt.id,
    wt.name,
    wt.description,
    wt.is_active,
    wt.created_at,
    wt.updated_at,
    COUNT(ws.id) AS step_count
  FROM workflow_templates wt
  LEFT JOIN workflow_steps ws ON ws.template_id = wt.id
  GROUP BY wt.id
  ORDER BY wt.id ASC;
$$;

COMMENT ON FUNCTION admin_get_all_templates IS
  'Admin: lấy toàn bộ workflow templates với số bước, kể cả đã vô hiệu hoá';
