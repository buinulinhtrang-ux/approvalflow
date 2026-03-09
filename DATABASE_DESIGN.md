# Thiết kế Database — Hệ thống Phê duyệt Linh hoạt
**Database:** PostgreSQL trên Supabase
**Phương án:** Hybrid — Cột thật cho trường quan trọng + JSONB cho dữ liệu đặc thù từng form

---

## 1. Nguyên tắc phân loại: Cột thật vs JSONB

### Quy tắc đưa vào CỘT THẬT
| Tiêu chí | Lý do |
|----------|-------|
| Dùng trong `WHERE` / `ORDER BY` thường xuyên | Index được, query nhanh |
| Dùng làm điều kiện đánh giá workflow (skip, branch) | Engine cần đọc trực tiếp, không parse JSON |
| Dùng cho kiểm tra conflict tài nguyên (phòng, xe) | Cần index composite trên `(resource_id, start_datetime, end_datetime)` |
| Dùng cho báo cáo tài chính chéo nhiều loại form | `GROUP BY budget_code`, `SUM(amount)` phải chạy trên cột thật |
| Dùng cho dashboard / filter danh sách | Người dùng filter theo budget_code, po_number, trạng thái, v.v. |

### Quy tắc đưa vào JSONB `form_data`
| Tiêu chí | Lý do |
|----------|-------|
| Chỉ hiển thị khi xem chi tiết 1 request | Không cần index, fetch 1 row là đủ |
| Cấu trúc khác nhau hoàn toàn giữa các loại form | Không có mẫu số chung để tạo cột |
| Có thể thay đổi schema khi thêm form mới | Zero migration khi thêm trường mới vào form_data |
| Là mảng / nested object (danh sách hàng, danh sách bộ phận...) | JSONB array native trong PostgreSQL |

### Lợi thế PostgreSQL JSONB so với SQLite TEXT
- **GIN Index** trên JSONB → query `form_data @> '{"city": "Hà Nội"}'` được index
- Toán tử `->>`, `->`, `@>`, `?` native — không cần `json_extract()` dài dòng
- Validate schema trong app layer, constraint bằng `CHECK` expression nếu cần
- Supabase Studio hiển thị JSONB đẹp, dễ debug

---

## 2. Phân loại toàn bộ trường hiện tại

### Bảng phân loại — Form PR (Purchase Request)

| Trường hiện tại | Kiểu hiện tại | Phân loại mới | Lý do |
|----------------|---------------|---------------|-------|
| `title` | TEXT column | **Cột thật** | Hiển thị trong danh sách, search |
| `description` | TEXT column | **Cột thật** | Mô tả ngắn, hiển thị trong list |
| `amount` | REAL column | **Cột thật** | Điều kiện workflow, báo cáo tài chính |
| `budget_plan` | TEXT column | **Cột thật** | Báo cáo tài chính, filter theo kế hoạch ngân sách |
| `budget_code` | TEXT column | **Cột thật** | Hạch toán, báo cáo chi phí theo mã |
| `po_number` | TEXT column | **Cột thật** | Đối chiếu PO với kế toán, tracking mua sắm |
| `notes` | TEXT column | **Cột thật** | Hiển thị cho approver, common mọi form |
| `request_group` | TEXT column | JSONB `form_data` | Đặc thù PR, ít khi filter chéo |
| `deadline_days` | INTEGER column | JSONB `form_data` | Đặc thù PR, ít khi query |
| `leadtime` | TEXT column | JSONB `form_data` | Đặc thù PR, chỉ hiển thị |
| `items[]` | Bảng `request_items` | **Giữ nguyên bảng riêng** | Cấu trúc tài chính chi tiết, cần query tổng |

### Bảng phân loại — Form PROPOSAL (Tờ trình)

