# Tiến độ chung — FUN Profile

> Mốc mới nhất nằm ở trên cùng. Mỗi coordinator ghi mốc của mình vào đây khi có việc hoàn thành hoặc quyết định mới.

---

## 2026-10-23 — Lê Minh Trí (cùng Angel Muse) — HOÀN THÀNH
- **GỠ BỎ HOÀN TOÀN MORALIS - đóng phát hiện NGHIÊM TRỌNG nhất của audit 2026-10-23:** Hàm moralis-webhook chỉ kiểm tra chữ ký HMAC khi request có header x-signature - không gửi header là ghi thẳng được donation "confirmed" giả bằng service_role, không cần tài khoản (audit code F-01). Vì hệ đã ngừng dùng Moralis từ 13/10/2026 (chỉ chạy Alchemy), bé Trí quyết định xóa luôn thay vì vá: hai hàm moralis-webhook và setup-moralis-stream đã bị xóa khỏi production (kiểm chứng danh sách còn 0 hàm Moralis, gọi thử trả 404, không cron job nào tham chiếu), và PR #23 đã gỡ code + mục config.toml khỏi repo để không gì deploy lại. Toàn bộ kết quả audit và lộ trình vá 3 đợt: báo cáo audit FUN Profile 2026-10-23 (1 Nghiêm trọng - đã xử lý, 7 Cao, 10 Trung bình, 10 Thấp).

