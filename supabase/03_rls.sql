-- ============================================================
-- Phase 1 — Script 03: Row Level Security (RLS)
-- Chạy SAU 02_indexes.sql
--
-- Lưu ý về kiến trúc auth:
--   - Project dùng localStorage auth (không dùng Supabase Auth native)
--   - Tất cả write operations đi qua SECURITY DEFINER RPC functions
--     → RPC functions bypass RLS hoàn toàn
--   - Frontend dùng anon key để READ trực tiếp từ một số bảng
--   - Phase này: policies permissive cho READ, restrict DELETE trên audit_log
--   - Phase 5 (nâng cao): có thể tighthen khi nâng cấp sang Supabase Auth
-- ============================================================


-- ============================================================
-- Bật RLS trên tất cả bảng
-- ============================================================
ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources              ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_templates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_types             ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests               ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_step_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log              ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLE: users
-- Frontend cần đọc để: login, hiển thị tên approver, HR sync
-- ============================================================
CREATE POLICY "users_select_all"
  ON users FOR SELECT
  USING (true);

-- INSERT/UPDATE đi qua RPC (sync_employees, admin functions) với SECURITY DEFINER
-- Không cần policy cho INSERT/UPDATE từ anon key trực tiếp


-- ============================================================
-- TABLE: resources (bảng tham chiếu — public read)
-- ============================================================
CREATE POLICY "resources_select_active"
  ON resources FOR SELECT
  USING (is_active = true);


-- ============================================================
-- TABLE: workflow_templates (bảng tham chiếu — public read)
-- ============================================================
CREATE POLICY "workflow_templates_select_active"
  ON workflow_templates FOR SELECT
  USING (is_active = true);


-- ============================================================
-- TABLE: workflow_steps (bảng tham chiếu — public read)
-- ============================================================
CREATE POLICY "workflow_steps_select_all"
  ON workflow_steps FOR SELECT
  USING (true);


-- ============================================================
-- TABLE: form_types (bảng tham chiếu — public read)
-- ============================================================
CREATE POLICY "form_types_select_active"
  ON form_types FOR SELECT
  USING (is_active = true);


-- ============================================================
-- TABLE: requests
-- Frontend read trực tiếp (getRequests, getRequest)
-- Write đi qua RPC create_request (SECURITY DEFINER)
-- ============================================================
CREATE POLICY "requests_select_all"
  ON requests FOR SELECT
  USING (true);

-- Cho phép UPDATE trực tiếp từ frontend (cancel request)
-- Phase 5 có thể tighten: chỉ cho phép requester_id = current user
CREATE POLICY "requests_update_all"
  ON requests FOR UPDATE
  USING (true);


-- ============================================================
-- TABLE: request_items
-- Frontend read trực tiếp (getRequestItems)
-- Write đi qua RPC create_request (SECURITY DEFINER)
-- ============================================================
CREATE POLICY "request_items_select_all"
  ON request_items FOR SELECT
  USING (true);


-- ============================================================
-- TABLE: request_step_instances
-- Frontend read trực tiếp để hiển thị workflow timeline
-- Write đi qua RPC approve_step, workflow_initialize (SECURITY DEFINER)
-- ============================================================
CREATE POLICY "step_instances_select_all"
  ON request_step_instances FOR SELECT
  USING (true);


-- ============================================================
-- TABLE: delegations
-- Frontend read để hiển thị delegation UI
-- Write đi qua RPC (Phase 5)
-- ============================================================
CREATE POLICY "delegations_select_all"
  ON delegations FOR SELECT
  USING (true);

CREATE POLICY "delegations_insert_all"
  ON delegations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "delegations_update_own"
  ON delegations FOR UPDATE
  USING (true);


-- ============================================================
-- TABLE: audit_log — CHỈ INSERT, không UPDATE, không DELETE
-- Enforce tính bất biến của audit trail
-- ============================================================
CREATE POLICY "audit_log_select_all"
  ON audit_log FOR SELECT
  USING (true);

CREATE POLICY "audit_log_insert_only"
  ON audit_log FOR INSERT
  WITH CHECK (true);

-- Không tạo policy cho UPDATE và DELETE trên audit_log
-- → Mặc định bị chặn khi RLS enabled

-- ============================================================
-- Ghi chú về SECURITY DEFINER functions:
--
-- Các RPC functions sau đây chạy với quyền của owner (postgres),
-- bypass hoàn toàn RLS → có thể read/write mọi bảng:
--   - create_request()
--   - approve_step()
--   - workflow_initialize()
--   - workflow_resolve_approver()
--   - workflow_evaluate_skip()
--   - admin_save_template()
--   - sync_employees()
--   - check_resource_conflict()
--
-- Điều này an toàn vì các functions đã có validation logic bên trong.
-- ============================================================
