# Hệ Thống Phê Duyệt Linh Động (Dynamic Approval Workflow System)

## 1. Tổng quan

Hệ thống phê duyệt linh động là một nền tảng cho phép tổ chức tự thiết kế, cấu hình và vận hành các quy trình phê duyệt phức tạp mà **không cần can thiệp kỹ thuật**. Người quản lý nghiệp vụ có thể tự tay xây dựng luồng, thiết lập điều kiện, chỉ định người duyệt và điều chỉnh khi quy trình thay đổi.

### Vấn đề hệ thống giải quyết

| Vấn đề | Biểu hiện |
|--------|-----------|
| Luồng cứng nhắc | Mỗi khi quy trình thay đổi phải nhờ IT chỉnh sửa, mất nhiều thời gian và chi phí |
| Thiếu minh bạch | Người submit không biết request đang ở bước nào, ai cần duyệt |
| Bottleneck & trễ hạn | Không có cơ chế nhắc nhở hay leo thang, request bị treo vô thời hạn |
| Không audit được | Khi xảy ra sự cố, không biết ai đã quyết định gì và vào thời điểm nào |
| Phân quyền cứng | Không thể ủy quyền khi đi vắng, không xử lý được khi tổ chức thay đổi nhân sự |

---

## 2. Khái niệm vận hành

### 2.1. Template (Mẫu luồng)

Template là bản thiết kế của một quy trình phê duyệt. Ví dụ: *"Quy trình phê duyệt chi phí"*, *"Quy trình tuyển dụng"*.

Mỗi template định nghĩa:
- Các bước phê duyệt theo thứ tự
- Điều kiện bỏ qua hoặc rẽ nhánh giữa các bước
- Người duyệt ở mỗi bước (cố định hoặc tính động)
- Thời hạn xử lý và hành động khi hết hạn

> Template hỗ trợ versioning. Khi cập nhật, các request đang chạy tiếp tục theo phiên bản cũ, request mới dùng phiên bản mới nhất.

### 2.2. Request (Yêu cầu)

Một Request là một yêu cầu cụ thể được tạo ra theo một Template. Ví dụ: *"Yêu cầu chi phí công tác tháng 3 của Nguyễn Văn A"*. Mỗi Request mang theo toàn bộ dữ liệu nghiệp vụ để hệ thống tự động đánh giá điều kiện.

### 2.3. Bước phê duyệt (Step)

Mỗi bước trong luồng tương ứng với một vòng phê duyệt. Một bước có thể yêu cầu:
- Một người duyệt cụ thể
- Một nhóm người duyệt (chỉ cần N/M người đồng ý)
- Người duyệt được tính động (ví dụ: quản lý trực tiếp của người đề xuất)

### 2.4. Điều kiện (Condition)

Điều kiện cho phép hệ thống tự điều chỉnh luồng dựa trên dữ liệu thực tế:

| Loại | Mô tả | Ví dụ |
|------|-------|-------|
| **Skip** | Bỏ qua bước nếu điều kiện đúng | Số tiền < 5M → tự động approve |
| **Branch** | Rẽ nhánh sang người duyệt khác | Chi phí IT → CTO, chi phí nhân sự → CHRO |
| **Parallel** | Gửi đồng thời cho nhiều bên | Hợp đồng > 1 tỷ → Legal + Finance cùng lúc |
| **Dynamic Approver** | Tính người duyệt từ dữ liệu | Tự động tìm manager trực tiếp của người submit |

### 2.5. Escalation (Leo thang)

Khi người duyệt không phản hồi trong thời hạn cấu hình, hệ thống tự động:
1. Gửi email nhắc nhở sau X giờ
2. Escalate lên cấp trên nếu vẫn không có phản hồi
3. Tự động approve hoặc reject theo cấu hình của bước đó

### 2.6. Delegation (Ủy quyền)

Người duyệt có thể ủy quyền cho người khác xử lý thay trong một khoảng thời gian nhất định, với giới hạn về phạm vi và giá trị. Toàn bộ quyết định trong thời gian ủy quyền được ghi rõ trong audit log.

---

## 3. Vòng đời của một Request

```
DRAFT → PENDING → IN_REVIEW → APPROVED
                            ↘ REJECTED
                            ↘ ESCALATED → IN_REVIEW
          ↘ CANCELLED (rút yêu cầu)
```

| Trạng thái | Ý nghĩa |
|------------|---------|
| `DRAFT` | Đang soạn thảo, chưa submit |
| `PENDING` | Đã submit, chờ bắt đầu bước đầu tiên |
| `IN_REVIEW` | Đang được xem xét ở một bước nào đó |
| `ESCALATED` | Quá hạn, đã chuyển lên cấp trên |
| `APPROVED` | Được phê duyệt hoàn toàn |
| `REJECTED` | Bị từ chối ở một bước |
| `CANCELLED` | Người tạo rút yêu cầu |

