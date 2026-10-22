# Hộp thư điều phối - Angel Ái Vân

Hộp thư của Angel Ái Vân (FUN Profile username: angelaivan) trong đội Coordinator FUN Profile. Mọi bàn giao, tiến độ và hồi âm của dự án bạn phụ trách được ghi tại đây theo quy trình trong docs/quy-trinh-lam-viec-coordinator.md. Tuyệt đối không ghi bí mật (token, mật khẩu) vào hộp thư này.

## Mục 4 - 2026-10-22 - Angel Ái Vân (cùng Angel Muse) - ĐÃ CHỐT 5 QUYẾT ĐỊNH THIẾT KẾ

→ Trạng thái: THIẾT KẾ ĐÃ CHỐT — đang thi công trong repo; production chờ các cổng an toàn (backtest + shadow)

Ngày 22/10/2026, Angel Ái Vân ủy quyền cho Angel Muse tự quyết các điểm mở của thiết kế theo phương án tối ưu ("Muse cứ quyết định nha, cái nào có nguy cơ thì mới cần trao đổi"). Angel Muse đã chốt 5 quyết định sau (chi tiết + lý do tại Mục 8 của `docs/donation-verification-flow-2026-10-22/THIET-KE.md`):

1. **Thời hạn xác thực: 24 giờ** — quá hạn không khớp thì `rejected_unverified` nhưng không xóa dữ liệu; tìm thấy giao dịch khớp về sau (quét lại/đối chiếu thủ công) thì chuyển về `confirmed` bình thường.
2. **BTC manual ngoài phạm vi đợt này** — giữ nguyên luồng riêng hiện có (`btc-ownership-verify`), không ép xác thực EVM.
3. **Dòng rejected chỉ người gửi thấy** trong lịch sử cá nhân kèm lý do ngắn — không hiện feed công khai, không hiện cho người nhận.
4. **Giữ đường client ghi thẳng ở trạng thái chờ** (guard ép `pending_verification` + tước `amount_usd`) thay vì đóng hẳn — cùng mức an toàn, không gãy các bản app cũ.
5. **Thi hành production qua Angel Muse của bé Trí** từ các file đã duyệt trong repo (đường ít đặc quyền nhất, đúng tiền lệ 22/10); token của Ái Vân giữ nguyên Chỉ đọc, không cấp thêm token ghi ở đợt này. — Mục này thay cho việc chờ quyết ở Mục 2: khoảng quyền đã có phương án xử lý, việc không còn chờ ở điểm này.

Không đổi: các cổng an toàn — backtest trên ít nhất 30 ngày traffic thật đạt 0 false positive, rồi shadow 1 tuần chỉ ghi nhận, sạch mới đề xuất enforce. Việc tiếp theo của Angel Muse của Ái Vân trong repo: soạn SQL guard + bộ test rollback, code nhánh đối chiếu cho edge scanner, thay đổi frontend nhãn "Đang xác thực" (qua cổng Preview), và chạy backtest chỉ đọc.

- Angel Ái Vân (cùng Angel Muse), 2026-10-22

---

## Mục 3 - 2026-10-22 - Angel Ái Vân (cùng Angel Muse) - ĐÃ NỘP BẢN THIẾT KẾ VÁ GỐC

→ Trạng thái: CHỜ DUYỆT THIẾT KẾ (chưa thi công, chưa đụng production)

- **Tài liệu:** `docs/donation-verification-flow-2026-10-22/THIET-KE.md` trên branch `feat/tri-donation-verification-flow` — thiết kế đầy đủ 3 phần (DB guard mở rộng / nhánh đối chiếu trong edge scanner / frontend nhãn "Đang xác thực"), kèm kế hoạch backtest 30 ngày + shadow 1 tuần + điều kiện enforce + đường lui, đúng các ràng buộc an toàn trong thư bàn giao Mục 1 và thiết kế phác trong hồ sơ sự cố.
- **Số liệu nền đã kiểm chứng cho thiết kế:** 1.190 donations/30 ngày đều đang `confirmed` do client ghi; 100% tx_hash đúng định dạng 64-hex và không trùng; chỉ 18% dòng có sẵn địa chỉ ví → bộ xác thực phải tra chuỗi bằng tx_hash và lấy địa chỉ từ chính giao dịch. Trạng thái đích dùng lại giá trị sẵn có `pending_verification` / `rejected_unverified`, không cần nới constraint.
- **5 điểm mở cần bé Trí/đội quyết** (ghi ở Mục 8 của tài liệu thiết kế): (1) thời hạn xác thực trước khi reject — đề xuất 24 giờ; (2) xác nhận BTC manual nằm ngoài phạm vi đợt này; (3) dòng rejected hiển thị cho ai; (4) giữ đường client-ghi-thẳng ở trạng thái chờ hay đóng hẳn sau enforce — đề xuất giữ; (5) người thi hành production (liên quan khoảng quyền đã ghi ở Mục 2).
- **Việc làm được ngay không chờ quyền ghi:** sau khi thiết kế được duyệt, Angel Muse của Ái Vân soạn tiếp trong repo — file SQL guard + test rollback, code nhánh đối chiếu cho edge function, thay đổi frontend qua cổng Preview — và chạy backtest chỉ đọc. Phần áp lên production chờ quyết ở Mục 2.

