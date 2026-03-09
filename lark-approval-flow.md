# Lark Approval Flow – Mô tả chi tiết mô hình thiết kế quy trình phê duyệt

> **Nguồn tham khảo:** [Lark Help Center – Process Design](https://www.larksuite.com/hc/en-US/category/7090801225146335238-admin-process-design)

---

## 1. Tổng quan

Lark Approval là tính năng cho phép tổ chức thiết kế các quy trình phê duyệt trực tuyến linh hoạt, thay thế hoàn toàn các phương thức phê duyệt thủ công/offline. Hệ thống tích hợp trực tiếp vào giao diện chat của Lark, hoạt động tốt trên cả desktop và mobile.

**Quy trình tạo một Approval gồm 3 bước chính:**

```
[1] Nhập thông tin cơ bản  →  [2] Thiết kế Form  →  [3] Thiết kế Process (Approval Flow)
```

---

## 2. Truy cập Process Design

1. Mở app **Approval** trên thanh sidebar trái của Lark.
2. Nhấn **Admin Console** (góc trên bên phải).
3. Chọn **Create a new approval** hoặc **Edit an existing approval**.
4. Chuyển sang tab **Process Design**.

> Hệ thống sẽ tự tạo sẵn một approval step mặc định. Admin có thể chỉnh sửa và mở rộng theo nhu cầu.

---

## 3. Các loại Node trong Process Design

### 3.1 Node Approver (Bước phê duyệt)

Đây là node cốt lõi của mọi quy trình. Mỗi node Approver đại diện cho một bước cần có người phê duyệt.

**Cách thêm:** Nhấn dấu `+` giữa các bước → chọn **Approver**.

#### Các loại Approver được hỗ trợ:

| Loại | Mô tả |
|---|---|
| **Direct Manager** | Quản lý trực tiếp của người nộp đơn |
| **Department Supervisor** | Trưởng phòng/bộ phận của người nộp |
| **Role** | Một vai trò được cấu hình sẵn (HR, Finance, Admin…) – cần thiết lập trước trong Lark Admin > Organizational Structure |
| **Specify Approver** | Chỉ định cụ thể một thành viên làm người phê duyệt |
| **Selected by Requester** | Người nộp đơn tự chọn người phê duyệt (có thể giới hạn phạm vi và phương thức chọn) |
| **Requester** | Chính người nộp đơn cũng thực hiện bước phê duyệt (thường dùng để review/xác nhận thông tin) |
| **Continuous Multi-level Manager Approval** | Phê duyệt theo nhiều cấp quản lý liên tiếp – ví dụ: bắt đầu từ manager trực tiếp, leo lên đến cấp cuối được chỉ định |
| **Step Approver** | Tự động liên kết với bước trước, người đã phê duyệt ở bước trước sẽ tiếp tục phê duyệt ở bước này |

---

#### Cấu hình chi tiết mỗi Approver Node:

**a) Approval Method (Phương thức phê duyệt khi có nhiều người cùng duyệt):**
- **And (tất cả phải duyệt):** Tất cả approver phải phê duyệt thì mới qua bước.
- **Or (một người duyệt là đủ):** Chỉ cần một approver đồng ý.

**b) Approver is Empty (Khi không có người phê duyệt):**
- Tự động phê duyệt (auto-approve).
- Chuyển cho một người được chỉ định sẵn.
- Chuyển cho Approval Administrator.

**c) Approver = Requester (Người phê duyệt là chính người nộp):**
- Để người nộp tự thực hiện bước phê duyệt.
- Tự động bỏ qua bước (auto-skip).
- Chuyển cho manager trực tiếp.
- Chuyển cho trưởng bộ phận.

**d) Approver đã nghỉ việc (Resigned):**
Cần cấu hình fallback – chuyển cho người thay thế hoặc admin.

**e) Add CC (Thêm người nhận bản sao):**
- Chỉ định người nhận thông báo CC tại bước này.
- Có thể chọn tùy chọn **CC approved requests only** – chỉ CC khi bước đó được phê duyệt.
- Người được CC không thể tương tác với quy trình, chỉ nhận thông báo.

---

### 3.2 Node Branch (Nhánh điều kiện)

Cho phép quy trình rẽ theo nhiều hướng khác nhau tùy theo điều kiện cụ thể.

**Cách thêm:** Nhấn `+` giữa các bước → chọn **Branch**.

Mặc định tạo ra 2 nhánh. Có thể nhấn **Add condition** để thêm nhiều nhánh hơn.

#### Cấu hình điều kiện (Conditions):

- **Condition Group:** Nhiều group điều kiện trong một nhánh kết nối với nhau bằng quan hệ **OR** (thỏa mãn một trong các group là đi vào nhánh đó).
- **Condition trong một Group:** Các điều kiện trong cùng group kết nối bằng quan hệ **AND** (phải thỏa mãn tất cả).

**Ví dụ thực tế:**
> Đơn xin nghỉ dưới 2 ngày → chỉ cần manager trực tiếp duyệt.  
> Đơn xin nghỉ từ 2 ngày trở lên → cần cả manager và phòng HR duyệt.

