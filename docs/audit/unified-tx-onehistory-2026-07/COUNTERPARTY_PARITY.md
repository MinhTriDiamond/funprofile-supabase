# COUNTERPARTY_PARITY — Batch 2.3.1 · Bước A1

**Ngày:** 2026-07-06 · **Chủ:** Angel AI · **Author:** Lovable

## Mục tiêu

Verify RPC `get_unified_transactions` (scope=`profile`) đã cung cấp đủ **counterparty enrichment** để `usePublicDonationHistoryV2` thay thế legacy hook mà không mất field hiển thị.

## Yêu cầu shape (từ legacy `DonationRecord`)

| Field cần | Nguồn RPC hiện tại | Status |
|---|---|---|
| `sender_username / display_name / avatar_url` | `sender_username` etc. trong `UnifiedTransactionRow` | ✅ có |
| `recipient_username / display_name / avatar_url` | `recipient_*` fields | ✅ có |
| `sender_id / recipient_id` | `sender_user_id / recipient_user_id` (fallback: `user_id + direction`) | ✅ có |
| `sender_address` | `sender_address` | ✅ có |
| `counterparty_address` (transfer) | Suy từ `sender_address` / `recipient_address` theo `direction` | ✅ derive được |
| `is_external` | `is_external` | ✅ có |
| Swap dual-amount (`from_*`, `to_*`) | `metadata.pair_symbol` + `metadata.pair_amount` | ✅ có (Batch 2.3.1 đã confirm) |
| **BTC-aux → user_id đối tác** | RPC enrichment tầng view (chưa verify runtime) | ⚠️ **cần probe** |

## Verification plan

1. **QA users:** `father`, `angelthuha`, `baokim86` (3 profile có mix BTC/FUN/CAMLY/swap).
2. Chạy song song 2 hook cho từng user (legacy + V2) qua **ShadowProbe** hiện có → nếu `count_mismatch` hoặc `sum_mismatch` = 0 trong 48h thì parity đạt.
3. Riêng BTC external in-txs (`chain=btc`, `is_external=true`): mở query manual so `sender_user_id` từ RPC vs `profile_btc_aux_addresses.verified=true` join trong hook legacy. Nếu RPC KHÔNG populate → mở migration nhỏ ở batch riêng (không nằm trong 2.3.1).

## Kết luận sơ bộ

- 8/9 field shape đã sẵn sàng từ RPC — **KHÔNG cần migration `v_unified_transactions_primary`** trong batch này.
- BTC-aux enrichment còn nghi vấn → theo dõi qua shadow probe. Nếu diff > 0.5% liên quan BTC → mở PR migration nhỏ ở Batch 2.3.2 (LEFT JOIN `profile_btc_aux_addresses WHERE verified=true`).

## Gate cutover

- Parity ≥ 99% dòng, 48h zero-diff qua `tx_shadow_diffs` cho surface `public_profile_history`.
- Diff còn lại có nguyên nhân documented ở `SHADOW_PROBE_LOG.md`.