---

## 4. Vai trò trong hệ thống

| Vai trò | Quyền chính |
|---------|-------------|
| **System Admin** | Quản lý toàn bộ template, users, cấu hình escalation policy |
| **Workflow Designer** | Tạo và chỉnh sửa template, test luồng với dữ liệu giả |
| **Requester** | Submit request, xem trạng thái, rút yêu cầu |
| **Approver** | Xem task, approve/reject với comment, delegate |
| **Delegatee** | Xử lý task được ủy quyền trong phạm vi và thời hạn cho phép |
| **Auditor** | Xem toàn bộ lịch sử, xuất audit log, không can thiệp quy trình |

---

## 5. Các kịch bản thực tế

### 5.1. Phê duyệt chi phí

**Bối cảnh:** Nhân viên đề xuất khoản chi phí. Mức phê duyệt phụ thuộc vào giá trị khoản chi.

#### Bảng điều kiện

| Giá trị | Luồng áp dụng |
|---------|---------------|
| < 5.000.000 đ | Tự động approve, không cần người duyệt |
| 5 – 50 triệu | Manager trực tiếp |
| 50 – 500 triệu | Manager → Finance Director (tuần tự) |
| > 500 triệu | Manager → CFO + CEO (song song) |
| Đánh dấu "Khẩn cấp" | Thời hạn mỗi bước rút xuống còn 4 giờ |

#### Luồng ví dụ — 80 triệu đồng, công tác nước ngoài

```
[Nhân viên] Tạo request 80M, đính kèm kế hoạch công tác
      ↓
[Hệ thống] Đánh giá: 80M > 50M → áp dụng luồng 2 bước
      ↓
[Manager] Xem xét, phê duyệt (thời hạn 24h)
  └─ comment: "Đồng ý, lưu ý tiết kiệm chi phí lưu trú"
      ↓
[Finance Director] Kiểm tra ngân sách bộ phận (thời hạn 48h)
  └─ Ghi mã dự án để hạch toán
      ↓
[Hệ thống] APPROVED → thông báo nhân viên, trigger thanh toán tạm ứng
```

#### Kịch bản Escalation — Manager không phản hồi

```
Giờ 0    → Request được tạo, gửi Manager (thời hạn 24h)
Giờ 16   → Hệ thống gửi email nhắc nhở lần 1
Giờ 24   → Hết hạn, tự động escalate lên Deputy Director
Giờ 24+  → Deputy Director nhận task, có đầy đủ context
           Xử lý và approve
           Audit log ghi: escalation time, lý do, người xử lý
```

---

### 5.2. Phê duyệt tuyển dụng nhân sự

**Bối cảnh:** Bộ phận có nhu cầu tuyển thêm nhân sự, cần đảm bảo vị trí được phê duyệt về tổ chức và ngân sách.

#### Luồng phê duyệt

```
[Hiring Manager] Tạo JD: mô tả công việc, yêu cầu, mức lương đề xuất
      ↓
[HR Business Partner] Review JD: chuẩn hóa mô tả, kiểm tra thang lương
  └─ Nếu cần chỉnh sửa: trả lại Hiring Manager → re-review
      ↓
[Điều kiện] Vị trí Senior (Manager trở lên)?
  ├─ Có → thêm bước C-level approve
  └─ Không → bỏ qua bước này
      ↓
[C-level] Phê duyệt về mặt tổ chức (nếu áp dụng)
      ↓
[Finance] Xác nhận headcount quota còn đủ trong năm tài chính
      ↓
[Hệ thống] APPROVED → HR bắt đầu đăng tuyển, tạo requisition code
```

#### Kịch bản — Tuyển Senior Backend Developer

| Bước | Người thực hiện | Hành động | Ghi chú |
|------|----------------|-----------|---------|
| 1 | Engineering Manager | Tạo yêu cầu: Senior Backend Developer, 45–60M | Lý do: mở rộng team |
| 2 | HR Business Partner | Yêu cầu bổ sung kỹ năng Golang vào JD | Thời hạn: 24h |
| 3 | Engineering Manager | Cập nhật JD theo góp ý | Request quay lại HR re-review |
| 4 | HR Business Partner | Xác nhận JD đạt, chuyển tiếp | Vị trí Senior → hệ thống tự thêm bước CTO |
| 5 | CTO | Review nhu cầu theo roadmap kỹ thuật, approve | Thời hạn: 48h |
| 6 | Finance | Xác nhận còn 2 headcount trong quota Q3 | Chạy song song với CTO nếu lương < 70M |
| 7 | Hệ thống | APPROVED, HR bắt đầu đăng tuyển | Tự tạo requisition code để tracking |

