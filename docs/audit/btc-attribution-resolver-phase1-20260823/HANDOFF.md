# BTC Attribution Resolver — Phase 1: báo cáo tiền đề + bàn giao

**Từ:** Claude Code · **Cho:** CTO · **Ngày:** 23/08/2026
**Phạm vi:** Mục 5 (điều kiện tiên quyết) + Mục 3/4 Phase 1 của bản giao việc gốc. Không đụng
dữ liệu sản xuất (donations/transactions/profiles) — đúng gate Phase 1.

**Tiếp theo:** Phase 2 (shadow mode) xem
`docs/audit/btc-attribution-resolver-phase2-20260824/HANDOFF.md`.

## 1. Kết quả kiểm tra tiền đề (Mục 5)

### 1.1 — `hd_input_back` có còn chạy sống không?

**Đã khoá thêm 1 nhánh ghi còn sống, chưa nằm trong phạm vi các freeze trước đó.**

| Nơi | Trạng thái trước khi kiểm tra | Hành động |
|---|---|---|
| `scan-btc-transactions` (cron 5 phút) | Đã tắt hoàn toàn từ 12/06/2026 — chỉ đọc aux `verified=true`, không tự học địa chỉ mới. | Không cần sửa. |
| `wallet-reconciliation-cron` | Chỉ dùng aux `verified=true` để map địa chỉ↔user. | Không cần sửa. |
| `btc-wallet-audit` (gọi thủ công: admin, chính chủ, hoặc `FATHER_ID`) | Nguồn `hd_input_back` đã bị khoá qua env `BTC_HD_INPUT_BACK_ENABLED` (mặc định tắt) từ sub-phase D (03/07/2026). **NHƯNG** 2 nguồn khác cùng bản chất tự học — `hd_change_auto` và `hd_cluster` — **KHÔNG hề bị khoá**, và hàm này backfill trực tiếp `donations.sender_id` + xoá `wallet_transfers` + sửa `posts.user_id` **ngay trong cùng 1 request**, dựa trên tập `owned` in-memory — **không lọc qua cột `verified`**. Đây là đường vòng bỏ qua toàn bộ gate RC2 nói tới trong bản giao việc. | **Đã khoá** — xem 1.1.1 bên dưới. |

Kết luận: **hd_input_back (nhãn gốc) đã chết**, nhưng cùng một class suy luận vòng tròn (RC8)
vẫn còn đường sống khác trong `btc-wallet-audit` cho tới hôm nay. Đã khoá theo đúng yêu cầu
"làm trước cả Phase 1", trước khi đụng tới bất kỳ thiết kế nào ở Mục 3.

#### 1.1.1 — Fix đã áp dụng

- Migration `20260823123949_...sql`: thêm `app_settings.btc_wallet_audit_write_enabled`
  (mặc định `'false'`) + RPC `btc_wallet_audit_write_enabled()`, đúng khuôn với
  `btc_manual_confirm_enabled()` đã dùng cho `BTC_MANUAL_CONFIRM_LOCK`.
- `supabase/functions/btc-wallet-audit/index.ts`: đọc cờ qua RPC, gate 2 điểm ghi
  (persist aux rows nguồn `hd_change_auto`/`hd_cluster`, và backfill
  donations/wallet_transfers/posts). BFS + report vẫn chạy bình thường để admin tiếp tục điều
  tra thủ công — chỉ INSERT/UPDATE/DELETE bị chặn. Response trả thêm `writes_locked: true`.
- Test guard: `src/__tests__/btc-wallet-audit-write-lock.test.ts` (8 test, pass) — khẳng định
  cờ mặc định `false`, REVOKE trước GRANT, và cả 2 điểm ghi đều gate đúng biến.
- **Bật lại** (không khuyến nghị trước Phase 3): `app_settings.btc_wallet_audit_write_enabled = 'true'`.

### 1.2 — User khác có "khai địa chỉ hồi tố" giống angelkim không?