> Đơn hoàn phí travel → đi vào nhánh trái.  
> Các đơn hoàn phí khác → đi vào nhánh phải.

> ⚠️ **Lưu ý:** Không phải tất cả các field trong form đều có thể dùng làm điều kiện cho Branch.

---

### 3.3 Node Handler (Người xử lý)

Admin có thể thêm **Handler node** vào quy trình để phục vụ các nhiệm vụ không phải phê duyệt, ví dụ: xử lý hồ sơ sau khi được duyệt, cập nhật thông tin, thực hiện tác vụ cụ thể.

Handler giúp tổ chức quản lý quy trình linh hoạt hơn, không chỉ đơn thuần là chuỗi approve/reject.

---

## 4. Phân quyền trong từng Approval Step

Mỗi bước trong quy trình có hai nhóm quyền riêng biệt:

### 4.1 Form Permissions (Quyền trên form)

| Quyền | Mô tả |
|---|---|
| **View** | Chỉ định các trường approver được xem tại bước này |
| **Edit** | Chỉ định các trường approver có thể chỉnh sửa tại bước này |

> Dùng để bảo vệ thông tin nhạy cảm hoặc cho phép bổ sung thông tin cần thiết theo từng bước.

### 4.2 Action Permissions (Quyền hành động)

Quy định approver có thể thực hiện những hành động nào tại bước đó (approve, reject, transfer, add approver…).

---

## 5. Tính năng mở rộng

### 5.1 Thêm người phê duyệt trong quá trình xử lý

Approver có thể thêm người phê duyệt bổ sung khi đang xử lý:
- **Before:** Người được thêm phê duyệt trước bước hiện tại.
- **After:** Người được thêm phê duyệt sau bước hiện tại (bước hiện tại được tự động approve).

### 5.2 Revoke Setting (Thu hồi đơn)

Admin có thể cho phép hoặc không cho phép người nộp thu hồi đơn trong một khoảng thời gian nhất định sau khi nộp.

### 5.3 Forward Setting (Chuyển tiếp đơn)

Admin có thể giới hạn việc chuyển tiếp đơn (forward/transfer approval) chỉ trong phạm vi những người liên quan đến approval đó.

### 5.4 Cross-organization Approval (Phê duyệt liên tổ chức)

Các tổ chức tin tưởng lẫn nhau (trusted parties) có thể cấu hình quy trình phê duyệt chéo giữa các tổ chức. Admin có thể chọn bộ phận hoặc người dùng từ tổ chức đối tác khi thiết kế quy trình.

---

## 6. Quản lý và tổ chức Approval

### 6.1 Nhóm Approval (Approval Groups)

Trong Admin Console, admin có thể:
- **Create Group:** Tạo nhóm theo loại (HR, Finance, Administration…).
- **Sort:** Kéo thả để sắp xếp thứ tự nhóm.

Cách nhóm và sắp xếp sẽ hiển thị tương ứng trong giao diện Approval của nhân viên.

### 6.2 Data Management

Trên trang **Data Management**, admin có thể:
- Xem và xuất (export) lịch sử phê duyệt.
- Lọc theo tiêu đề, trạng thái, thời gian, từ khóa.

---

## 7. Luồng tổng thể – Sơ đồ mô phỏng

```
[Người nộp đơn]
      │
      ▼
[START NODE] ── Nhập thông tin form
      │
      ▼
[BRANCH NODE] ◄─── Điều kiện từ form (VD: số ngày nghỉ, loại chi phí...)
   │         │
   ▼         ▼
[Nhánh A]  [Nhánh B]
   │              │
   ▼              ▼
[APPROVER   [APPROVER
  NODE 1]    NODE 2]
   │              │
   ▼              ▼
[APPROVER NODE CHUNG – cấp cuối]
      │
      ▼
[HANDLER NODE] ── Xử lý hậu phê duyệt (nếu có)
      │
      ▼
    [END]
      │
      └──► CC notification → các bên liên quan nhận thông báo
```

---

## 8. Vai trò Approval Administrator

Admin phê duyệt có toàn quyền quản lý thông qua **Approval Admin Console**, bao gồm:
- Thiết kế form (Form Design)
- Thiết kế quy trình (Process Design)
- Xem và quản lý dữ liệu phê duyệt (Data Management)
- Cấu hình cài đặt nâng cao (revoke, forward, cross-org...)

---

## 9. Tóm tắt nhanh

| Thành phần | Chức năng |
|---|---|
| **Approver Node** | Bước phê duyệt với nhiều loại approver, phương thức và fallback |
| **Branch Node** | Rẽ nhánh quy trình theo điều kiện AND/OR từ form data |
| **Handler Node** | Giao nhiệm vụ xử lý (không phải approve) cho người cụ thể |
| **CC** | Thông báo cho người liên quan mà không cho phép tương tác |
| **Form Permissions** | Kiểm soát quyền xem/sửa form theo từng bước |
| **Action Permissions** | Kiểm soát hành động approver có thể thực hiện |
| **Conditional Branch** | Logic AND/OR giữa điều kiện và nhóm điều kiện |
| **Data Management** | Xem, lọc, xuất dữ liệu phê duyệt |
