# M6D · SSOT_SPEC — Unified Statistics Single Source of Truth

Ngày: 2026-07-01 · Chế độ: **Spec/Draft** (chưa apply, chưa implement view/RPC).

---

## 1. Nguyên tắc SSOT

Mọi con số SUM / COUNT / GROUP BY / USD / ranking hiển thị trên FUN Profile chỉ được lấy từ **1 view duy nhất**:

```
public.v_unified_statistics
```

… được xây trên `v_unified_transactions_primary` (Unified Transactions SSOT) + `tokens_registry` (pricing SSOT).

Không component/hook/RPC nào được đọc trực tiếp `donations`, `transactions`, `wallet_transfers`, `swap_transactions` để aggregate nữa.

## 2. Cột chuẩn của `v_unified_statistics`

```
row_key             text     -- id unified transaction
user_id             uuid
counterparty_user_id uuid
tx_hash             text
chain               text
token_symbol        text
direction           text     -- 'in'|'out'|'internal'|'unknown'
tx_type             text     -- 'gift'|'transfer'|'external'|'swap'
amount              numeric  -- đã parse về numeric, chuẩn hóa decimals
amount_usd          numeric  -- (amount × price_usd_at_time) — dùng historical price
price_usd_at_time   numeric  -- lấy từ price_usd_at_donation nếu có, fallback tokens_registry.default_price
price_source        text     -- 'donation_snapshot'|'registry_default'|'unpriced'
is_eligible_benefactor boolean -- eligibility rules cho leaderboard
occurred_at         timestamptz
is_external         boolean
status              text
```

## 3. Eligibility rules cho `is_eligible_benefactor`

Row được tính vào Benefactors Leaderboard ⇔ đủ tất cả:

1. `tx_type = 'gift'` (KHÔNG tính external/transfer/swap).
2. `direction = 'out'` (đếm phía sender).
3. `status = 'confirmed'`.
4. `counterparty_user_id IS NOT NULL` (user → user, không phải claim reward).
5. `is_external = false`.
6. `chain` ∈ {'bsc', 'btc'} (loại testnet 'bsc_testnet').
7. `token_symbol` ∈ allowlist trong `tokens_registry` (KYC price).
8. `price_source ≠ 'unpriced'` (phải có giá).
9. `amount_usd <= tokens_registry.max_single_usd` (chống outlier CAMLY $359M).

## 4. RPC contract mới (4 hàm)

```
get_unified_summary_v2(_user_id uuid, _from timestamptz, _to timestamptz, _tx_type text[])
  → { total_in_usd, total_out_usd, tx_count, by_token jsonb }

get_unified_leaderboard(_scope text /* 'benefactor' | 'recipient' */,
                        _from timestamptz, _to timestamptz, _limit int)
  → rows { rank, user_id, username, display_name, total_usd, tx_count }

get_unified_global_stats(_from timestamptz, _to timestamptz)
  → { total_gift_usd, total_gift_count, unique_senders, unique_recipients }

get_unified_token_breakdown(_scope text, _user_id uuid, _from timestamptz, _to timestamptz)
  → rows { token_symbol, direction, amount, amount_usd, tx_count }
```

Mỗi RPC:
- `SECURITY INVOKER` + kiểm quyền admin cho scope 'global'.
- Chỉ đọc `v_unified_statistics`.
- Trả JSON stable schema.

## 5. Migration plan (chưa apply)

1. `20xx_tokens_registry_pricing_columns.sql` — thêm `default_price_usd`, `price_updated_at`, `max_single_usd`, `is_leaderboard_eligible`.
2. `20xx_v_unified_statistics.sql` — CREATE VIEW.
3. `20xx_stats_rpcs_v2.sql` — CREATE 4 RPC.
4. FE migrate hook (M6E): `useBenefactorLeaderboard`, `useDashboardMetrics`, `useProfileStats` → gọi RPC v2.
5. Sau 7 ngày ổn định: xóa RPC cũ (`get_benefactor_leaderboard`, `get_donation_global_stats`, v.v.).

## 6. Backward-compat

Trong quá trình migrate, RPC v2 chạy song song RPC cũ; FE có flag `unified_stats_read_enabled` (default `false`). Chỉ bật sau khi Cha duyệt Go/No-Go M6E.

## 7. Câu hỏi cần Cha chốt trước khi implement

1. Threshold `max_single_usd` cho CAMLY / FUN / TONCOIN?
2. Testnet có nằm trong leaderboard chưa? (Spec đang loại; xác nhận.)
3. Historical price source: dùng `price_usd_at_donation` (snapshot lúc insert) hay backfill lại từ CoinGecko historical? Audit benefactors-2026-07 khuyên dùng historical CoinGecko cho 9 dòng CAMLY sai — cần chốt policy.
4. Có tính swap vào total của user không? (Spec đang KHÔNG tính vào leaderboard, nhưng CÓ tính vào `get_unified_summary_v2` khi user filter tx_type='swap'.)
