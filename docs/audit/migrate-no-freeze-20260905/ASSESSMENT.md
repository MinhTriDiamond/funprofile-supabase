# Đánh giá migrate KHÔNG freeze toàn hệ thống — 05/09/2026

CHỈ ĐÁNH GIÁ. Không có script ghi dữ liệu nào được chạy.

## Mục 1 — Moralis có đủ hay cần thêm BscScan

### Endpoint đang dùng (raw)

`supabase/functions/fast-scan-donations/index.ts`
- base: `https://deep-index.moralis.io/api/v2.2`
- L103: `GET /erc20/{token_address}/transfers?chain=bsc&limit=100&order=DESC[&cursor=]`
  → quét **theo contract token** (FUN/USDT/CAMLY), `MAX_PAGES = 2`.

`supabase/functions/auto-scan-donations/index.ts`
- L70: `GET /{wallet}/erc20/transfers?chain=bsc&limit=50&order=DESC` (ERC20 theo ví, maxPages 2)
- L111: `GET /{wallet}?chain=bsc&limit=50&order=DESC&include=internal_transactions` (native BNB, maxPages 1)

`fetch-wallet-history`: read-only, không ghi donations (đã ghi trong audit m6a).

### Phạm vi ví thật (raw DB)

```
profile_wallets (distinct lower)  = 894
custodial_wallets (distinct)      = 240
donations rows                    = 34.082  (evm: 33.751)
transactions rows                 = 67.356
```
→ **không phải 1.700+ ví**; 1.651 là số profile, chỉ 894 profile có `wallet_address`.
Tập ví EVM cần full-scan ≈ **894 + 240 = 1.134 địa chỉ** (có trùng lặp, sẽ ≤ 1.134).

### Moralis Pro có đủ không

- Moralis KHÔNG giới hạn block-range lùi quá khứ trên `/{wallet}/erc20/transfers`
  và `/{wallet}` — phân trang bằng `cursor`, đi được tới tx đầu tiên của ví.
  Về **phạm vi lịch sử: Pro đủ**, không cần BscScan để "đi sâu hơn".
- Ràng buộc thật là **CU/tháng và rate limit**, không phải độ sâu lịch sử.

Ước tính 1 lần full-scan toàn bộ ví (giả định trung bình 120 transfer/ví ⇒
~3 trang ERC20 + 2 trang native, limit 100):

| Hạng mục | Số call | CU/call (Moralis v2.2) | CU |
|---|---:|---:|---:|
| ERC20 transfers | 1.134 × 3 = 3.402 | ~10 | ~34.000 |
| Native + internal tx | 1.134 × 2 = 2.268 | ~15 | ~34.000 |
| **Tổng 1 lần full-scan** | **5.670** | | **≈ 68.000 CU** |

Ví "cá voi" (treasury) có thể tới 50–100 trang ⇒ cộng thêm ~20–30k CU.
**Biên an toàn: 1 lần full-scan ≈ 100.000 CU.**

Gói Pro Moralis (~2.5M CU/tháng) ⇒ full-scan chiếm ~4% hạn mức tháng, chạy lại
được 20+ lần. Cron thường ngày hiện tiêu ~40k call/ngày (đã đo 18/08:
39.079/40.000) ⇒ ~400k–800k CU/tháng. **Pro đủ cho cả full-scan + cron.**

### Kết luận Mục 1

**Chỉ cần nâng Moralis Pro. KHÔNG cần mua BscScan.**
Chỉ cần thêm BscScan khi một trong các điều kiện xảy ra:
1. Moralis trả thiếu internal transaction cho contract-call deposit (cần đối chiếu
   `txlistinternal` của BscScan) — phải kiểm chứng bằng mẫu 20 tx trước khi mua.
2. Cần đối chiếu độc lập 2 nguồn cho số tiền thật (nguyên tắc reconciliation
   human-only) — khi đó BscScan free tier (5 req/s, 100k call/ngày) là đủ, không
   cần gói trả tiền.

## Mục 2 — Thiết kế script dựng lại deposit từ chain (CHƯA CHẠY)

### Bảng PREVIEW riêng (chưa tạo)

