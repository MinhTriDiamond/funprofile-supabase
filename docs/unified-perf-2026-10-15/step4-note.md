# Gift history toàn app chuyển sang chiều nhận — 15/10/2026

**Yêu cầu của Trí:** bảng Gift history toàn app đang hiển thị theo chiều gửi (dấu − trên mỗi giao dịch); chuyển sang chiều nhận để hiển thị dấu + cho đẹp.

**Đã áp dụng (production):** đổi đúng 1 dòng lọc ở nhánh `global` của 4 hàm `get_unified_transactions`, `get_unified_summary`, `get_unified_counterparties`, `get_unified_facets`: `v.direction = 'out'` → `'in'`. Các phạm vi self/profile/admin giữ nguyên (lịch sử cá nhân vẫn hiển thị cả hai chiều như sao kê).

**Sự cố trong lúc làm (đã sửa):** bản chuyển chiều đầu tiên (step4) được dựng lại từ định nghĩa gốc nên vô tình đưa 4 hàm quay về đọc view `v_unified_transactions_primary` thay vì bảng snapshot — trang chậm trở lại (5–19 giây) trong ít phút. Đã phát hiện qua đo kiểm, sửa bằng step4b (giữ nguyên chuyển chiều + khôi phục đọc snapshot). Sau sửa: transactions global 906 ms, summary 849 ms, counterparties 354 ms, facets 402 ms.

**Kiểm chứng:** trang 1 trước/sau: tập (tx_hash, số lượng) giống hệt; mọi dòng nay direction='in', người gửi/người nhận hiển thị đúng vai; tổng số giao dịch khớp (chênh +14 do quà mới phát sinh giữa hai lần chụp — hàm summary bám sát tổng này ở cả hai phía); bảng đối tác chỉ tăng số ở 3 người dùng do quà mới, không giảm ở đâu. Hàm làm mới snapshot chạy nền ~10–20 giây/lần (đánh giá view gốc), không ảnh hưởng người dùng (đọc bản cũ trong lúc nạp).
