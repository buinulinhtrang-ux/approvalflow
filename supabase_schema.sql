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
('WF07MN','WF07MN','Nguyễn Hoài Thu','COO','wf07mn@example.com','Ban giám đốc','Quản lý','COO'),
('WF06MN','WF06MN','Đinh Trà Mi','MANAGER','wf06mn@example.com','Phòng mua hàng','Quản lý','Trưởng phòng mua hàng'),
('WT12DT','WT12DT','Hoàng Văn Tuân','REQUESTER','wt12dt@example.com','Phòng mua hàng','Nhân viên','Nhân viên Mua hàng'),
('WT22AM','WT22AM','Trần Thị Ngọc Hoa','REQUESTER','wt22am@example.com','Phòng mua hàng','Nhân viên','Nhân viên Mua hàng'),
('WF01PD','WF01PD','Trần Thị Hoài','REQUESTER','wf01pd@example.com','Phòng mua hàng','Nhân viên','Nhân viên Mua hàng'),
('WF02PD','WF02PD','Nông Thị Thúy Hiền','REQUESTER','wf02pd@example.com','Phòng mua hàng','Nhân viên','Nhân viên Mua hàng'),
('WF15AD','WF15AD','Lê Hải Hà','REQUESTER','wf15ad@example.com','Phòng mua hàng','Nhân viên','Nhân viên Mua hàng'),
('WF29AD','WF29AD','La Thị Thảo','MANAGER','wf29ad@example.com','Phòng Kế toán','Quản lý','Trưởng phòng Kế toán'),
('WF02AD','WF02AD','Vũ Thị Thanh Bình','REQUESTER','wf02ad@example.com','Phòng Kế toán','Nhân viên','Nhân viên Kế toán'),
('WF05AD','WF05AD','Nguyễn Bích Huyền','REQUESTER','wf05ad@example.com','Phòng Kế toán','Nhân viên','Nhân viên Kế toán'),
('WF10AD','WF10AD','Lê Diệu Linh','REQUESTER','wf10ad@example.com','Phòng Kế toán','Nhân viên','Nhân viên Kế toán'),
('WF13AD','WF13AD','Nguyễn Phương Anh','REQUESTER','wf13ad@example.com','Phòng Kế toán','Nhân viên','Nhân viên Kế toán'),
('WF20AD','WF20AD','Trần Minh Quỳnh','REQUESTER','wf20ad@example.com','Phòng Kế toán','Nhân viên','Nhân viên Kế toán'),
('WF23AD','WF23AD','Nguyễn Hà Trang','REQUESTER','wf23ad@example.com','Phòng Kế toán','Nhân viên','Nhân viên Kế toán'),
('WF27AD','WF27AD','Lê Thanh Tịnh','REQUESTER','wf27ad@example.com','Phòng Kế toán','Nhân viên','Nhân viên Kế toán'),
('WF09AD','WF09AD','Bùi Việt Hà','CFO','wf09ad@example.com','Phòng Tài chính','Quản lý','CFO'),
('WF03RD','WF03RD','Phương Thanh Thảo','REQUESTER','wf03rd@example.com','Phòng Tài chính','Nhân viên','Nhân viên Tài chính'),
('WF02RD','WF02RD','Nguyễn Thị Hồng Anh','REQUESTER','wf02rd@example.com','Phòng Tài chính','Nhân viên','Nhân viên Tài chính'),
('WF19AD','WF19AD','Ngô Thị Kim Thanh','REQUESTER','wf19ad@example.com','Phòng Tài chính','Nhân viên','Nhân viên Tài chính'),
('WF32ME','WF32ME','Đinh Thị Thúy Hằng','REQUESTER','wf32me@example.com','Phòng truyền thông','Tổ trưởng','Trưởng nhóm Truyền thông'),
('WF60ME','WF60ME','Nguyễn Thu Trang','REQUESTER','wf60me@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WF63ME','WF63ME','Trần Thiện Tường Nhi','REQUESTER','wf63me@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WF68ME','WF68ME','Trần Hồng Hạnh','REQUESTER','wf68me@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WT13TR','WT13TR','Phạm Thanh Huyền','REQUESTER','wt13tr@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WT15TR','WT15TR','Phùng Huyền Ngọc','REQUESTER','wt15tr@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WF77ME','WF77ME','Phan Đức Hiếu','REQUESTER','wf77me@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WF85ME','WF85ME','Đỗ Mạnh Tiến','REQUESTER','wf85me@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WF09HR','WF09HR','Nguyễn Thị Quỳnh Liên','REQUESTER','wf09hr@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WT62PR','WT62PR','Đỗ Xuân Việt','REQUESTER','wt62pr@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WF88ME','WF88ME','Nguyễn Thị Ngọc Ánh','REQUESTER','wf88me@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WF90ME','WF90ME','Nguyễn Thị Huyền Trang','REQUESTER','wf90me@example.com','Phòng truyền thông','Nhân viên','Nhân viên Truyền thông'),
('WF70ME','WF70ME','Lê Thị Hồng','MANAGER','wf70me@example.com','Phòng tuyển sinh và kết nối Wisers','Quản lý','Trưởng phòng Tuyển sinh và Kết nối Wisers'),
('WF41ME','WF41ME','Phan Thị Minh Tâm','MANAGER','wf41me@example.com','Phòng tuyển sinh và kết nối Wisers','Quản lý','Phó phòng Tuyển sinh và Kết nối Wisers'),
('WF38ME','WF38ME','Nguyễn Thu Hòa','REQUESTER','wf38me@example.com','Phòng tuyển sinh và kết nối Wisers','Nhân viên','Nhân viên phòng Tuyển sinh và Kết nối Wisers'),
('WF75ME','WF75ME','Phạm Diệu Linh','REQUESTER','wf75me@example.com','Phòng tuyển sinh và kết nối Wisers','Nhân viên','Nhân viên phòng Tuyển sinh và Kết nối Wisers'),
('WF78ME','WF78ME','Phạm Phương Thanh','REQUESTER','wf78me@example.com','Phòng tuyển sinh và kết nối Wisers','Nhân viên','Nhân viên phòng Tuyển sinh và Kết nối Wisers'),
('WF79ME','WF79ME','Nguyễn Thị Hương Giang','REQUESTER','wf79me@example.com','Phòng tuyển sinh và kết nối Wisers','Tổ trưởng','Nhân viên phòng Tuyển sinh và Kết nối Wisers'),
('WT50PR','WT50PR','Phạm Ngọc Anh','REQUESTER','wt50pr@example.com','Phòng tuyển sinh và kết nối Wisers','Nhân viên','Nhân viên phòng Tuyển sinh và Kết nối Wisers'),
('WF87ME','WF87ME','Phạm Thùy Dương','REQUESTER','wf87me@example.com','Phòng tuyển sinh và kết nối Wisers','Nhân viên','Nhân viên phòng Tuyển sinh và Kết nối Wisers'),
('WT19TR','WT19TR','Đỗ Ngọc Khuê','REQUESTER','wt19tr@example.com','Phòng tuyển sinh và kết nối Wisers','Nhân viên','Nhân viên phòng Tuyển sinh và Kết nối Wisers'),
('WF83ME','WF83ME','Nguyễn Minh Anh','REQUESTER','wf83me@example.com','Phòng tuyển sinh và kết nối Wisers','Nhân viên','Nhân viên phòng Tuyển sinh và Kết nối Wisers'),
('WF23HR','WF23HR','Hoàng Thị Thu Trang','MANAGER','wf23hr@example.com','Phòng Nhân sự - Đào tạo','Quản lý','Trưởng phòng Nhân sự cấp cao'),
('WF02ME','WF02ME','Lê Vân Dung','MANAGER','wf02me@example.com','Phòng Nhân sự - Đào tạo','Quản lý','Phó phòng Nhân sự - Đào tạo'),
('WF07HR','WF07HR','Bùi Nữ Linh Trang','REQUESTER','wf07hr@example.com','Phòng Nhân sự - Đào tạo','Tổ trưởng','Trưởng nhóm phòng Nhân sự - Đào tạo'),
('WT42AM','WT42AM','Nguyễn Minh Huyền','REQUESTER','wt42am@example.com','Phòng Nhân sự - Đào tạo','Nhân viên','Nhân viên phòng Nhân sự - Đào tạo'),
('WF24HR','WF24HR','Trần Tuyết Nhung','REQUESTER','wf24hr@example.com','Phòng Nhân sự - Đào tạo','Nhân viên','Nhân viên phòng Nhân sự - Đào tạo'),
('WF25HR','WF25HR','Nguyễn Phương Linh','REQUESTER','wf25hr@example.com','Phòng Nhân sự - Đào tạo','Nhân viên','Nhân viên phòng Nhân sự - Đào tạo'),
('WF26HR','WF26HR','Hoàng Văn Tuyển','REQUESTER','wf26hr@example.com','Phòng Nhân sự - Đào tạo','Nhân viên','Nhân viên phòng Nhân sự - Đào tạo'),
('WF01IT','WF01IT','Nguyễn Hải Linh','MANAGER','wf01it@example.com','Phòng Công nghệ thông tin','Quản lý','Trưởng Phòng Công nghệ thông tin'),
('WF07SD','WF07SD','Nguyễn Văn Thắng','MANAGER','wf07sd@example.com','Phòng Công nghệ thông tin','Quản lý','Phó phòng Công nghệ Thông tin'),
('WT14DT','WT14DT','Nguyễn Thành Trung','REQUESTER','wt14dt@example.com','Phòng Công nghệ thông tin','Nhân viên','Nhân viên phòng công nghệ thông tin'),
('WF02IT','WF02IT','Nguyễn Duy Hiếu','REQUESTER','wf02it@example.com','Phòng Công nghệ thông tin','Nhân viên','Nhân viên phòng công nghệ thông tin'),
('WF03IT','WF03IT','Nguyễn Văn Thế','REQUESTER','wf03it@example.com','Phòng Công nghệ thông tin','Nhân viên','Nhân viên phòng công nghệ thông tin'),
('WF04IT','WF04IT','Dương Tuấn Nam','REQUESTER','wf04it@example.com','Phòng Công nghệ thông tin','Nhân viên','Nhân viên phòng công nghệ thông tin'),
('WF05IT','WF05IT','Vũ Thị Nhật Lệ','REQUESTER','wf05it@example.com','Phòng Công nghệ thông tin','Nhân viên','Nhân viên phòng công nghệ thông tin'),
('WF15HR','WF15HR','Trần Thị Ánh Tuyết','MANAGER','wf15hr@example.com','Khối Hành chính Tổng hợp và Dịch vụ học sinh','Quản lý','Trưởng Khối Hành chính Tổng hợp - Dịch vụ Học sinh'),
('WF01SD','WF01SD','Trần Quốc Trung','REQUESTER','wf01sd@example.com','Khối Hành chính Tổng hợp và Dịch vụ học sinh','Tổ trưởng','Nhân viên Khối Hành chính Tổng hợp - Dịch vụ Học sinh'),
('WF01PM','WF01PM','Nguyễn Huy Hoàng','REQUESTER','wf01pm@example.com','Khối Hành chính Tổng hợp và Dịch vụ học sinh','Nhân viên','Nhân viên Khối Hành chính Tổng hợp - Dịch vụ Học sinh'),
('WF15SD','WF15SD','Điền Hồng Hà','REQUESTER','wf15sd@example.com','Khối Hành chính Tổng hợp và Dịch vụ học sinh','Nhân viên','Nhân viên Khối Hành chính Tổng hợp - Dịch vụ Học sinh'),
('WF70SD','WF70SD','Bùi Mỹ Hạnh','REQUESTER','wf70sd@example.com','Khối Hành chính Tổng hợp và Dịch vụ học sinh','Nhân viên','Nhân viên Khối Hành chính Tổng hợp - Dịch vụ Học sinh'),
('WF72SD','WF72SD','Nguyễn Thị Hồng Nhung','REQUESTER','wf72sd@example.com','Khối Hành chính Tổng hợp và Dịch vụ học sinh','Nhân viên','Nhân viên Khối Hành chính Tổng hợp - Dịch vụ Học sinh'),
('WF06AD','WF06AD','Dương Thị Ngà','REQUESTER','wf06ad@example.com','Khối Hành chính Tổng hợp và Dịch vụ học sinh','Nhân viên','Nhân viên Khối Hành chính Tổng hợp - Dịch vụ Học sinh'),
('WF106SD','WF106SD','Trương Thị Thu Thủy','REQUESTER','wf106sd@example.com','Khối Hành chính Tổng hợp và Dịch vụ học sinh','Nhân viên','Nhân viên Khối Hành chính Tổng hợp - Dịch vụ Học sinh'),
('WF05SD','WF05SD','Đỗ Quốc Hùng','REQUESTER','wf05sd@example.com','Khối Hành chính Tổng hợp và Dịch vụ học sinh','Nhân viên','Nhân viên Khối Hành chính Tổng hợp - Dịch vụ Học sinh'),
('WF23SD','WF23SD','Nguyễn Thị Thanh Thúy','REQUESTER','wf23sd@example.com','Khối Hành chính Tổng hợp và Dịch vụ học sinh','Nhân viên','Nhân viên Khối Hành chính Tổng hợp - Dịch vụ Học sinh'),
('WT08EM','WT08EM','Nguyễn Vĩnh Sơn','MANAGER','wt08em@example.com','Trường THPT','Quản lý','Hiệu trưởng khối học thuật'),
('WT04HI','WT04HI','Phạm Thị Lan Phương','REQUESTER','wt04hi@example.com','Trường THPT','Nhân viên','Nhân viên khối học thuật'),
('WT50AM','WT50AM','Trần Phương Thảo','REQUESTER','wt50am@example.com','Trường THPT','Nhân viên','Nhân viên khối học thuật'),
('WT11CH','WT11CH','Đào Thị Bích Diệp','MANAGER','wt11ch@example.com','Ban đào tạo','Quản lý','Trưởng phòng Ban đào tạo'),
('WT42DT','WT42DT','Nguyễn Mai Ly','REQUESTER','wt42dt@example.com','Ban đào tạo','Tổ trưởng','Trưởng nhóm Ban đào tạo'),
('WT71DT','WT71DT','Nguyễn Phương Thảo','REQUESTER','wt71dt@example.com','Ban đào tạo','Nhân viên','Nhân viên Ban Đào tạo'),
('WT68DT','WT68DT','Nguyễn Thị Hoa','REQUESTER','wt68dt@example.com','Ban đào tạo','Nhân viên','Nhân viên Ban Đào tạo'),
-- Trường THCS (bổ sung MANAGER còn thiếu)
('THCS_MN','THCS_MN','Quản lý Trường THCS','MANAGER','thcs_mn@example.com','Trường THCS','Quản lý','Trưởng khối học thuật THCS'),
('WT16EV','WT16EV','Nguyễn Việt Linh','REQUESTER','wt16ev@example.com','Trường THCS','Nhân viên','Nhân viên khối học thuật'),
('WT31AM','WT31AM','Nguyễn Hoàng Hà','REQUESTER','wt31am@example.com','Trường THCS','Nhân viên','Nhân viên khối học thuật'),
('WT29AM','WT29AM','Lê Mai Anh','REQUESTER','wt29am@example.com','Trường THCS','Nhân viên','Nhân viên khối học thuật'),
('WT17GE','WT17GE','Nguyễn Thị Hiền','REQUESTER','wt17ge@example.com','Trường THCS','Nhân viên','Nhân viên khối học thuật'),
('WT20GE','WT20GE','Trần Việt Hoàng','REQUESTER','wt20ge@example.com','Trường THCS','Nhân viên','Nhân viên khối học thuật'),
-- Phòng truyền thông (bổ sung MANAGER còn thiếu)
('TT_MN','TT_MN','Quản lý Phòng truyền thông','MANAGER','tt_mn@example.com','Phòng truyền thông','Quản lý','Trưởng phòng Truyền thông')
ON CONFLICT (employee_id) DO NOTHING;
