-- ============================================================
-- ApprovalFlow — Supabase Schema
-- Chạy toàn bộ file này trong SQL Editor của Supabase Dashboard
-- ============================================================

-- ============================================================
-- 1. TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  employee_id     TEXT UNIQUE NOT NULL,
  password        TEXT NOT NULL,
  name            TEXT NOT NULL,
  role            TEXT NOT NULL,  -- REQUESTER | MANAGER | CFO | COO
  email           TEXT NOT NULL,
  department      TEXT,
  level           TEXT,
  title           TEXT
);

CREATE TABLE IF NOT EXISTS requests (
  id                        BIGSERIAL PRIMARY KEY,
  title                     TEXT NOT NULL,
  description               TEXT,
  amount                    FLOAT8 NOT NULL DEFAULT 0,
  type                      TEXT NOT NULL,  -- PR | PROPOSAL
  status                    TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING | APPROVED | REJECTED
  current_approver_role     TEXT NOT NULL,  -- MANAGER | CFO | COO | COMPLETED
  requester_id              BIGINT NOT NULL REFERENCES users(id),
  department                TEXT,
  request_group             TEXT,
  deadline_days             INTEGER,
  leadtime                  TEXT,
  po_number                 TEXT,
  budget_plan               TEXT,
  budget_code               TEXT,
  notes                     TEXT,
  proposal_overview         TEXT,
  proposal_time             TEXT,
  proposal_location         TEXT,
  proposal_chairperson      TEXT,
  proposal_form             TEXT,
  proposal_target           TEXT,
  proposal_requirements     TEXT,
  proposal_method_support   TEXT,  -- JSON string
  proposal_costs            TEXT,  -- JSON string
  proposal_results          TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_items (
  id            BIGSERIAL PRIMARY KEY,
  request_id    BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_name     TEXT NOT NULL,
  specs         TEXT,
  unit          TEXT,
  total_qty     FLOAT8,
  available_qty FLOAT8,
  purchase_qty  FLOAT8,
  unit_price    FLOAT8,
  amount        FLOAT8,
  reason        TEXT
);

CREATE TABLE IF NOT EXISTS approvals (
  id            BIGSERIAL PRIMARY KEY,
  request_id    BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  approver_id   BIGINT NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL,  -- APPROVED | REJECTED
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals      ENABLE ROW LEVEL SECURITY;

-- Cho phép anon key đọc tất cả (ứng dụng nội bộ, mutation qua RPC)
CREATE POLICY "anon_read_users"         ON users         FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_requests"      ON requests      FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_items"         ON request_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_approvals"     ON approvals     FOR SELECT TO anon USING (true);

-- ============================================================
-- 3. RPC: create_request
-- Tạo request + insert items trong một transaction
-- ============================================================

CREATE OR REPLACE FUNCTION create_request(
  p_title                   TEXT,
  p_description             TEXT,
  p_amount                  FLOAT8,
  p_type                    TEXT,
  p_requester_id            BIGINT,
  p_request_group           TEXT    DEFAULT NULL,
  p_deadline_days           INTEGER DEFAULT NULL,
  p_leadtime                TEXT    DEFAULT NULL,
  p_po_number               TEXT    DEFAULT NULL,
  p_budget_plan             TEXT    DEFAULT NULL,
  p_budget_code             TEXT    DEFAULT NULL,
  p_notes                   TEXT    DEFAULT NULL,
  p_proposal_overview       TEXT    DEFAULT NULL,
  p_proposal_time           TEXT    DEFAULT NULL,
  p_proposal_location       TEXT    DEFAULT NULL,
  p_proposal_chairperson    TEXT    DEFAULT NULL,
  p_proposal_form           TEXT    DEFAULT NULL,
  p_proposal_target         TEXT    DEFAULT NULL,
  p_proposal_requirements   TEXT    DEFAULT NULL,
  p_proposal_method_support TEXT    DEFAULT NULL,
  p_proposal_costs          TEXT    DEFAULT NULL,
  p_proposal_results        TEXT    DEFAULT NULL,
  p_items                   JSONB   DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_requester           users%ROWTYPE;
  v_initial_approver    TEXT;
  v_request_id          BIGINT;
  v_item                JSONB;
BEGIN
  SELECT * INTO v_requester FROM users WHERE id = p_requester_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Không tìm thấy thông tin người yêu cầu');
  END IF;

  -- Xác định bước phê duyệt đầu tiên theo role người tạo
  v_initial_approver := CASE v_requester.role
    WHEN 'MANAGER' THEN 'CFO'
    WHEN 'CFO'     THEN 'COO'
    WHEN 'COO'     THEN 'COMPLETED'
    ELSE                'MANAGER'
  END;

  INSERT INTO requests (
    title, description, amount, type, status, current_approver_role,
    requester_id, department, request_group, deadline_days,
    leadtime, po_number, budget_plan, budget_code, notes,
    proposal_overview, proposal_time, proposal_location,
    proposal_chairperson, proposal_form, proposal_target,
    proposal_requirements, proposal_method_support,
    proposal_costs, proposal_results
  ) VALUES (
    p_title, p_description, p_amount, p_type, 'PENDING', v_initial_approver,
    p_requester_id, v_requester.department, p_request_group, p_deadline_days,
    p_leadtime, p_po_number, p_budget_plan, p_budget_code, p_notes,
    p_proposal_overview, p_proposal_time, p_proposal_location,
    p_proposal_chairperson, p_proposal_form, p_proposal_target,
    p_proposal_requirements, p_proposal_method_support,
    p_proposal_costs, p_proposal_results
  )
  RETURNING id INTO v_request_id;

  -- Insert từng item nếu có
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      INSERT INTO request_items (
        request_id, item_name, specs, unit,
        total_qty, available_qty, purchase_qty,
        unit_price, amount, reason
      ) VALUES (
        v_request_id,
        v_item->>'item_name',
        v_item->>'specs',
        v_item->>'unit',
        COALESCE((v_item->>'total_qty')::FLOAT8,     0),
        COALESCE((v_item->>'available_qty')::FLOAT8, 0),
        COALESCE((v_item->>'purchase_qty')::FLOAT8,  0),
        COALESCE((v_item->>'unit_price')::FLOAT8,    0),
        COALESCE((v_item->>'amount')::FLOAT8,        0),
        v_item->>'reason'
      );
    END LOOP;
  END IF;

  RETURN json_build_object('id', v_request_id);
END;
$$;

-- ============================================================
-- 4. RPC: approve_request
-- Phê duyệt / từ chối + cập nhật trạng thái trong một transaction
-- ============================================================

CREATE OR REPLACE FUNCTION approve_request(
  p_request_id   BIGINT,
  p_approver_id  BIGINT,
  p_status       TEXT,   -- APPROVED | REJECTED
  p_comment      TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request   requests%ROWTYPE;
  v_approver  users%ROWTYPE;
  v_next_role TEXT;
BEGIN
  SELECT * INTO v_request  FROM requests WHERE id = p_request_id;
  SELECT * INTO v_approver FROM users    WHERE id = p_approver_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Không tìm thấy dữ liệu');
  END IF;

  -- Kiểm tra quyền phê duyệt theo bước hiện tại
  IF v_request.current_approver_role = 'MANAGER' THEN
    IF v_approver.role <> 'MANAGER' OR v_approver.department <> v_request.department THEN
      RETURN json_build_object('error',
        'Chỉ quản lý bộ phận ' || v_request.department || ' mới có quyền phê duyệt bước này');
    END IF;
  ELSIF v_approver.role <> v_request.current_approver_role THEN
    RETURN json_build_object('error',
      'Chỉ ' || v_request.current_approver_role || ' mới có quyền phê duyệt bước này');
  END IF;

  -- Ghi lịch sử
  INSERT INTO approvals (request_id, approver_id, status, comment)
  VALUES (p_request_id, p_approver_id, p_status, p_comment);

  -- Cập nhật trạng thái request
  IF p_status = 'REJECTED' THEN
    UPDATE requests
    SET status = 'REJECTED', current_approver_role = 'MANAGER'
    WHERE id = p_request_id;
  ELSE
    v_next_role := CASE v_request.current_approver_role
      WHEN 'MANAGER' THEN 'CFO'
      WHEN 'CFO'     THEN 'COO'
      ELSE                'COMPLETED'
    END;

    IF v_next_role = 'COMPLETED' THEN
      UPDATE requests
      SET status = 'APPROVED', current_approver_role = 'COMPLETED'
      WHERE id = p_request_id;
    ELSE
      UPDATE requests
      SET current_approver_role = v_next_role
      WHERE id = p_request_id;
    END IF;
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- ============================================================
-- 5. SEED DATA — Users (chạy 1 lần duy nhất)
-- Mật khẩu mặc định = employee_id
-- ============================================================

INSERT INTO users (employee_id, password, name, role, email, department, level, title) VALUES
ON CONFLICT (employee_id) DO NOTHING;
