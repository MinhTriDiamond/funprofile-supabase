# Kiểm kê dự án gốc FUN Profile — 2026-09-03

Nguồn: truy vấn trực tiếp DB production (`information_schema`, `cron.job`, `storage.*`, `auth.*`)
và `ls supabase/functions`. Không có số liệu nào lấy từ file cũ.

## 1. Tổng quan

| Hạng mục | Số lượng |
|---|---|
| Bảng `public` (BASE TABLE) | **284** |
| View `public` | 15 |
| Edge function | **283** |
| Cron job (`cron.job`) | **79** (79 active) |
| Storage bucket | 6 (tất cả public) |
| Object trong Storage | 152 — **6,3 MB** |
| Kích thước DB | **12 GB** |
| User (`auth.users`) | **1.741** |

Video/replay nặng **không** nằm trong Storage Supabase mà ở Cloudflare Stream + R2
(giải thích vì sao Storage chỉ 6,3 MB trong khi DB 12 GB).

## 2. Bảng theo domain (top nhóm theo tiền tố)

| Domain | Số bảng |
|---|---|
| pplp (v2/v2.5/mint/tier/param) | 44 |
| btc (audit/ownership/backup/semantic) | 17 |
| pet (Lumi, battle, shop, risk) | 14 |
| identity / sbt / did | 11 + 2 |
| wallet | 10 |
| mystery_box | 10 |
| live | 9 |
| user_* | 6 |
| reel | 6 |
| connector | 5 |
| token / reward / fun / buddy / app / admin | 4 mỗi nhóm |
| tx / swap / quest / profiles / post / external / email | 3 mỗi nhóm |
| video, treasury, transactions, stale, search, scanner, sbt, registry, red_envelope, provider, platform, pending | 2 mỗi nhóm |
| còn lại | 1 bảng/nhóm |

Danh sách đầy đủ kèm số cột: `/tmp/inv/tables_cols.txt` (284 dòng) — nếu cần commit thì
export lại bằng `psql -c "COPY (...) TO STDOUT WITH CSV HEADER"`.

## 3. Edge function theo domain (283 function)

| Domain | Số function |
|---|---|
| pplp-* | 48 |
| live-* | 32 |
| identity-* | 18 |
| sso-* | 15 |
| admin-* | 12 |
| backfill-* | 11 |
| btc-* | 7 |
| treasury-*, mystery-* | 6 mỗi nhóm |
| scan-* | 5 |
| token-*, sumsub-*, stream-*, quest-*, pet-*, get-*, auto-*, auth-* | 4 mỗi nhóm |
| tx-*, notify-*, migrate-*, delete-*, batch-* | 3 mỗi nhóm |
| còn lại | 1–2 mỗi nhóm |

## 4. Cron job — 79 job active

Phân bố theo domain (đếm từ snapshot 03/09/2026):

- **Live / Agora / replay**: ~22 job, phần lớn `* * * * *` hoặc `*/2`–`*/5`.
- **PPLP / mint**: 18 job (`pplp-auto-submit-batch */15`, `pplp-epoch-snapshot-monthly 5 0 1 * *`, …).
- **Scanner / donation / wallet**: `scanner-rpc-tick-every-2min`, `auto-scan-donations-tier-a-30min`,
  `auto-scan-donations-tier-b-hourly`, `fast-scan-donations-every-minute` (`*/3`),
  `auto-backfill-donations-every-5min`, `backfill-donations-to-transactions-5min`,
  `wallet-reconciliation-30min`, `wallet-bulk-update-detector` (`* * * * *`),
  `donations-repricing-backfill-10min`, `scan-btc-transactions-every-5min`.
- **BTC**: `btc-ownership-reverify-auto-resume` (`*/5`), `btc-pending-verification-sweep-daily` (`10 4`),
  `btc-raw-sat-guard-daily` (`45 4`), `scan-btc-transactions-every-5min` (`*/5`).
