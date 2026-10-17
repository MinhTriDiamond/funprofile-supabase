# Tiến độ chung — FUN Profile

> Mốc mới nhất nằm ở trên cùng. Mỗi coordinator ghi mốc của mình vào đây khi có việc hoàn thành hoặc quyết định mới.

---

## 2026-10-17 — Lê Minh Trí (cùng Angel Muse) — ĐANG LÀM
- **Cảnh báo cộng đồng khi có tài khoản tên gần giống (chống giả mạo bằng minh bạch):** rà soát toàn bộ tài khoản tìm mọi cặp username gần giống (trùng sau chuẩn hóa / cùng bộ chữ cái đảo thứ tự / lệch đúng 1 ký tự); dựng cơ chế tự động ở tầng database: khi tạo mới hoặc đổi username mà tên gần giống một tài khoản đang có → phát thông báo cảnh báo tới toàn thể người dùng (nêu cặp tên + ngày tham gia + đường dẫn hai trang cá nhân để cộng đồng tự đối chiếu avatar/lịch sử); phát cảnh báo cho mọi ca hiện có — mở đầu là cặp angeldieugnoc ↔ angeldieungoc (avatar sao chép y hệt của tài khoản thật, đã nhận 99 FUN từ một người dùng khác). Không chặn tạo tài khoản: chủ trương minh bạch, cộng đồng cảnh giác. Hồ sơ: `docs/community-alerts-2026-10-17/`.

## 2026-10-17 — Lê Minh Trí (cùng Angel Muse) — HOÀN THÀNH
- **Hiển thị lịch sử giao dịch TỨC THÌ cho giao dịch tặng tiền giữa người dùng — ĐÃ XONG, đang sống trên production (database):** trigger `trg_donations_snapshot_append` + hàm `append_donation_to_snapshot` ghi ngay dòng lịch sử của mỗi donation mới vào bản chụp `unified_transactions_snapshot`, logic sao chép nguyên vẹn view hợp nhất, kèm lớp bảo vệ để luồng tặng tiền không bao giờ bị chặn. Job 89 (làm mới mỗi 5 phút) giữ nguyên làm lưới an toàn đối soát. Kiểm chứng: phép chiếu khớp 100% view gốc trên 5 mẫu đa dạng; test cơ chế trong giao dịch hồi ngược đạt (2 dòng hiện ngay, gọi lại không trùng, cuốn chiếu sạch); giao dịch thật 10.000 CAMLY lúc 08:51:49 hiện trong lịch sử ngay lập tức — trước cả lượt làm mới kế tiếp — và vẫn đúng 2 dòng, 0 trùng sau khi lưới quét qua. Hồ sơ đầy đủ: `docs/unified-instant-2026-10-17/`.

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


## 15/10/2026 — Đính chính nguyên tắc công khai + kiểm tra thống nhất toàn app (Angel Muse)
Trí đính chính: lịch sử giao dịch của FUN Profile là **công khai theo thiết kế của Cha và Bé Ly** — khách vãng lai xem được toàn bộ là chủ ý minh bạch, không phải lỗ hổng. Phần thu quyền trên hai view hợp nhất ban sáng đã được **hoàn lại nguyên trạng**; phần vá tốc độ (snapshot) và việc bảo vệ các bảng nội bộ khỏi bị ghi đè vẫn giữ. Vòng kiểm tra lại sau đó đạt toàn bộ: mọi bề mặt số liệu một cách tính — một nguồn — khớp tuyệt đối khi đối chiếu chéo. Chi tiết: `docs/unified-perf-2026-10-15/step3-revert-note.md`.

## 15/10/2026 — Lịch sử quà tặng toàn cục chuyển sang hướng NHẬN (Angel Muse)

Theo yêu cầu của Trí: trang lịch sử quà tặng toàn cục trước đây hiển thị hướng gửi (dấu trừ), nay chuyển sang hướng nhận (dấu cộng) — một dòng sửa duy nhất trong 4 hàm của trang, các phạm vi cá nhân giữ nguyên hai chiều như sao kê. Kiểm chứng: tập giao dịch trùng khớp với hướng gửi trước đó (cùng mã giao dịch, cùng số tiền), tổng số đếm bám sát nhau. Hồ sơ: `docs/unified-perf-2026-10-15/step4-note.md`.

## 2026-10-15 — Thống nhất hiển thị thống kê quà tặng (Angel Muse, theo yêu cầu của Trí)

- Cả ba bề mặt (bảng Benefactor, HONOR BOARD, Lịch sử quà tặng) nay dùng chung một con số tổng USD duy nhất từ hàm chuẩn mới `donation_board_usd_total()` — định giá tại thời điểm tặng, kiểm chứng khớp tuyệt đối $1.368.155,12 ở cả ba nơi.
- Bảng Benefactor liệt kê đầy đủ mọi token kể cả FUN (đang testnet, chưa có giá nên để trống giá trị USD — không hiển thị 0) và TONCOIN.
- HONOR BOARD thôi nhân giá hiện tại; trang Lịch sử có sẵn trường `totals.total_usd` để giao diện hiển thị dòng tổng.
- Hồ sơ: `docs/stats-unify-display-2026-10-15/`.

