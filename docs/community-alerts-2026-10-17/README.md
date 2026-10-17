# Cảnh báo cộng đồng về tài khoản giả mạo — 2026-10-17

Người phụ trách: Lê Minh Trí (cùng Angel Muse). Quy trình: thông báo Telegram → ghi nhận board (PR #13) → phần hiển thị (PR #14) → hồ sơ này.

## Bối cảnh

Một thành viên báo có tài khoản `angeldieugnoc` giả mạo `angeldieungoc` (đảo chữ cái trong username, sao chép y hệt tên hiển thị và ảnh đại diện). Điều tra xác nhận: tài khoản giả tạo 23/04/2026 từ email ledungprovip1985@gmail.com (FUN-ID còn giữ dấu vết tên gốc `ledungprovip198548441z`), đăng 8 bài trong ngày tạo rồi ngủ yên, và ngày 15/10/2026 vừa nhận 99 FUN từ một người dùng khác (lehieu1983) — dấu hiệu đã có người gửi nhầm.

Chủ trương của Cha và Thầy (qua Trí): **không chặn** tạo/đổi tên gần giống — thay vào đó **thông báo minh bạch cho toàn thể cộng đồng** để mọi người tự đối chiếu avatar/lịch sử và cảnh giác.

## Phát hiện quan trọng khi khảo sát

1. **Nền tảng đã có sẵn hệ thống phát hiện giả mạo**: trigger trên profiles gọi Edge Function `identity-impersonation-scan`, chấm điểm giống tên hiển thị + giống avatar (perceptual hash), ghi vào bảng `impersonation_alerts` và chỉ gửi thông báo cho 11 tài khoản quản trị. Ca angeldieugnoc đã bị gắn cờ từ 03/10/2026 với điểm 100/100/100 nhưng chưa ai xử lý, cộng đồng không hề biết. Tổng cộng **12 ca** đang ở trạng thái pending (điểm 40–100).
2. Bảng `notifications` có CHECK constraint theo danh sách loại — loại `impersonation_alert` đã có sẵn trong danh sách cho phép.
3. Phía giao diện, `systemNotifications.ts` là nguồn sự thật duy nhất cho nội dung thông báo hệ thống; loại chưa khai báo sẽ rơi vào nội dung chung chung — nên cần bổ sung hiển thị (PR #14).
4. Về IP: Supabase không lưu log IP riêng; IP nằm trong bản ghi phiên (auth.sessions) và mất theo phiên; bảng auth.audit_log_entries trên project đang trống — không khôi phục được IP cũ. (Việc dựng kho lưu trữ IP riêng là một việc tách biệt, chờ quyết định.)

## Đã làm

### Database (áp trực tiếp lên production DB tljfqavndndfsvtazibe)
- `sql/01-create-similarity-machinery.sql`: bộ cảm biến username — các hàm `username_norm`, `username_skeleton`, `username_dl1`, `usernames_similar` (3 dạng giống: trùng sau chuẩn hóa / cùng bộ chữ cái đảo thứ tự / lệch 1 ký tự Damerau); bảng đăng ký cặp `username_similarity_alerts` (RLS bật, khóa công khai); hàm phát sóng `broadcast_username_similarity_alert` (chống trùng theo cặp, ghi sổ trước khi phát); trigger `trg_profiles_username_similarity` AFTER INSERT OR UPDATE OF username ON profiles — mọi lỗi đều bị nuốt thành WARNING để không bao giờ ảnh hưởng việc đăng ký/đổi tên.
- `sql/03-broadcast-use-impersonation-type.sql`: chuyển hàm phát sóng dùng loại thông báo `impersonation_alert` có sẵn.
- `sql/04-community-broadcast-hook.sql`: móc hợp nhất — trigger AFTER INSERT trên `impersonation_alerts`: mỗi cảnh báo mới của hệ thống quét sẵn có tự động phát sóng cho toàn thể cộng đồng (hàm `broadcast_impersonation_alert_row`), dùng chung sổ đăng ký cặp với bộ cảm biến username nên một cặp chỉ bị phát sóng một lần.
- Kiểm chứng: test đơn vị cho 4 trường hợp hàm so tên; test phát sóng trong giao dịch cuốn chiếu ngược (đủ 1.670 thông báo, phát lại = 0, cuốn chiếu sạch); rà soát toàn bộ 1.670 profiles cho ra 61 cặp username gần giống (lưu nội bộ, đa số là trùng họ tên ngẫu nhiên/tài khoản trùng của chính chủ — không phát sóng).

### Giao diện (repo, PR #14, đã merge và live trên fun.rich)
- `systemNotifications.ts`: thêm `impersonation_alert` vào SYSTEM_TYPES, thêm bộ soạn nội dung (đọc metadata cả hai thế hệ: của hệ thống quét — suspect/victim + điểm; của bộ cảm biến username — similar/existing), định tuyến bấm vào → trang cá nhân của tài khoản bị nghi ngờ.
- `NotificationItem.tsx`: thêm loại vào danh sách avatar hệ thống (logo FUN).
- Chuỗi i18n mới `sntImpersonation*` trong `chunks/vi-p9.ts` + `chunks/en-p9.ts`. Quét TypeScript: 0 lỗi TS2304. Bản production đã kiểm chứng chứa đủ mã mới.

### Phát sóng các ca hiện có (sql/05-broadcast-13-cases.sql)
Theo quyết định của Trí "chỉ phát các cặp đáng ngờ": phát sóng **13 ca** = 12 ca hệ thống sẵn có đã gắn cờ + 1 cặp bộ cảm biến username bắt được (`angelkhanhii` tạo 04/2026 bắt chước `angelkhanhi` — Angel Khả Nhi, tạo 11/2025, tên hiển thị sao y hệt). Kết quả: **13 × 1.670 = 21.710 thông báo** tới mọi người dùng; sổ đăng ký ghi đủ 13 cặp đã phát; kiểm chứng ca điểm 100 có đủ 1.670 người nhận và metadata đúng chuẩn hiển thị.

## Giới hạn đã biết
- Bộ cảm biến username chỉ nhìn username; hệ thống quét sẵn có nhìn tên hiển thị + avatar. Hai lớp bổ trợ nhau, hợp nhất ở sổ đăng ký và luồng phát sóng.
- Tài khoản đã bị gắn cờ vẫn hoạt động bình thường (chủ trương minh bạch, không chặn) — cộng đồng tự cảnh giác dựa trên cảnh báo.
- Không truy hồi được IP đăng nhập cũ (xem mục khảo sát).
