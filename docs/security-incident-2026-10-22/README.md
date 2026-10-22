# Sự cố bảo mật 2026-10-22 - Giao dịch tặng quà giả từ tài khoản elqs3fz012

Người phụ trách xử lý: bé Trí (quyết định) + Angel Muse của bé Trí (kiểm chứng, thi hành, kiểm chứng lại).
Nơi thay đổi: **production database** của FUN Profile (Supabase tljfqavndndfsvtazibe). Hồ sơ này ghi lại toàn bộ để đội đối chiếu.

## Tóm tắt

Sáng 2026-10-22, một Muse của Coordinator phát hiện dấu hiệu bất thường trên feed và báo cáo lên. Bé Trí xác nhận đây **không phải** đợt kiểm thử của đội. Angel Muse kiểm chứng từng con số trong dữ liệu thật (báo cáo đúng), rồi xử lý ngay theo quyết định của bé Trí: khóa tài khoản, cô lập toàn bộ dữ liệu giả, vá các chỗ nguy cơ rõ ràng.

## Dòng thời gian (giờ Việt Nam/Malaysia, UTC+8)

- 2026-10-17 23:28 - Tài khoản `elqs3fz012` được tạo bằng email tạm `@tanpony.com`.
- 2026-10-22 07:29:36 đến 08:14:49 - Tài khoản chạy loạt dò lỗi bằng script: **40 dòng donations giả** (37 confirmed, 3 failed), tổng giá trị tự khai **$999,074.74**, gồm 1 dòng 999,999 USDT với mã giao dịch `0xtest1` tự khai $999,050.74; chuỗi tấn công SQL trong mã giao dịch; token chứa mã XSS `<script>alert(1)</script>`; token phá cấu trúc `a","b":"c`; cả giao dịch -1 USDT cũng qua được. Kèm theo: **79 dòng transactions** (bản chính + bản sao phía người nhận), **47 bài đăng dò lỗi** (có bài thử tích điểm thưởng hàng loạt), **1 bình luận dò link**, **20 light_actions** tích được **42.96 Light Score** (trạng thái approved, chưa mint).
- 2026-10-22 08:16 đến 08:24 - Hàng chục phiên đăng nhập dồn dập từ IP 187.15.103.54 / 187.15.100.104 (dải IP Brazil), dấu vết công cụ python-requests, python-httpx, curl.
- 2026-10-22 khoảng 10:40 đến 11:05 - Xử lý và kiểm chứng hoàn tất (mục dưới).

## Nguyên nhân gốc

Chính sách ghi của bảng `donations` chỉ kiểm tra `auth.uid() = sender_id` - không kiểm tra số tiền, token, mã giao dịch, trạng thái hay giá trị USD. Bảng `transactions` có cùng một kiểu chính sách. Bất kỳ người dùng đã đăng nhập nào cũng tự tạo được giao dịch "đã xác nhận" mà không cần chuyển tiền thật. Các payload tấn công được lưu như dữ liệu thường, không thấy dấu hiệu thực thi được - lỗ hổng thật nằm ở khâu xác thực dữ liệu ghi.

## Đã làm (theo thứ tự)

