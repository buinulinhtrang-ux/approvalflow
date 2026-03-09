-- ============================================================
-- Phase 1 — Script 02: Indexes
-- Chạy SAU 01_tables.sql
-- ============================================================


-- ============================================================
-- users
-- ============================================================

-- Tìm user theo employee_id (login)
CREATE INDEX idx_users_employee_id
  ON users(employee_id);

-- Tìm MANAGER theo department (DYNAMIC_DEPT_HEAD resolver)
CREATE INDEX idx_users_role_dept
  ON users(role, department)
  WHERE is_active = true;

-- Tìm manager_id (DYNAMIC_MANAGER resolver)
CREATE INDEX idx_users_manager
  ON users(manager_id)
  WHERE manager_id IS NOT NULL;


-- ============================================================
-- resources
-- ============================================================

-- Lọc phòng/xe theo loại (dropdown chọn tài nguyên)
CREATE INDEX idx_resources_type
  ON resources(type)
  WHERE is_active = true;


-- ============================================================
-- workflow_templates & workflow_steps
-- ============================================================

-- Load steps của 1 template theo thứ tự
CREATE INDEX idx_wf_steps_template_order
  ON workflow_steps(template_id, step_order);


-- ============================================================
-- requests — indexes chính
-- ============================================================

-- Dashboard: danh sách request của 1 user, mới nhất trước
CREATE INDEX idx_requests_requester
  ON requests(requester_id, created_at DESC);

-- Filter theo status + form_type (dashboard filter)
CREATE INDEX idx_requests_status_type
  ON requests(status, form_type);

-- Filter theo department + status (approver xem request của bộ phận mình)
CREATE INDEX idx_requests_department
  ON requests(department, status);

-- Báo cáo tài chính theo budget_code
CREATE INDEX idx_requests_budget_code
  ON requests(budget_code)
  WHERE budget_code IS NOT NULL;

-- Báo cáo theo kế hoạch ngân sách
CREATE INDEX idx_requests_budget_plan
  ON requests(budget_plan)
  WHERE budget_plan IS NOT NULL;

-- Tra cứu theo PO number (kế toán đối chiếu)
CREATE INDEX idx_requests_po_number
  ON requests(po_number)
  WHERE po_number IS NOT NULL;

-- Workflow engine: tìm request theo template + bước hiện tại
CREATE INDEX idx_requests_workflow
  ON requests(workflow_template_id, current_step_order);

-- Xem lịch theo tháng (calendar view)
CREATE INDEX idx_requests_time_range
  ON requests(start_datetime, end_datetime)
  WHERE start_datetime IS NOT NULL;

-- ── Conflict check index (QUAN TRỌNG NHẤT) ─────────────────
-- Kiểm tra phòng/xe có bị đặt chồng không — phải dùng cột thật mới index được
-- Partial index: chỉ đánh index các request chưa bị hủy/từ chối
CREATE INDEX idx_requests_resource_conflict
  ON requests(resource_id, start_datetime, end_datetime)
  WHERE resource_id IS NOT NULL
    AND status NOT IN ('REJECTED', 'CANCELLED');

-- ── GIN index cho JSONB form_data ──────────────────────────
-- Cho phép query: form_data @> '{"city": "Hà Nội"}'
-- Dùng cho báo cáo/filter nâng cao trên form_data fields
CREATE INDEX idx_requests_form_data_gin
  ON requests USING GIN (form_data);


-- ============================================================
-- request_items
-- ============================================================

-- Load items của 1 request
CREATE INDEX idx_request_items_request
  ON request_items(request_id);


-- ============================================================
-- request_step_instances
-- ============================================================

-- Load tất cả steps của 1 request theo thứ tự
CREATE INDEX idx_step_instances_request_order
  ON request_step_instances(request_id, step_order);

-- Approver xem task của mình (assigned theo user cụ thể)
-- Partial index chỉ trên các bước đang active — giúp query dashboard nhanh
CREATE INDEX idx_step_instances_assigned_user
  ON request_step_instances(assigned_to_id, status)
  WHERE status IN ('PENDING', 'IN_PROGRESS')
    AND assigned_to_id IS NOT NULL;

-- Approver xem task theo role (khi không assign user cụ thể)
CREATE INDEX idx_step_instances_assigned_role
  ON request_step_instances(assigned_role, status)
  WHERE status IN ('PENDING', 'IN_PROGRESS')
    AND assigned_to_id IS NULL;

-- Escalation job: tìm các bước đã quá deadline
CREATE INDEX idx_step_instances_deadline
  ON request_step_instances(deadline_at)
  WHERE status IN ('PENDING', 'IN_PROGRESS', 'ESCALATED')
    AND deadline_at IS NOT NULL;


-- ============================================================
-- delegations
-- ============================================================

-- Kiểm tra ủy quyền active cho 1 người nhận (trong approve_step)
CREATE INDEX idx_delegations_delegatee_active
  ON delegations(delegatee_id, valid_from, valid_until)
  WHERE is_active = true;

-- Xem danh sách ủy quyền của 1 người (UI quản lý ủy quyền)
CREATE INDEX idx_delegations_delegator
  ON delegations(delegator_id)
  WHERE is_active = true;


-- ============================================================
-- audit_log
-- ============================================================

-- Xem lịch sử của 1 request (RequestDetail → tab lịch sử)
CREATE INDEX idx_audit_log_request
  ON audit_log(request_id, created_at DESC);

-- Xem hoạt động của 1 user (admin audit)
CREATE INDEX idx_audit_log_actor
  ON audit_log(actor_id, created_at DESC);

-- Lọc theo loại sự kiện
CREATE INDEX idx_audit_log_event_type
  ON audit_log(event_type, created_at DESC);