- **Identity / trust**: 3 job. **Pet / mystery box / quest / connector**: 10 job.
- **Housekeeping / stats / price**: `app-stats-refresh-5min`, `cleanup-old-system-data-daily`,
  `token-price-history-daily`, `token-price-gap-alert`, `tokens-registry-drift-alert-hourly`,
  `treasury-health-daily`, `cascade-consistency-daily`, `inflation-health-job-daily`,
  `stale-unaccepted-accounts-log-daily`, `live-session-events-retention-daily`,
  `registry-validate-log-cleanup-30d`, `daily-fraud-scan`.

Khác biệt so với `docs/ops/cron-jobs-inventory.md` (snapshot 13/07: 68 job): **+11 job**,
2 one-shot `registry-validate-report-24h/48h` đã tự huỷ đúng thiết kế.

## 5. OAuth / SSO

Supabase Auth provider đang bật: **email/password** + **Google OAuth** (không có phone/SMS).

`oauth_clients` — FUN Profile là OAuth **server** cho 4 client hệ sinh thái (đều `is_active=true`):

| client_id | Platform | Redirect URI | Scope |
|---|---|---|---|
| `fun_farm_client` | Fun Farm | `https://farm.fun.rich/auth/callback`, `https://funfarm.life/auth/callback`, lovableproject callback, `localhost:3000` | profile, email, wallet, rewards, platform_data |
| `fun_play_client` | Fun Play | `https://play.fun.rich/auth/callback`, `localhost:3001` | profile, email, wallet, gaming, platform_data |
| `fun_planet_client` | Fun Planet | `https://planet.fun.rich/auth/callback`, `localhost:3002` | profile, email, wallet, social, platform_data |
| `angel_ai_client` | Angel AI | `https://angel.fun.rich/auth/callback`, `https://angel999.lovable.app/auth/callback` | profile, email, wallet, soul, rewards, platform_data |

⚠️ **2 điểm cần xử lý khi chuyển giao/freeze:**
1. `angel_ai_client.client_secret` đang lưu **plaintext hex**, 3 client kia lưu **bcrypt hash**.
   Cần hash lại hoặc rotate secret cho Angel AI.
2. Còn redirect URI `localhost:3000/3001/3002` trong production ⇒ nên gỡ.
   Chỉ 1 client có `webhook_url` (Fun Farm).

## 6. Tỷ lệ user theo phương thức đăng nhập (1.741 user)

| Phương thức | Số lượng | Ghi chú |
|---|---|---|
| Identity `email` (mật khẩu thuần) | 1.589 | |
| Có `encrypted_password` | 1.634 | gồm cả user vừa có Google vừa đặt mật khẩu |
| Identity `google` | 283 | ~16,3% |
| Email đã xác thực | 1.720 | 98,8% |
| Có `phone` | **0** | không dùng SMS |
| Đăng nhập trong 30 ngày | **134** | ~7,7% MAU |

OTP email tồn tại ở tầng ứng dụng (`otp_codes`, `email_confirm_tokens`,
`email_verification_tokens`), **không** phải provider phone của Supabase.

## 7. Secret — 59 secret, phân loại 4 nhóm

> Cập nhật 15/09/2026: đếm lại **59** secret (trước 57). Hai secret mới thuộc **Nhóm B**:
> `QUICKNODE_BSC_RPC_URL` (QuickNode free, chỉ dùng cho call thường) và
> `ALCHEMY_BSC_RPC_URL` (Alchemy free — nguồn `alchemy_getAssetTransfers` cho đối chiếu
> định kỳ, đã kiểm chứng đủ hạn mức 30M CU/tháng). Cả hai do Cha/Founder tạo, chuyển giao
> bằng cách nhập lại URL ở project đích. Không còn secret nào chưa phân loại.

### Nhóm A — Tự sinh trong hệ thống (chuyển giao được ngay, chỉ cần rotate)
`APP_SECRETS_MASTER_KEY`, `FUN_PROVIDER_POOL_MASTER_KEY_V1`, `WALLET_ENCRYPTION_KEY`,
`STREAM_KEY_ENCRYPTION_SECRET`, `CRON_SHARED_SECRET`, `G5A_CRON_SECRET`,
`TOKEN_PRICE_HISTORY_CRON_TOKEN`, `DONATIONS_REPRICING_CRON_TOKEN`,
`FUN_PROFILE_SERVICE_SECRET`, `FUN_PROFILE_SERVICE_IDENTITY`, `FUN_PROFILE_ORIGIN`,
`PPLP_EXTERNAL_SYSTEM_USER_ID`, `AGORA_WORKER_API_KEY`, `AGORA_WORKER_URL`,
`TREASURY_WALLET_ADDRESS` → **15**.
🔴 Rủi ro cao: `PPLP_HOT_WALLET_PRIVATE_KEY`, `SYSTEM_HOT_WALLET_PRIVATE_KEY` (private key
ví nóng — thuộc nhóm A về nguồn gốc nhưng phải xử lý theo quy trình ví, không rotate tự động).

