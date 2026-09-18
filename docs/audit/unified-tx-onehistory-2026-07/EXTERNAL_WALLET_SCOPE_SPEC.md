# External Wallet Scope SPEC — SSOT cho watched wallets (Batch 2.4 · B2)

**Ngày:** 2026-07-06 · **Trạng thái:** DRAFT — chờ Cha duyệt.

## Bối cảnh

`useExternalWalletActivity` hiện gọi edge function `fetch-wallet-history` (BSC + BTC API trực tiếp). Đây là **read path song song** ngoài SSOT `v_unified_transactions_primary`, gây:

- 2 nguồn dữ liệu cho cùng 1 địa chỉ (khi user cũng có custodial wallet trùng).
- Không dùng chung filter/cache của Unified.
- Rủi ro rate-limit các provider (Etherscan / mempool).

## Đề xuất scope mới

Mở scope `external_wallet_watch` cho RPC `get_unified_transactions` + `get_unified_summary`.

### RPC signature (mở rộng, backward-compat)

```sql
-- Thêm scope 'external_wallet_watch' vào CHECK constraint hiện tại.
-- Tham số mới:
--   _watched_addresses text[]  -- danh sách địa chỉ lowercase (bắt buộc)
--   _watched_chains text[]     -- ['bsc','bsc_testnet','btc'] (optional; null=all)
```

Query engine sẽ WHERE:
```sql
(lower(sender_address) = ANY(_watched_addresses)
 OR lower(recipient_address) = ANY(_watched_addresses))
AND (_watched_chains IS NULL OR chain = ANY(_watched_chains))
```

### RLS / permission

- `security definer` — nhưng bên trong function **VERIFY** rằng mọi address trong `_watched_addresses` phải thuộc `user_watched_wallets` của `auth.uid()`. Nếu không → RAISE.
- Đây là dữ liệu **private của user watching** — không leak sang user khác.

## Migration plan (chưa apply)

```sql
-- 1) Extend get_unified_transactions signature (optional params).
-- 2) Trong body: nếu _scope='external_wallet_watch' → check ownership + query.
-- 3) Grant: giữ nguyên (function chỉ callable qua PostgREST bởi authenticated).
```

## Frontend

- File mới `src/hooks/useWatchedWalletHistoryV2.ts` wrap `useUnifiedTransactionHistory({ scope: 'external_wallet_watch', ... })`.
- Adapter map `UnifiedTransactionRow → ExternalTx` (shape hiện tại của `useExternalWalletActivity`).
- Cutover có cờ, deprecate edge `fetch-wallet-history` sau khi zero-diff 7 ngày.

## Acceptance

1. Ownership verification block truy cập address không thuộc caller (unit test SQL).
2. Zero-diff giữa edge function + RPC cho 3 QA wallets trong 48h.
3. Bundle size giảm ≥ 4KB gzip sau khi xoá edge invoke.

## Ngoài phạm vi

- Xoá edge function `fetch-wallet-history` (làm sau khi cutover ổn định).
- Realtime polling: giữ refetch 20s như hiện tại (không đổi UX).