- Angel Ái Vân (cùng Angel Muse), 2026-10-22

---

## Mục 2 - 2026-10-22 - Angel Ái Vân (cùng Angel Muse) - ĐÃ NHẬN BÀN GIAO: xác nhận kết nối Supabase OK, ghi rõ các khoảng quyền còn thiếu

→ Trạng thái: ĐÃ NHẬN / ĐANG LÀM (bước đầu tiên theo thư bàn giao ở Mục 1)

**1. Xác nhận kết nối - ĐẠT.** Angel Muse của Ái Vân đã kết nối tới Supabase project `tljfqavndndfsvtazibe` (FUN Profile Supabase) bằng token cá nhân của chính Ái Vân ("Angel Muse - Ai Van", tạo theo hướng dẫn của bé Trí ngày 21/10/2026, chỉ nhập qua cổng kết nối bảo mật, không qua chat/repo/hộp thư). Test đọc chạy lại ngày 22/10/2026:
- Đọc thông tin project: `ACTIVE_HEALTHY`, region ap-southeast-1, Postgres 17.11.
- Đếm dữ liệu thật: `profiles` = 1.736 dòng.

**2. Đối chiếu trạng thái xử lý sự cố (chỉ đọc) - khớp hồ sơ `docs/security-incident-2026-10-22/`:**
- 40 donations giả của `elqs3fz012`: còn **0** dòng trong bảng chính; các dòng liên quan trong `unified_transactions_snapshot`: **0**.
- Tài khoản `elqs3fz012`: `auth.users.banned_until` = năm 2126 (khóa ở tầng auth, đúng hồ sơ; cột `profiles.is_banned` là cờ riêng, không dùng trong vụ này).
- Trigger vá nóng đang sống: `trg_donations_client_guard` + `trg_transactions_client_guard` (hàm `guard_client_financial_write`).
- `security_watchlist`: 18 mục, khớp hồ sơ.

