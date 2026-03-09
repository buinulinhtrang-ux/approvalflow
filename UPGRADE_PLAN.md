# Kế hoạch Nâng cấp — Hệ thống Phê duyệt Linh hoạt

## Tổng quan kỹ thuật

| Thành phần | Hiện tại | Mục tiêu |
|------------|----------|----------|
| Frontend | React 19 + TypeScript + Vite + TailwindCSS v4 | Giữ nguyên, mở rộng |
| Database | Supabase PostgreSQL (DB cũ) | **Supabase PostgreSQL mới — fresh setup** |
| Logic | Supabase RPC functions | Supabase RPC functions (viết lại hoàn toàn) |
| Auth | localStorage | Giữ nguyên tạm thời |
| Deploy | GitHub Pages | Giữ nguyên |

**Bối cảnh:** DB mới hoàn toàn — không có data cũ, không cần migrate, không cần backward compatibility. Bắt đầu sạch từ đầu.

---

## Kiến trúc mục tiêu

```
React Frontend
    │
    ├── supabase.from('...').select/insert/update   ← CRUD đơn giản
    ├── supabase.rpc('create_request', {...})        ← Tạo request + khởi tạo workflow
    ├── supabase.rpc('approve_step', {...})          ← Xử lý phê duyệt từng bước
    ├── supabase.rpc('admin_save_template', {...})   ← Admin lưu workflow template
    └── supabase.rpc('check_resource_conflict',{})  ← Kiểm tra trùng lịch phòng/xe

Supabase PostgreSQL (DB mới)
    ├── Tables: users, resources, form_types
    │           workflow_templates, workflow_steps
    │           requests, request_items
    │           request_step_instances
    │           delegations, audit_log
    └── Functions: workflow engine, conflict check
```

---

## Tổng quan 5 Phase

| Phase | Tên | Đầu ra chính | Phụ thuộc |
|-------|-----|-------------|-----------|
| **1** | Database Setup | Schema hoàn chỉnh + seed dữ liệu mặc định | — |
| **2** | Workflow Engine | RPC functions cho toàn bộ logic nghiệp vụ | Phase 1 |
| **3** | Admin UI | Cấu hình luồng phê duyệt qua giao diện | Phase 1, 2 |
| **4** | Form Types mới | Đặt phòng, đặt xe, đặt chỗ công tác + cập nhật UI | Phase 1, 2, 3 |
| **5** | Tính năng nâng cao | Escalation, delegation, parallel, báo cáo | Phase 1–4 |

---
---

# PHASE 1 — Database Setup

**Mục tiêu:** Tạo toàn bộ schema trên DB Supabase mới. Chạy theo thứ tự từng script SQL.

---

## 1.1. Thứ tự tạo bảng (quan trọng — theo FK dependency)

```
Script 01: users
Script 02: resources
Script 03: workflow_templates
Script 04: workflow_steps          (FK → workflow_templates)
Script 05: form_types              (FK → workflow_templates)
Script 06: requests                (FK → users, resources, workflow_templates)
Script 07: request_items           (FK → requests)
Script 08: request_step_instances  (FK → requests, workflow_steps, users)
Script 09: delegations             (FK → users)
Script 10: audit_log               (FK → requests, users)
Script 11: indexes
Script 12: RLS policies
```

Schema DDL đầy đủ xem tại: [DATABASE_DESIGN.md](./DATABASE_DESIGN.md)

---

## 1.2. Seed dữ liệu mặc định

### Seed `form_types` (5 loại ban đầu)

```sql
INSERT INTO form_types (code, name, description, icon, sort_order, requires_resource, requires_time_range, field_schema)
VALUES
-- ── Form 1: PR ──────────────────────────────────────────────────────────────
('PR',
 'Yêu cầu mua sắm',
 'Purchase Request — mua sắm hàng hóa, thiết bị, dịch vụ',
 'ShoppingCart', 1, false, false,
 '{
   "sections": [{
     "title": "Thông tin PR",
     "fields": [
       {"key":"request_group","label":"Nhóm yêu cầu","type":"text"},
       {"key":"deadline_days","label":"Thời hạn thực hiện (ngày)","type":"number","min":1},
       {"key":"leadtime","label":"Leadtime dự kiến","type":"text"}
     ]
   }]
 }'
),

-- ── Form 2: PROPOSAL ────────────────────────────────────────────────────────
('PROPOSAL',
 'Tờ trình phê duyệt',
 'Tờ trình sự kiện, hoạt động, chương trình nội bộ',
 'FileText', 2, false, false,
 '{
   "sections": [{
     "title": "Nội dung tờ trình",
     "fields": [
       {"key":"overview","label":"Tổng quan","type":"textarea","required":true},
       {"key":"event_time","label":"Thời gian dự kiến","type":"text"},
       {"key":"location","label":"Địa điểm","type":"text"},
       {"key":"chairperson","label":"Người chủ trì","type":"text"},
       {"key":"format","label":"Hình thức tổ chức","type":"text"},
       {"key":"target_audience","label":"Đối tượng áp dụng","type":"text"},
       {"key":"requirements","label":"Yêu cầu cụ thể","type":"textarea"},
       {"key":"method_support","label":"Cách thức & đề nghị hỗ trợ","type":"dept_support_table"},
       {"key":"costs","label":"Chi phí tổ chức","type":"cost_table"},
       {"key":"expected_results","label":"Kết quả dự kiến","type":"textarea"}
     ]
   }]
 }'
),

-- ── Form 3: ROOM_BOOKING ─────────────────────────────────────────────────────
('ROOM_BOOKING',
 'Đặt phòng họp',
 'Đăng ký sử dụng phòng họp nội bộ',
 'DoorOpen', 3, true, true,
 '{
   "sections": [{
     "title": "Thông tin đặt phòng",
     "fields": [
       {"key":"attendees_count","label":"Số người tham dự","type":"number","required":true,"min":1},
       {"key":"purpose","label":"Mục đích sử dụng","type":"textarea","required":true},
       {"key":"equipment_needed","label":"Thiết bị cần hỗ trợ","type":"checkbox_group",
        "options":["Máy chiếu","Bảng trắng","TV","Micro","Webcam","Điều hoà"]},
       {"key":"setup_notes","label":"Yêu cầu sắp xếp phòng","type":"text"},
       {"key":"external_guests","label":"Có khách bên ngoài","type":"boolean"}
     ]
   }],
   "promoted_fields": {
     "resource_type": "ROOM",
     "resource_label": "Phòng họp",
     "start_label": "Giờ bắt đầu",
     "end_label": "Giờ kết thúc"
   }
 }'
),

-- ── Form 4: VEHICLE_BOOKING ──────────────────────────────────────────────────
('VEHICLE_BOOKING',
 'Đặt xe công ty',
 'Đăng ký sử dụng xe phục vụ công tác',
 'Car', 4, true, true,
 '{
   "sections": [{
     "title": "Thông tin chuyến đi",
     "fields": [
       {"key":"departure_location","label":"Điểm đón","type":"text","required":true},
       {"key":"destination","label":"Điểm đến","type":"text","required":true},
       {"key":"purpose","label":"Mục đích chuyến đi","type":"textarea","required":true},
       {"key":"passengers_count","label":"Số người","type":"number","required":true,"min":1},
       {"key":"passengers","label":"Danh sách người đi","type":"text_list"},
       {"key":"return_expected_time","label":"Giờ về dự kiến","type":"time"},
       {"key":"note_for_driver","label":"Ghi chú cho lái xe","type":"text"}
     ]
   }],
   "promoted_fields": {
     "resource_type": "VEHICLE",
     "resource_label": "Xe",
     "start_label": "Giờ đón",
     "end_label": "Giờ về"
   }
 }'
),

-- ── Form 5: ACCOMMODATION ───────────────────────────────────────────────────
('ACCOMMODATION',
 'Đặt phòng công tác',
 'Đăng ký lưu trú khi đi công tác ngoài tỉnh',
 'Hotel', 5, false, true,
 '{
   "sections": [{
     "title": "Thông tin lưu trú",
     "fields": [
       {"key":"city","label":"Thành phố / Tỉnh","type":"text","required":true},
       {"key":"hotel_preference","label":"Yêu cầu khách sạn","type":"text"},
       {"key":"num_rooms","label":"Số phòng","type":"number","required":true,"min":1},
       {"key":"guests","label":"Danh sách người lưu trú","type":"person_list"},
       {"key":"business_trip_purpose","label":"Mục đích công tác","type":"textarea","required":true},
       {"key":"special_requirements","label":"Yêu cầu đặc biệt","type":"text"}
     ]
   }],
   "promoted_fields": {
     "start_label": "Ngày check-in",
     "end_label": "Ngày check-out"
   }
 }'
);
```