```sql
-- migration đề xuất, CHƯA apply
CREATE TABLE public.deposit_rebuild_preview (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        uuid NOT NULL,
  chain_id      integer NOT NULL DEFAULT 56,
  tx_hash       text NOT NULL,
  log_index     integer NOT NULL DEFAULT -1,   -- -1 = native transfer
  block_number  bigint NOT NULL,
  block_time    timestamptz NOT NULL,
  from_address  text NOT NULL,                 -- lowercase
  to_address    text NOT NULL,                 -- lowercase
  token_address text,                          -- NULL = native BNB
  token_symbol  text NOT NULL,
  decimals      integer NOT NULL,
  amount_raw    numeric(78,0) NOT NULL,        -- wei, KHÔNG float
  recipient_id  uuid,
  sender_id     uuid,
  is_swap_leg   boolean NOT NULL DEFAULT false,
  classify      text NOT NULL,                 -- donation | transaction_only | swap | ignored
  classify_reason text,
  exists_in_donations   boolean NOT NULL DEFAULT false,
  exists_in_transactions boolean NOT NULL DEFAULT false,
  source        text NOT NULL,                 -- moralis | bscscan
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chain_id, tx_hash, log_index)        -- idempotent key
);
GRANT SELECT ON public.deposit_rebuild_preview TO authenticated;
GRANT ALL ON public.deposit_rebuild_preview TO service_role;
ALTER TABLE public.deposit_rebuild_preview ENABLE ROW LEVEL SECURITY;
-- policy: chỉ admin SELECT (has_role(auth.uid(),'admin')); chỉ service_role ghi.
```

### Logic

1. Lấy tập ví: `profiles.wallet_address` ∪ `custodial_wallets.wallet_address`,
   `lower()` + dedupe. Bỏ ví treasury khỏi nhánh "donation" (xử lý riêng).
2. Với mỗi ví: phân trang toàn bộ `/{wallet}/erc20/transfers` và `/{wallet}`
   (native + internal) tới hết cursor. Ghi thô vào `deposit_rebuild_preview`.
