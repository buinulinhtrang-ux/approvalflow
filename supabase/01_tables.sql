-- ============================================================
-- Phase 1 — Script 01: Tạo toàn bộ bảng
-- Thứ tự tạo phải tuân theo FK dependency:
--   users → resources → workflow_templates → workflow_steps
--   → form_types → requests → request_items
--   → request_step_instances → delegations → audit_log
-- ============================================================


-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  employee_id   TEXT UNIQUE NOT NULL,
  password      TEXT NOT NULL,                    -- plaintext tạm thời (nâng cấp bcrypt ở phase sau)
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL
                CHECK (role IN ('REQUESTER', 'MANAGER', 'CFO', 'COO', 'ADMIN')),
  department    TEXT,
  level         TEXT,
  title         TEXT,
  manager_id    BIGINT REFERENCES users(id),      -- quản lý trực tiếp (dùng cho dynamic approver)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  users              IS 'Người dùng hệ thống';
COMMENT ON COLUMN users.manager_id  IS 'Quản lý trực tiếp — dùng để resolve DYNAMIC_MANAGER approver';
COMMENT ON COLUMN users.role        IS 'REQUESTER | MANAGER | CFO | COO | ADMIN';


-- ============================================================
-- TABLE: resources
-- Phòng họp, xe công ty, và các tài nguyên đặt theo lịch
-- ============================================================
CREATE TABLE resources (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL
              CHECK (type IN ('ROOM', 'VEHICLE', 'OTHER')),
  name        TEXT NOT NULL,                      -- 'Phòng họp A - Tầng 3', 'Toyota Innova 30A-001'
  code        TEXT UNIQUE,                        -- Mã nội bộ: 'ROOM-A', 'VEH-001'
  capacity    INTEGER,                            -- Sức chứa (người / chỗ ngồi)
  location    TEXT,                               -- Vị trí: 'Tầng 3, Tòa A'
  description TEXT,
  properties  JSONB NOT NULL DEFAULT '{}',        -- Thuộc tính đặc thù theo loại
                                                  -- ROOM:    {"has_projector": true, "has_whiteboard": true}
                                                  -- VEHICLE: {"plate": "30A-001", "seats": 7}
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE resources IS 'Tài nguyên có thể đặt theo lịch: phòng họp, xe công ty';


-- ============================================================
-- TABLE: workflow_templates
-- Bản thiết kế của một luồng phê duyệt
-- ============================================================
CREATE TABLE workflow_templates (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,                      -- 'Luồng phê duyệt chuẩn'
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  BIGINT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE workflow_templates IS 'Bản thiết kế luồng phê duyệt — có thể tái sử dụng cho nhiều loại form';


-- ============================================================
-- TABLE: workflow_steps
-- Các bước trong một workflow template
-- ============================================================
CREATE TABLE workflow_steps (
  id               BIGSERIAL PRIMARY KEY,
  template_id      BIGINT NOT NULL
                   REFERENCES workflow_templates(id) ON DELETE CASCADE,
  step_order       INTEGER NOT NULL,              -- Thứ tự bước: 1, 2, 3 ...
  step_name        TEXT NOT NULL,                 -- 'Trưởng bộ phận', 'CFO', 'COO'

  -- Cách xác định người duyệt
  approver_type    TEXT NOT NULL
                   CHECK (approver_type IN (
                     'FIXED_ROLE',         -- Theo role cố định (CFO, COO, MANAGER...)
                     'FIXED_USER',         -- Người dùng cụ thể theo user id
                     'DYNAMIC_MANAGER',    -- Quản lý trực tiếp của người tạo (manager_id)
                     'DYNAMIC_DEPT_HEAD',  -- Trưởng bộ phận cùng department với người tạo
                     'REQUESTER_SELECT'    -- Người tạo tự chọn khi submit
                   )),
  approver_value   TEXT,                          -- Giá trị tùy theo approver_type:
                                                  --   FIXED_ROLE  → 'CFO', 'COO', 'MANAGER'
                                                  --   FIXED_USER  → user id dạng text
                                                  --   DYNAMIC_*   → NULL
                                                  --   REQUESTER_SELECT → NULL

  -- Cấu hình song song trong cùng 1 vòng
  parallel_group   INTEGER,                       -- Các bước cùng group chạy đồng thời
  require_all      BOOLEAN NOT NULL DEFAULT true, -- true: cần tất cả approve; false: chỉ cần 1

  -- Thời hạn và leo thang
  deadline_hours   INTEGER NOT NULL DEFAULT 48,   -- Thời hạn xử lý (giờ)
  reminder_hours   INTEGER,                       -- Nhắc trước deadline N giờ (NULL = không nhắc)
  on_timeout       TEXT NOT NULL DEFAULT 'ESCALATE'
                   CHECK (on_timeout IN ('ESCALATE', 'AUTO_APPROVE', 'AUTO_REJECT')),
  escalate_to_role TEXT,                          -- Role nhận task khi escalate (NULL = dùng on_timeout)

  -- Điều kiện bỏ qua bước này
  -- Ví dụ: {"field": "amount", "op": "<", "value": 5000000}
  -- Ví dụ: {"field": "is_urgent", "op": "=", "value": true}
  -- Ví dụ: {"field": "form_data.attendees_count", "op": "<=", "value": 10}
  skip_condition   JSONB,                         -- NULL = không bỏ qua bao giờ

  -- Hành động khi bị từ chối
  on_reject        TEXT NOT NULL DEFAULT 'RETURN_REQUESTER'
                   CHECK (on_reject IN (
                     'RETURN_REQUESTER',  -- Trả về người tạo để chỉnh sửa
                     'RETURN_PREV_STEP',  -- Trả về bước trước
                     'CANCEL_REQUEST'     -- Hủy request luôn
                   )),

  UNIQUE (template_id, step_order),

  CONSTRAINT fixed_role_needs_value CHECK (
    approver_type != 'FIXED_ROLE' OR approver_value IS NOT NULL
  ),
  CONSTRAINT fixed_user_needs_value CHECK (
    approver_type != 'FIXED_USER' OR approver_value IS NOT NULL
  )
);

COMMENT ON TABLE  workflow_steps               IS 'Các bước trong một workflow template';
COMMENT ON COLUMN workflow_steps.skip_condition IS 'JSONB condition — nếu đúng thì bỏ qua bước này';
COMMENT ON COLUMN workflow_steps.parallel_group IS 'Các bước cùng group chạy đồng thời (song song)';


-- ============================================================
-- TABLE: form_types
-- Danh mục loại biểu mẫu + schema registry
-- ============================================================
CREATE TABLE form_types (
  id                   BIGSERIAL PRIMARY KEY,
  code                 TEXT UNIQUE NOT NULL,       -- 'PR', 'PROPOSAL', 'ROOM_BOOKING', ...
  name                 TEXT NOT NULL,              -- 'Yêu cầu mua sắm'
  description          TEXT,
  icon                 TEXT,                       -- Tên icon Lucide: 'ShoppingCart', 'FileText', ...
  active_template_id   BIGINT
                       REFERENCES workflow_templates(id),   -- Template đang áp dụng
  field_schema         JSONB NOT NULL DEFAULT '{}', -- Định nghĩa fields để render form động
                                                   -- Xem UPGRADE_PLAN.md để biết cấu trúc chi tiết
  requires_resource    BOOLEAN NOT NULL DEFAULT false, -- true → hiện widget chọn phòng/xe
  requires_time_range  BOOLEAN NOT NULL DEFAULT false, -- true → hiện date/time picker
  sort_order           INTEGER NOT NULL DEFAULT 0, -- Thứ tự hiển thị trong danh sách chọn form
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  form_types                    IS 'Danh mục loại biểu mẫu và schema definition';
COMMENT ON COLUMN form_types.field_schema       IS 'JSON schema định nghĩa các field đặc thù — frontend render động';
COMMENT ON COLUMN form_types.requires_resource  IS 'true nếu form cần chọn tài nguyên (phòng/xe) — map vào requests.resource_id';
COMMENT ON COLUMN form_types.requires_time_range IS 'true nếu form cần thời gian — map vào requests.start/end_datetime';


-- ============================================================
-- TABLE: requests
-- CORE TABLE — yêu cầu phê duyệt (mọi loại form)
-- ============================================================
CREATE TABLE requests (
  id                   BIGSERIAL PRIMARY KEY,

  -- ── NHÓM 1: Trường chung ─────────────────────────────────
  title                TEXT NOT NULL,
  form_type            TEXT NOT NULL,              -- Khớp với form_types.code
  status               TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN (
                         'DRAFT',       -- Đang soạn thảo, chưa submit
                         'PENDING',     -- Đã submit, chờ bắt đầu bước đầu
                         'IN_REVIEW',   -- Đang ở trong luồng phê duyệt
                         'APPROVED',    -- Được phê duyệt hoàn toàn
                         'REJECTED',    -- Bị từ chối
                         'CANCELLED'    -- Người tạo rút hoặc bị cancel
                       )),
  requester_id         BIGINT NOT NULL REFERENCES users(id),
  department           TEXT NOT NULL,              -- Snapshot bộ phận tại thời điểm tạo
  description          TEXT,                       -- Mô tả ngắn (hiển thị trong danh sách)
  notes                TEXT,                       -- Ghi chú thêm cho approver
  is_urgent            BOOLEAN NOT NULL DEFAULT false, -- Ảnh hưởng deadline từng bước

  -- ── NHÓM 2: Trường tài chính ─────────────────────────────
  -- Dùng NUMERIC(18,0) thay FLOAT để tránh lỗi làm tròn số tiền VND
  amount               NUMERIC(18,0) NOT NULL DEFAULT 0,
  budget_plan          TEXT,                       -- Mã kế hoạch ngân sách: 'KH-IT-2025-Q1'
  budget_code          TEXT,                       -- Mã ngân sách / mục chi: 'IT-INFRA-001'
  po_number            TEXT,                       -- Purchase Order number từ kế toán

  -- ── NHÓM 3: Trường tài nguyên & thời gian ─────────────────
  -- NULL với PR, PROPOSAL — bắt buộc với ROOM_BOOKING, VEHICLE_BOOKING
  resource_id          BIGINT REFERENCES resources(id),
  start_datetime       TIMESTAMPTZ,               -- Giờ bắt đầu / ngày check-in
  end_datetime         TIMESTAMPTZ,               -- Giờ kết thúc / ngày check-out

  -- ── NHÓM 4: Workflow tracking ─────────────────────────────
  workflow_template_id BIGINT REFERENCES workflow_templates(id), -- Snapshot template khi tạo
  current_step_order   INTEGER NOT NULL DEFAULT 0, -- Bước hiện tại (0 = chưa bắt đầu)

  -- ── NHÓM 5: Dữ liệu đặc thù theo form_type ───────────────
  -- Cấu trúc khác nhau theo từng loại — xem DATABASE_DESIGN.md
  form_data            JSONB NOT NULL DEFAULT '{}',

  -- ── Metadata ───────────────────────────────────────────────
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at         TIMESTAMPTZ,
  cancelled_reason     TEXT,

  CONSTRAINT valid_time_range CHECK (
    end_datetime IS NULL OR start_datetime IS NULL OR end_datetime > start_datetime
  )
);

COMMENT ON TABLE  requests             IS 'Core table — yêu cầu phê duyệt cho mọi loại biểu mẫu';
COMMENT ON COLUMN requests.form_type   IS 'Khớp với form_types.code — không dùng FK để linh hoạt';
COMMENT ON COLUMN requests.form_data   IS 'JSONB — dữ liệu đặc thù từng form_type, không cần migration khi thêm form mới';
COMMENT ON COLUMN requests.amount      IS 'NUMERIC(18,0) — tránh lỗi làm tròn khi dùng FLOAT với VND';


-- ============================================================
-- TABLE: request_items
-- Danh sách hàng hóa — CHỈ dùng cho form_type = PR
-- ============================================================
CREATE TABLE request_items (
  id            BIGSERIAL PRIMARY KEY,
  request_id    BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_name     TEXT NOT NULL,
  specs         TEXT,                              -- Quy cách / thông số kỹ thuật
  unit          TEXT,                              -- Đơn vị tính: cái, bộ, chiếc
  total_qty     NUMERIC(10,2),                     -- Tổng số lượng yêu cầu
  available_qty NUMERIC(10,2),                     -- Số lượng sẵn có trong kho
  purchase_qty  NUMERIC(10,2),                     -- Số lượng cần mua = total - available
  unit_price    NUMERIC(18,0),                     -- Đơn giá (VND)
  amount        NUMERIC(18,0),                     -- Thành tiền = purchase_qty * unit_price
  reason        TEXT,                              -- Lý do cần mua item này
  sort_order    INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE request_items IS 'Danh sách hàng hóa trong PR — chỉ dùng cho form_type = PR';


-- ============================================================
-- TABLE: request_step_instances
-- Trạng thái thực tế từng bước của từng request
-- Thay thế hoàn toàn bảng approvals cũ
-- ============================================================
CREATE TABLE request_step_instances (
  id               BIGSERIAL PRIMARY KEY,
  request_id       BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  step_id          BIGINT NOT NULL REFERENCES workflow_steps(id),
  step_order       INTEGER NOT NULL,               -- Snapshot thứ tự bước tại thời điểm tạo
  step_name        TEXT NOT NULL,                  -- Snapshot tên bước

  status           TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN (
                     'PENDING',      -- Chưa đến lượt
                     'IN_PROGRESS',  -- Đang chờ approver xử lý
                     'APPROVED',     -- Đã duyệt
                     'REJECTED',     -- Đã từ chối
                     'SKIPPED',      -- Bị bỏ qua do skip_condition
                     'ESCALATED',    -- Quá hạn, đã chuyển lên cấp trên
                     'CANCELLED'     -- Bị hủy (do request bị reject/cancel trước)
                   )),

  -- Người được assign xử lý bước này
  assigned_to_id   BIGINT REFERENCES users(id),    -- Người cụ thể (NULL nếu theo role)
  assigned_role    TEXT,                            -- Role chung (khi assigned_to_id IS NULL)

  -- Timestamps
  assigned_at      TIMESTAMPTZ,                    -- Khi nào bước này bắt đầu (IN_PROGRESS)
  deadline_at      TIMESTAMPTZ,                    -- Hạn chót xử lý
  acted_at         TIMESTAMPTZ,                    -- Khi nào approver hoàn tất
  escalated_at     TIMESTAMPTZ,                    -- Khi nào bị escalate

  -- Kết quả
  comment          TEXT,                           -- Comment của approver
  acted_by_id      BIGINT REFERENCES users(id),   -- Người thực sự xử lý (khác assigned nếu delegate)
  is_delegated     BOOLEAN NOT NULL DEFAULT false, -- true nếu xử lý qua ủy quyền

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  request_step_instances              IS 'Trạng thái thực tế từng bước phê duyệt — thay thế bảng approvals cũ';
COMMENT ON COLUMN request_step_instances.assigned_to_id IS 'NULL nếu bước này assign theo role, không phải user cụ thể';
COMMENT ON COLUMN request_step_instances.is_delegated   IS 'true khi acted_by_id khác assigned_to_id do ủy quyền';


-- ============================================================
-- TABLE: delegations
-- Ủy quyền phê duyệt có thời hạn
-- ============================================================
CREATE TABLE delegations (
  id               BIGSERIAL PRIMARY KEY,
  delegator_id     BIGINT NOT NULL REFERENCES users(id), -- Người ủy quyền
  delegatee_id     BIGINT NOT NULL REFERENCES users(id), -- Người được ủy quyền
  valid_from       TIMESTAMPTZ NOT NULL,
  valid_until      TIMESTAMPTZ NOT NULL,
  scope_form_types TEXT[],                               -- NULL = tất cả; ['PR','PROPOSAL'] = giới hạn
  max_amount       NUMERIC(18,0),                        -- NULL = không giới hạn số tiền
  reason           TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_delegation_period  CHECK (valid_until > valid_from),
  CONSTRAINT no_self_delegation       CHECK (delegator_id != delegatee_id)
);

COMMENT ON TABLE  delegations                  IS 'Ủy quyền phê duyệt có thời hạn và phạm vi';
COMMENT ON COLUMN delegations.scope_form_types IS 'NULL = ủy quyền tất cả loại form; nếu có giá trị = chỉ các form type trong mảng';


-- ============================================================
-- TABLE: audit_log
-- Bất biến — không UPDATE, không DELETE
-- ============================================================
CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  request_id  BIGINT REFERENCES requests(id),
  event_type  TEXT NOT NULL,                       -- 'SUBMIT'|'APPROVE'|'REJECT'|'ESCALATE'|
                                                   -- 'DELEGATE'|'CANCEL'|'COMPLETE'|'SKIP'
  actor_id    BIGINT REFERENCES users(id),
  actor_name  TEXT NOT NULL,                       -- Snapshot tên — không thay đổi kể cả user bị xóa sau
  target_id   BIGINT,                              -- step_instance_id, delegation_id tùy event
  old_value   JSONB,
  new_value   JSONB,
  metadata    JSONB DEFAULT '{}',                  -- IP, user-agent, thông tin phụ
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE audit_log IS 'Audit log bất biến — RLS chỉ cho phép INSERT, không UPDATE/DELETE';