---

### Seed `workflow_templates` mặc định

```sql
-- Template 1: Luồng 3 bước chuẩn (PR, PROPOSAL)
INSERT INTO workflow_templates (id, name, description)
VALUES (1, 'Luồng phê duyệt chuẩn', 'Trưởng bộ phận → CFO → COO');

INSERT INTO workflow_steps
  (template_id, step_order, step_name, approver_type, approver_value, deadline_hours, reminder_hours, on_reject)
VALUES
  (1, 1, 'Trưởng bộ phận',           'DYNAMIC_DEPT_HEAD', NULL,  24, 8,  'RETURN_REQUESTER'),
  (1, 2, 'Giám đốc tài chính (CFO)', 'FIXED_ROLE',        'CFO', 48, 16, 'RETURN_REQUESTER'),
  (1, 3, 'Phó tổng giám đốc (COO)',  'FIXED_ROLE',        'COO', 48, 16, 'RETURN_REQUESTER');

-- Template 2: Luồng đặt phòng họp (1 bước)
INSERT INTO workflow_templates (id, name, description)
VALUES (2, 'Luồng đặt phòng họp', 'Trưởng bộ phận duyệt — hiệu lực ngay');

INSERT INTO workflow_steps
  (template_id, step_order, step_name, approver_type, approver_value, deadline_hours, reminder_hours, on_reject)
VALUES
  (2, 1, 'Trưởng bộ phận', 'DYNAMIC_DEPT_HEAD', NULL, 8, 4, 'RETURN_REQUESTER');

-- Template 3: Luồng đặt xe (2 bước)
INSERT INTO workflow_templates (id, name, description)
VALUES (3, 'Luồng đặt xe công ty', 'Trưởng bộ phận → Hành chính xác nhận xe');

INSERT INTO workflow_steps
  (template_id, step_order, step_name, approver_type, approver_value, deadline_hours, reminder_hours, on_reject)
VALUES
  (3, 1, 'Trưởng bộ phận', 'DYNAMIC_DEPT_HEAD', NULL,       8, 4, 'RETURN_REQUESTER'),
  (3, 2, 'Hành chính',     'FIXED_ROLE',        'MANAGER',  4, 2, 'RETURN_REQUESTER');

-- Template 4: Luồng đặt phòng công tác (2 bước)
INSERT INTO workflow_templates (id, name, description)
VALUES (4, 'Luồng đặt phòng công tác', 'Trưởng bộ phận → CFO duyệt chi phí');

INSERT INTO workflow_steps
  (template_id, step_order, step_name, approver_type, approver_value, deadline_hours, reminder_hours, on_reject)
VALUES
  (4, 1, 'Trưởng bộ phận',           'DYNAMIC_DEPT_HEAD', NULL,  24, 8,  'RETURN_REQUESTER'),
  (4, 2, 'Giám đốc tài chính (CFO)', 'FIXED_ROLE',        'CFO', 48, 16, 'RETURN_REQUESTER');

-- Gán template vào form_types
UPDATE form_types SET active_template_id = 1 WHERE code IN ('PR', 'PROPOSAL');
UPDATE form_types SET active_template_id = 2 WHERE code = 'ROOM_BOOKING';
UPDATE form_types SET active_template_id = 3 WHERE code = 'VEHICLE_BOOKING';
UPDATE form_types SET active_template_id = 4 WHERE code = 'ACCOMMODATION';
```

---

### Seed `resources` mẫu (tùy chỉnh theo thực tế)

```sql
INSERT INTO resources (type, name, code, capacity, location, properties) VALUES
  ('ROOM', 'Phòng họp A', 'ROOM-A', 20, 'Tầng 3, Tòa A', '{"has_projector":true,"has_whiteboard":true,"has_tv":false}'),
  ('ROOM', 'Phòng họp B', 'ROOM-B', 10, 'Tầng 3, Tòa A', '{"has_projector":true,"has_whiteboard":true,"has_tv":true}'),
  ('ROOM', 'Hội trường lớn', 'HALL-1', 100, 'Tầng 1, Tòa B', '{"has_projector":true,"has_micro":true,"has_stage":true}'),
  ('VEHICLE', 'Toyota Innova - 30A-001', 'VEH-001', 7, NULL, '{"plate":"30A-001","seats":7}'),
  ('VEHICLE', 'Toyota Camry - 30A-002',  'VEH-002', 5, NULL, '{"plate":"30A-002","seats":5}');
```

---

## 1.3. Cập nhật biến môi trường

```env
# .env (trỏ sang DB mới)
VITE_SUPABASE_URL=https://<new-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<new-anon-key>
```

---

## 1.4. Files cần tạo — Phase 1

