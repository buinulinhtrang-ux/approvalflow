-- ============================================================
-- Phase 1 — Script 05: Seed workflow templates mặc định
-- Chạy SAU 04_seed_form_types.sql
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- Template 1: Luồng phê duyệt chuẩn 3 bước
-- Áp dụng cho: PR, PROPOSAL
-- Trưởng bộ phận → CFO → COO
-- ─────────────────────────────────────────────────────────────
INSERT INTO workflow_templates (id, name, description) VALUES
  (1, 'Luồng phê duyệt chuẩn', 'Trưởng bộ phận → CFO → COO — áp dụng cho PR và Tờ trình');

INSERT INTO workflow_steps
  (template_id, step_order, step_name, approver_type, approver_value,
   deadline_hours, reminder_hours, on_reject, on_timeout)
VALUES
  -- Bước 1: Trưởng bộ phận (tự động tìm MANAGER cùng department với người tạo)
  (1, 1, 'Trưởng bộ phận',
   'DYNAMIC_DEPT_HEAD', NULL,
   24, 8, 'RETURN_REQUESTER', 'ESCALATE'),

  -- Bước 2: CFO
  (1, 2, 'Giám đốc tài chính (CFO)',
   'FIXED_ROLE', 'CFO',
   48, 16, 'RETURN_REQUESTER', 'ESCALATE'),

  -- Bước 3: COO
  (1, 3, 'Phó tổng giám đốc (COO)',
   'FIXED_ROLE', 'COO',
   48, 16, 'RETURN_REQUESTER', 'ESCALATE');


-- ─────────────────────────────────────────────────────────────
-- Template 2: Luồng phê duyệt chuẩn 2 bước
-- Áp dụng cho: PR giá trị thấp, PROPOSAL đơn giản
-- Trưởng bộ phận → CFO
-- ─────────────────────────────────────────────────────────────
INSERT INTO workflow_templates (id, name, description) VALUES
  (2, 'Luồng phê duyệt 2 bước', 'Trưởng bộ phận → CFO — cho các yêu cầu giá trị vừa');

INSERT INTO workflow_steps
  (template_id, step_order, step_name, approver_type, approver_value,
   deadline_hours, reminder_hours, on_reject, on_timeout)
VALUES
  (2, 1, 'Trưởng bộ phận',
   'DYNAMIC_DEPT_HEAD', NULL,
   24, 8, 'RETURN_REQUESTER', 'ESCALATE'),

  (2, 2, 'Giám đốc tài chính (CFO)',
   'FIXED_ROLE', 'CFO',
   48, 16, 'RETURN_REQUESTER', 'ESCALATE');


-- ─────────────────────────────────────────────────────────────
-- Template 3: Luồng đặt phòng họp (1 bước)
-- Áp dụng cho: ROOM_BOOKING
-- Trưởng bộ phận duyệt — hiệu lực ngay
-- ─────────────────────────────────────────────────────────────
INSERT INTO workflow_templates (id, name, description) VALUES
  (3, 'Luồng đặt phòng họp', 'Trưởng bộ phận duyệt — phòng được đặt ngay khi approve');

INSERT INTO workflow_steps
  (template_id, step_order, step_name, approver_type, approver_value,
   deadline_hours, reminder_hours, on_reject, on_timeout)
VALUES
  (3, 1, 'Trưởng bộ phận',
   'DYNAMIC_DEPT_HEAD', NULL,
   8, 4, 'RETURN_REQUESTER', 'AUTO_REJECT');


-- ─────────────────────────────────────────────────────────────
-- Template 4: Luồng đặt xe công ty (2 bước)
-- Áp dụng cho: VEHICLE_BOOKING
-- Trưởng bộ phận → Hành chính xác nhận điều xe
-- ─────────────────────────────────────────────────────────────
INSERT INTO workflow_templates (id, name, description) VALUES
  (4, 'Luồng đặt xe công ty', 'Trưởng bộ phận → Hành chính xác nhận xe và lịch lái xe');

INSERT INTO workflow_steps
  (template_id, step_order, step_name, approver_type, approver_value,
   deadline_hours, reminder_hours, on_reject, on_timeout)
VALUES
  (4, 1, 'Trưởng bộ phận',
   'DYNAMIC_DEPT_HEAD', NULL,
   8, 4, 'RETURN_REQUESTER', 'ESCALATE'),

  -- Bước 2: MANAGER role — hành chính sẽ có role MANAGER trong bộ phận Hành chính
  -- Admin có thể đổi thành FIXED_USER sau khi xác định user cụ thể
  (4, 2, 'Hành chính — Xác nhận xe',
   'FIXED_ROLE', 'MANAGER',
   4, 2, 'RETURN_REQUESTER', 'AUTO_REJECT');


-- ─────────────────────────────────────────────────────────────
-- Template 5: Luồng đặt phòng công tác (2 bước)
-- Áp dụng cho: ACCOMMODATION
-- Trưởng bộ phận → CFO duyệt chi phí
-- ─────────────────────────────────────────────────────────────
INSERT INTO workflow_templates (id, name, description) VALUES
  (5, 'Luồng đặt phòng công tác', 'Trưởng bộ phận → CFO duyệt chi phí lưu trú');

INSERT INTO workflow_steps
  (template_id, step_order, step_name, approver_type, approver_value,
   deadline_hours, reminder_hours, on_reject, on_timeout)
VALUES
  (5, 1, 'Trưởng bộ phận',
   'DYNAMIC_DEPT_HEAD', NULL,
   24, 8, 'RETURN_REQUESTER', 'ESCALATE'),

  (5, 2, 'Giám đốc tài chính (CFO)',
   'FIXED_ROLE', 'CFO',
   48, 16, 'RETURN_REQUESTER', 'ESCALATE');


-- ─────────────────────────────────────────────────────────────
-- Gán active_template_id cho từng form_type
-- ─────────────────────────────────────────────────────────────
UPDATE form_types SET active_template_id = 1 WHERE code = 'PR';
UPDATE form_types SET active_template_id = 1 WHERE code = 'PROPOSAL';
UPDATE form_types SET active_template_id = 3 WHERE code = 'ROOM_BOOKING';
UPDATE form_types SET active_template_id = 4 WHERE code = 'VEHICLE_BOOKING';
UPDATE form_types SET active_template_id = 5 WHERE code = 'ACCOMMODATION';


-- ─────────────────────────────────────────────────────────────
-- Reset sequence để tránh conflict nếu insert thủ công với id
-- ─────────────────────────────────────────────────────────────
SELECT setval('workflow_templates_id_seq', (SELECT MAX(id) FROM workflow_templates));
