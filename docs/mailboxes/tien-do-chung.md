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
