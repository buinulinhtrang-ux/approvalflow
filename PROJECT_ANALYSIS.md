# ApprovalFlow — Phân tích dự án

## Mô tả tổng quan

**ApprovalFlow** là hệ thống quản lý **Purchase Request (PR) và Tờ trình** với quy trình phê duyệt đa cấp, được xây dựng cho một tổ chức giáo dục (có các phòng ban như Trường THCS, THPT, Ban đào tạo, HR, IT...).

---

## Kiến trúc kỹ thuật

### Stack công nghệ

| Lớp | Công nghệ |
|-----|-----------|
| Frontend | React 19 + TypeScript + Vite + TailwindCSS v4 + Framer Motion + Lucide Icons |
| Backend | Express.js chạy bằng `tsx` (TypeScript trực tiếp, không build) |
| Database | SQLite qua `better-sqlite3` — file `approval.db` lưu cục bộ |
| Dev server | Vite chạy ở middleware mode trong Express (cùng port 3000) |

### Cấu trúc file

```
approvalflow/
├── server.ts              ← Express API + DB init + Vite dev middleware
├── users.json             ← Dữ liệu user seed (~194 người dùng)
├── approval.db            ← SQLite database (tự tạo khi chạy)
└── src/
    ├── App.tsx            ← App shell: routing, auth state, fetch
    ├── types.ts           ← TypeScript interfaces
    └── components/
        ├── Login.tsx          ← Form đăng nhập
        ← Dashboard.tsx        ← Danh sách tất cả yêu cầu
        ├── CreateRequest.tsx  ← Form tạo PR / Tờ trình
        └── RequestDetail.tsx  ← Xem chi tiết + phê duyệt
```

### Schema cơ sở dữ liệu

```
users            ← Người dùng (employee_id, password, name, role, department...)
requests         ← Yêu cầu PR / Tờ trình (title, amount, type, status, current_approver_role...)
request_items    ← Hàng hóa trong PR (item_name, specs, qty, unit_price, amount...)
approvals        ← Lịch sử phê duyệt (approver_id, status, comment, created_at)
```

---

## Luồng hoạt động

### Quy trình phê duyệt cố định 3 bước

```
REQUESTER  →  MANAGER (cùng bộ phận)  →  CFO  →  COO  →  COMPLETED
```

- Nếu người tạo là MANAGER → bắt đầu từ bước CFO
- Nếu bị từ chối → reset về bước MANAGER, `status = REJECTED`

### Hai loại biểu mẫu

**1. PR (Purchase Request)**
- Bảng hàng hóa: tên, quy cách, đơn vị, SL tổng / sẵn có / mua bổ sung, đơn giá, thành tiền, lý do
- Thông tin phụ: nhóm yêu cầu, thời hạn, leadtime, PO number, budget plan, budget code
- Mô tả chi tiết và ghi chú

**2. PROPOSAL (Tờ trình)**
Cấu trúc 6 mục:
1. Tổng quan
2. Thông tin chính (thời gian, địa điểm, người chủ trì, hình thức, đối tượng)
3. Yêu cầu cụ thể
4. Cách thức tổ chức & đề nghị hỗ trợ (bảng bộ phận + nội dung)
5. Chi phí tổ chức (bảng sản phẩm + số lượng + đơn giá + thành tiền)
6. Kết quả dự kiến

### Xác thực người dùng

- Đăng nhập bằng `employee_id` + `password`
- User object lưu trong `localStorage` (không dùng session/JWT)
- Mật khẩu mặc định = mã nhân viên

---

## Các điểm cần cải thiện / làm rõ

### Bảo mật (nghiêm trọng)

| Vấn đề | Vị trí | Chi tiết |
|--------|--------|----------|
| Mật khẩu plaintext | `server.ts:154` | Password lưu và so sánh trực tiếp, không hash (bcrypt...) |
| Không có authentication middleware | Toàn bộ API | Mọi endpoint đều public, không cần token xác thực |
| Session giả | `App.tsx:13` | User data lưu trong `localStorage` — ai cũng có thể giả mạo bất kỳ user nào bằng cách sửa localStorage |
| API `/api/users` lộ thông tin | `server.ts:163` | Trả về toàn bộ thông tin kể cả `password` của tất cả người dùng |
| SQL Injection tiềm năng | `server.ts:112` | Migration dùng string interpolation: `` `ALTER TABLE ... ADD COLUMN ${col.name} ${col.type}` `` |

