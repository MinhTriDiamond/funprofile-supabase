# Tiến độ chung — FUN Profile

> Mốc mới nhất nằm ở trên cùng. Mỗi coordinator ghi mốc của mình vào đây khi có việc hoàn thành hoặc quyết định mới.

---

## 2026-10-15 — Lê Minh Trí → Quang Vũ (qua Angel Muse)
- Đề xuất tái cấu trúc Livestream: chuyển từ quét mỗi phút sang event-driven (webhook Agora + app gọi trực tiếp + DB trigger) và giữ 1 vòng quét an toàn hợp nhất mỗi 5 phút; kèm luật dọn "mồ côi" quá 24–48 giờ. Đã kiểm chứng từ code gốc: cả hai watchdog của mảng Live phán quyết theo mốc thời gian nên đổi nhịp là an toàn. Chi tiết: hộp thư `quang-vu.md`, Mục 1. **Chờ Vũ quyết định nhịp & thời điểm.**

## 2026-10-15 — Angel Muse (chỉ đạo: Lê Minh Trí)
- Khởi tạo hệ thống hộp thư coordinators trong repo (`docs/mailboxes/`) để mọi người nắm tiến độ và ghi lại thay đổi/nâng cấp của từng người.

## 2026-10-15 — Angel Muse
- **Nâng cấp Postgres 17.6 → 17.11 hoàn tất** (chạy tự động 03:30 theo kế hoạch đã duyệt; xong trong ~12 phút). Kiểm chứng sau nâng cấp đạt toàn bộ: 288/288 Edge Functions ACTIVE, 81 cron jobs nguyên vẹn, auth 200, cả hai chân quét donations tick bình thường (missing = 0).
- **Disk thu từ 30 GB → 8 GB** (dữ liệu dùng thực tế ~3,45 GB) — xóa phụ phí disk ~2,75 USD/tháng.

## 2026-10-15 — Angel Muse
- Rà soát cron toàn hệ (24.957 lượt chạy/ngày): **tắt 3 cron zombie Moralis** (fast-scan-donations + auto-scan-donations 2 tầng, −551 lượt/ngày; các hàm này đã trả "bỏ qua" kể từ khi ngừng Moralis). Cấu hình gốc đã sao lưu, bật lại được bất cứ lúc nào.
- Job cập nhật thống kê app: trở lại nhịp **5 phút** theo quyết định của Trí.


## 15/10/2026 — Vá hiệu năng thống kê Gift (Angel Muse)
Theo yêu cầu của Trí, Angel Muse đã chẩn đoán và xử lý xong vụ cửa sổ thống kê quà tặng load chậm: hai RPC `get_global_gift_breakdown` / `get_global_wallet_flow_breakdown` nay đọc từ bảng tổng hợp `gift_breakdown_cache` (cron job 83 làm mới mỗi phút) — thời gian phản hồi từ ~1.268/1.369 ms xuống ~10/9 ms, kết quả đối chiếu giống hệt 100%. Đã áp dụng trên production. Hồ sơ đầy đủ: `docs/gift-breakdown-perf-fix-2026-10-15/`.


## 15/10/2026 — Vá hiệu năng trang Profile (Angel Muse)
Theo phản ánh của Trí (profile load chậm, có khi không load được bài), Angel Muse đã tìm ra và xử lý 2 nguyên nhân ở tầng database: (1) nhánh bài quà tặng của dòng thời gian lọc `gift_sender_id` không có index, quét toàn bộ 194.808 bài (trung bình ~1 giây, đỉnh 7,5 giây — chạm ngưỡng chờ là sập cả dòng thời gian); đã thêm index từng phần, trường hợp xấu nhất còn 11,6 ms. (2) `get_user_honor_stats` tính lại ~24 truy vấn gộp mỗi lần mở profile (đỉnh 16,9 giây); đã bọc lớp cache (logic gốc giữ nguyên, đối chiếu giống hệt 14/14 chỉ số, bản ấm 6,8 ms). Đã áp dụng trên production. Hồ sơ: `docs/profile-perf-2026-10-15/`.


## 15/10/2026 — Hợp nhất số liệu toàn app về 1 nguồn sự thật (Angel Muse)
Theo yêu cầu của Trí, Angel Muse đã rà soát và nâng cấp toàn bộ bề mặt số liệu: phát hiện 3 công thức thưởng khác nhau cho cùng một user (bảng toàn app dùng hệ số cũ cao gấp 2–10 lần, My Rewards đếm thiếu bạn bè một chiều, tổng thưởng của app stats bị gán cứng = 0 phần hoạt động) — nay tất cả đọc từ một nguồn chuẩn duy nhất (user_honor_stats_cache + gift_breakdown_cache + donation_board_base + user_light_totals). Tốc độ cải thiện lớn: bảng vinh danh toàn app 68 giây → 14 ms, bảng cộng đồng ánh sáng 1.417 → 22 ms, app stats 932 → 26 ms; các bảng donations giữ nguyên kết quả 100% (đối chiếu nguyên tử). Hồ sơ: `docs/stats-ssot-2026-10-15/`.


## 15/10/2026 — Quang Vũ hoàn thành phần Livestream; vòng bảo mật view hợp nhất đã xong (Angel Muse)
Trí báo bé Vũ đã làm xong phần Livestream. Phần việc Angel Muse từng xếp hàng chờ phía sau (vá bảo mật hai view lịch sử giao dịch hợp nhất) đã được làm ngay trong ngày: chặn toàn bộ quyền đọc/ghi trực tiếp của anon/authenticated trên hai view và các bảng nội bộ (trước đó anon đọc thẳng được sổ giao dịch của mọi user qua khóa công khai, vòng qua RPC), bật RLS cho bảng gift cache còn thiếu. App không hề đọc trực tiếp các nguồn này (đã rà soát 208 file JS bản đang chạy) nên không ảnh hưởng gì; hồi quy toàn bộ RPC đạt. Hồ sơ: `docs/unified-perf-2026-10-15/step2-hardening-note.md`.