| Trường hiện tại | Kiểu hiện tại | Phân loại mới | Lý do |
|----------------|---------------|---------------|-------|
| `title` | TEXT column | **Cột thật** | Hiển thị trong danh sách |
| `amount` | REAL column | **Cột thật** | Tổng chi phí, điều kiện workflow |
| `proposal_overview` | TEXT column | JSONB `form_data.overview` | Chỉ hiển thị trong chi tiết |
| `proposal_time` | TEXT column | JSONB `form_data.event_time` | Chỉ hiển thị trong chi tiết |
| `proposal_location` | TEXT column | JSONB `form_data.location` | Chỉ hiển thị trong chi tiết |
| `proposal_chairperson` | TEXT column | JSONB `form_data.chairperson` | Chỉ hiển thị trong chi tiết |
| `proposal_form` | TEXT column | JSONB `form_data.format` | Chỉ hiển thị trong chi tiết |
| `proposal_target` | TEXT column | JSONB `form_data.target_audience` | Chỉ hiển thị trong chi tiết |
| `proposal_requirements` | TEXT column | JSONB `form_data.requirements` | Chỉ hiển thị trong chi tiết |
| `proposal_method_support` | TEXT (JSON string) | JSONB `form_data.method_support[]` | Array, chỉ hiển thị |
| `proposal_costs` | TEXT (JSON string) | JSONB `form_data.costs[]` | Array, chỉ hiển thị |
| `proposal_results` | TEXT column | JSONB `form_data.expected_results` | Chỉ hiển thị trong chi tiết |

---

## 3. Schema đầy đủ — PostgreSQL DDL

### 3.1. Bảng `users` (mở rộng từ hiện tại)

```sql
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  employee_id   TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,                        -- bcrypt, không plaintext
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL                          -- 'REQUESTER'|'MANAGER'|'CFO'|'COO'|'ADMIN'
                CHECK (role IN ('REQUESTER','MANAGER','CFO','COO','ADMIN')),
  department    TEXT,
  level         TEXT,
  title         TEXT,
  manager_id    BIGINT REFERENCES users(id),           -- THÊM MỚI: quản lý trực tiếp (cho dynamic approver)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role_dept ON users(role, department) WHERE is_active = true;
CREATE INDEX idx_users_manager   ON users(manager_id);
```

**Giải thích `manager_id`:** Workflow engine dùng để resolve dynamic approver — khi 1 bước cấu hình `approver_type = 'DYNAMIC_MANAGER'`, engine tự tìm `users WHERE id = requester.manager_id`.

---

### 3.2. Bảng `resources` (MỚI — phòng họp, xe, ...)

```sql
CREATE TABLE resources (
  id            BIGSERIAL PRIMARY KEY,
  type          TEXT NOT NULL                          -- 'ROOM'|'VEHICLE'|'OTHER'
                CHECK (type IN ('ROOM', 'VEHICLE', 'OTHER')),
  name          TEXT NOT NULL,                         -- 'Phòng họp A - Tầng 3', 'Toyota Camry - 30A-12345'
  code          TEXT UNIQUE,                           -- Mã nội bộ: 'ROOM-3A', 'VEH-001'
  capacity      INTEGER,                              -- Sức chứa (người / chỗ ngồi)
  location      TEXT,                                 -- Tầng, tòa nhà, vị trí
  description   TEXT,
  properties    JSONB DEFAULT '{}',                   -- Thuộc tính đặc thù: {"has_projector": true, "plate": "30A-12345"}
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_resources_type ON resources(type) WHERE is_active = true;
```

---

### 3.3. Bảng `form_types` (MỚI — danh mục & schema registry)