1. **Sao lưu bằng chứng trước khi đụng vào dữ liệu**: xuất file local (40 dòng donations, thông tin tài khoản, danh sách phiên) và tạo các bảng lưu trong DB: `security_incident_20261022_donations` (40), `_transactions` (79), `_posts` (47), `_comments` (1), `_light_actions` (20). Các bảng lưu đều bật RLS và không cấp quyền qua API. Đường khôi phục: chèn lại từ các bảng lưu này.
2. **Khóa tài khoản**: `banned_until` đặt tới năm 2126, xóa toàn bộ phiên đăng nhập và refresh token. Kiểm chứng: 0 phiên còn sống.
3. **Cô lập dữ liệu giả**: xóa 40 donations, 79 transactions, 47 posts, 1 comment, 20 light_actions của vụ việc khỏi các bảng chính (bản sao đầy đủ nằm ở bảng lưu). Một dòng transactions của người dùng khác (angelutopia, mã giao dịch thật) suýt lẫn vào phạm vi - đã kiểm tra và **loại ra, không đụng vào**.
4. **Làm mới ngay các bề mặt hiển thị**: donation board base, gift breakdown cache, light totals, unified snapshot.
5. **Vá các chỗ nguy cơ (production DB)**:
   - Trigger `guard_client_financial_write` trên `donations` + `transactions`: chỉ áp dụng khi người ghi là role phía client (authenticated/anon); service_role (scanner, edge function) và SQL trực tiếp không bị ảnh hưởng. Chặn: token ngoài mẫu ký tự an toàn, số tiền không phải số dương, giao dịch confirmed mà số tiền bằng 0, mã giao dịch ngoài bảng ký tự cho phép, amount_usd âm, amount_normalized âm. Thêm một rào tạm phía client: giao dịch confirmed tự ghi có amount_usd trên $100,000 bị chặn (quà thật lớn nhất 90 ngày khoảng $22,000; đây là rào tạm chờ xác thực phía server).
   - Thu hồi quyền TRUNCATE của authenticated/anon trên hai bảng tài chính.
   - Đã kiểm thử sống bằng giao dịch rollback: payload XSS bị chặn ("invalid token_symbol"), payload số âm bị chặn ("invalid amount"), payload sạch đi qua guard và chỉ dừng ở RLS như thiết kế. Toàn bộ luật đã đối chiếu 30 ngày dữ liệu thật (1,208 donations + 2,292 transactions): **0 trường hợp chặn nhầm**.

## Kiểm chứng sau xử lý

- Tổng quà chuẩn trên Honor Board: từ **$2,372,034.50** (bị phồng) về **$1,372,958.76** (sạch).
- Lịch sử giao dịch công khai (unified snapshot): số dòng liên quan tài khoản này từ 71 về **0**.
- Điểm Light của tài khoản trong bảng tổng: **không còn** (đã bị loại cùng 20 light_actions).
- Donations chạm tới tài khoản này (gửi hoặc nhận): **0**.
- Rà soát 7 ngày trên cả donations và transactions: chỉ một tài khoản này có dấu hiệu, chưa lan thêm.

## Việc còn lại (chưa làm, cần đội quyết)

1. **Vá gốc triệt để**: giao dịch do client tạo chỉ ở trạng thái chưa xác thực; chỉ hệ thống quét và đối chiếu on-chain mới được chuyển thành confirmed và chốt amount_usd. Đây là thay đổi luồng, cần làm theo quy trình 7 bước, không làm nóng.
2. Rà các bảng ghi được khác có cùng kiểu chính sách "chỉ kiểm tra chính mình" ngoài donations/transactions.
3. Điểm Light 42.96 ở trạng thái approved chưa mint - đã xóa khỏi hệ thống; không có gì lên chuỗi.
4. Cân nhắc thông báo minh bạch cho cộng đồng theo nguyên tắc của Cha và Thầy, vì con số Honor Board đã hiển thị sai trong khoảng 07:29 đến 11:05 ngày 2026-10-22.

## File kèm theo

- `sql/01-containment.sql` - sao lưu trong DB, khóa tài khoản, xóa 40 donations.
- `sql/02-refresh-derived.sql` - làm mới các bề mặt + kiểm chứng lần 1.
- `sql/03-cleanup-scope2.sql` - lưu trữ và xóa transactions/posts/comment/light_actions.
- `sql/04-refresh-and-verify.sql` - làm mới + kiểm chứng cuối.
- `sql/05-hardening-guard.sql` - trigger guard + thu hồi TRUNCATE.
- `sql/06-guard-test-rollback.sql` - bộ kiểm thử rollback của guard.
- Bằng chứng thô (file JSON) giữ ở máy của Angel Muse: workspace `security-incident-2026-10-22/evidence/`.