**Không thể tự chạy trong sandbox này** — môi trường Phase 1 chỉ có `SUPABASE_URL` +
publishable/anon key trong `.env`, không có service-role key hay kết nối Postgres trực tiếp
(đúng tinh thần "Phase 1 không đụng dữ liệu sản xuất", nhưng cũng có nghĩa không tự truy vấn
được `profiles_wallet_audit`). Không có audit trước đó nào quét toàn hệ thống cho pattern này
(chỉ có audit riêng cho angelkim, xem `ANGELKIM_CLAIM_V6.md`).

**Đề nghị CTO/admin chạy hộ** (read-only, an toàn):

```sql
-- Mọi lần đổi btc_address có old_value RỖNG (khai lần đầu) trong cùng khung giờ nghi vấn
-- (23:00–23:59 UTC ngày 11/06/2026), hoặc rộng hơn: toàn bộ khai báo btc_address có tx BTC
-- gắn user đó TRƯỚC thời điểm audit ghi nhận (dấu hiệu "nghịch lý thời gian" như angelkim).
SELECT id, user_id, changed_at, old_value, new_value, application_name, db_session_user
FROM public.profiles_wallet_audit
WHERE column_name = 'btc_address'
  AND (old_value IS NULL OR old_value = '')
  AND changed_at >= '2026-01-01'
ORDER BY changed_at;
```

Với mỗi user trả về: so `changed_at` với thời điểm giao dịch BTC sớm nhất đã gắn địa chỉ đó
trong `donations`/`transactions` (nếu sớm hơn `changed_at` ⇒ cùng dạng "nghịch lý thời gian"
như angelkim, cần đưa vào diện xem xét ở Phase 4, không xử lý ở đây).

> **Cập nhật 23/08/2026:** SQL trên đã chạy thật (read-only). Kết quả: **44 user khai
> `btc_address` lần đầu trong 11–12/06/2026**, và **không có user nào khác ngoài angelkim**
> trong khung 23:30–23:59 UTC 11/06 ⇒ câu hỏi bảo mật này đã đóng. Danh sách đầy đủ 44 user +
> phương pháp xác minh on-chain bắt buộc đã ghi vào backlog Phase 4:
> `PHASE4_BACKLOG_ADDRESS_CLAIMS.md` (chưa thực thi).


## 2. Phát hiện thêm (ngoài phạm vi 2 câu hỏi, nhưng liên quan trực tiếp)

Đã có sẵn `supabase/functions/btc-ownership-reverify` (G5A, trước phiên này) + bảng
`btc_ownership_snapshot` — về hình dạng khá giống resolver được yêu cầu ở Mục 3 (feature-flag
`btc_ownership_reverify_enabled`, mặc định OFF, dry_run/apply, review queue), **nhưng**:

- `source` cho phép `'hd_change_verified'` — tức vẫn là **heuristic** (guard theo `tx_count`/
  `funded_btc`), không phải chữ ký. Đây chính xác là điều Mục 3.1 yêu cầu cấm ở tầng schema.
- Không có mô hình sở hữu-theo-thời-gian (unique theo `address`, không có `valid_from`/`valid_to`).
- Flag `btc_ownership_reverify_enabled` không được seed ở bất kỳ migration nào ⇒ mặc định
  `false` theo code, nhưng **chưa xác nhận được** liệu có bị bật thủ công trong `system_config`
  hay không (không có DB access để kiểm). Nên hỏi admin xác nhận trạng thái hiện tại trước khi
  quyết định Phase 5 (dọn nợ) có cần deprecate hệ thống này hay không.

**Không sửa gì ở đây trong phiên này** — ngoài phạm vi 2 câu hỏi tiền đề, và bảng/hàm mới ở
Mục 3 không phụ thuộc vào nó. Nêu ra để CTO cân nhắc khi làm Phase 5.

## 3. Phase 1 — đã build