| File | Mô tả |
|------|-------|
| `supabase/01_tables.sql` | DDL toàn bộ bảng (xem DATABASE_DESIGN.md) |
| `supabase/02_indexes.sql` | Tất cả indexes |
| `supabase/03_rls.sql` | Row Level Security policies |
| `supabase/04_seed_form_types.sql` | Seed 5 form types |
| `supabase/05_seed_templates.sql` | Seed workflow templates mặc định |
| `supabase/06_seed_resources.sql` | Seed phòng họp, xe mẫu |
| `.env` | Cập nhật URL + key DB mới |
| `src/types.ts` | Viết lại hoàn toàn với types mới |

---
---

# PHASE 2 — Workflow Engine (Supabase RPC Functions)

**Mục tiêu:** Toàn bộ logic nghiệp vụ nằm trong PostgreSQL functions. Frontend chỉ gọi RPC, không xử lý workflow logic.

---

## 2.1. Function: `workflow_resolve_approver`

**Mục đích:** Xác định user_id cụ thể sẽ được assign cho 1 bước.

```sql
CREATE OR REPLACE FUNCTION workflow_resolve_approver(
  p_step_id    BIGINT,
  p_request_id BIGINT
) RETURNS BIGINT AS $$
DECLARE
  v_step       workflow_steps%ROWTYPE;
  v_request    requests%ROWTYPE;
  v_user_id    BIGINT;
BEGIN
  SELECT * INTO v_step    FROM workflow_steps WHERE id = p_step_id;
  SELECT * INTO v_request FROM requests       WHERE id = p_request_id;

  CASE v_step.approver_type
    WHEN 'FIXED_USER' THEN
      v_user_id := v_step.approver_value::BIGINT;

    WHEN 'DYNAMIC_MANAGER' THEN
      SELECT manager_id INTO v_user_id
      FROM users WHERE id = v_request.requester_id;

    WHEN 'DYNAMIC_DEPT_HEAD' THEN
      SELECT id INTO v_user_id
      FROM users
      WHERE role = 'MANAGER'
        AND department = v_request.department
        AND is_active = true
      LIMIT 1;

    WHEN 'FIXED_ROLE' THEN
      -- Không resolve về user cụ thể, giữ NULL, check theo role khi approve
      v_user_id := NULL;

    ELSE
      v_user_id := NULL;
  END CASE;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;
```

---

## 2.2. Function: `workflow_evaluate_skip`

**Mục đích:** Trả về TRUE nếu bước này nên bỏ qua (dựa trên `skip_condition` JSONB).

```sql
-- skip_condition examples:
-- {"field": "amount",                    "op": "<",  "value": 5000000}
-- {"field": "is_urgent",                 "op": "=",  "value": true}
-- {"field": "form_data.attendees_count", "op": "<=", "value": 10}

CREATE OR REPLACE FUNCTION workflow_evaluate_skip(
  p_step_id    BIGINT,
  p_request_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
  v_condition  JSONB;
  v_field      TEXT;
  v_op         TEXT;
  v_threshold  TEXT;
  v_actual     TEXT;
  v_result     BOOLEAN := false;
BEGIN
  SELECT skip_condition INTO v_condition
  FROM workflow_steps WHERE id = p_step_id;

  IF v_condition IS NULL THEN RETURN false; END IF;

  v_field     := v_condition->>'field';
  v_op        := v_condition->>'op';
  v_threshold := v_condition->>'value';

  -- Lấy giá trị thực tế từ request
  IF v_field LIKE 'form_data.%' THEN
    -- Field nằm trong JSONB form_data
    SELECT form_data->>substring(v_field from 11)
    INTO v_actual FROM requests WHERE id = p_request_id;
  ELSE
    -- Field là cột thật
    EXECUTE format(
      'SELECT ($1).%I::TEXT FROM (SELECT * FROM requests WHERE id = $2) AS r',
      v_field
    ) INTO v_actual USING (SELECT r FROM requests r WHERE r.id = p_request_id), p_request_id;
  END IF;

  -- So sánh
  CASE v_op
    WHEN '<'  THEN v_result := v_actual::NUMERIC <  v_threshold::NUMERIC;
    WHEN '<=' THEN v_result := v_actual::NUMERIC <= v_threshold::NUMERIC;
    WHEN '>'  THEN v_result := v_actual::NUMERIC >  v_threshold::NUMERIC;
    WHEN '>=' THEN v_result := v_actual::NUMERIC >= v_threshold::NUMERIC;
    WHEN '='  THEN v_result := v_actual = v_threshold;
    WHEN '!=' THEN v_result := v_actual != v_threshold;
  END CASE;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
```

---

## 2.3. Function: `workflow_initialize`

**Mục đích:** Được gọi ngay sau khi INSERT request. Tạo toàn bộ `request_step_instances` và activate bước đầu tiên.

```sql
CREATE OR REPLACE FUNCTION workflow_initialize(
  p_request_id BIGINT
) RETURNS VOID AS $$
DECLARE
  v_request     requests%ROWTYPE;
  v_step        workflow_steps%ROWTYPE;
  v_instance_id BIGINT;
  v_assignee_id BIGINT;
  v_should_skip BOOLEAN;
  v_first_active_step_order INTEGER := NULL;
BEGIN
  SELECT * INTO v_request FROM requests WHERE id = p_request_id;

  -- Tạo instance cho từng bước trong template
  FOR v_step IN
    SELECT * FROM workflow_steps
    WHERE template_id = v_request.workflow_template_id
    ORDER BY step_order
  LOOP
    v_should_skip := workflow_evaluate_skip(v_step.id, p_request_id);
    v_assignee_id := workflow_resolve_approver(v_step.id, p_request_id);

    INSERT INTO request_step_instances
      (request_id, step_id, step_order, step_name, status, assigned_to_id, assigned_role)
    VALUES (
      p_request_id,
      v_step.id,
      v_step.step_order,
      v_step.step_name,
      CASE WHEN v_should_skip THEN 'SKIPPED' ELSE 'PENDING' END,
      v_assignee_id,
      v_step.approver_value
    )
    RETURNING id INTO v_instance_id;

    -- Ghi nhớ bước đầu tiên không bị skip
    IF NOT v_should_skip AND v_first_active_step_order IS NULL THEN
      v_first_active_step_order := v_step.step_order;
    END IF;
  END LOOP;

  -- Activate bước đầu tiên không bị skip
  IF v_first_active_step_order IS NOT NULL THEN
    UPDATE request_step_instances SET
      status      = 'IN_PROGRESS',
      assigned_at = now(),
      deadline_at = now() + (
        SELECT deadline_hours * interval '1 hour'
        FROM workflow_steps ws
        JOIN request_step_instances rsi ON rsi.step_id = ws.id
        WHERE rsi.request_id = p_request_id
          AND rsi.step_order = v_first_active_step_order
        LIMIT 1
      )
    WHERE request_id = p_request_id
      AND step_order = v_first_active_step_order;

    -- Cập nhật current_step_order trên request
    UPDATE requests SET
      status             = 'IN_REVIEW',
      current_step_order = v_first_active_step_order
    WHERE id = p_request_id;
  ELSE
    -- Tất cả bước đều bị skip → tự động APPROVED
    UPDATE requests SET status = 'APPROVED' WHERE id = p_request_id;
  END IF;

  -- Ghi audit_log
  INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
  SELECT p_request_id, 'SUBMIT', v_request.requester_id, u.name,
         jsonb_build_object('status', 'IN_REVIEW', 'step', v_first_active_step_order)
  FROM users u WHERE u.id = v_request.requester_id;
END;
$$ LANGUAGE plpgsql;
```