### Logic nghiệp vụ

| Vấn đề | Chi tiết |
|--------|----------|
| Không có MANAGER cho "Trường THCS" | ~45 người trong bộ phận này nhưng không ai có `role: "MANAGER"` → không thể duyệt bước đầu |
| Không có MANAGER cho "Phòng truyền thông" | Tương tự — request của phòng này sẽ bị kẹt |
| Từ chối reset về bước 1 | Khi COO từ chối, yêu cầu reset về MANAGER và mất toàn bộ context. Thực tế nghiệp vụ thường cần "trả về người tạo" để chỉnh sửa |
| Không phân ngưỡng giá trị | Mọi PR dù 10.000đ hay 10 tỷ đều phải qua đủ 3 bước phê duyệt |
| Dashboard hiển thị tất cả request | Mọi user đều thấy request của toàn bộ tổ chức — không lọc theo role/bộ phận |

### Kỹ thuật

| Vấn đề | Vị trí | Chi tiết |
|--------|--------|----------|
| Fetch toàn bộ list để lấy 1 record | `RequestDetail.tsx:28` | Gọi `GET /api/requests` rồi `.find()` client-side thay vì có endpoint `GET /api/requests/:id` |
| Không có loading state khi phê duyệt | `RequestDetail.tsx:57` | Nút "Phê duyệt" / "Từ chối" không disable trong khi đang gửi request |
| `proposal_method_support` và `proposal_costs` lưu JSON string | `server.ts:45-50` | Lưu dưới dạng TEXT trong SQLite thay vì bảng riêng → khó query, filter về sau |
| Port cứng 3000 | `server.ts:357` | Không đọc từ `process.env.PORT` |
| README chưa cập nhật | `README.md` | Còn đề cập `GEMINI_API_KEY` từ template Google AI Studio nhưng project không sử dụng Gemini |
| Demo account không tồn tại | `Login.tsx:105` | Hiển thị demo account `WF04MN` nhưng user này không có trong `users.json` |

### UX / Giao diện

| Vấn đề | Vị trí | Chi tiết |
|--------|--------|----------|
| Không có filter / tìm kiếm | `Dashboard.tsx` | Không lọc được theo trạng thái, loại, bộ phận hoặc search theo tên |
| Hiển thị role code thô | `Dashboard.tsx:94` | Cột "Chờ duyệt" hiển thị `"MANAGER"` thay vì tên vai trò tiếng Việt |
| Không có phân trang | `Dashboard.tsx` | Khi có hàng trăm request sẽ load chậm và khó đọc |
| Header detail page cứng "Purchase Request Form" | `RequestDetail.tsx:126` | Hiển thị cùng nhãn cho cả Tờ trình (PROPOSAL) |

---

## Đề xuất ưu tiên xử lý

### Ưu tiên cao (bảo mật & correctness)
1. Hash mật khẩu bằng `bcrypt` trước khi lưu DB
2. Thêm authentication middleware — verify token/session trước mỗi API call
3. Tạo endpoint `GET /api/requests/:id` riêng
4. Bổ sung MANAGER cho "Trường THCS" và "Phòng truyền thông" trong `users.json`
5. Ẩn field `password` khỏi response của `GET /api/users`

### Ưu tiên trung bình (nghiệp vụ)
6. Xem xét logic từ chối: nên trả về người tạo thay vì reset về MANAGER
7. Thêm filter/tìm kiếm trên Dashboard
8. Đọc PORT từ `process.env.PORT`

### Ưu tiên thấp (UX & cleanup)
9. Thêm loading state cho nút phê duyệt
10. Sửa label "Purchase Request Form" trong RequestDetail cho loại PROPOSAL
11. Cập nhật README
12. Sửa demo account trong Login.tsx
