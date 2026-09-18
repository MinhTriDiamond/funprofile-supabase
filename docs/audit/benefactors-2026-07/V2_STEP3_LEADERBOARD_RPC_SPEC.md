# Benefactor Leaderboard V2 — RPC SPEC (Batch 2.4 · B1)

**Ngày:** 2026-07-06 · **Trạng thái:** DRAFT — chờ Cha duyệt trước khi mở migration.

## Bối cảnh

`useBenefactorLeaderboard` hiện đọc `get_benefactor_leaderboard` + `get_recipient_leaderboard` + `get_donation_history`. Chưa thống nhất SSOT, không hỗ trợ dimension USD / Token / Ecosystem tách biệt, và BXH BTC bị lỗi ownership (chờ G5A/G5/G6).

Batch 2.4 → V2 dùng 1 RPC duy nhất, đọc từ SSOT (`v_unified_transactions_primary` + `donations.usd_value`).

## RPC signature

```sql
create or replace function public.get_benefactor_leaderboard_v2(
  _dimension text default 'usd',          -- 'usd' | 'token' | 'ecosystem'
  _token_symbol text default null,        -- required khi dimension='token'
  _time_range text default 'all',         -- 'day' | 'week' | 'month' | 'year' | 'all'
  _include_btc boolean default false,     -- BẬT sau khi G6 cutover
  _limit int default 50,
  _offset int default 0
)
returns table (
  user_id uuid,
  rank int,
  username text,
  display_name text,
  avatar_url text,
  primary_score numeric,          -- USD hoặc token amount hoặc composite ecosystem score
  totals_by_token jsonb,          -- { FUN: {amount, usd, count}, ... }
  total_transactions int,
  total_light_score numeric,
  updated_at timestamptz
)
security definer
stable
```

## Dimension matrix

| Dimension | primary_score | Filter | Ghi chú |
|---|---|---|---|
| `usd` | `SUM(donations.usd_value)` | tất cả token (loại BTC nếu `_include_btc=false`) | mặc định |
| `token` | `SUM(amount_decimal)` cho `_token_symbol` | 1 token cụ thể | required `_token_symbol` |
| `ecosystem` | Weighted: `0.5*usd + 0.3*log(1+tx_count) + 0.2*light_score` | tất cả | dùng cho BXH tổng |

## Index cần thiết

```sql
-- Đã có (Phase 7B): idx_donations_sender_created, idx_donations_recipient_created
-- Mới:
create index if not exists idx_donations_usd_created
  on public.donations (created_at desc, usd_value)
  where filter_status is null or filter_status <> 'filtered_spam';

create index if not exists idx_donations_sender_token_created
  on public.donations (sender_id, token_symbol, created_at desc)
  where filter_status is null or filter_status <> 'filtered_spam';
```

## Filter matrix

| Filter | RPC param | Ghi chú |
|---|---|---|
| Thời gian | `_time_range` | window UTC dựa trên `now()` |
| Token cụ thể | `_token_symbol` + `_dimension='token'` | |
| Include BTC | `_include_btc` | mặc định `false` cho tới sau G6 |
| External wallet | (ẩn) | luôn loại `is_external=true` để tránh farm |

## Cache policy

- FE: React Query `staleTime = 5 min`, `gcTime = 15 min`.
- Materialized view **KHÔNG** dùng ở phase này (data cập nhật < 60s là bắt buộc). Nếu p95 > 300ms → xem xét mv refresh 5'.

## Acceptance

1. RPC pass linter (`security definer` + `search_path=public`).
2. `EXPLAIN` cho query `_time_range='month'`, `_limit=50` phải hit index seq_scan=0.
3. Unit test SQL: 5 case (usd, token=FUN, token=CAMLY, ecosystem, empty range).
4. Zero-diff cho 3 user QA khi cross-check với `get_benefactor_leaderboard` legacy trong dimension USD.

## Ngoài phạm vi

- BTC dimension: bật sau G6.
- Recipient leaderboard V2: SPEC riêng (Batch 2.4 phần 2).
- Frontend rewrite `useBenefactorLeaderboard`: chờ SPEC được duyệt.