## 2026-10-15 — Đóng băng số liệu Bitcoin (Angel Muse, theo quyết định của Trí)

- Kiểm toán toàn bộ 549 bản ghi BTC đã xong (3 vòng đối chiếu blockchain); kết luận: cơ chế gán danh tính của hệ thống tạm thời không đáng tin (sổ địa chỉ chủ yếu do máy suy đoán).
- **Quyết định của Trí: số liệu Bitcoin tới hôm nay là ĐÓNG — giữ nguyên, không xét lại quá khứ nữa.** Mọi việc là Cha làm. Số liệu hiển thị không thay đổi.
- Việc tương lai theo lộ trình: xây hệ thống giao dịch Bitcoin chuẩn với xác thực chủ địa chỉ bằng chữ ký trước khi ghi tên người. Hồ sơ: `docs/btc-audit-2026-10-15/`.

### 2026-10-15 — Gỡ bỏ hệ thống ví custodial (Angel Muse, theo chỉ đạo của Trí)
Tính năng custodial đã ngưng từ lâu và ví trống (quét on-chain: BNB = 0 ở 240/240 ví, CAMLY chỉ còn bụi ≈ 0 USD). Đã xóa bảng custodial_wallets + 240 khóa mã hóa + view user_custodial_wallets TRỰC TIẾP trên production DB; phân loại địa chỉ nội bộ giữ nguyên qua bảng lưu trữ chỉ-gồm-địa-chỉ (RLS khóa chặt); các mặt thống kê khớp nhau sau gỡ. Hồ sơ: docs/custodial-removal-2026-10-15/. Còn lại phía giao diện: bỏ mục hiển thị custodial ở Identity Dashboard + câu chữ trong tài liệu hệ sinh thái.

## 2026-10-16 — Quy trình phối hợp của đội Coordinator chính thức có hiệu lực
- Theo phân công của anh Trí (dưới sự dẫn dắt của Cha và Thầy — chủ dự án), từ hôm nay đội Coordinator (5–6 bạn) áp dụng **một quy trình phối hợp cao nhất**: [Quy trình làm việc — Coordinators FUN Profile](../quy-trinh-lam-viec-coordinator.md).
- Tóm tắt 6 bước: **Báo Telegram → Ghi nhận hộp thư → Tạo nhánh → Làm trong phạm vi → Qua cổng Preview (ưu tiên preview local qua Muse) → Merge + ghi nhận kết quả**. Việc chưa có thư ghi nhận thì chưa làm; việc chưa có thư kết quả thì chưa xong.
- Mọi Coordinator và Angel Muse của từng bạn — kể cả anh Trí và Angel Muse điều phối — đều làm theo. Mục trỏ bắt buộc đã được thêm vào `AGENTS.md` ở gốc repo để mọi Angel Muse đọc repo đều thấy trước tiên.

## 2026-10-16 — Thực hành quy trình (vòng 2): chữ "About FUN Profile" thành IN HOA toàn bộ — ĐANG LÀM
- Bước 1 đã xong: anh Trí đã nhắn thông báo vào nhóm Coordinator trên Telegram (xác nhận 18:32).
- Người làm: anh Trí cùng Angel Muse. Việc: chữ "About FUN Profile" (mục About trong dải hệ sinh thái dưới feed) hiển thị IN HOA toàn bộ — "ABOUT FUN PROFILE".
- Phạm vi: `src/components/feed/EcosystemBelowItems.tsx`. Nhánh: `fix/tri-about-fun-profile-uppercase`.
- Trạng thái: ĐANG LÀM — chờ qua cổng Preview rồi mới merge (theo đúng 6 bước của quy trình).

## 2026-10-16 — KẾT QUẢ thực hành quy trình (vòng 2): chữ "About FUN Profile" đã IN HOA — ĐÃ XONG
- Đã làm: thêm lớp `uppercase` riêng cho mục About trong `src/components/feed/EcosystemBelowItems.tsx` — chữ hiển thị "ABOUT FUN PROFILE" ở mọi ngôn ngữ, không sửa từ điển.
- Link PR: https://github.com/MinhTriDiamond/funprofile-supabase/pull/5 — đã merge vào `main` (sau khi anh Trí bỏ bảo vệ nhánh và phân công Angel Muse merge). Cloudflare Pages tự deploy lên fun.rich sau merge, không cần Publish.
- Kiểm chứng: cổng Preview đạt trước merge (đối chiếu bản dựng preview của Cloudflare với production: bản preview có quy tắc uppercase cho mục About, production chưa có); sau merge, mã trên `main` đã chứa thay đổi.
- Vòng thực hành đi đủ 6 bước: Telegram → ghi nhận hộp thư → nhánh riêng → làm trong phạm vi → cổng Preview (link Cloudflare) → merge + thư kết quả này.
- Ghi chú: PR #4 (vòng 1 — bản màu đỏ) đã bị vòng 2 thay thế, còn mở chờ anh Trí quyết đóng.