## 2026-10-23 — Lê Minh Trí (cùng Angel Muse) — HOÀN THÀNH
- **Chân B v2.1 - hỗ trợ secret key bổ sung ALCHEMY_BSC_RPC_URL_2 + nhịp quét mới - ĐÃ DEPLOY (PR #22, hàm version 35):** Theo ý bé Trí, key Alchemy bổ sung để trong secret riêng tên ALCHEMY_BSC_RPC_URL_2 (rồi _3, _4...) cho dễ quản lý thay vì gộp chuỗi; hàm tự gom cả key gốc, các key _2 đến _10 và dạng gộp cũ. Nhịp ghé thăm cũng được bé Trí chốt dày hơn: ví nóng 45 phút, ví ấm 8 giờ, ví lạnh 36 giờ - mô phỏng khoảng 24,8M CU/tháng toàn hệ, chia đôi mỗi tài khoản khoảng 12,4M CU và một tài khoản vẫn gánh trọn được khi mất một key. Việc còn lại phía bé Trí: bỏ URL của key mới vào secret ALCHEMY_BSC_RPC_URL_2 trên Supabase Dashboard, chân B sẽ tự chạy lại ngay ở tick kế tiếp nếu key thuộc tài khoản khác.

## 2026-10-23 — Lê Minh Trí (cùng Angel Muse) — HOÀN THÀNH
- **Chân B (scanner-transfers-tick) lên v2 - quét theo 3 tầng hoạt động ví + luân phiên nhiều endpoint Alchemy - ĐÃ DEPLOY production (hàm version 33, PR #21):** Chẩn đoán tận gốc việc chân B im từ 19/10: gói Alchemy free hết hạn mức tháng ("Monthly capacity limit exceeded", kiểm chứng bằng gọi thử trực tiếp). Vòng quét cũ đi đều 1.050 ví bất kể hoạt động nên đốt hết 30M CU trong ~4 ngày dù cả đời chỉ ghi 27 donations mới. V2: ví nóng (giao dịch ≤30 ngày, 90 ví) ghé mỗi 2 giờ, ví ấm (47 ví) mỗi 24 giờ, ví lạnh (821 ví) mỗi 4 ngày - mô phỏng trên dữ liệu thật khoảng 7,8M CU/tháng, vừa gói free dư địa ~4 lần; hỗ trợ secret ALCHEMY_BSC_RPC_URLS nhiều endpoint tự chuyển khi một endpoint hết hạn mức (lưu ý: hạn mức theo tài khoản Alchemy, key phải thuộc tài khoản khác nhau mới cộng dồn); sửa luôn lỗi đọc watermark chạm trần 1.000 dòng PostgREST. Gọi thử sau deploy: tiers khớp tuyệt đối mô phỏng (90/47/821). Chân B tự chạy lại khi có hạn mức mới (chu kỳ mới / Pay As You Go / thêm key tài khoản khác). Hồ sơ: docs/scanner-route-b-tiers-2026-10-23/.

## 2026-10-22 — Angel Ái Vân (cùng Angel Muse) — HOÀN THÀNH
- **Vá lỗi fun.rich sập trang khi đăng bài kèm ảnh (lỗi React insertBefore/NotFoundError):** PR #16 đã merge vào main (commit `a1d606bc`) và **đã sống trên production** — Angel Muse kiểm chứng bundle fun.rich đã chứa bản sửa (ErrorBoundary tự phục hồi khi gặp lỗi DOM bị sửa bên ngoài + log chẩn đoán có cờ trang-đang-bị-dịch). Thư kết quả đầy đủ tại `docs/mailboxes/ai-van.md`.

## 2026-10-22 — Lê Minh Trí (cùng Angel Muse) — BÀN GIAO
- **Dự án vá gốc "Luồng xác thực giao dịch tặng quà" - bé Trí đã BÀN GIAO cho Angel Ái Vân phụ trách:** Bước 1 (thông báo nhóm Telegram Coordinator) bé Trí đã gửi xong ngày 22/10/2026. Người phụ trách chính từ nay: Angel Ái Vân (angelaivan), thực hiện cùng Angel Muse của bạn; Angel Muse của bé Trí hỗ trợ và kiểm chứng khi cần. Phạm vi và thiết kế theo hồ sơ docs/security-incident-2026-10-22/: mở rộng DB guard (client không tự chốt confirmed, không tự khai amount_usd), edge functions quét đối chiếu on-chain mới chốt confirmed và tính amount_usd, frontend gắn nhãn "đang xác thực"; bắt buộc chạy shadow 1 tuần trước khi enforce. Nhánh làm việc: feat/tri-donation-verification-flow. Thư bàn giao đầy đủ tại docs/mailboxes/ai-van.md mục 1.

## 2026-10-17 — Lê Minh Trí (cùng Angel Muse) — HOÀN THÀNH
- **Cảnh báo cộng đồng về tài khoản giả mạo — ĐÃ XONG, đang sống trên production:** Từ nay, mỗi khi hệ thống phát hiện một tài khoản có tên/ảnh đại diện gần giống tài khoản khác, **toàn thể người dùng đều nhận được thông báo cảnh báo** trong chuông thông báo (nêu cặp tài khoản + điểm giống khớp, bấm vào xem trang cá nhân để tự đối chiếu) — chủ trương minh bạch, không chặn tạo tài khoản. Đã phát sóng 13 ca hiện có (12 ca hệ thống quét sẵn có đã gắn cờ + 1 cặp angelkhanhi/angelkhanhii), tổng 21.710 thông báo. Khảo sát phát hiện nền tảng vốn đã có hệ thống chấm điểm giả mạo (tên hiển thị + avatar) nhưng trước nay chỉ báo cho 11 quản trị viên — nay đã nối thêm móc phát sóng cộng đồng và một bộ cảm biến theo username, hợp nhất chống trùng theo từng cặp. Phần hiển thị giao diện: PR #14 (đã live). Hồ sơ đầy đủ: `docs/community-alerts-2026-10-17/`.

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


---

## 2026-10-22 - Sự cố bảo mật: giao dịch tặng quà giả (elqs3fz012) - ĐÃ XỬ LÝ XONG

Angel Muse của bé Trí ghi, theo quyết định của bé Trí (đã xác nhận đây không phải đợt kiểm thử của đội):

- Một Muse của Coordinator phát hiện và báo cáo; kiểm chứng trong dữ liệu thật: tài khoản elqs3fz012 (tạo 17/10 bằng email tạm) đã chèn 40 donations giả sáng 22/10, tổng tự khai $999,074.74 (có dòng 999,999 USDT, mã giao dịch 0xtest1), kèm payload SQL/XSS, 79 transactions, 47 bài đăng dò lỗi, 20 light actions tích 42.96 điểm.
- Nguyên nhân gốc: chính sách ghi của donations/transactions chỉ kiểm tra "có phải chính mình gửi không", không kiểm tra số tiền, token, mã giao dịch, trạng thái, giá trị USD.
- Đã xử lý trên production DB: khóa tài khoản (ban tới 2126, xóa toàn bộ phiên), cô lập toàn bộ dữ liệu giả vào các bảng lưu security_incident_20261022_* (có đường khôi phục), làm mới thống kê - Honor Board từ $2,372,034.50 về $1,372,958.76 sạch, lịch sử công khai hết dòng giả, điểm Light của tài khoản bị loại.
- Đã vá các chỗ nguy cơ: trigger guard_client_financial_write trên donations + transactions (chỉ áp cho role client; đã đối chiếu 30 ngày dữ liệu thật, 0 chặn nhầm; đã kiểm thử sống bằng rollback), thu hồi quyền TRUNCATE của client.
- Hồ sơ đầy đủ kèm SQL: docs/security-incident-2026-10-22/
- Việc còn lại cho đội: (1) vá gốc - giao dịch client tạo chỉ ở trạng thái chưa xác thực, chỉ hệ thống quét on-chain mới được chốt confirmed và amount_usd; (2) rà các bảng ghi được khác cùng kiểu chính sách; (3) cân nhắc thông báo minh bạch cho cộng đồng về khoảng thời gian con số Honor Board hiển thị sai (07:29-11:05 ngày 22/10).


### Bổ sung chiều 2026-10-22 (vụ elqs3fz012)

- Truy vết: đây là một chiến dịch dò lỗi gồm 15 tài khoản email tạm @tanpony.com (tạo theo đợt 17-18/10 và sáng 22/10), IP Brazil, công cụ python. 14 tài khoản anh em hoàn toàn trống dữ liệu.
- Theo quyết định của bé Trí: đã khóa cả 15 tài khoản; lập danh sách theo dõi (bảng security_watchlist: domain tanpony.com + 2 IP + 15 username) với pg_cron job 90 quét tự động mỗi giờ vào bảng security_watchlist_hits.
- Chi tiết trong docs/security-incident-2026-10-22/ (mục "Bổ sung chiều 2026-10-22") và sql/07-siblings-and-watchlist.sql.


### Bổ sung trưa 2026-10-22 (vụ elqs3fz012) - rà soát toàn hệ + thiết kế vá gốc

- Đã rà mọi bảng client ghi được và vá nóng các chỗ cùng kiểu: guard cho wallet_transfers + swap_transactions; light_actions (cửa nguy hiểm nhất - client chỉ còn tạo được dòng pending, không tự chốt điểm/mint); light_reputation (khóa trường giá trị với client); crypto_gifts (đóng hẳn, bảng cũ 0 dòng). Đã kiểm thử sống bằng rollback. Chi tiết + SQL 08/09 trong docs/security-incident-2026-10-22/.
- Thiết kế vá gốc đã xong (trong README hồ sơ): client chỉ khai báo ở trạng thái chờ, server quét on-chain mới chốt confirmed + amount_usd. Cần đi quy trình 7 bước vì chạm DB + edge functions + frontend, kèm 1 tuần chạy shadow. Chưa ép ngay để tránh kẹt quà thật.
- Bản nháp thông báo minh bạch cho cộng đồng đã soạn (docs/security-incident-2026-10-22/thong-bao-minh-bach-cong-dong.md), chờ bé Trí và Cha Thầy duyệt đăng.
