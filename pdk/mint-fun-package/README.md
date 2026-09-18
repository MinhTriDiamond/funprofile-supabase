# FUN Money Mint Package — v2.5 cho LoveHUB.fun

Đóng gói **toàn bộ tính năng mint FUN Money** đang chạy trên FUN Profile để
áp dụng ngay vào LoveHUB.fun.

- **Light Score:** v2.5 đầy đủ (VVU + 3-tier PLS/NLS/LLS + IIS/IM + Stability)
- **Multisig attester:** share **cùng 3 signer** với FUN Profile qua webhook HTTPS
- **Budget:** **50 000 000 FUN / tháng riêng** cho LoveHUB (SoftCeiling)
- **Admin UI:** đủ 7 tab (Mint / Backlog / Allocation / User stats / Params / Treasury / Alerts)

## Cấu trúc

```
pdk/mint-fun-package/
├── contracts/
│   ├── ADDRESS.md              # địa chỉ FUN Money v1.2.1 + 6 action + attester
│   └── FUN_MONEY_ABI.json      # ABI dùng cho viem/wagmi
├── database/
│   ├── 01_schema.sql           # 15 bảng + GRANT + RLS + policies
│   ├── 02_functions.sql        # DB functions (has_role, auto_flip, ...)
│   ├── 03_seed.sql             # seed epoch_config 50M + pplp_v25_config
│   ├── 04_indexes.sql          # index bổ sung
│   └── CRON_SETUP.sql          # 9 cron job pg_cron
├── edge-functions/
│   ├── _shared/                # httpAuth, cors, pplp-crypto, pplp-eip712, ...
│   ├── pplp-mint-fun/          # 23 function tổng cộng
│   ├── pplp-evaluate/
│   ├── pplp-auto-submit/
│   ├── pplp-epoch-snapshot/
│   ├── pplp-v25-*/
│   ├── CONFIG_TOML_APPEND.toml # block append cho supabase/config.toml
│   └── SECRETS.env.example     # danh sách secret cần add_secret
└── frontend/
    ├── config/                 # pplp.ts (ABI + hằng số) + pplp-action-registry.ts
    ├── hooks/                  # useMintFun, useMintPreview, useClaimFun, ...
    └── components/
        ├── user/               # MintPreviewCard, ClaimRewardsCard, LightScoreDashboard, TierBadge, IIS, ...
        └── admin/              # PplpMintTab + 7 tab admin, BacklogStatusBanner, ...
```

## Thứ tự cài đặt trên LoveHUB

### 1. Chuẩn bị prerequisite
- Lovable Cloud đã bật, có `profiles` + `user_roles` + function `has_role()`.
- Đã có wallet auth (Wagmi + signature challenge, lowercase địa chỉ).

### 2. Database (theo thứ tự)
```
supabase/migrations/<ts>_mint_fun_01_schema.sql   ← copy 01_schema.sql
supabase/migrations/<ts>_mint_fun_02_functions.sql
supabase/migrations/<ts>_mint_fun_03_seed.sql
supabase/migrations/<ts>_mint_fun_04_indexes.sql
```
Chạy qua `supabase--migration` (approval bắt buộc).

### 3. Edge functions
- Copy toàn bộ `edge-functions/*` vào `supabase/functions/` của LoveHUB.
- Append block trong `CONFIG_TOML_APPEND.toml` vào `supabase/config.toml`.
- Cấu hình secret theo `SECRETS.env.example` (dùng `add_secret`).
- Deploy qua `supabase--deploy_edge_functions`.

### 4. Cron
Sau khi deploy edge, chạy `database/CRON_SETUP.sql` (thay `{PROJECT_REF}` +
`{ANON_KEY}` của LoveHUB).

### 5. Frontend
- Copy `frontend/config/*` → `src/config/`.
- Copy `frontend/hooks/*` → `src/hooks/`.
- Copy `frontend/components/user/*` → `src/components/wallet/` (hoặc route riêng).
- Copy `frontend/components/admin/*` → `src/components/admin/`.
- Mount admin panel dưới route `/admin` (yêu cầu `has_role('admin')`).
- Đảm bảo `src/config/pplp.ts` giữ hằng `MIN_POST_LENGTH_FOR_LS = 50`.

### 6. Cross-project attester webhook
Trên **FUN Profile**, bật edge `pplp-attester-sign-external`:
- Verify HMAC bằng `FUN_PROFILE_ATTESTER_SHARED_SECRET` (dùng chung LoveHUB).
- Whitelist origin `https://lovehub.fun` + project ref LoveHUB.
- Trả về 2/3 chữ ký EIP-712 cho payload đúng schema (user, action, amount, nonce, evidenceHash, chainId).

## Ràng buộc quan trọng

- **Token math**: luôn dùng string-based BigInt (`parseUnits/formatUnits`).
- **Wallet address**: lowercase trước khi lưu / so sánh.
- **6 action on-chain**: mọi mint mới phải map vào 1 trong 6 (fallback `INNER_WORK`).
- **EPOCH_CAP throttle**: 950 000 FUN / action / UTC day.
- **Ví ngoài** (`sender_id IS NULL`): KHÔNG tạo `gift_celebration` post.
- **Post text-only < 50 ký tự**: `is_reward_eligible = false`.
- **SoftCeiling 50M FUN/tháng** cho LoveHUB — cột `soft_ceiling` trong `epoch_config`.
- **Multisig share:** private key attester **KHÔNG** đặt bên LoveHUB.

## Kiểm thử sau khi cài

1. Post 1 bài text ≥ 50 ký tự → `light_actions` có row `is_eligible=true`.
2. Gọi `pplp-evaluate` → `raw_light_score` tăng, tier badge lên đúng.
3. Vào Admin → tab Mint → chạy `pplp-batch-processor` → tạo `mint_requests`.
4. `pplp-auto-submit` xin sig qua webhook FUN Profile → submit BSC → mint thành công.
5. User claim qua `useClaimFun` → nhận FUN token vào ví.

## Version
Package `mint-fun-package@2.5.0` — snapshot ngày 2026-07-25.
