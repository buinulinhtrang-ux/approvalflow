-- ============================================================
-- Phase 2 — Script 01: Helper Functions
-- Chạy TRƯỚC 02_workflow_initialize.sql
-- Thứ tự: 01 → 02 → 03 → 04 → 05 → 06
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- FUNCTION: workflow_evaluate_skip
-- Đánh giá điều kiện bỏ qua bước workflow
-- Trả về TRUE nếu bước này cần được bỏ qua
--
-- skip_condition format:
--   {"field": "amount", "op": "<", "value": 5000000}
--   {"field": "is_urgent", "op": "=", "value": true}
--   {"field": "form_data.attendees_count", "op": "<=", "value": 10}
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION workflow_evaluate_skip(
  p_skip_condition  JSONB,
  p_request         requests
) RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_field   TEXT;
  v_op      TEXT;
  v_value   TEXT;
  v_actual  TEXT;
BEGIN
  -- NULL condition = không bao giờ bỏ qua
  IF p_skip_condition IS NULL THEN
    RETURN false;
  END IF;

  v_field := p_skip_condition->>'field';
  v_op    := p_skip_condition->>'op';
  v_value := p_skip_condition->>'value';

  -- Lấy giá trị thực từ request
  v_actual := CASE v_field
    WHEN 'amount'    THEN p_request.amount::TEXT
    WHEN 'is_urgent' THEN p_request.is_urgent::TEXT
    WHEN 'form_type' THEN p_request.form_type
    WHEN 'department'THEN p_request.department
    ELSE
      -- form_data.some_field → lấy từ JSONB
      CASE WHEN v_field LIKE 'form_data.%'
        THEN p_request.form_data->>(substring(v_field FROM 11))
        ELSE NULL
      END
  END;

  -- NULL actual → không đủ điều kiện để bỏ qua
  IF v_actual IS NULL THEN
    RETURN false;
  END IF;

  -- So sánh: số học với '<', '<=', '>', '>='
  --           chuỗi/boolean với '=', '!='
  RETURN CASE v_op
    WHEN '<'  THEN v_actual::NUMERIC <  v_value::NUMERIC
    WHEN '<=' THEN v_actual::NUMERIC <= v_value::NUMERIC
    WHEN '>'  THEN v_actual::NUMERIC >  v_value::NUMERIC
    WHEN '>=' THEN v_actual::NUMERIC >= v_value::NUMERIC
    WHEN '='  THEN lower(v_actual)    =  lower(v_value)
    WHEN '!=' THEN lower(v_actual)    != lower(v_value)
    ELSE false
  END;

EXCEPTION WHEN OTHERS THEN
  -- Lỗi cast / kiểu dữ liệu → không bỏ qua để an toàn
  RETURN false;
END;
$$;

COMMENT ON FUNCTION workflow_evaluate_skip IS
  'Đánh giá skip_condition JSONB của một workflow_step so với dữ liệu request thực tế';


-- ─────────────────────────────────────────────────────────────
-- FUNCTION: workflow_activate_step
-- Kích hoạt (chuyển sang IN_PROGRESS) một bước cụ thể của request.
-- Tự động resolve người phê duyệt dựa vào approver_type.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION workflow_activate_step(
  p_request_id  BIGINT,
  p_step_order  INTEGER
) RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_request      requests%ROWTYPE;
  v_step         workflow_steps%ROWTYPE;
  v_to_id        BIGINT  := NULL;
  v_role         TEXT    := NULL;
  v_deadline     TIMESTAMPTZ;
  v_lookup_id    BIGINT;