Tất cả trong 1 migration `20260823124512_...sql` (bảng + hàm) + 1 edge function mới, **không**
sửa bất kỳ bảng/consumer sản xuất nào (`donations`, `profiles`, `profile_btc_aux_addresses`,
các scanner...). Wiring vào luồng đổi ví thật, và migrate các scanner sang gọi resolver, là
việc của Phase 3 theo đúng bảng giai đoạn gốc.

### 3.1 `btc_address_ownership_history` + `resolve_btc_owner()` + `claim_btc_ownership()`

Đúng thiết kế Mục 3.1/3.2, với 2 điều chỉnh:

1. **`verification_method` CHECK** chỉ nhận `'signature' | 'admin_manual'`, enforce lại lần
   nữa trong `claim_btc_ownership` (defense-in-depth) — chặn RC8 tái diễn ở tầng schema.
2. **`claim_btc_ownership()`** là điểm ghi DUY NHẤT (đóng active-row cũ + mở active-row mới
   trong 1 transaction, tránh race condition giữa 2 lệnh rời rạc). Chỉ `service_role` được
   `EXECUTE` — client không bao giờ ghi trực tiếp.

`resolve_btc_owner(address, at)` — `SECURITY DEFINER`, đọc theo đúng predicate:
`verified_at <= at AND (valid_to IS NULL OR valid_to > at)`, không có kết quả ⇒ `NULL`.

### 3.2 Xác thực chữ ký BIP-322

- Thư viện: `bip322-js@4.0.0` (npm, 100% JS không WASM — an toàn cho Deno edge runtime, cùng
  cách `npm:ethers@6` đã dùng cho EVM). Đã tự kiểm chứng round-trip sign/verify thật (ký bằng
  keypair random, verify qua `Verifier.verifySignature`) cho cả **SegWit (bc1q)** và
  **Taproot (bc1p)**, và xác nhận verify từ chối chữ ký khi đổi message hoặc đổi địa chỉ.
