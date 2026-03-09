-- ============================================================
-- Phase 1 — Script 04: Seed form_types
-- Chạy SAU 03_rls.sql
-- active_template_id sẽ được gán sau khi chạy 05_seed_templates.sql
-- ============================================================

INSERT INTO form_types (
  code, name, description, icon,
  sort_order, requires_resource, requires_time_range,
  field_schema
) VALUES

-- ─────────────────────────────────────────────────────────────
-- Form 01: PR — Yêu cầu mua sắm
-- Dữ liệu đặc thù vào form_data (request_group, deadline_days, leadtime)
-- Danh sách hàng hóa lưu riêng trong bảng request_items
-- ─────────────────────────────────────────────────────────────
(
  'PR',
  'Yêu cầu mua sắm',
  'Purchase Request — mua sắm hàng hóa, thiết bị, dịch vụ cho bộ phận',
  'ShoppingCart',
  1, false, false,
  '{
    "sections": [
      {
        "title": "Thông tin chung",
        "fields": [
          {
            "key": "request_group",
            "label": "Nhóm yêu cầu",
            "type": "text",
            "required": false,
            "placeholder": "VD: Thiết bị văn phòng, Vật tư IT..."
          },
          {
            "key": "deadline_days",
            "label": "Thời hạn cần hàng (ngày)",
            "type": "number",
            "required": false,
            "min": 1,
            "placeholder": "Số ngày kể từ ngày được duyệt"
          },
          {
            "key": "leadtime",
            "label": "Leadtime dự kiến",
            "type": "text",
            "required": false,
            "placeholder": "VD: 2-3 tuần, 30 ngày..."
          }
        ]
      }
    ],
    "has_items_table": true,
    "has_financial_fields": true
  }'
),

-- ─────────────────────────────────────────────────────────────
-- Form 02: PROPOSAL — Tờ trình phê duyệt
-- Cấu trúc 6 mục như thiết kế hiện tại, chuyển vào form_data
-- ─────────────────────────────────────────────────────────────
(
  'PROPOSAL',
  'Tờ trình phê duyệt',
  'Tờ trình sự kiện, hoạt động, chương trình — đề xuất cần phê duyệt cấp cao',
  'FileText',
  2, false, false,
  '{
    "sections": [
      {
        "title": "1. Tổng quan",
        "fields": [
          {
            "key": "overview",
            "label": "Nội dung tổng quan",
            "type": "textarea",
            "required": true,
            "placeholder": "Mô tả tổng quan về nội dung tờ trình..."
          }
        ]
      },
      {
        "title": "2. Thông tin chính",
        "fields": [
          {
            "key": "event_time",
            "label": "Thời gian dự kiến áp dụng",
            "type": "text",
            "required": false,
            "placeholder": "VD: Tháng 4/2025, từ ngày 10-12/4"
          },
          {
            "key": "location",
            "label": "Địa điểm",
            "type": "text",
            "required": false,
            "placeholder": "VD: Hội trường lớn - Tầng 1, Tòa A"
          },
          {
            "key": "chairperson",
            "label": "Người chủ trì",
            "type": "text",
            "required": false,
            "placeholder": "Họ tên và chức danh"
          },
          {
            "key": "format",
            "label": "Hình thức tổ chức",
            "type": "text",
            "required": false,
            "placeholder": "VD: Offline, Online qua Zoom, Hybrid..."
          },
          {
            "key": "target_audience",
            "label": "Đối tượng áp dụng",
            "type": "text",
            "required": false,
            "placeholder": "VD: Toàn thể nhân viên, Ban giám hiệu..."
          }
        ]
      },
      {
        "title": "3. Yêu cầu cụ thể",
        "fields": [
          {
            "key": "requirements",
            "label": "Yêu cầu cụ thể",
            "type": "textarea",
            "required": false,
            "placeholder": "Các yêu cầu, điều kiện cần thiết..."
          }
        ]
      },
      {
        "title": "4. Cách thức tổ chức & Đề nghị hỗ trợ",
        "fields": [
          {
            "key": "method_support",
            "label": "Đề nghị hỗ trợ từ các bộ phận",
            "type": "dept_support_table",
            "required": false
          }
        ]
      },
      {
        "title": "5. Chi phí tổ chức",
        "fields": [
          {
            "key": "costs",
            "label": "Chi tiết chi phí",
            "type": "cost_table",
            "required": false
          }
        ]
      },
      {
        "title": "6. Kết quả dự kiến",
        "fields": [
          {
            "key": "expected_results",
            "label": "Kết quả và chỉ tiêu dự kiến",
            "type": "textarea",
            "required": false,
            "placeholder": "Các kết quả, KPI dự kiến đạt được..."
          }
        ]
      }
    ],
    "has_items_table": false,
    "has_financial_fields": true
  }'
),