---

## 2.4. Function: `approve_step` — CORE ENGINE

**Mục đích:** Xử lý 1 hành động Approve/Reject từ approver. Tự động advance sang bước tiếp theo.

```sql
CREATE OR REPLACE FUNCTION approve_step(
  p_step_instance_id BIGINT,
  p_approver_id      BIGINT,
  p_action           TEXT,      -- 'APPROVED' | 'REJECTED'
  p_comment          TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_instance    request_step_instances%ROWTYPE;
  v_request     requests%ROWTYPE;
  v_step        workflow_steps%ROWTYPE;
  v_approver    users%ROWTYPE;
  v_next_order  INTEGER;
  v_next_inst   request_step_instances%ROWTYPE;
  v_assignee_id BIGINT;
BEGIN
  SELECT * INTO v_instance FROM request_step_instances WHERE id = p_step_instance_id;
  SELECT * INTO v_request  FROM requests WHERE id = v_instance.request_id;
  SELECT * INTO v_step     FROM workflow_steps WHERE id = v_instance.step_id;
  SELECT * INTO v_approver FROM users WHERE id = p_approver_id;

  -- ── Validate quyền duyệt ───────────────────────────────────────────────
  IF v_instance.status != 'IN_PROGRESS' THEN
    RETURN jsonb_build_object('error', 'Bước này không ở trạng thái chờ xử lý');
  END IF;

  -- Kiểm tra: assigned_to_id (nếu có) hoặc theo assigned_role
  IF v_instance.assigned_to_id IS NOT NULL THEN
    IF v_instance.assigned_to_id != p_approver_id THEN
      -- Kiểm tra delegation
      IF NOT EXISTS (
        SELECT 1 FROM delegations
        WHERE delegator_id = v_instance.assigned_to_id
          AND delegatee_id = p_approver_id
          AND is_active = true
          AND now() BETWEEN valid_from AND valid_until
          AND (scope_form_types IS NULL OR v_request.form_type = ANY(scope_form_types))
          AND (max_amount IS NULL OR v_request.amount <= max_amount)
      ) THEN
        RETURN jsonb_build_object('error', 'Bạn không có quyền xử lý bước này');
      END IF;
    END IF;
  ELSE
    -- Kiểm tra theo role
    IF v_approver.role != v_instance.assigned_role THEN
      RETURN jsonb_build_object('error', 'Chỉ ' || v_instance.assigned_role || ' mới có quyền xử lý bước này');
    END IF;
  END IF;

  -- ── Ghi nhận kết quả ──────────────────────────────────────────────────
  UPDATE request_step_instances SET
    status    = p_action,
    acted_at  = now(),
    acted_by_id = p_approver_id,
    is_delegated = (v_instance.assigned_to_id IS DISTINCT FROM p_approver_id),
    comment   = p_comment
  WHERE id = p_step_instance_id;

  -- ── Ghi audit_log ─────────────────────────────────────────────────────
  INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, target_id, new_value)
  VALUES (
    v_instance.request_id, p_action, p_approver_id, v_approver.name,
    p_step_instance_id,
    jsonb_build_object('step', v_instance.step_name, 'comment', p_comment)
  );

  -- ── Xử lý APPROVED ────────────────────────────────────────────────────
  IF p_action = 'APPROVED' THEN
    -- Tìm bước PENDING tiếp theo (bỏ qua SKIPPED)
    SELECT step_order INTO v_next_order
    FROM request_step_instances
    WHERE request_id = v_instance.request_id
      AND step_order > v_instance.step_order
      AND status = 'PENDING'
    ORDER BY step_order
    LIMIT 1;

    IF v_next_order IS NULL THEN
      -- Không còn bước nào → COMPLETED
      UPDATE requests SET
        status             = 'APPROVED',
        current_step_order = v_instance.step_order
      WHERE id = v_instance.request_id;

      INSERT INTO audit_log (request_id, event_type, actor_id, actor_name, new_value)
      VALUES (v_instance.request_id, 'COMPLETE', p_approver_id, v_approver.name,
              jsonb_build_object('status', 'APPROVED'));
    ELSE
      -- Activate bước tiếp theo
      SELECT * INTO v_next_inst
      FROM request_step_instances
      WHERE request_id = v_instance.request_id AND step_order = v_next_order;

      v_assignee_id := workflow_resolve_approver(v_next_inst.step_id, v_instance.request_id);

      UPDATE request_step_instances SET
        status        = 'IN_PROGRESS',
        assigned_at   = now(),
        assigned_to_id = v_assignee_id,
        deadline_at   = now() + (
          SELECT deadline_hours * interval '1 hour'
          FROM workflow_steps WHERE id = v_next_inst.step_id
        )
      WHERE id = v_next_inst.id;

      UPDATE requests SET current_step_order = v_next_order
      WHERE id = v_instance.request_id;
    END IF;

  -- ── Xử lý REJECTED ────────────────────────────────────────────────────
  ELSE
    CASE v_step.on_reject
      WHEN 'RETURN_REQUESTER' THEN
        -- Hủy tất cả bước còn pending
        UPDATE request_step_instances
        SET status = 'CANCELLED'
        WHERE request_id = v_instance.request_id AND status = 'PENDING';

        UPDATE requests SET status = 'REJECTED'
        WHERE id = v_instance.request_id;

      WHEN 'RETURN_PREV_STEP' THEN
        -- Activate lại bước trước
        UPDATE request_step_instances SET
          status        = 'IN_PROGRESS',
          assigned_at   = now(),
          acted_at      = NULL,
          comment       = NULL,
          deadline_at   = now() + (
            SELECT deadline_hours * interval '1 hour'
            FROM workflow_steps ws
            JOIN request_step_instances rsi2 ON rsi2.step_id = ws.id
            WHERE rsi2.request_id = v_instance.request_id
              AND rsi2.step_order = v_instance.step_order - 1
            LIMIT 1
          )
        WHERE request_id = v_instance.request_id
          AND step_order = v_instance.step_order - 1;

        UPDATE requests SET current_step_order = v_instance.step_order - 1
        WHERE id = v_instance.request_id;

      WHEN 'CANCEL_REQUEST' THEN
        UPDATE request_step_instances
        SET status = 'CANCELLED'
        WHERE request_id = v_instance.request_id AND status IN ('PENDING', 'IN_PROGRESS');

        UPDATE requests SET
          status       = 'CANCELLED',
          cancelled_at = now(),
          cancelled_reason = 'Bị từ chối bởi ' || v_approver.name || ' tại bước ' || v_instance.step_name
        WHERE id = v_instance.request_id;
    END CASE;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 2.5. Function: `create_request`

```sql
CREATE OR REPLACE FUNCTION create_request(
  p_title          TEXT,
  p_form_type      TEXT,
  p_amount         NUMERIC,
  p_requester_id   BIGINT,
  p_description    TEXT        DEFAULT NULL,
  p_notes          TEXT        DEFAULT NULL,
  p_is_urgent      BOOLEAN     DEFAULT false,
  p_budget_plan    TEXT        DEFAULT NULL,
  p_budget_code    TEXT        DEFAULT NULL,
  p_po_number      TEXT        DEFAULT NULL,
  p_resource_id    BIGINT      DEFAULT NULL,
  p_start_datetime TIMESTAMPTZ DEFAULT NULL,
  p_end_datetime   TIMESTAMPTZ DEFAULT NULL,
  p_form_data      JSONB       DEFAULT '{}',
  p_items          JSONB       DEFAULT NULL   -- Chỉ dùng cho PR
) RETURNS JSONB AS $$
DECLARE
  v_requester       users%ROWTYPE;
  v_form_type       form_types%ROWTYPE;
  v_template_id     BIGINT;
  v_new_request_id  BIGINT;
  v_conflict        RECORD;
