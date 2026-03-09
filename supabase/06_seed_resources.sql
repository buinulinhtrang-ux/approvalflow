-- ============================================================
-- Phase 1 — Script 06: Seed resources mẫu (phòng họp, xe)
-- Chạy SAU 05_seed_templates.sql
-- Điều chỉnh dữ liệu cho phù hợp với tổ chức thực tế
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- Phòng họp
-- ─────────────────────────────────────────────────────────────
INSERT INTO resources (type, name, code, capacity, location, description, properties) VALUES

  ('ROOM',
   'Phòng họp A',
   'ROOM-A',
   20,
   'Tầng 3, Tòa nhà chính',
   'Phòng họp đa năng, phù hợp họp nhóm và đào tạo nội bộ',
   '{
     "has_projector": true,
     "has_whiteboard": true,
     "has_tv": false,
     "has_micro": false,
     "has_webcam": false,
     "has_private_ac": true
   }'
  ),

  ('ROOM',
   'Phòng họp B',
   'ROOM-B',
   10,
   'Tầng 3, Tòa nhà chính',
   'Phòng họp nhỏ, phù hợp họp ban lãnh đạo hoặc phỏng vấn',
   '{
     "has_projector": true,
     "has_whiteboard": true,
     "has_tv": true,
     "has_micro": false,
     "has_webcam": true,
     "has_private_ac": true
   }'
  ),

  ('ROOM',
   'Phòng họp C',
   'ROOM-C',
   8,
   'Tầng 2, Tòa nhà chính',
   'Phòng họp nhỏ, không cần đặt trước với nhóm dưới 4 người',
   '{
     "has_projector": false,
     "has_whiteboard": true,
     "has_tv": true,
     "has_micro": false,
     "has_webcam": false,
     "has_private_ac": false
   }'
  ),

  ('ROOM',
   'Hội trường lớn',
   'HALL-1',
   150,
   'Tầng 1, Tòa nhà chính',
   'Hội trường toàn trường — hội nghị, lễ tổng kết, đào tạo quy mô lớn',
   '{
     "has_projector": true,
     "has_whiteboard": false,
     "has_tv": false,
     "has_micro": true,
     "has_webcam": true,
     "has_stage": true,
     "has_private_ac": true,
     "has_sound_system": true
   }'
  ),

  ('ROOM',
   'Phòng đào tạo',
   'TRAIN-1',
   40,
   'Tầng 4, Tòa nhà phụ',
   'Phòng đào tạo có bố cục lớp học — bàn ghế cố định hướng về bảng',
   '{
     "has_projector": true,
     "has_whiteboard": true,
     "has_tv": false,
     "has_micro": false,
     "has_webcam": false,
     "has_private_ac": true,
     "layout": "classroom"
   }'
  );


-- ─────────────────────────────────────────────────────────────
-- Xe công ty
-- ─────────────────────────────────────────────────────────────
INSERT INTO resources (type, name, code, capacity, location, description, properties) VALUES

  ('VEHICLE',
   'Toyota Innova 2022 — 30A-00001',
   'VEH-001',
   7,
   'Bãi xe tầng hầm B1',
   'Xe 7 chỗ — phù hợp đi công tác nhóm hoặc đón khách',
   '{
     "plate": "30A-00001",
     "seats": 7,
     "brand": "Toyota",
     "model": "Innova 2022",
     "color": "Trắng",
     "fuel_type": "Xăng"
   }'
  ),

  ('VEHICLE',
   'Toyota Camry 2023 — 30A-00002',
   'VEH-002',
   5,
   'Bãi xe tầng hầm B1',
   'Xe 5 chỗ cao cấp — ưu tiên đón tiếp đối tác, ban lãnh đạo',
   '{
     "plate": "30A-00002",
     "seats": 5,
     "brand": "Toyota",
     "model": "Camry 2023",
     "color": "Đen",
     "fuel_type": "Xăng"
   }'
  ),

  ('VEHICLE',
   'Ford Transit 2021 — 51A-00003',
   'VEH-003',
   16,
   'Bãi xe tầng hầm B1',
   'Xe 16 chỗ — phù hợp chở đoàn đi công tác hoặc tham quan',
   '{
     "plate": "51A-00003",
     "seats": 16,
     "brand": "Ford",
     "model": "Transit 2021",
     "color": "Bạc",
     "fuel_type": "Diesel"
   }'
  );


-- ─────────────────────────────────────────────────────────────
-- Verify
-- ─────────────────────────────────────────────────────────────
-- SELECT type, code, name, capacity FROM resources ORDER BY type, code;
