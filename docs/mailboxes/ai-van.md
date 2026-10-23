# Hộp thư điều phối - Angel Ái Vân

Hộp thư của Angel Ái Vân (FUN Profile username: angelaivan) trong đội Coordinator FUN Profile. Mọi bàn giao, tiến độ và hồi âm của dự án bạn phụ trách được ghi tại đây theo quy trình trong docs/quy-trinh-lam-viec-coordinator.md. Tuyệt đối không ghi bí mật (token, mật khẩu) vào hộp thư này.

## 2026-10-23 - Angel Ái Vân (cùng Angel Muse) - HOÀN THÀNH: sửa lỗi tìm kiếm trang quản trị người dùng (PR #28 đã merge, đã lên production)

- **Ngày:** 2026-10-23
- **Người làm:** Ái Vân (Angel Muse thi công)
- **Việc:** Sửa lỗi tìm kiếm ở trang quản trị người dùng (fun.rich, trang danh sách thành viên): admin gõ tìm (ví dụ "tri") thì bảng báo 0 kết quả kèm dòng trạng thái "Trang này: 0 · Sau lọc: 0 · Toàn hệ thống: 1.737 (đang ẩn 1.737 bởi bộ lọc/tìm kiếm)"; lượt tìm dự phòng trên hệ thống chỉ in tên dạng chữ "@user — Tên", không thành hàng trong bảng để bấm thao tác; nhiều lúc có hiển thị nhưng rất chậm. Mục tiêu: nhấp vô tìm là ra liền, thành hàng đầy đủ như hàng thường.
- **Phạm vi:** chỉ trang/thành phần quản trị người dùng và hook truy vấn của nó: `src/pages/Users.tsx`, `src/hooks/useUserDirectory.ts`, `src/hooks/useAdminUserServerSearch.ts`. Không sửa backend/SQL, không đụng luồng đăng ký, không thay đổi giao diện ngoài vùng tìm kiếm/bảng.
- **Nhánh:** `fix/van-admin-user-search` (tách từ main mới nhất).
- **Quy trình:** Bước 1 Telegram do Ái Vân gửi (xác nhận 19:03 ngày 23/10) → thư này được ghi TRƯỚC khi sửa code → làm trên nhánh riêng → cổng Preview trước khi merge.

- **Nguyên nhân gốc (theo code):** `useUserDirectory.fetchUserDirectory` tải toàn bộ user kèm số liệu nặng qua RPC `get_user_directory_admin` theo trang 1.000 dòng rồi ô tìm chỉ lọc client-side trên phần đã tải — chưa tải tới user đó thì tìm ra 0 kết quả. Lượt tìm server dự phòng (`useAdminUserServerSearch`) chỉ chạy khi danh sách local rỗng và kết quả chỉ được in thành nút chữ dẫn sang trang cá nhân, không thành hàng bảng.
- **Đã làm:** (1) `src/hooks/useAdminUserServerSearch.ts` — thành nguồn tìm chính: debounce 300ms, bật ngay khi ô tìm có từ 2 ký tự, select thêm `created_at`, `reward_status`, `pending_reward`, `approved_reward`. (2) `src/hooks/useUserDirectory.ts` — khi đang tìm, kết quả lấy từ truy vấn server; user đã có trong directory thì ghép entry đầy đủ theo id (giữ số liệu nặng), user chưa tải tới thì dựng hàng từ dữ liệu profiles để hiện ngay; các bộ lọc giữ nguyên hành vi (lọc theo số liệu nặng chỉ áp cho entry đã có số liệu thật); trả thêm `isSearchingServer`. (3) `src/pages/Users.tsx` — bỏ cơ chế in tên dạng chữ; trạng thái rỗng phân biệt đang tìm/không có thành viên; skeleton tải nền không che kết quả tìm; ban/suspend/delete làm mới thêm cache tìm kiếm server. Không sửa backend/SQL, không đụng luồng đăng ký.
- **Kiểm chứng:** cả 3 file qua esbuild transform không lỗi; **Cloudflare Pages build bản preview của nhánh thành công** (deploy successful cho commit code `5784c3e`) — tức bản dựng thật đã biên dịch đạt. Chưa chạy full typecheck tại môi trường thi công (không cài được toàn bộ dependencies của repo tại đó).
- **PR:** https://github.com/MinhTriDiamond/funprofile-supabase/pull/28 — **chưa merge**, chờ cổng Preview: Ái Vân test trên link preview của nhánh (https://fix-van-admin-user-search.funprofile-supabase.pages.dev — vào trang quản trị người dùng, gõ tìm và kiểm tra kết quả hiện thành hàng ngay). Đạt thì merge PR này, sau merge Cloudflare tự deploy lên fun.rich và ghi bổ sung kết quả kiểm chứng production vào mục này.