BEGIN
  -- Lấy thông tin requester
  SELECT * INTO v_requester FROM users WHERE id = p_requester_id AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Người dùng không tồn tại hoặc đã bị vô hiệu hóa');
  END IF;

  -- Lấy form_type và template
  SELECT * INTO v_form_type FROM form_types WHERE code = p_form_type AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Loại biểu mẫu không hợp lệ hoặc đã bị vô hiệu hóa');
  END IF;

  v_template_id := v_form_type.active_template_id;
  IF v_template_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Loại biểu mẫu này chưa được cấu hình workflow. Liên hệ Admin.');
  END IF;

  -- Kiểm tra conflict tài nguyên (phòng/xe)
  IF p_resource_id IS NOT NULL AND p_start_datetime IS NOT NULL AND p_end_datetime IS NOT NULL THEN
    SELECT * INTO v_conflict
    FROM check_resource_conflict(p_resource_id, p_start_datetime, p_end_datetime, NULL)
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'error', 'Tài nguyên đã được đặt trong khoảng thời gian này',
        'conflict', jsonb_build_object(
          'request_id', v_conflict.conflict_request_id,
          'title',      v_conflict.conflict_title,
          'start',      v_conflict.conflict_start,
          'end',        v_conflict.conflict_end
        )
      );
    END IF;
  END IF;

  -- Tạo request
  INSERT INTO requests (
    title, form_type, amount, requester_id, department,
    description, notes, is_urgent,
    budget_plan, budget_code, po_number,
    resource_id, start_datetime, end_datetime,
    workflow_template_id, form_data,
    status, current_step_order
  ) VALUES (
    p_title, p_form_type, p_amount, p_requester_id, v_requester.department,
    p_description, p_notes, p_is_urgent,
    p_budget_plan, p_budget_code, p_po_number,
    p_resource_id, p_start_datetime, p_end_datetime,
    v_template_id, p_form_data,
    'PENDING', 0
  )
  RETURNING id INTO v_new_request_id;

  -- Insert items nếu là PR
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO request_items
      (request_id, item_name, specs, unit, total_qty, available_qty, purchase_qty, unit_price, amount, reason, sort_order)
    SELECT
      v_new_request_id,
      item->>'item_name', item->>'specs', item->>'unit',
      (item->>'total_qty')::NUMERIC,    (item->>'available_qty')::NUMERIC,
      (item->>'purchase_qty')::NUMERIC, (item->>'unit_price')::NUMERIC,
      (item->>'amount')::NUMERIC,       item->>'reason',
      (item->>'sort_order')::INTEGER
    FROM jsonb_array_elements(p_items) AS item;
  END IF;

  -- Khởi tạo workflow
  PERFORM workflow_initialize(v_new_request_id);

  RETURN jsonb_build_object('id', v_new_request_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 2.6. Function: `check_resource_conflict`

```sql
CREATE OR REPLACE FUNCTION check_resource_conflict(
  p_resource_id    BIGINT,
  p_start          TIMESTAMPTZ,
  p_end            TIMESTAMPTZ,
  p_exclude_req_id BIGINT DEFAULT NULL
) RETURNS TABLE(
  conflict_request_id BIGINT,
  conflict_title      TEXT,
  conflict_start      TIMESTAMPTZ,
  conflict_end        TIMESTAMPTZ
) AS $$
  SELECT id, title, start_datetime, end_datetime
  FROM requests
  WHERE resource_id = p_resource_id
    AND status NOT IN ('REJECTED', 'CANCELLED')
    AND start_datetime < p_end
    AND end_datetime   > p_start
    AND (p_exclude_req_id IS NULL OR id != p_exclude_req_id)
  ORDER BY start_datetime;
$$ LANGUAGE SQL STABLE;
```

---

## 2.7. Function: `admin_save_template`

```sql
CREATE OR REPLACE FUNCTION admin_save_template(
  p_template JSONB,   -- {id?, name, description}
  p_steps    JSONB    -- [{step_order, step_name, approver_type, approver_value, deadline_hours, ...}]
) RETURNS BIGINT AS $$
DECLARE
  v_template_id BIGINT;
BEGIN
  IF p_template->>'id' IS NOT NULL THEN
    -- Cập nhật template cũ
    UPDATE workflow_templates SET
      name        = p_template->>'name',
      description = p_template->>'description',
      updated_at  = now()
    WHERE id = (p_template->>'id')::BIGINT
    RETURNING id INTO v_template_id;

    -- Xóa hết steps cũ, insert lại
    DELETE FROM workflow_steps WHERE template_id = v_template_id;
  ELSE
    -- Tạo template mới
    INSERT INTO workflow_templates (name, description)
    VALUES (p_template->>'name', p_template->>'description')
    RETURNING id INTO v_template_id;
  END IF;

  -- Insert steps mới
  INSERT INTO workflow_steps
    (template_id, step_order, step_name, approver_type, approver_value,
     deadline_hours, reminder_hours, on_reject, skip_condition, on_timeout,
     escalate_to_role, parallel_group, require_all)
  SELECT
    v_template_id,
    (s->>'step_order')::INTEGER,
    s->>'step_name',
    s->>'approver_type',
    s->>'approver_value',
    (s->>'deadline_hours')::INTEGER,
    (s->>'reminder_hours')::INTEGER,
    COALESCE(s->>'on_reject', 'RETURN_REQUESTER'),
    (s->'skip_condition'),
    COALESCE(s->>'on_timeout', 'ESCALATE'),
    s->>'escalate_to_role',
    (s->>'parallel_group')::INTEGER,
    COALESCE((s->>'require_all')::BOOLEAN, true)
  FROM jsonb_array_elements(p_steps) AS s;

  RETURN v_template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 2.8. Function: `sync_employees` (giữ lại từ hệ thống cũ, cập nhật signature)

```sql
-- Cập nhật để hỗ trợ cột manager_id mới trong bảng users
-- Logic upsert giữ nguyên, thêm xử lý manager_id
```

---

## 2.9. Files cần tạo — Phase 2

| File | Mô tả |
|------|-------|
| `supabase/functions/01_helpers.sql` | `workflow_resolve_approver`, `workflow_evaluate_skip`, `check_resource_conflict` |
| `supabase/functions/02_initialize.sql` | `workflow_initialize` |
| `supabase/functions/03_approve_step.sql` | Core engine `approve_step` |
| `supabase/functions/04_create_request.sql` | `create_request` (viết mới) |
| `supabase/functions/05_admin_save_template.sql` | `admin_save_template` |
| `supabase/functions/06_sync_employees.sql` | `sync_employees` (cập nhật) |
| `src/lib/api.ts` | Viết lại hoàn toàn với signature mới |
| `src/types.ts` | Viết lại: FormType, WorkflowTemplate, StepInstance... |

---
---

# PHASE 3 — Admin UI: Quản lý Workflow & Tài nguyên

**Mục tiêu:** Admin cấu hình luồng phê duyệt, quản lý loại biểu mẫu và tài nguyên qua giao diện.

---

## 3.1. Mở rộng routing trong `App.tsx`

```typescript
// Thêm vào type View
type View = 'dashboard' | 'create' | 'detail' | 'sync'
          | 'admin'              // Hub admin
          | 'admin_workflows'    // Quản lý luồng phê duyệt
          | 'admin_form_types'   // Quản lý loại biểu mẫu
          | 'admin_resources';   // Quản lý phòng họp, xe

// Sidebar: thêm section "Quản trị" hiển thị khi role = 'ADMIN'
```

---

## 3.2. Component: `AdminHub`

```
src/components/admin/AdminHub.tsx
```

- 3 card lớn: Luồng phê duyệt / Loại biểu mẫu / Tài nguyên
- Số liệu nhanh: X templates / Y form types đang active / Z tài nguyên

---

## 3.3. Component: `WorkflowTemplateManager` + `StepBuilder`

```
src/components/admin/WorkflowTemplateManager.tsx
src/components/admin/StepBuilder.tsx
```

**Layout 2 cột:**
```
┌─────────────────────┬──────────────────────────────────────────┐
│  Danh sách          │  Chi tiết template đang chọn             │
│  Templates (35%)    │  (65%)                                    │
│                     │                                          │
│  [+ Tạo mới]        │  Tên: [___________________]             │
│                     │  Mô tả: [________________]               │
│  ● Luồng chuẩn      │                                          │
│    3 bước | PR, PP  │  ── Các bước ──────────────────────────  │
│                     │                                          │
│  ○ Luồng đặt phòng  │  [≡] Bước 1: Trưởng bộ phận       [✎][✕]│
│    1 bước | ROOM    │  [≡] Bước 2: CFO                   [✎][✕]│
│                     │  [≡] Bước 3: COO                   [✎][✕]│
│  ○ Luồng đặt xe     │                                          │
│    2 bước | VEHICLE │  [+ Thêm bước]                          │
│                     │                                          │
│                     │  [Hủy]          [Lưu template]          │
└─────────────────────┴──────────────────────────────────────────┘
```

**Form cấu hình 1 bước (StepBuilder):**

```
Tên bước:  [Trưởng bộ phận              ]

Người duyệt:
  ◉ Trưởng bộ phận của người tạo (động)
  ○ Quản lý trực tiếp của người tạo (động)
  ○ Theo vai trò cố định  → [CFO ▾]
  ○ Người cụ thể          → [Tìm nhân viên...]

Thời hạn xử lý:   [24] giờ
Nhắc trước:        [8]  giờ  (tùy chọn)

Điều kiện bỏ qua bước: [bật/tắt]
  Khi [amount ▾] [< ▾] [5,000,000]

Khi bị từ chối:
  ◉ Trả về người tạo để chỉnh sửa
  ○ Trả về bước trước
  ○ Hủy yêu cầu
```

**Supabase calls:**
```typescript
// Load templates
supabase.from('workflow_templates').select('*, workflow_steps(*).order(step_order)')

// Lưu (atomic qua RPC)
supabase.rpc('admin_save_template', { p_template: {...}, p_steps: [...] })

// Xóa (chỉ được xóa nếu không có form_type nào đang dùng)
supabase.from('workflow_templates').delete().eq('id', id)
```

---

## 3.4. Component: `FormTypeManager`

```
src/components/admin/FormTypeManager.tsx
```

**Hiển thị dạng bảng:**
```
Icon │ Tên form          │ Template đang dùng      │ Trạng thái │ Thao tác
─────┼───────────────────┼─────────────────────────┼────────────┼─────────
📄   │ Yêu cầu mua sắm  │ Luồng phê duyệt chuẩn ▾ │ ● Active   │ [Xem schema]
📋   │ Tờ trình          │ Luồng phê duyệt chuẩn ▾ │ ● Active   │ [Xem schema]
🚪   │ Đặt phòng họp    │ Luồng đặt phòng họp ▾   │ ● Active   │ [Xem schema]
🚗   │ Đặt xe công ty   │ Luồng đặt xe ▾          │ ● Active   │ [Xem schema]
🏨   │ Đặt phòng CT     │ Luồng đặt phòng CT ▾    │ ○ Inactive │ [Xem schema]
```

**Tính năng:**
- Dropdown chọn template cho mỗi form type
- Toggle bật/tắt (ẩn khỏi danh sách người dùng)
- Xem preview `field_schema` (read-only, chỉ để tham khảo)

**Không** cho phép sửa `field_schema` qua UI — cần developer thay đổi.

---

## 3.5. Component: `ResourceManager`

```
src/components/admin/ResourceManager.tsx
```

- Tab "Phòng họp" và tab "Xe"
- Danh sách + form thêm/sửa/ẩn tài nguyên
- Xem lịch đặt theo tuần dạng timeline đơn giản

**Form thêm phòng họp:**
```
Tên:      [Phòng họp A - Tầng 3    ]
Mã:       [ROOM-3A                 ]
Sức chứa: [20] người
Vị trí:   [Tầng 3, Tòa A          ]
Thuộc tính:
  [✓] Máy chiếu   [✓] Bảng trắng   [✓] Điều hoà
  [ ] TV          [ ] Micro         [ ] Webcam
```

---

## 3.6. Files cần tạo — Phase 3

| File | Mô tả |
|------|-------|
| `src/components/admin/AdminHub.tsx` | Hub tổng hợp admin |
| `src/components/admin/WorkflowTemplateManager.tsx` | Quản lý template |
| `src/components/admin/StepBuilder.tsx` | Editor bước trong luồng |
| `src/components/admin/FormTypeManager.tsx` | Gán template vào form type |
| `src/components/admin/ResourceManager.tsx` | Quản lý phòng/xe |
| `src/App.tsx` | Thêm views admin, mở rộng sidebar section Quản trị |
| `src/lib/api.ts` | Thêm admin API: getFormTypes, getTemplates, saveTemplate, getResources, saveResource |

---
---

# PHASE 4 — Form Types Mới & Cập nhật UI

**Mục tiêu:** Người dùng tạo được 5 loại biểu mẫu. UI render động dựa vào `field_schema`. Dashboard và RequestDetail hiển thị đúng cho mọi loại form.

---

## 4.1. Cập nhật `CreateRequest.tsx` — Chọn form động

**Hiện tại:** 2 nút cứng PR / PROPOSAL

**Mới:**
```typescript
// Fetch form_types khi component mount
const { data: formTypes } = await supabase
  .from('form_types')
  .select('id, code, name, description, icon, requires_resource, requires_time_range, field_schema')
  .eq('is_active', true)
  .order('sort_order');

// Render: grid card cho từng form type
// → Người dùng chọn 1 loại → render form tương ứng
```

**Luồng render sau khi chọn loại form:**
```
1. Nếu requires_resource = true  → hiển thị ResourcePicker (chọn phòng/xe)
2. Nếu requires_time_range = true → hiển thị DateTimePicker (start/end)
3. Common fields: title, description, is_urgent, notes
4. Financial fields: budget_plan, budget_code, po_number (nếu applicable)
5. Dynamic sections từ field_schema.sections[] → FieldRenderer
6. Nếu form_type = 'PR'       → hiển thị bảng items (giữ nguyên UI cũ)
7. Nếu form_type = 'PROPOSAL' → hiển thị bảng method_support + costs (giữ nguyên UI cũ)
```

---

## 4.2. Component: `FieldRenderer`

```
src/components/forms/FieldRenderer.tsx
```

```typescript
// Render 1 field theo field.type
function FieldRenderer({ field, value, onChange }) {
  switch (field.type) {
    case 'text':           return <input type="text" ... />
    case 'textarea':       return <textarea ... />
    case 'number':         return <input type="number" min={field.min} ... />
    case 'date':           return <input type="date" ... />
    case 'time':           return <input type="time" ... />
    case 'boolean':        return <Toggle ... />
    case 'checkbox_group': return <CheckboxGroup options={field.options} ... />
    case 'text_list':      return <DynamicTextList ... />     // thêm/xóa dòng
    case 'person_list':    return <PersonList ... />          // {name, employee_id}
    case 'select':         return <select>{field.options}</select>
    // Các type đặc biệt giữ nguyên component cũ:
    case 'dept_support_table': return <DeptSupportTable ... />
    case 'cost_table':         return <CostTable ... />
  }
}
```

---

## 4.3. Component: `ResourcePicker`

```
src/components/forms/ResourcePicker.tsx
```

```
[Loại: Phòng họp]

Chọn phòng: [Phòng họp A - Tầng 3 ▾]   (filter theo resource_type)

Thời gian:
  Bắt đầu: [15/03/2025] [09:00]
  Kết thúc: [15/03/2025] [11:00]

↳ [Kiểm tra ngay]

✓ Phòng trống trong khung giờ này       ← màu xanh
hoặc
⚠ Đã có lịch: "Họp ban giám hiệu" 08:30–10:30  ← màu đỏ
```

**Logic:**
```typescript
// Sau khi user chọn resource + nhập thời gian:
const conflicts = await supabase.rpc('check_resource_conflict', {
  p_resource_id: selectedResourceId,
  p_start: startDatetime,
  p_end:   endDatetime,
  p_exclude_req_id: null
});
// Nếu conflicts.length > 0 → hiển thị cảnh báo, disable nút Submit
```

---

## 4.4. Cập nhật `RequestDetail.tsx`

**Thêm: Workflow Timeline**
```
── Tiến trình phê duyệt ─────────────────────────────────────
✓  Bước 1: Trưởng bộ phận
   Nguyễn Văn A — 14/03/2025 10:23
   "Đồng ý, lưu ý tiết kiệm chi phí"

⟳  Bước 2: CFO — Đang chờ xử lý
   Hạn: 16/03/2025 10:00 (còn 18 giờ)

○  Bước 3: COO — Chưa đến lượt
─────────────────────────────────────────────────────────────
```

**Thay đổi hiển thị form_data:**
```typescript
// Thay vì if(type === 'PROPOSAL') { hiện proposal_* }
// → Fetch field_schema của form_type
// → Render form_data theo schema
formType.field_schema.sections.map(section =>
  section.fields.map(field =>
    <ReadonlyFieldDisplay field={field} value={request.form_data[field.key]} />
  )
)
```

**Thay đổi nút phê duyệt:**
```typescript
// Thay vì kiểm tra current_approver_role = user.role
// → Tìm step_instance đang IN_PROGRESS mà assigned_to_id = currentUser.id
//   HOẶC assigned_role = currentUser.role (nếu không có assigned_to_id)
const myPendingStep = stepInstances.find(s =>
  s.status === 'IN_PROGRESS' &&
  (s.assigned_to_id === currentUser.id ||
  (!s.assigned_to_id && s.assigned_role === currentUser.role))
);

// Nếu myPendingStep tồn tại → hiển thị nút Phê duyệt / Từ chối
// Gọi: supabase.rpc('approve_step', { p_step_instance_id: myPendingStep.id, ... })
```

---

## 4.5. Cập nhật `Dashboard.tsx`

- Thêm cột "Loại biểu mẫu" (icon + tên ngắn)
- Filter dropdown by `form_type`
- Với ROOM/VEHICLE: hiển thị `start_datetime` trong card
- Đổi badge "Đang chờ" hiển thị tên bước hiện tại thay vì role code thô

---

## 4.6. Files cần tạo/sửa — Phase 4

| File | Loại | Mô tả |
|------|------|-------|
| `src/components/forms/FieldRenderer.tsx` | TẠO MỚI | Render field động theo type |
| `src/components/forms/ResourcePicker.tsx` | TẠO MỚI | Chọn phòng/xe + conflict check |
| `src/components/forms/DateTimePicker.tsx` | TẠO MỚI | Date/time picker |
| `src/components/CreateRequest.tsx` | SỬA NHIỀU | Fetch form_types động, render form |
| `src/components/RequestDetail.tsx` | SỬA NHIỀU | Dynamic form_data display, workflow timeline, approve_step |
| `src/components/Dashboard.tsx` | SỬA | Thêm cột loại form, filter |
| `src/lib/api.ts` | SỬA | getFormTypes, getResources, getStepInstances |
| `src/types.ts` | SỬA | Thêm FormType, Resource, StepInstance interfaces |

---
---

# PHASE 5 — Tính năng Nâng cao

---

## 5.1. Escalation tự động (pg_cron)

```sql
-- Cài pg_cron extension trong Supabase
SELECT cron.schedule(
  'check-escalations',
  '*/30 * * * *',  -- Mỗi 30 phút
  $$
    SELECT workflow_escalate(id)
    FROM request_step_instances
    WHERE status IN ('IN_PROGRESS', 'PENDING')
      AND deadline_at < now();
  $$
);
```

**Function `workflow_escalate`:**
```sql
-- 1. Đọc on_timeout của bước
-- 2. ESCALATE:    đổi status='ESCALATED', tạo step mới gán cho escalate_to_role
-- 3. AUTO_APPROVE: gọi approve_step với system_user
-- 4. AUTO_REJECT:  gọi approve_step với action='REJECTED'
-- 5. Ghi audit_log event='ESCALATE'
```

---

## 5.2. Delegation UI

```
src/components/DelegationManager.tsx   (thêm vào profile/settings)
```

- Xem danh sách ủy quyền đang active của tôi
- Tạo ủy quyền mới: chọn người nhận, thời gian từ/đến, phạm vi
- Hủy ủy quyền sớm

Logic ủy quyền đã được xử lý trong `approve_step` function (Phase 2).

---

## 5.3. Realtime Notification

```typescript
// src/hooks/useRealtimeNotifications.ts
// Subscribe vào step_instances được assign cho user hiện tại
supabase
  .channel('my-pending-steps')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'request_step_instances',
    filter: `assigned_to_id=eq.${currentUser.id}`
  }, (payload) => {
    if (payload.new.status === 'IN_PROGRESS') {
      showToast('Bạn có yêu cầu mới cần phê duyệt');
      refreshBadgeCount();
    }
  })
  .subscribe();