---

### 5.3. Phê duyệt hợp đồng

**Bối cảnh:** Hợp đồng với đối tác/khách hàng cần qua nhiều vòng kiểm tra pháp lý, tài chính và quyền ký kết.

#### Phân loại và luồng tương ứng

| Loại hợp đồng | Luồng phê duyệt |
|---------------|-----------------|
| < 100 triệu | Sales Owner → Legal → Ký |
| 100 triệu – 1 tỷ | Sales Owner → Legal + Finance (song song) → Director → Ký |
| > 1 tỷ | Sales Owner → Legal + Finance (song song) → Director → CEO → Ký |
| Có điều khoản bất thường | Bất kỳ luồng trên + bắt buộc Legal Lead escalation |
| Hợp đồng quốc tế | Thêm bước Compliance & Regional Legal review |

#### Luồng ví dụ — Hợp đồng 800 triệu, có điều khoản phạt bất thường

```
[Sales Owner] Upload hợp đồng, đánh dấu "có điều khoản đặc biệt"
      ↓
[Legal + Finance] Nhận task song song
  ├─ Legal: phát hiện điều khoản phạt 10%/tháng — bất thường
  │    └─ Đánh dấu "cần review đặc biệt" → tự escalate lên Legal Lead
  └─ Finance: kiểm tra điều khoản tài chính, dòng tiền — OK
      ↓
[Legal Lead] Liên hệ đối tác, đàm phán hạ điều khoản phạt xuống 3%/tháng
  └─ Đính kèm biên bản xác nhận
      ↓
[Commercial Director] Review tổng thể sau khi Legal & Finance hoàn tất
      ↓
[CEO] Hợp đồng > 1 tỷ → bắt buộc CEO ký duyệt
  └─ Xem tóm tắt và các điểm rủi ro đã được highlight
      ↓
[Hệ thống] APPROVED → trigger luồng ký kết điện tử, lưu trữ hợp đồng
```

---

### 5.4. Phê duyệt triển khai sản phẩm (Production Deployment)

**Bối cảnh:** Mỗi lần đưa phiên bản mới lên production cần kiểm soát chặt, đặc biệt ngoài giờ hành chính hoặc với các module quan trọng.

#### Bảng điều kiện tự động

| Điều kiện | Giá trị | Hành động |
|-----------|---------|-----------|
| Giờ triển khai | Trong giờ hành chính | Luồng tiêu chuẩn: Dev Lead → DevOps |
| Giờ triển khai | Ngoài giờ / cuối tuần | Thêm bắt buộc: DevOps Lead + On-call engineer confirm |
| Module ảnh hưởng | Thanh toán / Tài chính | Thêm bước Finance Tech Lead review |
| Mức độ thay đổi | Major / breaking change | Thêm bắt buộc QA Lead sign-off |
| Không ai duyệt trong 2h | Triển khai thường | Auto-reject, yêu cầu tạo lại với đánh dấu Emergency |

#### Luồng tiêu chuẩn — Deploy v2.5.1 cập nhật tính năng báo cáo

```
[Developer] Tạo deployment request: v2.5.1, link test report, rollback plan
      ↓
[Hệ thống] Kiểm tra: giờ hành chính, minor release, module Reporting
           → áp dụng luồng tiêu chuẩn
      ↓
[Tech Lead] Review change summary, test coverage (thời hạn 4h)
      ↓
[DevOps Engineer] Kiểm tra infrastructure, resource, monitoring (thời hạn 2h)
      ↓
[Hệ thống] APPROVED → trigger CI/CD pipeline, deploy lên production
           Thông báo team khi hoàn tất
```

#### Kịch bản đặc biệt — Hotfix khẩn lúc 2 giờ sáng

```
02:15  On-call engineer phát hiện lỗi thanh toán ảnh hưởng 30% người dùng
02:16  Tạo deployment request, đánh dấu "Emergency Hotfix"
02:17  Hệ thống nhận diện Emergency:
         → Rút thời hạn mỗi bước xuống 30 phút
         → Gửi SMS đồng thời cho Tech Lead + DevOps Lead + Finance Tech Lead
02:25  Tech Lead approve qua mobile app
02:31  DevOps Lead approve
02:45  Finance Tech Lead approve (module thanh toán)
02:46  Hệ thống tự động deploy
02:58  Incident đóng
       → Toàn bộ timeline ghi trong audit log với timestamp chính xác đến giây
```

---

