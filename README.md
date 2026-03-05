# ApprovalFlow

Hệ thống quản lý **Purchase Request (PR) và Tờ trình** với quy trình phê duyệt đa cấp.

**Stack:** React 19 + TypeScript + Vite + TailwindCSS + Supabase + GitHub Pages

---

## Hướng dẫn cài đặt

### 1. Chuẩn bị Supabase

1. Tạo project tại [supabase.com](https://supabase.com)
2. Vào **SQL Editor** và chạy toàn bộ file [`supabase_schema.sql`](./supabase_schema.sql)
   (tạo bảng, RLS, RPC functions, seed users)
3. Lấy thông tin kết nối tại **Project Settings > API**:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`

### 2. Chạy local

```bash
npm install

cp .env.example .env.local
# Điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào .env.local

npm run dev
# App chạy tại http://localhost:5173
```

---

## Deploy lên GitHub Pages

### Tự động — GitHub Actions (khuyến nghị)

1. Push code lên GitHub repository

2. Vào **Settings > Secrets and variables > Actions**, thêm:

   | Loại | Tên | Giá trị |
   |------|-----|---------|
   | Secret | `VITE_SUPABASE_URL` | URL Supabase project |
   | Secret | `VITE_SUPABASE_ANON_KEY` | Anon key Supabase |
   | Variable | `VITE_BASE_PATH` | `/tên-repo/` (ví dụ: `/approvalflow/`) |

3. Vào **Settings > Pages**, chọn source: **Deploy from a branch**, branch: `gh-pages`

4. Push lên branch `main` → GitHub Actions tự động build và deploy

### Thủ công

```bash
echo 'VITE_BASE_PATH=/approvalflow/' >> .env.local
npm run deploy
```

---

## Luồng phê duyệt

```
Người tạo  →  Trưởng bộ phận (MANAGER)  →  CFO  →  COO  →  Hoàn thành
```

- Nếu người tạo là MANAGER → bắt đầu từ bước CFO
- Mật khẩu mặc định = Mã nhân viên

## Tài khoản demo

| Mã nhân viên | Họ tên | Vai trò |
|---|---|---|
| `WT12DT` | Hoàng Văn Tuân | Nhân viên (Phòng mua hàng) |
| `WF06MN` | Đinh Trà Mi | Trưởng phòng mua hàng (MANAGER) |
| `WF09AD` | Bùi Việt Hà | CFO |
| `WF07MN` | Nguyễn Hoài Thu | COO |