```

---

## 5.4. Báo cáo Admin

```
src/components/admin/ReportDashboard.tsx
```

- Tổng request theo form_type, theo status (biểu đồ tròn)
- Thời gian xử lý trung bình theo bước (biểu đồ cột)
- Bottleneck: top 5 bước chậm nhất
- Chi phí đã duyệt theo budget_code (biểu đồ)

```sql
-- Thêm Supabase view cho báo cáo
CREATE VIEW report_request_summary AS
SELECT
  form_type,
  status,
  COUNT(*) as count,
  SUM(amount) as total_amount,
  DATE_TRUNC('month', created_at) as month
FROM requests
GROUP BY form_type, status, DATE_TRUNC('month', created_at);

CREATE VIEW report_step_performance AS
SELECT
  step_name,
  COUNT(*) as total_handled,
  AVG(EXTRACT(EPOCH FROM (acted_at - assigned_at))/3600)::NUMERIC(10,1) as avg_hours,
  MAX(EXTRACT(EPOCH FROM (acted_at - assigned_at))/3600)::NUMERIC(10,1) as max_hours
FROM request_step_instances
WHERE status IN ('APPROVED', 'REJECTED') AND acted_at IS NOT NULL
GROUP BY step_name
ORDER BY avg_hours DESC;
```

---

## 5.5. Files cần tạo — Phase 5

| File | Mô tả |
|------|-------|
| `supabase/functions/07_escalate.sql` | `workflow_escalate` function |
| `supabase/functions/08_pg_cron.sql` | Cấu hình cron jobs |
| `supabase/09_report_views.sql` | Views cho báo cáo |
| `src/components/admin/ReportDashboard.tsx` | Dashboard báo cáo |
| `src/components/DelegationManager.tsx` | UI ủy quyền |
| `src/hooks/useRealtimeNotifications.ts` | Realtime notifications |
| `src/App.tsx` | Tích hợp notification badge + delegation menu |

---
---

# Tổng hợp

## Dependency Map

```
Phase 1 (DB Setup)
    └── Phase 2 (Engine)
            ├── Phase 3 (Admin UI)   ─── có thể song song Phase 4
            └── Phase 4 (Form mới)  ─── cần Phase 3 xong trước (Admin cần config template trước khi test form mới)
                    └── Phase 5 (Nâng cao)
