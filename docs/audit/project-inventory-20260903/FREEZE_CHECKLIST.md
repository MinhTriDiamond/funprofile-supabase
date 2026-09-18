# CUTOVER CHECKLIST v2 — Migrate KHÔNG freeze toàn hệ thống

> Cập nhật 15/09/2026. **Bản này THAY THẾ toàn bộ checklist freeze v1** (7 bước
> "freeze production 24–30h", khoá ghi tài chính, tắt 40+ cron, unpublish app).
> Chiến lược mới đã chốt với Cha: **hệ thống tiếp tục chạy bình thường**, chỉ khoá
> việc **tạo tài khoản mới**, rồi dựng lại dữ liệu tài chính từ chuỗi tới sát thời
> điểm cutover và chấp nhận mất một phần dữ liệu xã hội phát sinh trong gap.
>
> Lý do bỏ freeze: dữ liệu tài chính có thể **dựng lại từ blockchain** (đã chứng minh
> ở đợt backfill 15/09 — 111 dòng, đối chiếu 100%), nên không cần đóng băng người dùng.

Nguyên tắc bất biến vẫn giữ: không xoá dữ liệu lịch sử; Preview trước Confirm; số tiền
luôn tính bằng BigInt chuỗi; địa chỉ ví lowercase; mọi bước có người thứ hai xác nhận.

---

## Bước 0 — Chốt mốc (T-0, chỉ đọc)

- [ ] Ghi `SELECT max(block_number) FROM donations WHERE chain_family='evm'` + toàn bộ
      `scanner_watermarks` vào file mốc cutover.
- [ ] Đếm `donations`, `transactions`, `light_actions`, `mint_allocations`,
      `pplp_mint_requests` (theo `status`), `profiles`.
- [ ] Snapshot số dư on-chain 3 ví hệ thống + treasury (BNB/USDT/CAMLY/FUN).
- **Rollback:** không có tác động.

## Bước 1 — Khoá tạo tài khoản mới (T+0, ĐÃ DỰNG SẴN 15/09)

Hai công tắc, phải bật **cả hai** mới kín:

- [ ] `UPDATE app_settings SET value='false'::jsonb WHERE key='signup_enabled';`
      → chặn 4 luồng tự dựng: email/mật khẩu (`auth-signup-send-confirm`),
      `sso-register`, OTP người mới (`sso-otp-verify`), đăng nhập ví người mới
      (`sso-web3-auth`). Cổng dùng chung: `supabase/functions/_shared/signupGate.ts`.
- [ ] Bật `disable_signup = true` ở cấu hình xác thực nền tảng → chặn đăng ký trực
      tiếp qua Auth API, magic link tạo người mới, và **Google OAuth người mới**.
- [ ] Verify sau khi bật: 4 luồng edge trả **403 `signup_disabled`**; Auth API trả
      **422 `signup_disabled`**. (Kết quả kiểm thử 15/09 lưu ở
      `docs/audit/signup-gate-verify-20260915/RESULT.md`.)
- Không chạm: đăng nhập tài khoản cũ, gộp tài khoản (`sso-merge-*`), admin tạo tay.
- **Rollback:** đặt cờ về `true` + `disable_signup = false` (hiệu lực ngay, không deploy).

## Bước 2 — Dựng deposit từ chuỗi tới sát cutover (T+15')

- [ ] Chạy đối chiếu `alchemy_getAssetTransfers` cho toàn bộ ví EVM giám sát
      (1.037 ví, ~1.037 lượt gọi, ~0,41% hạn mức tháng) từ mốc watermark tới head.
- [ ] Bắt buộc **Preview** trước (`admin_backfill_candidates`), báo cáo 3 số nghiệm thu:
      % đối chiếu Cloud (≥99%), tổng `amount_raw` theo từng token, danh sách swap
      khớp bộ ghi swap.