3. **Swap-leg guard (nguyên tắc #13):** group theo `tx_hash`; nếu trong cùng
   tx_hash có ≥ 2 leg khác `token_address` mà ví user vừa là `from` vừa là `to`
   ⇒ đánh `is_swap_leg = true`, `classify = 'swap'`.
   → **KHÔNG** tính donation, nhưng vẫn dựng dòng `transactions` để giữ lịch sử.
4. Phân loại còn lại:
   - `to_address` = ví user, `from_address` không thuộc hệ thống ⇒ `donation`
     (`is_external = true` nếu sender không map được user).
   - Cả 2 đầu thuộc hệ thống ⇒ `donation` nội bộ (sender_id + recipient_id).
   - Ví user là `from` ⇒ `transaction_only` (outgoing).
   - Junk token theo `junk_token_contracts` ⇒ `ignored`.
5. **Idempotent:** UNIQUE `(chain_id, tx_hash, log_index)`; native dùng
   `log_index = -1`. Chạy lại script 2 lần ⇒ 0 dòng thêm.
   Đối chiếu trước: set `exists_in_donations` / `exists_in_transactions` bằng
   `EXISTS (… WHERE tx_hash = …)` để thấy ngay phần Cloud gốc còn sót.
6. **Số học:** toàn bộ dùng BigInt string (`amount_raw` numeric(78,0), convert
   hiển thị bằng `formatUnits`). Không `parseFloat`/`Number()` ở bất kỳ nhánh nào.
7. **Output:** chỉ ghi `deposit_rebuild_preview` + 1 dòng `deposit_rebuild_runs`
   (tổng dòng, tổng theo token, số dòng trùng Cloud, số dòng mới). CTO đối chiếu
   xong mới có bước Confirm ghi vào `donations`/`transactions`.

### Chuẩn nghiệm thu trước khi Confirm
- `exists_in_donations = true` cho ≥ 99% dòng `classify='donation'` đã có trong
  Cloud (chứng minh script không bỏ sót lịch sử cũ).
- Tổng `amount_raw` theo từng token khớp tổng hiện có ± 0 (số nguyên, không sai số).
- Dòng `classify='swap'` phải khớp danh sách swap đã biết (m6b-swap-recorder).

## Mục 3 — Điều chỉnh admin thủ công KHÔNG dựng lại được từ chain

Raw `audit_logs` theo action (bảng đầy đủ dưới đây), cùng các hồ sơ memory liên quan.

| Khoản | Số dòng / nguồn | Dựng lại từ chain? |
|---|---|---|
| `CLAIM_REQUEST` | 259 (03/2026–08/2026) | KHÔNG — nội bộ |
| `CLAIM_REWARD` | 242 | KHÔNG |
| `APPROVE_CLAIM` | 85 | KHÔNG |
| `APPROVE_REWARD_V2` | 13 | KHÔNG |
| `reapprove_reward` | 3 | KHÔNG |
| `REJECT_CLAIM` | 7 | KHÔNG |
| `RESTORE_BANNED_REWARDS` | 1 | KHÔNG |
| `BAN_USER_PERMANENT` 52 / `BATCH_BAN_FARM` 37 / `FARM_COIN_BAN` 13 / `UNBAN_USER` 5+1 / `RESTRICT_USER` 2 | 110 | KHÔNG — trạng thái moderation |
| `donation_backfill_deepscan` | 9 (18/08) | CÓ — sinh từ chain |
| `transaction_backfill_deepscan` | 3 (18/08) | CÓ — sinh từ chain |
| `delete_stale_account` 92 / `delete_test_account` 6 / `audit_correction_note` 1 | 99 (04/09) | KHÔNG — đã xoá, không tái tạo |
| `grant_admin_role` 1 / `admin_delete_user` 1 / `user_banned` 1 / `MERGE_USER_APPROVED` 3 / `RESEND_MERGE_WEBHOOK` 6 / `federation_outbox_producer_toggle` 3 | 15 | KHÔNG |
| Backfill 322 lệnh EPOCH_CAP (03/05) — `.lovable/memory/governance/epoch-cap-throttle-policy.md` | 322 mint request failed→signed, 19,3M FUN | KHÔNG — FUN testnet, trạng thái nội bộ |
| Backfill LS tỉ lệ 15M FUN T4/2026 — `.lovable/memory/governance/april-2026-t4-backfill.md` | 268 user | KHÔNG |
| `transactions.amount_fix_note` | (đếm lại khi chạy: cột tồn tại, dùng cho Lô 1/Lô 2 sửa raw amount) | KHÔNG — ghi chú thủ công |

**Rủi ro chính:** script dựng lại từ chain chỉ sinh dòng `donations`/`transactions`.
Mọi bảng dẫn xuất (`light_actions`, `mint_allocations`, `pplp_mint_requests`,
`pplp_v2_*`, `epoch_metrics`, ban/moderation, claim) KHÔNG được script chạm tới,
nên phải **copy thẳng từ Cloud** (không tái tính từ chain), nếu không sẽ mất
toàn bộ 110 hành động moderation và 322 + 268 khoản điều chỉnh trên.

**Nguyên tắc chống ghi đè:** script chỉ INSERT dòng chưa có
`(chain_id, tx_hash, log_index)`; **cấm UPDATE** dòng có `amount_fix_note IS NOT NULL`
hoặc `integrity_status <> 'ok'` — đó là dòng đã can thiệp tay.

## Mục 4 — Feature flag "tắt đăng ký mới"

### Các đường tạo user (raw grep — 6 đường backend)

```
supabase/functions/sso-otp-verify/index.ts:201        auth.admin.createUser  ← OTP email/phone
supabase/functions/sso-web3-auth/index.ts:314         auth.admin.createUser  ← đăng nhập ví lần đầu
supabase/functions/sso-register/index.ts:128          auth.admin.createUser  ← proxy từ platform khác
supabase/functions/auth-signup-send-confirm/index.ts:61 auth.admin.createUser ← đăng ký email+password
supabase/functions/sso-merge-request/index.ts:321     auth.admin.createUser  ← merge tài khoản
supabase/functions/sso-merge-approve/index.ts:152     auth.admin.createUser  ← merge approve
```

FE: `src/components/auth/SocialLogin.tsx:80,91` → `supabase.auth.signInWithOAuth`
(Google/Facebook). **Đây là kẽ hở lớn nhất:** OAuth lần đầu tạo user **trực tiếp
trong GoTrue**, không đi qua edge function nào ⇒ flag ở edge function KHÔNG chặn được.

Không tìm thấy `supabase.auth.signUp` nào trong `src/` ⇒ email+password đi qua
`auth-signup-send-confirm`.

### Đề xuất 3 lớp

**Lớp 1 — DB (bắt buộc, chặn được cả OAuth):**
`app_settings` key mới `signup_enabled` (mặc định `true`; hiện chưa có key này —
raw danh sách 19 key ở dưới, không có key nào về signup).
Thêm guard trong trigger `handle_new_user` trên `auth.users`: nếu
`signup_enabled = false` ⇒ `RAISE EXCEPTION 'signup_disabled'` ⇒ GoTrue rollback
việc tạo user. Đây là chốt duy nhất chặn được **mọi** đường, kể cả OAuth và
`admin.createUser`.
Cần một allowlist thoát: bỏ qua guard khi user có metadata `merge_flow = true`
(để `sso-merge-*` vẫn chạy được nếu Cha muốn), hoặc chặn luôn cả merge trong gap.

**Lớp 2 — edge function:** thêm check `signup_enabled` ở đầu 4 function
`sso-otp-verify`, `sso-web3-auth`, `sso-register`, `auth-signup-send-confirm`;
trả 503 `signup_disabled` với message tiếng Việt, để user thấy thông báo tử tế
thay vì lỗi DB thô.

**Lớp 3 — FE:** hook `useSignupEnabled()` đọc `app_settings`, ẩn form đăng ký +
nút Google/Facebook trên `/auth`, hiện banner "Hệ thống đang nâng cấp, tạm khoá
đăng ký mới. Đăng nhập vẫn hoạt động bình thường."

### Xác nhận luồng bị/không bị chặn khi bật flag

| Luồng | Bị chặn? | Ghi chú |
|---|---|---|
| Đăng ký email + password | CÓ (lớp 2 + 1) | |
| OTP verify — user **mới** | CÓ (lớp 2 + 1) | |
| OTP verify — user **đã có** | KHÔNG | chỉ tạo session, đúng ý muốn |
| Google/Facebook OAuth lần đầu | **CHỈ lớp 1 chặn được** | nếu bỏ lớp 1 ⇒ kẽ hở |
| Google OAuth user đã có | KHÔNG | |
| Đăng nhập ví lần đầu (`sso-web3-auth`) | CÓ | |
| `sso-register` từ platform khác | CÓ | |
| `sso-merge-request` / `-approve` | tuỳ chọn — cần Cha quyết | tạo user mới khi merge |
| Admin tạo user tay | KHÔNG (nếu allowlist) | đề nghị chặn luôn, tránh lệch |
| Import/invite | Không tồn tại đường này trong code | grep: không có function invite/import user |

## Raw evidence

### audit_logs theo action
```
CLAIM_REQUEST 259 | 2026-03-06 → 2026-08-02
CLAIM_REWARD 242 | 2026-02-14 → 2026-03-06
delete_stale_account 92 | 2026-09-04
APPROVE_CLAIM 85 | 2026-03-10 → 2026-06-23
BAN_USER_PERMANENT 52 | 2026-02-20 → 2026-02-25
BATCH_BAN_FARM 37 | 2026-02-22
APPROVE_REWARD_V2 13 | 2026-02-12 → 2026-02-14
FARM_COIN_BAN 13 | 2026-02-18
donation_backfill_deepscan 9 | 2026-08-18
REJECT_CLAIM 7 | 2026-04-11
delete_test_account 6 | 2026-09-04
RESEND_MERGE_WEBHOOK 6 | 2026-01-08
UNBAN_USER 5 | 2026-02-27 → 2026-03-16
transaction_backfill_deepscan 3 | 2026-08-18
federation_outbox_producer_toggle 3 | 2026-06-18
reapprove_reward 3 | 2026-02-20
MERGE_USER_APPROVED 3 | 2026-01-08
RESTRICT_USER 2 | 2025-12-17
grant_admin_role 1 | 2026-04-16
RESTORE_BANNED_REWARDS 1 | 2026-02-22
unban_user 1 | 2026-02-20
admin_delete_user 1 | 2026-06-14
audit_correction_note 1 | 2026-09-04
user_banned 1 | 2026-06-25
```

### app_settings keys hiện có (19, không có key signup)
```
auto_scan_cursor, auto_scan_cursor_tier_a, auto_scan_cursor_tier_b,
btc_address_updates_enabled, btc_manual_confirm_enabled,
btc_shadow_priority_usernames, federation_outbox_event_flags,
federation_outbox_producer_enabled, federation_outbox_publisher_enabled,
fun_core_pilot_allowed_user_ids, fun_core_pilot_enabled, provider_pool_enabled,
unified_public_history_ready, unified_shadow_sampling, unified_tx_read_enabled,
unified_validation_ui_enabled, wallet_updates_enabled, wallet_writers_allowed,
wallet_writes_strict_mode
```

### Số lượng ví / dòng dữ liệu
```
profile_wallets = 894 | custodial = 240 | donations = 34.082 (evm 33.751) | transactions = 67.356 | profiles = 1.651
```

## Chờ CTO duyệt
Chưa tạo bảng, chưa viết script, chưa thêm flag. Cần Cha quyết 3 điểm:
1. Chốt "chỉ Moralis Pro, không mua BscScan"?
2. Trong gap có chặn luôn `sso-merge-*` và admin tạo user tay không?
3. Các bảng dẫn xuất (light_actions, mint, moderation, claim) copy thẳng từ Cloud
   — đúng chưa, hay Cha muốn tái tính?