```sql
CREATE TABLE form_types (
  id                   BIGSERIAL PRIMARY KEY,
  code                 TEXT UNIQUE NOT NULL,           -- 'PR'|'PROPOSAL'|'ROOM_BOOKING'|'VEHICLE_BOOKING'|'ACCOMMODATION'
  name                 TEXT NOT NULL,                  -- 'Yêu cầu mua sắm', 'Tờ trình phê duyệt', ...
  description          TEXT,
  icon                 TEXT,                           -- Tên icon Lucide: 'ShoppingCart', 'FileText', ...
  active_template_id   BIGINT,                         -- FK tới workflow_templates (gán sau)
  field_schema         JSONB NOT NULL DEFAULT '{}',    -- Schema registry: định nghĩa fields để render form động
  requires_resource    BOOLEAN NOT NULL DEFAULT false, -- true nếu form này cần chọn tài nguyên (phòng/xe)
  requires_time_range  BOOLEAN NOT NULL DEFAULT false, -- true nếu cần start/end datetime
  sort_order           INTEGER NOT NULL DEFAULT 0,     -- Thứ tự hiển thị trong danh sách chọn form
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Cấu trúc `field_schema` — ví dụ cho ROOM_BOOKING:**
```json
{
  "sections": [
    {
      "title": "Thông tin đặt phòng",
      "fields": [
        {
          "key": "attendees_count",
          "label": "Số người tham dự",
          "type": "number",
          "required": true,
          "min": 1
        },
        {
          "key": "purpose",
          "label": "Mục đích sử dụng",
          "type": "textarea",
          "required": true,
          "placeholder": "Họp nhóm, đào tạo, phỏng vấn..."
        },
        {
          "key": "equipment_needed",
          "label": "Thiết bị cần hỗ trợ",
          "type": "checkbox_group",
          "required": false,
          "options": ["Máy chiếu", "Bảng trắng", "TV", "Micro", "Webcam"]
        },
        {
          "key": "setup_notes",
          "label": "Yêu cầu sắp xếp phòng",
          "type": "text",
          "required": false
        }
      ]
    }
  ],
  "promoted_fields": {
    "resource_type": "ROOM",
    "resource_label": "Phòng họp",
    "start_label": "Thời gian bắt đầu",
    "end_label": "Thời gian kết thúc"
  }
}
```

**`promoted_fields`** — phần đặc biệt trong schema để frontend biết cần render widget chọn tài nguyên và time range (sẽ map vào cột thật `resource_id`, `start_datetime`, `end_datetime`).

---

### 3.4. Bảng `workflow_templates` (MỚI)

```sql
CREATE TABLE workflow_templates (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,                         -- 'Luồng phê duyệt mua sắm tiêu chuẩn'
  description   TEXT,
  version       INTEGER NOT NULL DEFAULT 1,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    BIGINT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

### 3.5. Bảng `workflow_steps` (MỚI)

```sql
CREATE TABLE workflow_steps (
  id               BIGSERIAL PRIMARY KEY,
  template_id      BIGINT NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  step_order       INTEGER NOT NULL,                   -- Thứ tự bước: 1, 2, 3, ...
  step_name        TEXT NOT NULL,                      -- 'Trưởng bộ phận', 'CFO', 'COO'

  -- Loại approver
  approver_type    TEXT NOT NULL                       -- Cách xác định người duyệt
                   CHECK (approver_type IN (
                     'FIXED_ROLE',        -- Theo role: CFO, COO, MANAGER
                     'FIXED_USER',        -- Người cụ thể theo user_id
                     'DYNAMIC_MANAGER',   -- Lấy manager_id của người tạo request
                     'DYNAMIC_DEPT_HEAD', -- Lấy MANAGER cùng department với requester
                     'REQUESTER_SELECT'   -- Người tạo tự chọn approver khi submit
                   )),
  approver_value   TEXT,                               -- Giá trị tùy theo type:
                                                       -- FIXED_ROLE   → 'CFO', 'COO', 'MANAGER'
                                                       -- FIXED_USER   → user_id dạng text
                                                       -- DYNAMIC_*    → NULL (engine tự tính)
                                                       -- REQUESTER_SELECT → NULL

  -- Cấu hình xử lý nhiều approver trong 1 bước (song song)
  parallel_group   INTEGER,                            -- Bước cùng parallel_group chạy đồng thời
  require_all      BOOLEAN NOT NULL DEFAULT true,      -- true: cần tất cả đồng ý; false: chỉ cần 1 người

  -- Thời hạn & leo thang
  deadline_hours   INTEGER NOT NULL DEFAULT 48,        -- Thời hạn xử lý (giờ)
  reminder_hours   INTEGER,                            -- Gửi nhắc trước deadline bao nhiêu giờ (NULL = không nhắc)
  escalate_to_role TEXT,                               -- Role sẽ nhận task khi hết hạn (NULL = auto-reject/approve)
  on_timeout       TEXT NOT NULL DEFAULT 'ESCALATE'    -- 'ESCALATE'|'AUTO_APPROVE'|'AUTO_REJECT'
                   CHECK (on_timeout IN ('ESCALATE', 'AUTO_APPROVE', 'AUTO_REJECT')),

  -- Điều kiện bỏ qua bước
  skip_condition   JSONB,                              -- NULL = không bỏ qua, có JSON = đánh giá condition
                                                       -- {"field": "amount", "op": "<", "value": 5000000}
                                                       -- {"field": "is_urgent", "op": "=", "value": true}

  -- Hành động khi bị từ chối
  on_reject        TEXT NOT NULL DEFAULT 'RETURN_REQUESTER'
                   CHECK (on_reject IN (
                     'RETURN_REQUESTER',  -- Trả về người tạo để chỉnh sửa và submit lại
                     'RETURN_PREV_STEP',  -- Trả về bước trước
                     'CANCEL_REQUEST'     -- Hủy request luôn
                   )),

  UNIQUE (template_id, step_order),
  CONSTRAINT valid_fixed_role CHECK (
    approver_type != 'FIXED_ROLE' OR approver_value IS NOT NULL
  )
);

CREATE INDEX idx_wf_steps_template ON workflow_steps(template_id, step_order);
```

---

### 3.6. Bảng `requests` (SỬA từ hiện tại — CORE TABLE)

```sql
CREATE TABLE requests (
  id                   BIGSERIAL PRIMARY KEY,

  -- =========================================================
  -- NHÓM 1: TRƯỜNG CHUNG — có ở mọi loại form
  -- =========================================================
  title                TEXT NOT NULL,
  form_type            TEXT NOT NULL,                  -- 'PR'|'PROPOSAL'|'ROOM_BOOKING'|'VEHICLE_BOOKING'|'ACCOMMODATION'
  status               TEXT NOT NULL DEFAULT 'PENDING'
                       CHECK (status IN ('DRAFT','PENDING','IN_REVIEW','APPROVED','REJECTED','CANCELLED')),
  requester_id         BIGINT NOT NULL REFERENCES users(id),
  department           TEXT NOT NULL,                  -- Snapshot tại thời điểm tạo (department của requester)
  description          TEXT,                           -- Mô tả ngắn, hiển thị trong danh sách
  notes                TEXT,                           -- Ghi chú cho approver
  is_urgent            BOOLEAN NOT NULL DEFAULT false, -- Ảnh hưởng deadline từng bước

  -- =========================================================
  -- NHÓM 2: TRƯỜNG TÀI CHÍNH — cột thật vì dùng báo cáo & workflow condition
  -- =========================================================
  amount               NUMERIC(18,0) NOT NULL DEFAULT 0,  -- Tổng giá trị (VND, không dùng FLOAT tránh lỗi làm tròn)
  budget_plan          TEXT,                           -- Mã kế hoạch ngân sách (VD: 'KH-IT-2025-Q1')
  budget_code          TEXT,                           -- Mã ngân sách / mục chi (VD: 'IT-INFRA-001')
  po_number            TEXT,                           -- PO Number từ hệ thống kế toán

  -- =========================================================
  -- NHÓM 3: TRƯỜNG TÀI NGUYÊN & THỜI GIAN — cột thật vì cần conflict check
  -- Áp dụng cho: ROOM_BOOKING, VEHICLE_BOOKING, ACCOMMODATION
  -- NULL đối với PR, PROPOSAL
  -- =========================================================
  resource_id          BIGINT REFERENCES resources(id),  -- Phòng họp hoặc xe được đặt
  start_datetime       TIMESTAMPTZ,                    -- Giờ bắt đầu / ngày check-in
  end_datetime         TIMESTAMPTZ,                    -- Giờ kết thúc / ngày check-out

  -- =========================================================
  -- NHÓM 4: WORKFLOW TRACKING
  -- =========================================================
  workflow_template_id BIGINT REFERENCES workflow_templates(id),  -- Snapshot template khi tạo request
  current_step_order   INTEGER NOT NULL DEFAULT 0,    -- Bước hiện tại (0 = chưa bắt đầu)

  -- =========================================================
  -- NHÓM 5: DỮ LIỆU ĐẶC THÙ — JSONB, khác nhau theo từng form_type
  -- =========================================================
  form_data            JSONB NOT NULL DEFAULT '{}',

  -- =========================================================
  -- METADATA
  -- =========================================================
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at         TIMESTAMPTZ,
  cancelled_reason     TEXT
);

-- Index cho dashboard & filter thường dùng
CREATE INDEX idx_requests_requester    ON requests(requester_id, created_at DESC);
CREATE INDEX idx_requests_status       ON requests(status, form_type);
CREATE INDEX idx_requests_department   ON requests(department, status);
CREATE INDEX idx_requests_budget_code  ON requests(budget_code) WHERE budget_code IS NOT NULL;
CREATE INDEX idx_requests_budget_plan  ON requests(budget_plan) WHERE budget_plan IS NOT NULL;
CREATE INDEX idx_requests_po_number    ON requests(po_number) WHERE po_number IS NOT NULL;
CREATE INDEX idx_requests_workflow     ON requests(workflow_template_id, current_step_order);

-- Index conflict check cho tài nguyên (phòng họp, xe)
-- Partial index chỉ trên các request chưa bị hủy/từ chối
CREATE INDEX idx_requests_resource_time ON requests(resource_id, start_datetime, end_datetime)
  WHERE resource_id IS NOT NULL
    AND status NOT IN ('REJECTED', 'CANCELLED');

-- GIN index cho query trên form_data JSONB
CREATE INDEX idx_requests_form_data_gin ON requests USING GIN (form_data);
```

---

### 3.7. Bảng `request_items` (GIỮ NGUYÊN — chỉ dùng cho PR)

```sql
CREATE TABLE request_items (
  id            BIGSERIAL PRIMARY KEY,
  request_id    BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_name     TEXT NOT NULL,
  specs         TEXT,                                  -- Quy cách / thông số kỹ thuật
  unit          TEXT,                                  -- Đơn vị tính
  total_qty     NUMERIC(10,2),                         -- Tổng số lượng yêu cầu
  available_qty NUMERIC(10,2),                         -- Số lượng sẵn có trong kho
  purchase_qty  NUMERIC(10,2),                         -- Số lượng cần mua = total - available
  unit_price    NUMERIC(18,0),                         -- Đơn giá (VND)
  amount        NUMERIC(18,0),                         -- Thành tiền = purchase_qty * unit_price
  reason        TEXT,                                  -- Lý do cần mua
  sort_order    INTEGER NOT NULL DEFAULT 0             -- Thứ tự dòng
);

CREATE INDEX idx_request_items_request ON request_items(request_id);
```

---

### 3.8. Bảng `request_step_instances` (MỚI — trạng thái thực tế từng bước)

```sql
CREATE TABLE request_step_instances (
  id               BIGSERIAL PRIMARY KEY,
  request_id       BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  step_id          BIGINT NOT NULL REFERENCES workflow_steps(id),
  step_order       INTEGER NOT NULL,                   -- Snapshot thứ tự bước
  step_name        TEXT NOT NULL,                      -- Snapshot tên bước
  status           TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','IN_PROGRESS','APPROVED','REJECTED','SKIPPED','ESCALATED')),

  -- Người được giao xử lý (resolved tại thời điểm khởi tạo bước)
  assigned_to_id   BIGINT REFERENCES users(id),        -- Người cụ thể được assign
  assigned_role    TEXT,                               -- Hoặc theo role (nếu không resolve được user cụ thể)

  -- Timestamps
  assigned_at      TIMESTAMPTZ,                        -- Khi nào bắt đầu bước này
  deadline_at      TIMESTAMPTZ,                        -- Hạn chót xử lý
  acted_at         TIMESTAMPTZ,                        -- Khi nào approver xử lý xong
  escalated_at     TIMESTAMPTZ,                        -- Khi nào bị escalate (nếu có)

  -- Kết quả
  comment          TEXT,                               -- Comment của approver
  acted_by_id      BIGINT REFERENCES users(id),        -- Người thực sự xử lý (có thể khác assigned nếu delegate)
  is_delegated     BOOLEAN NOT NULL DEFAULT false,     -- true nếu xử lý qua ủy quyền

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_step_instances_request   ON request_step_instances(request_id, step_order);
CREATE INDEX idx_step_instances_assigned  ON request_step_instances(assigned_to_id, status)
  WHERE status IN ('PENDING', 'IN_PROGRESS');
CREATE INDEX idx_step_instances_deadline  ON request_step_instances(deadline_at)
  WHERE status IN ('PENDING', 'IN_PROGRESS', 'ESCALATED');
```

**Bảng này thay thế hoàn toàn cột `current_approver_role` và bảng `approvals` hiện tại.**
Bảng `approvals` cũ sẽ được migrate vào đây.

---

### 3.9. Bảng `delegations` (MỚI — ủy quyền)

```sql
CREATE TABLE delegations (
  id               BIGSERIAL PRIMARY KEY,
  delegator_id     BIGINT NOT NULL REFERENCES users(id),   -- Người ủy quyền
  delegatee_id     BIGINT NOT NULL REFERENCES users(id),   -- Người được ủy quyền
  valid_from       TIMESTAMPTZ NOT NULL,
  valid_until      TIMESTAMPTZ NOT NULL,
  scope_form_types TEXT[],                                  -- NULL = tất cả loại form; ['PR','PROPOSAL'] = giới hạn
  max_amount       NUMERIC(18,0),                           -- NULL = không giới hạn số tiền
  reason           TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT valid_period CHECK (valid_until > valid_from),
  CONSTRAINT no_self_delegate CHECK (delegator_id != delegatee_id)
);

CREATE INDEX idx_delegations_delegatee ON delegations(delegatee_id, valid_from, valid_until)
  WHERE is_active = true;
CREATE INDEX idx_delegations_delegator ON delegations(delegator_id)
  WHERE is_active = true;
```

---

### 3.10. Bảng `audit_log` (MỚI — bất biến)

```sql
CREATE TABLE audit_log (
  id           BIGSERIAL PRIMARY KEY,
  request_id   BIGINT REFERENCES requests(id),
  event_type   TEXT NOT NULL,                          -- 'SUBMIT'|'APPROVE'|'REJECT'|'ESCALATE'|'DELEGATE'|'CANCEL'|'TEMPLATE_CHANGE'
  actor_id     BIGINT REFERENCES users(id),            -- Ai thực hiện
  actor_name   TEXT NOT NULL,                          -- Snapshot tên (không đổi kể cả sau này user bị xóa)
  target_id    BIGINT,                                 -- ID đối tượng liên quan (step_instance_id, delegation_id, ...)
  old_value    JSONB,                                  -- Giá trị trước khi thay đổi
  new_value    JSONB,                                  -- Giá trị sau khi thay đổi
  metadata     JSONB DEFAULT '{}',                     -- Thông tin bổ sung: IP, user-agent, ...
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_request ON audit_log(request_id, created_at DESC);
CREATE INDEX idx_audit_log_actor   ON audit_log(actor_id, created_at DESC);

-- KHÔNG có UPDATE, DELETE trên bảng này — enforce qua RLS Supabase
```

---

## 4. Cấu trúc `form_data` JSONB theo từng loại form

### 4.1. Form `PR` — Yêu cầu mua sắm

**Cột thật:** `title`, `amount`, `budget_plan`, `budget_code`, `po_number`, `notes`, `description`
**Riêng:** Bảng `request_items` cho danh sách hàng hóa

```json
{
  "request_group": "Thiết bị văn phòng",
  "deadline_days": 7,
  "leadtime": "2-3 tuần"
}
```

> Cực kỳ gọn vì phần lớn đã được promote lên cột thật hoặc chuyển sang `request_items`.

---

### 4.2. Form `PROPOSAL` — Tờ trình phê duyệt

**Cột thật:** `title`, `amount` (tổng chi phí), `budget_plan`, `budget_code`, `notes`, `description`

```json
{
  "overview": "Tổ chức chương trình đào tạo kỹ năng mềm cho nhân viên toàn trường",
  "event_time": "Tháng 4/2025, từ ngày 10-12/4",
  "location": "Hội trường lớn - Tầng 3, Tòa A",
  "chairperson": "Nguyễn Thị B - Trưởng phòng Nhân sự",
  "format": "Offline, kết hợp workshop thực hành",
  "target_audience": "Toàn thể nhân viên văn phòng (~120 người)",
  "requirements": "Cần hỗ trợ thiết bị âm thanh, ánh sáng và in ấn tài liệu",
  "method_support": [
    { "dept_name": "IT", "content": "Chuẩn bị máy chiếu, micro, livestream" },
    { "dept_name": "Hành chính", "content": "In tài liệu 120 bộ, chuẩn bị nước uống" },
    { "dept_name": "Kế toán", "content": "Thanh toán hóa đơn dịch vụ" }
  ],
  "costs": [
    { "product_name": "Thuê giảng viên", "content": "2 buổi x 4 giờ", "quantity": 2, "unit_price": 5000000, "amount": 10000000 },
    { "product_name": "In tài liệu", "content": "120 bộ x 50 trang", "quantity": 120, "unit_price": 15000, "amount": 1800000 },
    { "product_name": "Nước uống & coffee break", "content": "3 ngày x 120 người", "quantity": 360, "unit_price": 30000, "amount": 10800000 }
  ],
  "expected_results": "Nâng cao kỹ năng giao tiếp, làm việc nhóm cho 120 nhân viên. KPI: 85% đánh giá hài lòng sau khóa học"
}
```

---

### 4.3. Form `ROOM_BOOKING` — Đặt phòng họp

**Cột thật:** `title`, `resource_id` (phòng), `start_datetime`, `end_datetime`, `amount` (= 0 hoặc phí thuê)
**Conflict check query:**
```sql
SELECT id FROM requests
WHERE resource_id = $room_id
  AND status NOT IN ('REJECTED', 'CANCELLED')
  AND start_datetime < $end AND end_datetime > $start;
```

```json
{
  "attendees_count": 15,
  "purpose": "Họp triển khai dự án X - Sprint review Q1",
  "equipment_needed": ["Máy chiếu", "Bảng trắng", "Webcam"],
  "setup_notes": "Sắp xếp kiểu chữ U, cần 2 màn hình phụ",
  "external_guests": false
}
```

---

### 4.4. Form `VEHICLE_BOOKING` — Đặt xe công ty

**Cột thật:** `title`, `resource_id` (xe, NULL nếu chưa assign), `start_datetime` (giờ đón), `end_datetime` (giờ về dự kiến), `amount` (= 0 hoặc phí thuê ngoài)

```json
{
  "departure_location": "Văn phòng HN - 123 Lê Duẩn, Ba Đình",
  "destination": "Khu công nghiệp Thăng Long, Hà Nội",
  "purpose": "Thăm và kiểm tra tiến độ đối tác sản xuất",
  "passengers_count": 4,
  "passengers": ["Nguyễn Văn A", "Trần Thị B", "Lê Văn C", "Phạm Thị D"],
  "return_expected_time": "17:30",
  "note_for_driver": "Đón tại cổng chính, cần đến trước 10 phút"
}
```

---

### 4.5. Form `ACCOMMODATION` — Đặt phòng lưu trú công tác

**Cột thật:** `title`, `start_datetime` (check-in), `end_datetime` (check-out), `amount` (chi phí dự kiến), `budget_plan`, `budget_code`

```json
{
  "city": "Đà Nẵng",
  "hotel_preference": "Khách sạn 3-4 sao gần biển Mỹ Khê",
  "num_rooms": 2,
  "guests": [
    { "name": "Nguyễn Văn A", "employee_id": "NV001" },
    { "name": "Trần Thị B", "employee_id": "NV042" }
  ],
  "business_trip_purpose": "Tham dự hội nghị giáo dục toàn quốc 2025",
  "linked_vehicle_request_id": null,
  "special_requirements": "Cần 2 phòng liền kề, phòng có bàn làm việc"
}
```

---

## 5. Thêm loại biểu mẫu mới — Zero Migration

Khi cần thêm form mới, ví dụ `OVERTIME_REQUEST` (Đăng ký làm thêm giờ):

```sql
-- Bước 1: Thêm 1 row vào form_types (không cần migration schema)
INSERT INTO form_types (code, name, description, icon, field_schema, sort_order)
VALUES (
  'OVERTIME_REQUEST',
  'Đăng ký làm thêm giờ',
  'Yêu cầu phê duyệt làm ngoài giờ hành chính',
  'Clock',
  '{
    "sections": [{
      "title": "Thông tin làm thêm giờ",
      "fields": [
        {"key": "work_date", "label": "Ngày làm thêm", "type": "date", "required": true},
        {"key": "start_time", "label": "Giờ bắt đầu", "type": "time", "required": true},
        {"key": "end_time", "label": "Giờ kết thúc", "type": "time", "required": true},
        {"key": "reason", "label": "Lý do làm thêm", "type": "textarea", "required": true},
        {"key": "work_content", "label": "Nội dung công việc", "type": "textarea", "required": true},
        {"key": "estimated_hours", "label": "Số giờ dự kiến", "type": "number", "required": true}
      ]
    }]
  }',
  5
);

-- Bước 2: Tạo workflow template cho loại form này (hoặc tái dùng template có sẵn)
-- Bước 3: Gán template vào form_type
UPDATE form_types SET active_template_id = $template_id WHERE code = 'OVERTIME_REQUEST';

-- Bước 4: Viết React component OvertimeRequestForm (đọc field_schema, render động)
-- KHÔNG thêm cột mới vào bảng requests
-- KHÔNG viết thêm SQL migration
```

---

## 6. Ví dụ Workflow Engine — Đánh giá điều kiện skip

```sql
-- Workflow Engine đọc skip_condition của bước và evaluate:
-- skip_condition = {"field": "amount", "op": "<", "value": 5000000}

-- Với cột thật (amount): đọc trực tiếp từ requests.amount
SELECT amount FROM requests WHERE id = $request_id;

-- Với field trong form_data:
-- skip_condition = {"field": "form_data.attendees_count", "op": ">", "value": 50}
SELECT (form_data->>'attendees_count')::int FROM requests WHERE id = $request_id;
```

---

## 7. Conflict Check — Đặt phòng họp không trùng lịch

```sql
-- Kiểm tra phòng ROOM-3A có bị đặt chồng ngày 15/3, 09:00-11:00 không?
SELECT r.id, r.title, r.start_datetime, r.end_datetime, u.name as requester_name
FROM requests r
JOIN users u ON r.requester_id = u.id
WHERE r.resource_id = $room_id
  AND r.status NOT IN ('REJECTED', 'CANCELLED')
  AND r.start_datetime < '2025-03-15 11:00:00+07'
  AND r.end_datetime   > '2025-03-15 09:00:00+07'
  AND r.id != $current_request_id;  -- Loại trừ request đang xem nếu đang edit
```

Query trên chạy trên **cột thật với partial index** → O(log n), cực nhanh.

---

## 8. Báo cáo tài chính — Query trên cột thật

```sql
-- Tổng chi tiêu theo mã ngân sách trong năm 2025
SELECT
  budget_code,
  budget_plan,
  COUNT(*) as request_count,
  SUM(amount) as total_amount
FROM requests
WHERE status = 'APPROVED'
  AND created_at BETWEEN '2025-01-01' AND '2025-12-31'
  AND budget_code IS NOT NULL
GROUP BY budget_code, budget_plan
ORDER BY total_amount DESC;

-- Query này chạy trên cột thật → dùng index idx_requests_budget_code
-- Không cần json_extract, không full scan
```

---

## 9. Supabase — Row Level Security (RLS)

```sql
-- Bật RLS
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Requester chỉ thấy request của mình
CREATE POLICY "requester_own_requests" ON requests
  FOR SELECT USING (requester_id = auth.uid()::bigint);

-- Approver thấy request đang ở bước cần họ duyệt
CREATE POLICY "approver_assigned_requests" ON requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM request_step_instances rsi
      WHERE rsi.request_id = requests.id
        AND rsi.assigned_to_id = auth.uid()::bigint
        AND rsi.status IN ('PENDING', 'IN_PROGRESS')
    )
  );

-- Admin thấy tất cả
CREATE POLICY "admin_all_requests" ON requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid()::bigint AND role = 'ADMIN')
  );

-- audit_log: không ai được UPDATE hoặc DELETE
CREATE POLICY "audit_log_insert_only" ON audit_log
  FOR INSERT WITH CHECK (true);
-- Không tạo policy cho UPDATE/DELETE → mặc định bị chặn
```

---

## 10. Tóm tắt — Bảng vs Cột vs JSONB

```
requests (bảng chính)
├── Cột chung:     title, description, notes, status, form_type
│                  requester_id, department, is_urgent, created_at
├── Cột tài chính: amount, budget_plan, budget_code, po_number   ← PROMOTE lên cột thật
├── Cột tài nguyên: resource_id, start_datetime, end_datetime    ← PROMOTE lên cột thật
├── Cột workflow:  workflow_template_id, current_step_order
└── JSONB:         form_data { ... dữ liệu đặc thù từng form ... }

request_items (riêng cho PR — giữ nguyên cấu trúc)
resources (phòng họp, xe, ...)
form_types (schema registry — thêm form mới = thêm 1 row)
workflow_templates + workflow_steps (engine phê duyệt linh hoạt)
request_step_instances (trạng thái thực tế từng bước)
delegations (ủy quyền)
audit_log (bất biến — không UPDATE/DELETE)
```

### Quy tắc vàng khi thêm field mới

```
Hỏi: "Field này có cần WHERE, ORDER BY, GROUP BY, JOIN không?"
  ├── Có → Cột thật (thêm migration)
  └── Không → JSONB form_data (không cần migration, chỉ cập nhật field_schema)

Hỏi: "Field này có ở nhiều loại form khác nhau không?"
  ├── Có (budget_code, notes...) → Cột thật
  └── Không (chỉ 1 form) → JSONB form_data
```