### Nhóm B — Provider tài khoản công ty (bàn giao theo tài khoản, không rotate lẻ)
Agora (`AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `AGORA_CUSTOMER_ID`,
`AGORA_RECORDING_STORAGE_*` ×3), Cloudflare (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCESS_KEY_ID`, `CLOUDFLARE_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`,
`CLOUDFLARE_R2_PUBLIC_URL`, `CLOUDFLARE_STREAM_*` ×5, `R2_ARCHIVE_BUCKET`,
`R2_PUBLIC_BASE_URL`, `R2_TEMP_*` ×4), Resend (`RESEND_API_KEY`),
Sumsub (`SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_BASE_URL`, `SUMSUB_ENVIRONMENT`,
`SUMSUB_LEVEL_NAME`), Lovable (`LOVABLE_API_KEY` — chỉ rotate qua tool riêng),
**Moralis (`MORALIS_API_KEY`, `MORALIS_API_KEY_2`, `MORALIS_API_KEY_3`) — chủ sở hữu:
Cha (Founder), xác nhận 03/09/2026; cả 3 key đang HTTP 401 "usage consumed",
không cần liên hệ ai thêm** → **~33**.

### Nhóm C — Provider cá nhân / cộng tác viên (⚠️ phải đòi lại hoặc thay bằng tài khoản công ty)
(3 key Moralis đã chuyển sang Nhóm B ngày 03/09/2026 — chủ sở hữu là Cha/Founder.)
`ANGEL_AI_API_KEY`, `ANGEL_AI_INGEST_KEY`, `ATTESTER_EXTERNAL_SECRET_LOVEHUB`,
`FUN_CORE_API_KEY_FOR_FUN_PROFILE`, `FUN_CORE_API_BASE_URL` — thuộc đối tác trong hệ sinh thái → **8**.

### Nhóm D — Webhook 2 phía (phải phối hợp cả hai bên khi đổi)
`SUMSUB_WEBHOOK_SECRET`, `SUMSUB_WEBHOOK_URL`, `CLOUDFLARE_STREAM_WEBHOOK_SECRET`,
`oauth_clients.webhook_url` của Fun Farm → **4**.

### Tiến độ / còn chờ người giữ
| Việc | Trạng thái |
|---|---|
| Liệt kê 59 secret theo 4 nhóm | ✅ xong — 15/09/2026, không còn secret nào thiếu phân loại |
| Quyết định nguồn RPC | ✅ xong — Alchemy free (Transfers API) + blxrbdn (getLogs), không mua Moralis/Etherscan |
| Verify cờ khoá đăng ký (`signup_enabled` + `disable_signup`) | ✅ xong — `docs/audit/signup-gate-verify-20260915/RESULT.md` |
| Xác định chủ 3 key Moralis | ✅ xong — Nhóm B, chủ sở hữu Cha (Founder), 03/09/2026 |
| Quyết định nâng hạn mức Moralis / mua RPC trả phí | ⏳ chờ số liệu 24-48h độ tin cậy RPC miễn phí |
| Rotate secret nhóm A sau bàn giao | ⏳ chờ lịch freeze |
| Bàn giao tài khoản Agora / Cloudflare / Resend / Sumsub | ⏳ chờ chủ tài khoản |
| Xác nhận đối tác Angel AI / LoveHUB / FUN Core | ⏳ chờ đối tác |
| Hash lại `angel_ai_client.client_secret`, gỡ redirect `localhost` | ⏳ chờ duyệt |
| `app_secrets` vault (v1) | ⚠️ **0 dòng** — vault đã dựng nhưng chưa nạp secret nào |