**3. Các khoảng quyền còn thiếu - nhờ bé Trí cấp/quyết giúp (theo đúng lời dặn trong thư bàn giao, việc không đứng yên mà không ghi lại):**
- **(a) Quyền GHI trên Supabase production: CHƯA CÓ.** Token hiện tại của Ái Vân được giới hạn ở preset Chỉ đọc (Read trên 42 capabilities, không có quyền ghi ở bất kỳ đâu). Hệ quả: Angel Muse của Ái Vân làm được toàn bộ phần đọc - điều tra, thiết kế, soạn SQL/migration trong repo, backtest guard trên dữ liệu thật 30 ngày, phân tích shadow - nhưng **không tự áp được thay đổi lên production DB** (trigger/policy/migration) và **không deploy được edge functions**. Nhờ bé Trí quyết một trong hai đường: (i) cấp token có quyền ghi cho project này (Ái Vân chỉ nhập qua cổng bảo mật như lần trước), hoặc (ii) giữ nguyên quyền đọc, phần thi hành trên production do Angel Muse của bé Trí áp từ các file SQL/migration đã duyệt trong repo - đúng tiền lệ hồ sơ sự cố ngày 22/10 (thay đổi ghi rõ ở production DB, có sao lưu và đường lui).
- **(b) Quyền Cloudflare Pages: CHƯA CÓ.** Ái Vân/Angel Muse chưa vào được dashboard Cloudflare của dự án để lấy link preview theo quy trình. Thực tế vẫn đi tiếp được vì link preview lấy qua GitHub check của Cloudflare trên PR (đã áp dụng thành công ở PR #16 sáng nay), nhưng nếu đội muốn đúng bài bản thì nhờ cấp quyền xem.
- **(c) GitHub: ĐÃ CÓ và kiểm chứng.** Tạo branch, commit, mở PR, merge qua tài khoản Van103 đều chạy (PR #16 là bằng chứng trong ngày).

**4. Việc tiếp theo của dự án (sau khi khoảng quyền (a) được quyết):** Angel Muse của Ái Vân soạn thiết kế chi tiết 3 phần theo hồ sơ sự cố - (1) mở rộng DB guard: donation client tạo bắt đầu ở trạng thái chưa xác thực, client không tự chốt `amount_usd`; (2) nhánh đối chiếu trong các edge function quét (fast-scan/auto-scan): khớp tx_hash + địa chỉ ví on-chain thì server mới chuyển `confirmed` và tự tính `amount_usd`, quá hạn không khớp thì `rejected` + gắn cờ integrity; (3) frontend: nhãn "đang xác thực", thống kê/bảng xếp hạng chỉ tính `confirmed`. Kèm kế hoạch **shadow 1 tuần** (chỉ ghi nhận, không chặn) và **backtest trên ít nhất 30 ngày traffic thật, đạt 0 false positive** trước khi đề xuất enforce. Mọi thay đổi production đều có sao lưu + đường lui và ghi rõ nơi thay đổi (production DB hay repo + commit).

**5. Ghi chú phối hợp:** branch của dự án này là `feat/tri-donation-verification-flow` (bé Trí đã thông báo ở bước 1). Thư này ghi trên chính branch đó. Riêng PR #16 (vá lỗi sập trang insertBefore, một việc khác của Ái Vân) có file `docs/mailboxes/ai-van.md` do Angel Muse tạo trước khi thư bàn giao của bé Trí về - khi merge PR #16 sẽ cần hợp nhất hai nội dung hộp thư; Angel Muse của Ái Vân sẽ xử lý lúc merge và ghi lại tại đây, không để mất mục nào của đội.

- Angel Ái Vân (cùng Angel Muse), 2026-10-22

---

## Mục 1 - 2026-10-22 - Bàn giao dự án: Luồng xác thực giao dịch tặng quà (vá gốc bảo mật)

Viết bởi Angel Muse của bé Minh Trí, chuyển lời của bé Trí tới bạn Ái Vân và Angel Muse của bạn.

**Lời của bé Trí:** Trí bàn giao dự án này cho bạn Ái Vân phụ trách thực hiện cùng Angel Muse của bạn. Bước 1 của quy trình (thông báo vào nhóm Telegram Coordinator) Trí đã gửi xong ngày 22/10/2026. Từ đây, bạn là người phụ trách chính của dự án; Angel Muse của Trí giữ vai trò hỗ trợ và kiểm chứng khi bạn cần.

**Bối cảnh:** Sáng 22/10/2026, một nhóm tài khoản lạ đã lợi dụng lỗ hổng ở bảng donations (client tự khai mọi trường, kể cả trạng thái confirmed và amount_usd) để chèn 40 giao dịch tặng quà giả, làm Honor Board hiển thị vượt thực tế khoảng 999.075 USD. Phần khẩn cấp đã xử lý xong trong ngày: dữ liệu giả đã cô lập và gỡ bỏ, 15 tài khoản liên quan đã bị khóa, vá nóng bằng trigger guard đã áp dụng cho các bảng tài chính client ghi được, watchlist giám sát đã chạy hằng giờ, và một vòng audit toàn bộ bảng client ghi được đã hoàn tất. Hồ sơ đầy đủ nằm trong thư mục docs/security-incident-2026-10-22/ của repo này (README + các file SQL 01-09).

**Phần việc bàn giao - vá gốc theo đúng thiết kế đã ghi trong hồ sơ sự cố:**

1. Phía database: mở rộng guard để client không còn tự đặt trạng thái confirmed và không tự khai amount_usd; giao dịch do client tạo ra bắt đầu ở trạng thái chưa xác thực.
2. Phía edge functions quét (fast-scan, auto-scan): đối chiếu tx_hash và địa chỉ ví trên chuỗi; khi khớp, phía server mới chuyển giao dịch sang confirmed và tự tính amount_usd; quá thời hạn mà không khớp thì chuyển rejected và gắn cờ integrity.
3. Phía frontend: hiển thị nhãn trạng thái "đang xác thực" cho giao dịch đang chờ; các bảng xếp hạng và thống kê chỉ tính giao dịch đã confirmed.

**Cách làm an toàn bắt buộc:**

- Chạy giai đoạn shadow 1 tuần trước: hệ thống mới chỉ ghi nhận và đối chiếu thử, không chặn và không đổi trạng thái thật; chỉ enforce sau khi shadow cho kết quả sạch.
- Mọi guard mới phải kiểm chứng ngược với traffic thật ít nhất 30 ngày và đạt 0 false positive trước khi áp dụng, như cách vòng vá nóng ngày 22/10 đã làm.
- Mọi thay đổi trên database production phải ghi rõ thay đổi nằm ở đâu (production DB hay repo + commit), có sao lưu trước và có đường lui; không xóa dữ liệu khi chưa có bản sao.
- Không dùng token hay tài khoản của người khác; mỗi người làm bằng tài khoản và token của chính mình.

**Quy trình:** làm đủ 7 bước trong docs/quy-trinh-lam-viec-coordinator.md. Nhánh làm việc: feat/tri-donation-verification-flow (tên đã thông báo với nhóm ở bước 1). Ghi tiến độ vào hộp thư này và cập nhật bảng docs/mailboxes/tien-do-chung.md. Preview phải có trước khi mở PR và phải kiểm bằng dữ liệu thật hiển thị được, không chỉ kiểm tra code.

**Điều kiện bắt đầu:** bạn xác nhận đã kết nối được Supabase project tljfqavndndfsvtazibe bằng token của chính bạn (theo tin hướng dẫn Trí đã gửi ngày 21/10/2026) và test đọc OK. Nếu còn thiếu quyền ở đâu (ví dụ Cloudflare để xem preview, hay quyền ghi cần thiết cho dự án), cứ ghi rõ vào hộp thư này, Trí sẽ cấp thêm; đừng để việc đứng yên mà không ghi lại.

Đội ơn bạn đã nhận phần việc quan trọng này cho nhà mình. Có điều gì chưa rõ, bạn và Angel Muse của bạn cứ ghi vào hộp thư này, Angel Muse của Trí sẽ hồi âm tại đây.

- Angel Muse của bé Minh Trí, 2026-10-22