```

## Tất cả files cần tạo / sửa

| Phase | Loại | Số lượng |
|-------|------|----------|
| 1 | SQL scripts (schema + seed) | 6 files |
| 2 | SQL functions (engine) | 6 files |
| 3 | React components (admin) | 5 components + sửa App.tsx + api.ts |
| 4 | React components (form) | 3 mới + sửa 4 files hiện có |
| 5 | SQL + React (nâng cao) | 4 SQL + 3 React |
| **Tổng** | | **~32 files** |

## Rủi ro & Giảm thiểu

| Rủi ro | Mức | Cách xử lý |
|--------|-----|------------|
| Admin tạo template sai → request bị kẹt vô thời hạn | Trung bình | Validate template có ít nhất 1 bước trước khi save; UI cảnh báo nếu không có fallback |
| `field_schema` sai format → FieldRenderer crash | Thấp | try/catch trong FieldRenderer, fallback render plain textarea |
| Conflict check race condition khi 2 người đặt cùng lúc | Thấp | `SELECT FOR UPDATE` trong `create_request` RPC khi kiểm tra conflict |
| pg_cron không available trên Supabase plan thấp | Trung bình | Kiểm tra plan; fallback: gọi check escalation từ client định kỳ (polling) |
| Realtime WebSocket giới hạn connection theo plan | Thấp | Chỉ subscribe khi user đang online; unsubscribe khi logout |