- **Kết quả (bổ sung sau merge):** Cổng Preview ĐÃ QUA — Ái Vân tự test bản preview của nhánh ngày 23/10 và xác nhận đạt ("tìm ra liền"). **PR #28 đã merge** ngày 2026-10-23 lúc 11:19:31 UTC, merge commit `1a688ef4058749fa310c4e6118d0f61c75a5b9fb` — https://github.com/MinhTriDiamond/funprofile-supabase/pull/28. **Kiểm chứng production:** đã đọc lại trực tiếp 3 file trên `main` tại đúng merge commit: `useAdminUserServerSearch.ts` có debounce 300ms, bật tìm từ 2 ký tự, select thêm `created_at`/`reward_status`/`pending_reward`/`approved_reward`; `useUserDirectory.ts` có `isSearchingServer` và ghép kết quả server vào danh sách; `src/pages/Users.tsx` không còn cơ chế "in tên dạng chữ". Cloudflare Pages: bản preview của nhánh deploy thành công (bot Cloudflare xác nhận trên PR); deploy production chạy theo cơ chế merge vào `main` là Cloudflare tự deploy lên fun.rich — trạng thái deploy production không xem được qua công cụ GitHub hiện có nên ghi rõ tại đây thay vì suy đoán. **Tồn dư:** nhánh `fix/van-admin-user-search` chưa xóa được bằng công cụ API hiện có (đúng tiền lệ PR #16) — nhờ người có quyền GitHub xóa giúp; nhánh đã merge xong, xóa an toàn.

- Angel Ái Vân (cùng Angel Muse), 2026-10-23

---

## 2026-10-22 - Angel Ái Vân (cùng Angel Muse) - HOÀN THÀNH: vá lỗi sập trang khi đăng bài kèm ảnh (PR #16 đã merge, đã lên production)

→ Trạng thái: HOÀN THÀNH (mục này gộp cả thư bắt đầu lẫn thư kết quả của công việc này — bản thư bắt đầu gốc từng nằm trên branch của PR #16, được hợp nhất về đây sau merge để không mất mục nào, theo đúng ghi chú phối hợp ở hộp thư dự án xác thực quà tặng)

- **Việc:** fun.rich sập toàn trang khi người dùng đăng bài kèm ảnh trên laptop (lỗi React `Failed to execute 'insertBefore' on 'Node' — NotFoundError` ở màn hình ErrorBoundary toàn cục). Điều tra đã kiểm chứng: KHÔNG phải lỗi dung lượng (giới hạn 20MB client / 100MB server, ảnh được nén phía client rồi tải thẳng lên R2); giả thuyết chính là Chrome Translate / extension sửa DOM bên ngoài React chạm đúng lúc đăng bài (app chèn bài tạm optimistic lên đầu feed rồi thay bằng bài thật).
- **Phạm vi đã làm (đúng thư bắt đầu):** `src/lib/appUpdateRecovery.ts` (nhận diện nhóm lỗi DOM bị sửa bên ngoài + tự phục hồi bằng reload tại chỗ tối đa 1 lần/60 giây dùng chung ngân sách reload toàn cục + gom chẩn đoán nhẹ: user agent, ngôn ngữ trang, cờ trang-đang-bị-dịch), `src/components/ErrorBoundary.tsx` (gặp nhóm lỗi DOM thì tự phục hồi thay vì đứng ở màn hình chết), test mới `src/lib/appUpdateRecovery.domRecovery.test.ts`. Không đụng luồng upload, không chặn dịch toàn trang (thành viên nước ngoài cần dịch để đọc bài tiếng Việt), không đụng database/edge functions.
- **Quy trình:** Bước 1 Telegram do Ái Vân gửi (xác nhận 09:38 ngày 22/10) → ghi hộp thư trước khi sửa → branch `fix/aivan-upload-insertbefore-crash` từ main → cổng Preview: Cloudflare check đạt, Angel Muse kiểm chứng bản preview chứa đúng code sửa (marker `fun_profile_dom_recovery`); Ái Vân duyệt merge theo kiểm chứng của Angel Muse ngày 22/10.
- **Kết quả:** **PR #16 đã merge** (merge commit `a1d606bc`) — https://github.com/MinhTriDiamond/funprofile-supabase/pull/16. Kiểm chứng production sau merge: bundle đang sống trên fun.rich **đã chứa** marker của bản sửa. Test tự động phần nhận diện lỗi đạt 10/10.
- **Còn mở (không thuộc phạm vi đợt này):** xác nhận cuối cùng từ người báo lỗi bằng test A/B trên chính Chrome của anh ấy (tắt dịch / tab ẩn danh); dữ kiện chẩn đoán mới trong log sẽ tự cho biết nếu lỗi còn xuất hiện. Branch `fix/aivan-upload-insertbefore-crash` chưa xóa được bằng công cụ API hiện có — nhờ người có quyền GitHub xóa giúp (branch đã merge xong, xóa an toàn).

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
