-- ============================================================
-- Phase 2 — Script 04: create_request — Tạo yêu cầu phê duyệt
-- Chạy SAU 03_approve_step.sql
--
-- create_request(p_payload JSONB):
--   p_payload = {
--     title, form_type, amount, requester_id,
--     description?, notes?, is_urgent?,
--     budget_plan?, budget_code?, po_number?,
--     resource_id?, start_datetime?, end_datetime?,
--     form_data: {...},
--     items?: [{item_name, specs, unit, total_qty, ...}]
--   }
--
-- Trả về: {"id": <request_id>}
-- ============================================================


CREATE OR REPLACE FUNCTION create_request(p_payload JSONB)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
  v_request_id  BIGINT;
  v_requester   users%ROWTYPE;
  v_item        JSONB;
  v_sort        INTEGER := 0;
  v_res_id      BIGINT;
  v_start       TIMESTAMPTZ;
  v_end         TIMESTAMPTZ;
  v_conflict    JSONB;
BEGIN
  -- ── 1. Validate requester ──────────────────────────────────
  SELECT * INTO v_requester
  FROM users
  WHERE id = (p_payload->>'requester_id')::BIGINT;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Người dùng không tồn tại: %', p_payload->>'requester_id';
  END IF;

  IF NOT v_requester.is_active THEN
    RAISE EXCEPTION 'Tài khoản đã bị vô hiệu hoá. Vui lòng liên hệ quản trị.';
  END IF;

  -- ── 2. Validate dữ liệu bắt buộc ──────────────────────────
  IF NULLIF(trim(p_payload->>'title'), '') IS NULL THEN
    RAISE EXCEPTION 'Tiêu đề yêu cầu không được để trống';
  END IF;

  IF NULLIF(trim(p_payload->>'form_type'), '') IS NULL THEN
    RAISE EXCEPTION 'Loại biểu mẫu (form_type) không được để trống';
  END IF;

  -- Kiểm tra form_type tồn tại và active
  IF NOT EXISTS (
    SELECT 1 FROM form_types
    WHERE code = p_payload->>'form_type' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Loại biểu mẫu không hợp lệ hoặc đã bị vô hiệu hoá: %',
                    p_payload->>'form_type';
  END IF;

  -- ── 3. Kiểm tra conflict tài nguyên (phòng họp / xe) ──────
  v_res_id := NULLIF(p_payload->>'resource_id', '')::BIGINT;
  v_start  := NULLIF(p_payload->>'start_datetime', '')::TIMESTAMPTZ;
  v_end    := NULLIF(p_payload->>'end_datetime',   '')::TIMESTAMPTZ;

  IF v_res_id IS NOT NULL AND v_start IS NOT NULL AND v_end IS NOT NULL THEN
    IF v_end <= v_start THEN
      RAISE EXCEPTION 'Thời gian kết thúc phải sau thời gian bắt đầu';
    END IF;

    v_conflict := check_resource_conflict(v_res_id, v_start, v_end, NULL);

    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'Tài nguyên đã được đặt trong khung giờ này (conflict với yêu cầu #%: %)',
                      v_conflict->>'conflict_request_id',
                      v_conflict->>'conflict_title';
    END IF;
  END IF;

  -- ── 4. Insert request ─────────────────────────────────────
  INSERT INTO requests (
    title,
    form_type,
    status,
    requester_id,
    department,
    description,
    notes,
    is_urgent,
    amount,
    budget_plan,
    budget_code,
    po_number,
    resource_id,
    start_datetime,
    end_datetime,
    form_data
  ) VALUES (
    trim(p_payload->>'title'),
    p_payload->>'form_type',
    'PENDING',
    v_requester.id,
    COALESCE(v_requester.department, ''),
    NULLIF(trim(p_payload->>'description'), ''),
    NULLIF(trim(p_payload->>'notes'), ''),
    COALESCE((p_payload->>'is_urgent')::BOOLEAN,  false),
    COALESCE((p_payload->>'amount')::NUMERIC,      0),
    NULLIF(trim(p_payload->>'budget_plan'),   ''),
    NULLIF(trim(p_payload->>'budget_code'),   ''),
    NULLIF(trim(p_payload->>'po_number'),     ''),
    v_res_id,
    v_start,
    v_end,
    COALESCE(p_payload->'form_data', '{}')
  )
  RETURNING id INTO v_request_id;

  -- ── 5. Insert request_items (chỉ dùng cho PR) ────────────
  IF p_payload->'items' IS NOT NULL
     AND jsonb_typeof(p_payload->'items') = 'array'
     AND jsonb_array_length(p_payload->'items') > 0
  THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
    LOOP
      v_sort := v_sort + 1;

      INSERT INTO request_items (
        request_id,
        item_name,
        specs,
        unit,
        total_qty,
        available_qty,
        purchase_qty,
        unit_price,
        amount,
        reason,
        sort_order
      ) VALUES (
        v_request_id,
        COALESCE(v_item->>'item_name', ''),
        NULLIF(v_item->>'specs',          ''),
        NULLIF(v_item->>'unit',           ''),
        NULLIF(v_item->>'total_qty',      '')::NUMERIC,
        NULLIF(v_item->>'available_qty',  '')::NUMERIC,
        NULLIF(v_item->>'purchase_qty',   '')::NUMERIC,
        NULLIF(v_item->>'unit_price',     '')::NUMERIC,
        NULLIF(v_item->>'amount',         '')::NUMERIC,
        NULLIF(v_item->>'reason',         ''),
        v_sort
      );
    END LOOP;
  END IF;

  -- ── 6. Ghi audit log SUBMIT ───────────────────────────────
  INSERT INTO audit_log (
    request_id, event_type, actor_id, actor_name, new_value
  ) VALUES (
    v_request_id,
    'SUBMIT',
    v_requester.id,
    v_requester.name,
    jsonb_build_object(
      'form_type', p_payload->>'form_type',
      'amount',    p_payload->>'amount',
      'title',     p_payload->>'title'
    )
  );

  -- ── 7. Khởi tạo workflow ──────────────────────────────────
  PERFORM workflow_initialize(v_request_id);

  RETURN jsonb_build_object('id', v_request_id);

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise với context rõ ràng hơn
    RAISE EXCEPTION 'create_request thất bại: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION create_request IS
  'Tạo yêu cầu phê duyệt mới: validate → insert request + items → audit → khởi tạo workflow';
