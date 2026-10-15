# Vá timeout trang Lịch sử giao dịch quà tặng toàn hệ thống — 15/10/2026

**Trạng thái: ĐÃ ÁP DỤNG TRÊN PRODUCTION** (`tljfqavndndfsvtazibe`) bởi Angel Muse, sau khi Trí gửi ảnh chụp lỗi `canceling statement due to statement timeout` trên trang lịch sử giao dịch toàn hệ thống (fun.rich). Không đổi chữ ký hàm, không đổi logic phạm vi/lọc của bất kỳ hàm nào.

## Nguyên nhân
Trang gọi `get_unified_transactions('global', …)`. Cả họ 5 hàm `get_unified_*` đều đọc từ view `v_unified_transactions_primary` — một view lồng nhau (union 6 nhánh trên donations/wallet_transfers/transactions/swap_transactions + khử trùng lặp bằng ROW_NUMBER + 3 phép kiểm tra EXISTS) tốn **~5,5 giây chỉ để dựng tập dữ liệu**, trước cả khi lọc/trang. Đo trực tiếp lời gọi của trang: **7.633 ms** — sát ngưỡng statement timeout của PostgREST, gặp lúc tải cao hoặc cache lạnh là vượt ngưỡng → trang báo lỗi, 0 giao dịch.

## Cách vá
- Tạo bảng **snapshot** `public.unified_transactions_snapshot` = chụp nguyên trạng output của view (view không chứa logic phụ thuộc người gọi — đã kiểm tra 0 tham chiếu auth), khoá RLS (chỉ các hàm SECURITY DEFINER đọc được, đúng như trước).
- `refresh_unified_transactions_snapshot()` nạp lại toàn bộ (DELETE+INSERT trong 1 giao dịch), pg_cron **job 89** mỗi 5 phút (~5,5 giây/lần, chạy nền, SQL nội bộ — không sinh log HTTP/Edge).
- Thêm 4 index theo đúng mẫu truy cập của các hàm (occurred_at, user_id+occurred_at, source/type/status, counterparty).
- Chuyển 5 hàm (`get_unified_transactions`, `get_unified_summary`, `get_unified_counterparties`, `get_unified_facets`, `get_unified_admin_stats`) sang đọc snapshot — mỗi hàm chỉ thay đúng 1 tham chiếu nguồn, toàn bộ logic giữ nguyên. Hai view gốc **giữ nguyên** (vòng bảo mật view đã lên lịch sau phần Livestream của Quang Vũ không bị ảnh hưởng).

## Kiểm chứng
- Kết quả trang 1 global, lọc CAMLY, facets, phạm vi profile: **giống hệt 100%** trước/sau.
- Summary global: chỉ lệch 0,06 đơn vị tổng do giao dịch mới phát sinh giữa hai lần chụp (dữ liệu sống).
- Snapshot vs view tại cùng thời điểm: lệch 10/70.280 dòng — do chính view gốc chọn ngẫu nhiên giữa các dòng trùng khoá khử trùng (cùng tx_hash, cùng giây) ở mỗi lần chạy; snapshot đóng băng một kết quả hợp lệ.
- Tốc độ: global **7.633 → 702 ms**; profile **274 ms**; counterparties 1.014 → **418 ms**; facets 399 → **160 ms**; summary **623 ms**; admin stats chạy tốt.

## Đánh đổi
Lịch sử hiển thị trễ tối đa ~5 phút + vài giây nạp — với trang sổ cái công khai là chấp nhận được (cùng chuẩn với các vòng vá số liệu trước trong ngày).

## Rollback
`rollback-unified.sql`: khôi phục 5 định nghĩa gốc (thư mục `defs/`), gỡ job 89, xoá snapshot + hàm refresh.