- [ ] Cha CONFIRM → ghi qua `_shared/ingestTransfer.ts` (idempotent `(tx_hash, user_id)`).
- [ ] Lặp lại lần cuối **sát thời điểm cutover** để khoảng mù = 0 block.
- [ ] BTC: giữ nguyên trạng freeze hiện hành, đối chiếu riêng.
- **Rollback:** không xoá dòng đã ghi; chạy lại chỉ bổ sung, không nhân đôi.

## Bước 3 — Copy các bảng phái sinh từ Cloud (T+1h)

Copy nguyên trạng (không tính lại) sang project đích:

- [ ] Light Score / PPLP: `light_actions`, `light_reputation`, `pplp_*` (mint requests,
      allocations, scores, tiers, caps, epoch config/metrics).
- [ ] Mint & claim: `mint_epochs`, `mint_allocations`, `pending_claims`,
      `financial_transactions`.
- [ ] Moderation & ban: `audit_logs`, `account_activity_logs`, `blacklisted_*`,
      `identity_*` (DID/SBT/trust/dispute), `user_roles`.
- [ ] Ví & tài chính: `donations`, `transactions`, `wallet_transfers`, `custodial_wallets`,
      `crypto_gifts`, `scanner_watermarks`.
- [ ] Sau copy: đối chiếu số dòng từng bảng nguồn ↔ đích, ghi vào báo cáo cutover.
- **Rollback:** project đích chưa nhận traffic, xoá và copy lại.

## Bước 4 — Chấp nhận mất dữ liệu trong gap (đã chốt với Cha)

Phần **phát sinh trong khoảng từ lúc copy tới lúc chuyển traffic** sẽ không được mang theo:

- Feed: bài viết, bình luận, phản ứng mới.
- Chat: tin nhắn mới, phòng mới.
- Light Score: điểm phát sinh mới (sẽ tự tính lại từ hành động sau cutover).
- Moderation: lệnh ban/mở ban thực hiện trong gap → phải làm lại tay sau cutover.
- Live: phiên live diễn ra trong gap và replay của phiên đó.

Bắt buộc: **thông báo trước trong app** cho toàn user (actor FUN.RICH) nêu rõ khoảng
thời gian bị ảnh hưởng, và **không mở live/không đăng chiến dịch** trong gap.

## Bước 5 — Chuyển traffic & mở lại đăng ký (T+X)

- [ ] Trỏ domain sang project đích, smoke test: đăng nhập cũ, xem lịch sử giao dịch,
      Light Score, thông báo, feed, chat.
- [ ] Bật lại đăng ký: `signup_enabled = true` + `disable_signup = false`.
- [ ] Bật cron ghi ở project đích, tắt cron ghi ở project nguồn (**đúng thứ tự này**).
- [ ] Chạy đối chiếu chuỗi 1 lần nữa ở project đích, xác nhận 0 dòng thiếu.
- **Rollback:** trỏ domain về project nguồn (cron nguồn chưa tắt cho tới khi đích ổn định 2h).

## Bước 6 — Hậu cutover

- [ ] Rotate secret Nhóm A (xem `INVENTORY.md` §7); 3 khoá mã hoá dữ liệu
      (`WALLET_ENCRYPTION_KEY`, `FUN_PROVIDER_POOL_MASTER_KEY_V1`,
      `APP_SECRETS_MASTER_KEY`) **giữ nguyên giá trị**, chỉ chuyển sang project đích.
- [ ] Quay lại 3 lỗ hổng tạm gác: `angel_ai_client` plaintext, redirect `localhost`,
      11 cron chưa giải thích.
- [ ] Đóng hồ sơ nợ kỹ thuật `account-deletion-cascade-triggers.md`.

## Ranh giới an toàn

1. Không freeze, không unpublish, không tắt cron nguồn trước khi đích ổn định.
2. Không xoá dữ liệu lịch sử ở cả 2 project.
3. Không ghi dữ liệu tài chính mà chưa qua Preview + 3 số nghiệm thu.
4. Chỉ khoá **tạo tài khoản mới** — người dùng cũ vẫn dùng bình thường.
