# Gỡ bỏ hệ thống ví custodial — 2026-10-15 (áp dụng trực tiếp lên production DB tljfqavndndfsvtazibe)

Theo chỉ đạo của Trí: tính năng ví custodial đã ngưng hoạt động từ lâu, ví không giữ tài sản,
nhưng hệ thống còn tồn tại gây hiểu lầm là platform dùng custodial wallet. Kiểm kê của Angel Muse
trước khi gỡ (cùng ngày): 240 ví BSC, tạo ≤ 14/02/2026, last_activity_at trống toàn bộ, 0 giao dịch
quà tặng/chuyển tiền chạm vào, quét on-chain: BNB = 0 ở 240/240 ví; CAMLY chỉ còn "bụi" ở 33 ví
(tổng < 0,000000002 CAMLY ≈ 0 USD). Không cron nào chạy cho hệ thống này.

## Đã làm
1. `step1-archive.sql` — tạo `custodial_wallets_archive_20261015` (chỉ gồm id, user_id, địa chỉ,
   chain, trạng thái, mốc thời gian — KHÔNG có khóa mã hóa), sao 240 dòng, bật RLS + thu hồi toàn bộ
   quyền của anon/authenticated/public. Mục đích: giữ phân loại địa chỉ nội bộ + hồ sơ truy vết.
2. `step2-repoint.sql` (xây từ định nghĩa đang sống):
   - `v_internal_addresses`: nhánh custodial chuyển sang đọc bảng lưu trữ → tổng 2.800 địa chỉ và
     240 địa chỉ cũ giữ nguyên sau thay đổi.
   - `get_user_mint_stats`: bỏ LEFT JOIN custodial + COALESCE — hiển thị ví hồ sơ của người dùng
     (110 người từng hiển thị địa chỉ custodial đều có ví hồ sơ, bảng admin không mất dữ liệu).
   - `fun_profile_dry_run_emit_event` (công cụ kiểm thử sự kiện, admin): sự kiện WALLET_LINKED/
     UNLINKED nay lấy ví công khai của hồ sơ, wallet_kind = 'external'.
3. `step3-drop.sql` — chính sách "suspicious user read own" trên `suspicious_wallet_events` bỏ nhánh
   custodial (đo thực tế: 0 sự kiện nào có watched_address thuộc 240 địa chỉ — nhánh này chưa từng
   khớp, không người dùng nào mất quyền đọc); DROP view `user_custodial_wallets`; DROP bảng
   `custodial_wallets` kèm 240 khóa riêng đã mã hóa và các chính sách của nó.

## Kiểm chứng sau gỡ
- Không còn bảng/view/chính sách nào tham chiếu custodial_wallets.
- Phân loại nội bộ: 2.800 địa chỉ, 240 địa chỉ cũ vẫn nhận diện nội bộ.
- donation_board_usd_total() = get_unified_summary('global').totals.total_usd = 1.368.165,56 USD (khớp nhau).
- unified_transactions_snapshot vẫn làm mới bình thường.

## Khóa mã hóa gốc
Danh sách bí mật Edge Functions không có khóa riêng cho custodial; bản mã v1 nhiều khả năng dùng
`APP_SECRETS_MASTER_KEY` — khóa chủ dùng chung của app, KHÔNG xóa (có thể còn phục vụ dữ liệu mã
hóa khác). Vì toàn bộ bản mã custodial đã bị hủy, khóa chủ không còn giải mã được gì của hệ thống này.

## Không thể khôi phục (chủ đích)
Khóa riêng đã mã hóa bị xóa vĩnh viễn — đó là mục tiêu của đợt gỡ. Bảng lưu trữ (chỉ địa chỉ) giữ
90 ngày phục vụ truy vết/phân loại, sau đó có thể xóa nốt.

## Việc còn lại phía giao diện (đội phát triển)
- Identity Dashboard: bỏ loại mục hiển thị "custodial_wallet" (hiện truy vấn bảng đã xóa → trả rỗng, không lỗi).
- Trang tài liệu hệ sinh thái (EcosystemDocs): bỏ câu chữ nhắc custodial.
- Cột profiles.custodial_wallet_address giữ nguyên (luôn trống; nhiều hàm bảo mật ví đang tham chiếu).
