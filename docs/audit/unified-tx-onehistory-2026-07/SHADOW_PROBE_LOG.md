# SHADOW_PROBE_LOG — surface `public_profile_history`

**Kick-off:** 2026-07-06 · **Gate:** 48h zero-diff → `app_settings.unified_public_history_ready=true`

## Format entry

| Ngày (UTC) | Sample | Diff (count) | Diff (sum) | Ghi chú |
|---|---|---|---|---|

## Log

| 2026-07-06 12:xx | probe mounted | — | — | Kick-off cho `HistoryTab` + `WalletTransactionHistory`, sampling ≥ 0.1. |
| 2026-07-06 (Cha duyệt) | — | — | — | **Cutover per Cha directive (a)**: bypass 48h probe gate vì `unified_tx_read_enabled` đã ON và unified pipeline stable trên các surface khác. Bật `app_settings.unified_public_history_ready = true`; 2 consumer swap sang V2 qua `usePublicDonationHistoryAuto`. Fallback flag giữ 7 ngày làm kill-switch. |

## Root-cause playbook


- **count_mismatch > 0.5%**: kiểm dedup rule (tx_hash+token) — nếu unified thấp hơn, legacy có thể đang double-count swap multi-leg.
- **sum_mismatch nhỏ**: decimal precision. Cast sang BigInt/Number(6dp) trước khi so sánh.
- **BTC-specific diff**: xem `COUNTERPARTY_PARITY.md` — nếu tập trung ở chain=btc external, cần migration BTC-aux JOIN.

## Tổng kết (sẽ update sau 48h)

_Chờ dữ liệu._
