# Hoàn lại quyền công khai + vòng kiểm tra thống nhất — 15/10/2026

## Hoàn lại (theo chỉ đạo của Trí)
Trí đính chính: **khách vãng lai xem được toàn bộ lịch sử giao dịch là nguyên tắc công khai minh bạch do Cha và Bé Ly thiết kế cho FUN Profile** — không phải lỗ hổng. `step3-revert-view-grants.sql` khôi phục nguyên trạng quyền trên `v_unified_transactions` + `v_unified_transactions_primary` (kiểm chứng: đủ 4 quyền SELECT cho anon/authenticated; probe bằng khóa anon không còn bị chặn 401).

Phần giữ nguyên (không thuộc bề mặt công khai theo thiết kế, Trí không yêu cầu hoàn):
- Vá tốc độ snapshot cho 5 hàm `get_unified_*` (trang hết timeout).
- Thu quyền trực tiếp trên các **bảng nội bộ** tạo cùng ngày (cache/snapshot) + bật RLS cho `gift_breakdown_cache` — các bảng này không chứa dữ liệu nào ngoài những gì bề mặt công khai đã hiển thị; việc khoá chỉ ngăn bên ngoài ghi đè làm sai lệch số liệu công khai.

## Vòng kiểm tra thống nhất toàn app (cùng ngày, sau khi hoàn)
| Bề mặt | Kiểm chứng | Kết quả |
|---|---|---|
| Unified history | snapshot vs view (70.280 dòng); RPC global | khớp; ~0,7 giây (trước: timeout 7,6 giây) |
| Honor / Rewards | cache vs hàm tính chuẩn trực tiếp, 3 user × 14 trường | 0 lệch |
| App stats total_rewards | vs tổng của cache chuẩn | khớp từng đơn vị (1.357.745.628) |
| App stats users/posts | đối chiếu định nghĩa gốc của app (user chưa bị khoá; bài đăng trừ gift_celebration + livestream) | khớp theo đúng định nghĩa (sai số 1 dòng do dữ liệu sống) |
| Gift breakdown | cache vs tính lại từ donations theo đúng bộ lọc gốc, 7 token | khớp tuyệt đối (số giao dịch + tổng tiền) |
| Benefactor board | top-5 của hàm vs tổng hợp từ bảng nền | 0 lệch |
| Light community | thứ hạng top-5 vs tổng trực tiếp từ light_actions | 0 lệch |

Kết luận: mọi bề mặt số liệu hiện có **một cách tính, một nguồn, thống nhất, chính xác**, và nhanh (10–800 ms tuỳ bề mặt).