- Edge function mới: `btc-ownership-verify` (`action: 'challenge' | 'verify'`), theo đúng
  khuôn `sso-web3-auth`/`wallet_challenges` đã có cho EVM: nonce ngẫu nhiên 32 byte, TTL 5
  phút, single-use qua **1 UPDATE...WHERE used_at IS NULL...RETURNING nguyên tử** (đã sửa sau
  review — xem 3.5, bản đầu tách SELECT rồi UPDATE có race condition). Khác biệt so với luồng
  EVM: challenge gắn với `user_id` đã đăng nhập (đây là luồng "chứng minh sở hữu địa chỉ cho
  tài khoản đang có", không phải luồng login ẩn danh) — verify còn chặn thêm trường hợp dùng
  challenge của người khác hoặc đổi địa chỉ giữa chừng.
- Bảng `btc_ownership_challenges` — cùng khuôn `wallet_challenges` (RLS chặn hết, chỉ
  service_role thao tác).
- Rate limit: RPC bền `check_rate_limit` (đã dùng ở `claim-reward`, `sso-otp-request`...) —
  xem 3.5, bản đầu dùng `Map` trong bộ nhớ, mất state mỗi cold start.

### 3.3 Phát hiện & sửa 1 lỗi tương thích — chuẩn hoá địa chỉ

Toàn bộ scanner hiện có (`scan-btc-transactions`, `btc-wallet-audit`...) dùng
`toLowerCase()` vô điều kiện để chuẩn hoá địa chỉ trước khi lưu/so sánh. Với địa chỉ bech32
(`bc1q.../bc1p...`) điều này an toàn (case-insensitive theo BIP-173). Với địa chỉ legacy
base58 (`1.../3...`) thì **không** — base58 case-sensitive, lowercase vô điều kiện tạo ra một
chuỗi khác/không hợp lệ.

Đã tự kiểm chứng bằng script Node độc lập (ký thật bằng `bip322-js` + `bitcoinjs-lib`, không
chỉ đọc tài liệu): verify 1 địa chỉ legacy đúng case → `true`; verify cùng chữ ký với địa chỉ
đã lowercase → **throw `Invalid Bitcoin address is provided`**. Nếu Phase 1 tái dùng
`toLowerCase()` như các scanner cũ, **bất kỳ user nào dùng địa chỉ legacy sẽ không bao giờ xác
thực được sở hữu**.

Đã viết `btc_normalize_address()` (SQL) + mirror TS `btcNormalizeAddress()` — chỉ lowercase
khi địa chỉ khớp `^bc1[a-z0-9]+$`, còn lại giữ nguyên case (chỉ trim). Dùng nhất quán ở bảng,
2 hàm RPC, và edge function.

### 3.4 Test (đều đã chạy pass — xem `npx vitest run`)

| File | Nội dung |
|---|---|
| `src/__tests__/btc-ownership-resolver.test.ts` | **Gate time-travel**: cùng 1 địa chỉ, 2 mốc thời gian → 2 chủ khác nhau; ranh giới `verified_at`/`valid_to` chính xác tới mili-giây; không bằng chứng ⇒ `NULL`; chuẩn hoá địa chỉ (bech32 case-insensitive, legacy case-sensitive, có ví dụ địa chỉ Genesis block thật). Chạy trên `src/lib/btc/btcOwnershipResolver.ts` — mirror thuần TS của `resolve_btc_owner()`, dùng để test offline. |
| `src/__tests__/btc-ownership-history-schema.test.ts` | Snapshot tĩnh migration: CHECK constraint không cho `'heuristic'`, `created_by`/`user_id` NOT NULL + FK, unique index active-owner, RLS + GRANT đúng vai, REVOKE trước GRANT trên cả 2 RPC, `claim_btc_ownership` chỉ `service_role`. |
| `src/__tests__/btc-ownership-verify-edge.test.ts` | Snapshot tĩnh edge function: bắt buộc đăng nhập, dùng BIP-322 (không phải verify Legacy-only), TTL 5 phút, nonce claim là 1 UPDATE...RETURNING nguyên tử (3.5), rate limit qua RPC bền `check_rate_limit` (3.5), đối chiếu challenge đúng user/address, ghi qua `claim_btc_ownership`, không đụng `profiles`/`donations`/`wallet_transfers`. |
| `src/__tests__/btc-wallet-audit-write-lock.test.ts` | Guard cho fix ở Mục 1.1.1. |

Toàn bộ suite hiện có (`npx vitest run`) vẫn xanh sau các thay đổi: 44 file, 331 pass / 21
skip, không regression.

**Cập nhật 24/08/2026:** mọi khẳng định về `resolve_btc_owner`/`claim_btc_ownership`/CHECK/unique
index ở 3.1 và toàn bộ 3.5 dưới đây đã được verify bằng **Postgres 15 + PostgREST 16.2 thật**
chạy cục bộ (không phải chỉ đọc lại định nghĩa) — xem chi tiết lệnh/RAW output trong lịch sử hội
thoại yêu cầu "RAW evidence" ngày 23-24/08. Tóm tắt các phép thử đã chạy thật:
- CHECK `verification_method NOT IN ('signature','admin_manual')` → Postgres từ chối, lỗi
  `violates check constraint "btc_address_ownership_history_verification_method_check"`.
- Unique partial index (2 dòng cùng `address`, `valid_to=NULL`) → Postgres từ chối, lỗi
  `duplicate key value violates unique constraint "idx_btc_ownership_active_unique"`.
- Time-travel qua chính `resolve_btc_owner()` (không phải mirror TS): 3 mốc thời gian → đúng
  `NULL` / `USER_A` / `USER_B` như thiết kế.
- IDOR bằng nonce của người khác → `401 "Nonce không thuộc phiên đăng nhập này"`, không ghi gì
  vào DB.
- Chữ ký thật hợp lệ + body cố gắn `user_id`/`p_user_id`/`created_by` của user khác → DB vẫn ghi
  đúng danh tính từ JWT, bỏ qua hoàn toàn field client gửi.
- `btc_ownership_challenges` bị PostgREST từ chối `403 permission denied` khi dùng JWT
  `authenticated` trực tiếp (đúng thiết kế — chỉ `service_role` có GRANT).

### 3.5 2 fix theo yêu cầu review bảo mật (24/08/2026)

1. **Nonce claim đổi sang 1 UPDATE...WHERE used_at IS NULL...RETURNING nguyên tử** — bản đầu
   tách `SELECT` rồi `UPDATE` riêng có race condition (2 request đồng thời cùng nonce đều có
   thể pass `SELECT` trước khi request nào kịp `UPDATE`). Đã verify bằng `Promise.all` gửi
   thật 2 request `verify` đồng thời cùng 1 nonce hợp lệ (qua Deno.serve thật, không mock):
   đúng 1 request `200 success:true`, request còn lại `401 "Invalid or expired nonce..."`; DB
   chỉ có đúng 1 dòng ownership (không double-write dù HTTP đã trả 401).
2. **Rate limit chuyển từ `Map` trong bộ nhớ sang RPC bền `check_rate_limit`** — đã có sẵn
   trong codebase (`supabase/migrations/20260123095850_...sql`, bảng `rate_limit_state` +
   RPC atomic `INSERT ... ON CONFLICT`), đang dùng ở `claim-reward`, `sso-otp-request`,
   `angel-chat`, `admin-merge-mint-requests`... — tái dùng đúng chuẩn, không tự chế. Đã verify
   bằng cách gọi `challenge` 4 lần (count=4 trong DB), **kill hẳn process Deno cũ, khởi động
   process Deno mới hoàn toàn khác PID**, gọi tiếp 3 lần → count lên đúng 7 (không reset về
   1 hay 3), `window_start` giữ nguyên mốc trước cold start; gọi tới lần 11 → `429 Too many
   requests` đúng ngưỡng 10/phút dù đã cold start giữa chừng.

Test guard cho cả 2 fix: `src/__tests__/btc-ownership-verify-edge.test.ts` (thêm 2 test mới —
đọc source xác nhận pattern UPDATE nguyên tử + không còn `Map`/`rateLimitMap`).

## 4. Việc CHƯA làm (đúng phạm vi Phase 1, KHÔNG tự ý làm thêm)

- Chưa gọi `resolve_btc_owner()` từ bất kỳ scanner/RPC leaderboard nào — Phase 3.
- Chưa đổi vai trò `profile_btc_aux_addresses` thành "candidate suggestion" trong UI — Phase 3.
- Chưa build UI cho user tự ký địa chỉ (nút "Xác thực sở hữu ví" trong app) — cần thiết kế UX
  riêng (QR/deep-link cho ví ngoài ký message BIP-322), đề xuất làm đầu Phase 3 cùng lúc mở
  lại tính năng đổi ví.
- Chưa chạy shadow mode (Phase 2) — cần ít nhất 7 ngày theo gate gốc, chưa tới lượt.
- Chưa đụng `btc_ownership_snapshot`/`btc-ownership-reverify` (Mục 2) — chờ quyết định CTO.

## 5. Cần CTO xác nhận trước khi cho qua gate Phase 1

1. Đồng ý cách khoá `btc-wallet-audit` ở Mục 1.1.1 (giữ đọc/BFS, chặn ghi) — hay muốn tắt hẳn
   function này cho tới khi Phase 3 xong?
2. ~~Chạy hộ query ở Mục 1.2~~ — **Đã xong** (xem cập nhật 23/08 ở Mục 1.2: 44 user, không có
   ai khác angelkim trong khung giờ nghi vấn).
3. ~~Review schema + `resolve_btc_owner`/`claim_btc_ownership`~~ — **Đã verify bằng Postgres +
   PostgREST thật** (xem cập nhật 24/08 ở Mục 3.4/3.5). Còn chờ CTO đọc/ký duyệt, không còn
   chờ evidence.
4. Quyết định số phận `btc-ownership-reverify`/`btc_ownership_snapshot` (Mục 2) — giữ song song
   tạm thời, hay deprecate ngay khi resolver mới vào Phase 3.