-- ─────────────────────────────────────────────────────────────
-- Form 03: ROOM_BOOKING — Đặt phòng họp
-- requires_resource = true → hiện ResourcePicker chọn phòng
-- requires_time_range = true → hiện DateTimePicker
-- start/end datetime + resource_id lưu vào cột thật trên requests
-- ─────────────────────────────────────────────────────────────
(
  'ROOM_BOOKING',
  'Đặt phòng họp',
  'Đăng ký sử dụng phòng họp nội bộ — kiểm tra tự động nếu phòng đã có lịch',
  'DoorOpen',
  3, true, true,
  '{
    "sections": [
      {
        "title": "Thông tin buổi họp",
        "fields": [
          {
            "key": "attendees_count",
            "label": "Số người tham dự",
            "type": "number",
            "required": true,
            "min": 1,
            "placeholder": "Nhập số người"
          },
          {
            "key": "purpose",
            "label": "Mục đích sử dụng phòng",
            "type": "textarea",
            "required": true,
            "placeholder": "VD: Họp triển khai dự án X, Phỏng vấn ứng viên..."
          },
          {
            "key": "equipment_needed",
            "label": "Thiết bị cần hỗ trợ",
            "type": "checkbox_group",
            "required": false,
            "options": ["Máy chiếu", "Bảng trắng", "TV màn hình lớn", "Micro", "Webcam", "Điều hoà riêng"]
          },
          {
            "key": "setup_notes",
            "label": "Yêu cầu sắp xếp phòng",
            "type": "text",
            "required": false,
            "placeholder": "VD: Kiểu chữ U, kiểu hội đồng, để trống..."
          },
          {
            "key": "external_guests",
            "label": "Có khách từ bên ngoài tổ chức",
            "type": "boolean",
            "required": false
          }
        ]
      }
    ],
    "has_items_table": false,
    "has_financial_fields": false,
    "promoted_fields": {
      "resource_type": "ROOM",
      "resource_label": "Phòng họp",
      "start_label": "Thời gian bắt đầu",
      "end_label": "Thời gian kết thúc"
    }
  }'
),

-- ─────────────────────────────────────────────────────────────
-- Form 04: VEHICLE_BOOKING — Đặt xe công ty
-- requires_resource = true → hiện ResourcePicker chọn xe
-- requires_time_range = true → hiện DateTimePicker
-- ─────────────────────────────────────────────────────────────
(
  'VEHICLE_BOOKING',
  'Đặt xe công ty',
  'Đăng ký sử dụng xe công ty phục vụ công tác — kiểm tra tự động nếu xe đã có lịch',
  'Car',
  4, true, true,
  '{
    "sections": [
      {
        "title": "Thông tin chuyến đi",
        "fields": [
          {
            "key": "departure_location",
            "label": "Điểm đón",
            "type": "text",
            "required": true,
            "placeholder": "VD: Văn phòng HN - 123 Lê Duẩn, Ba Đình"
          },
          {
            "key": "destination",
            "label": "Điểm đến",
            "type": "text",
            "required": true,
            "placeholder": "VD: Sân bay Nội Bài, Hải Phòng..."
          },
          {
            "key": "purpose",
            "label": "Mục đích chuyến đi",
            "type": "textarea",
            "required": true,
            "placeholder": "VD: Thăm đối tác, tham dự hội nghị, đưa đón khách..."
          },
          {
            "key": "passengers_count",
            "label": "Số người đi",
            "type": "number",
            "required": true,
            "min": 1,
            "placeholder": "Nhập số người"
          },
          {
            "key": "passengers",
            "label": "Danh sách người đi (nếu có)",
            "type": "text_list",
            "required": false,
            "placeholder": "Nhập tên mỗi người..."
          },
          {
            "key": "return_expected_time",
            "label": "Giờ về dự kiến",
            "type": "time",
            "required": false
          },
          {
            "key": "note_for_driver",
            "label": "Ghi chú cho lái xe",
            "type": "text",
            "required": false,
            "placeholder": "VD: Đón tại cổng chính, cần đến trước 10 phút..."
          }
        ]
      }
    ],
    "has_items_table": false,
    "has_financial_fields": false,
    "promoted_fields": {
      "resource_type": "VEHICLE",
      "resource_label": "Xe",
      "start_label": "Giờ xuất phát",
      "end_label": "Giờ về (dự kiến)"
    }
  }'
),

-- ─────────────────────────────────────────────────────────────
-- Form 05: ACCOMMODATION — Đặt phòng lưu trú công tác
-- requires_time_range = true → chọn ngày check-in / check-out
-- Chi phí lưu vào cột amount + budget_code (cột thật)
-- ─────────────────────────────────────────────────────────────
(
  'ACCOMMODATION',
  'Đặt phòng công tác',
  'Đăng ký phòng lưu trú khi đi công tác ngoài tỉnh — kèm chi phí dự kiến',
  'Hotel',
  5, false, true,
  '{
    "sections": [
      {
        "title": "Thông tin lưu trú",
        "fields": [
          {
            "key": "city",
            "label": "Thành phố / Tỉnh công tác",
            "type": "text",
            "required": true,
            "placeholder": "VD: Đà Nẵng, TP. Hồ Chí Minh, Hải Phòng..."
          },
          {
            "key": "hotel_preference",
            "label": "Yêu cầu về khách sạn",
            "type": "text",
            "required": false,
            "placeholder": "VD: Khách sạn 3-4 sao gần trung tâm, có wifi..."
          },
          {
            "key": "num_rooms",
            "label": "Số phòng cần đặt",
            "type": "number",
            "required": true,
            "min": 1
          },
          {
            "key": "guests",
            "label": "Danh sách người lưu trú",
            "type": "person_list",
            "required": false
          },
          {
            "key": "business_trip_purpose",
            "label": "Mục đích công tác",
            "type": "textarea",
            "required": true,
            "placeholder": "Mô tả công việc cần thực hiện trong chuyến công tác..."
          },
          {
            "key": "special_requirements",
            "label": "Yêu cầu đặc biệt",
            "type": "text",
            "required": false,
            "placeholder": "VD: Phòng có bàn làm việc, 2 phòng liền kề..."
          }
        ]
      }
    ],
    "has_items_table": false,
    "has_financial_fields": true,
    "promoted_fields": {
      "start_label": "Ngày check-in",
      "end_label": "Ngày check-out"
    }
  }'
);