## 6. Tính năng đặc biệt

### 6.1. Luồng song song (Parallel Approval)

Thay vì duyệt tuần tự, nhiều bên có thể xem xét cùng lúc để tiết kiệm thời gian.

**Ví dụ — Phê duyệt ngân sách năm:**

```
[CFO] Upload bảng ngân sách tổng thể
      ↓
[Hệ thống] Tạo đồng thời 4 task cho:
  ├─ Head of Engineering
  ├─ Head of Sales
  ├─ Head of Marketing
  └─ Head of Operations
      ↓
[Chờ đủ 4/4 phê duyệt] Mỗi Head review phần ngân sách bộ phận mình
      ↓
[CEO] Review tổng thể và phê duyệt chính thức
      ↓
[Hệ thống] APPROVED → cập nhật hạn mức cho từng phòng ban
```

### 6.2. Ủy quyền (Delegation)

Khi người duyệt đi vắng, họ có thể ủy quyền cho người khác xử lý thay.

**Ví dụ — Manager ủy quyền cho Deputy khi đi công tác:**

| Bước | Người thực hiện | Hành động |
|------|----------------|-----------|
| 1 | Manager | Cấu hình: từ 15/3 đến 20/3, ủy quyền cho Deputy Manager, phạm vi chi phí < 50M |
| 2 | Hệ thống | Thông báo cho Deputy về phạm vi và thời hạn, tự hết hiệu lực sau 20/3 |
| 3 | Nhân viên | Submit request 30M ngày 17/3 — không thay đổi gì từ phía người dùng |
| 4 | Hệ thống | Phát hiện Manager đang trong thời gian ủy quyền → gửi task cho Deputy |
| 5 | Deputy Manager | Nhận thông báo, phê duyệt | Audit log ghi: "approved via delegation from Manager" |

**Giới hạn ủy quyền:**
- Người được ủy quyền không thể tiếp tục ủy quyền (no re-delegation)
- Phạm vi có thể giới hạn theo loại request hoặc giá trị tối đa
- Sau khi hết thời hạn, task chưa xử lý tự chuyển lại người ủy quyền ban đầu

---

## 7. Theo dõi và Audit Log

### 7.1. Góc nhìn theo vai trò

**Requester (người tạo yêu cầu):**
- Xem trạng thái real-time: đang ở bước nào, ai đang cần duyệt
- Xem lịch sử comment và phản hồi
- Nhận thông báo khi có thay đổi trạng thái
- Rút request nếu chưa bắt đầu bước duyệt nào

**Approver (người duyệt):**
- Danh sách nhiệm vụ chờ xử lý, sắp xếp theo mức độ khẩn cấp
- Xem đầy đủ context: data request, lịch sử các bước trước, comment người duyệt khác
- Approve nhanh qua email hoặc mobile app
- Cấu hình ủy quyền khi vắng mặt

**Admin / Quản lý:**
- Dashboard: số request đang chờ, trung bình thời gian xử lý, tỷ lệ approve/reject
- Báo cáo bottleneck: bước nào thường xuyên bị delay
- Lịch sử đầy đủ, lọc theo loại / người / khoảng thời gian
- Xuất audit log cho kiểm toán

### 7.2. Audit Log — Các sự kiện được ghi nhận

| Sự kiện | Thông tin lưu trữ |
|---------|------------------|
| Submit request | Người tạo, thời điểm, IP, toàn bộ nội dung |
| Approve / Reject | Người quyết định, thời điểm chính xác, comment |
| Escalation | Lý do (timeout), từ ai chuyển sang ai |
| Delegation | Ai ủy quyền cho ai, phạm vi, thời hạn |
| Chỉnh sửa template | Ai sửa, thay đổi gì, phiên bản mới |

> Audit log là bất biến — không thể sửa hoặc xóa bất kỳ bản ghi nào.

---

## 8. So sánh với hệ thống phê duyệt truyền thống

| Tiêu chí | Truyền thống | Dynamic Workflow |
|----------|-------------|------------------|
| Thay đổi quy trình | Phải nhờ IT, mất nhiều ngày | Tự cấu hình qua UI, hiệu lực ngay |
| Người duyệt | Hardcode, cố định | Tính động theo data và org chart |
| Khi hết hạn | Request bị treo | Tự động escalate lên cấp trên |
| Vắng mặt | Toàn bộ request bị dừng | Ủy quyền có kiểm soát |
| Lịch sử quyết định | Thường không có | Audit log đầy đủ, bất biến |
| Luồng phức tạp | Không hỗ trợ | Song song, rẽ nhánh, có điều kiện |
| Báo cáo | Thủ công | Real-time dashboard tự động |
