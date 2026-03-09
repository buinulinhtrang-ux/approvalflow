-- ============================================================
-- Phase 2 — Script 06: sync_employees
-- Chạy SAU 05_admin_save_template.sql
--
-- sync_employees(p_employees JSONB):
--   Đồng bộ danh sách nhân viên từ Google Sheets vào bảng users.
--   - Upsert từng nhân viên (INSERT nếu mới, UPDATE nếu đã có)
--   - Deactivate nhân viên không còn trong danh sách (trừ ADMIN)
--
-- p_employees = [{
--   employee_id, name, email, department,
--   role, title, level, is_active
-- }]
--
-- Trả về: { new_count, updated_count, deact_count }
-- ============================================================


CREATE OR REPLACE FUNCTION sync_employees(p_employees JSONB)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_emp          JSONB;
  v_emp_ids      TEXT[]  := ARRAY[]::TEXT[];
  v_new_count    INTEGER := 0;
  v_upd_count    INTEGER := 0;
  v_deact_count  INTEGER := 0;
  v_emp_id       TEXT;
  v_role         TEXT;
  v_is_active    BOOLEAN;
BEGIN
  -- Validate input
  IF p_employees IS NULL OR jsonb_typeof(p_employees) != 'array' THEN
    RAISE EXCEPTION 'p_employees phải là mảng JSON';
  END IF;

  IF jsonb_array_length(p_employees) = 0 THEN
    RAISE EXCEPTION 'Danh sách nhân viên trống';
  END IF;

  -- ── Xử lý từng nhân viên ──────────────────────────────────
  FOR v_emp IN SELECT * FROM jsonb_array_elements(p_employees)
  LOOP
    v_emp_id := trim(v_emp->>'employee_id');

    IF v_emp_id IS NULL OR v_emp_id = '' THEN
      CONTINUE;  -- Bỏ qua dòng không có employee_id
    END IF;

    -- Normalize role — chỉ chấp nhận các role hợp lệ
    v_role := UPPER(COALESCE(NULLIF(trim(v_emp->>'role'), ''), 'REQUESTER'));
    IF v_role NOT IN ('REQUESTER', 'MANAGER', 'CFO', 'COO', 'ADMIN') THEN
      v_role := 'REQUESTER';
    END IF;

    v_is_active := COALESCE((v_emp->>'is_active')::BOOLEAN, true);

    -- Thu thập danh sách employee_id để deactivate sau
    v_emp_ids := v_emp_ids || v_emp_id;

    IF EXISTS (SELECT 1 FROM users WHERE employee_id = v_emp_id) THEN
      -- ── UPDATE nhân viên đã có ─────────────────────────────
      UPDATE users
      SET
        name       = COALESCE(NULLIF(trim(v_emp->>'name'),       ''), name),
        email      = COALESCE(NULLIF(trim(v_emp->>'email'),      ''), email),
        department = COALESCE(NULLIF(trim(v_emp->>'department'), ''), department),
        title      = COALESCE(NULLIF(trim(v_emp->>'title'),      ''), title),
        level      = COALESCE(NULLIF(trim(v_emp->>'level'),      ''), level),
        -- Không tự động thay đổi role ADMIN từ sheet để an toàn
        role       = CASE
                       WHEN role = 'ADMIN' THEN role
                       ELSE v_role
                     END,
        is_active  = v_is_active,
        updated_at = now()
      WHERE employee_id = v_emp_id;

      v_upd_count := v_upd_count + 1;

    ELSE
      -- ── INSERT nhân viên mới ───────────────────────────────
      -- Mật khẩu mặc định = employee_id (nhân viên đổi sau khi đăng nhập lần đầu)
      INSERT INTO users (
        employee_id,
        password,
        name,
        email,
        department,
        role,
        title,
        level,
        is_active
      ) VALUES (
        v_emp_id,
        v_emp_id,  -- Default password = employee_id
        COALESCE(NULLIF(trim(v_emp->>'name'),       ''), v_emp_id),
        COALESCE(NULLIF(trim(v_emp->>'email'),      ''), ''),
        COALESCE(NULLIF(trim(v_emp->>'department'), ''), ''),
        v_role,
        COALESCE(NULLIF(trim(v_emp->>'title'),      ''), ''),
        COALESCE(NULLIF(trim(v_emp->>'level'),      ''), ''),
        v_is_active
      );

      v_new_count := v_new_count + 1;
    END IF;

  END LOOP;

  -- ── Deactivate nhân viên không còn trong danh sách ────────
  -- Không deactivate ADMIN để đảm bảo không bị lock out
  UPDATE users
  SET
    is_active  = false,
    updated_at = now()
  WHERE employee_id != ALL(v_emp_ids)
    AND is_active    = true
    AND role        != 'ADMIN';

  GET DIAGNOSTICS v_deact_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'new_count',     v_new_count,
    'updated_count', v_upd_count,
    'deact_count',   v_deact_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'sync_employees thất bại: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION sync_employees IS
  'Đồng bộ danh sách nhân viên từ Google Sheets: upsert + deactivate không còn trong list';