BEGIN
  -- Load request
  SELECT * INTO v_request FROM requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request không tồn tại: %', p_request_id;
  END IF;

  -- Load workflow step definition thông qua step instance
  SELECT ws.* INTO v_step
  FROM workflow_steps ws
  JOIN request_step_instances rsi ON rsi.step_id = ws.id
  WHERE rsi.request_id = p_request_id
    AND rsi.step_order = p_step_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy workflow step cho step_order % của request %',
                    p_step_order, p_request_id;
  END IF;

  -- ── Resolve approver ──────────────────────────────────────
  CASE v_step.approver_type

    WHEN 'FIXED_ROLE' THEN
      -- Gán cho tất cả user có role này (không assign user cụ thể)
      v_to_id := NULL;
      v_role  := v_step.approver_value;

    WHEN 'FIXED_USER' THEN
      -- Gán cho user ID cố định
      v_to_id := v_step.approver_value::BIGINT;
      v_role  := NULL;

    WHEN 'DYNAMIC_MANAGER' THEN
      -- Quản lý trực tiếp của người tạo (manager_id)
      SELECT manager_id INTO v_lookup_id
      FROM users WHERE id = v_request.requester_id;

      IF v_lookup_id IS NOT NULL THEN
        v_to_id := v_lookup_id;
        v_role  := NULL;
      ELSE
        -- Fallback: gán theo role MANAGER nếu không tìm thấy manager_id
        v_to_id := NULL;
        v_role  := 'MANAGER';
      END IF;

    WHEN 'DYNAMIC_DEPT_HEAD' THEN
      -- Tìm user có role=MANAGER trong cùng department
      SELECT id INTO v_lookup_id
      FROM users
      WHERE department = v_request.department
        AND role       = 'MANAGER'
        AND is_active  = true
      LIMIT 1;

      IF v_lookup_id IS NOT NULL THEN
        v_to_id := v_lookup_id;
        v_role  := NULL;
      ELSE
        -- Fallback: gán theo role MANAGER nếu không tìm thấy
        v_to_id := NULL;
        v_role  := 'MANAGER';
      END IF;

    WHEN 'REQUESTER_SELECT' THEN
      -- Người tạo tự chọn — cần được set thủ công trước khi submit
      -- Nếu chưa set thì giữ unassigned
      v_to_id := NULL;
      v_role  := 'REQUESTER_SELECT';

    ELSE
      v_to_id := NULL;
      v_role  := NULL;
  END CASE;

  -- ── Tính deadline ─────────────────────────────────────────
  -- Urgent request: deadline = một nửa thời gian bình thường (tối thiểu 1 giờ)
  v_deadline := now() + MAKE_INTERVAL(hours => CASE
    WHEN v_request.is_urgent THEN GREATEST(1, v_step.deadline_hours / 2)
    ELSE v_step.deadline_hours
  END);

  -- ── Kích hoạt step instance ───────────────────────────────
  UPDATE request_step_instances
  SET
    status         = 'IN_PROGRESS',
    assigned_to_id = v_to_id,
    assigned_role  = v_role,
    assigned_at    = now(),
    deadline_at    = v_deadline
  WHERE request_id = p_request_id
    AND step_order = p_step_order
    AND status     = 'PENDING';  -- Chỉ activate step đang PENDING

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Step % của request % không ở trạng thái PENDING',
                    p_step_order, p_request_id;
  END IF;

  -- ── Cập nhật current_step_order trên request ──────────────
  UPDATE requests
  SET current_step_order = p_step_order,
      updated_at         = now()
  WHERE id = p_request_id;

END;
$$;

COMMENT ON FUNCTION workflow_activate_step IS
  'Kích hoạt bước workflow (PENDING → IN_PROGRESS), tự động resolve approver';


-- ─────────────────────────────────────────────────────────────
-- FUNCTION: check_resource_conflict
-- Kiểm tra xem resource có bị trùng lịch không.
-- Trả về thông tin conflict (JSONB) hoặc NULL nếu không có.
--
-- Gọi trước khi tạo ROOM_BOOKING / VEHICLE_BOOKING để đảm bảo
-- không có request khác đang giữ resource trong cùng khung giờ.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION check_resource_conflict(
  p_resource_id         BIGINT,
  p_start               TIMESTAMPTZ,
  p_end                 TIMESTAMPTZ,
  p_exclude_request_id  BIGINT DEFAULT NULL
) RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_conflict RECORD;
BEGIN
  -- Kiểm tra overlap: [p_start, p_end) giao với [start, end) của request đã tồn tại
  -- Điều kiện overlap: A.start < B.end AND A.end > B.start
  SELECT
    r.id,
    r.title,
    r.start_datetime,
    r.end_datetime
  INTO v_conflict
  FROM requests r
  WHERE r.resource_id   = p_resource_id
    AND r.status NOT IN ('REJECTED', 'CANCELLED')
    AND r.start_datetime < p_end
    AND r.end_datetime   > p_start
    AND (p_exclude_request_id IS NULL OR r.id != p_exclude_request_id)
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'conflict_request_id', v_conflict.id,
      'conflict_title',      v_conflict.title,
      'conflict_start',      v_conflict.start_datetime,
      'conflict_end',        v_conflict.end_datetime
    );
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION check_resource_conflict IS
  'Kiểm tra trùng lịch tài nguyên (phòng họp, xe) — trả về NULL nếu không có conflict';
