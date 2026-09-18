# BTC lowercase vô điều kiện — vá bước 3/4/5

Ngày: 2026-08-26. Trạng thái: **đã vá + deploy**, cờ `btc_shadow_write_enabled` **VẪN FALSE**.

## 1. Chuẩn duy nhất (SSOT)

- DB: `public.btc_normalize_address()` (migration `20260823124512_…`).
- Edge: `supabase/functions/_shared/btcAddress.ts` → `btcNormalizeAddress()`, `detectBtcAddressType()`.
- FE: `src/lib/btc/btcOwnershipResolver.ts::btcNormalizeAddress()` +
  `src/lib/btc/addressNormalize.ts::normalizeAddressForCompare()` (dữ liệu trộn chain) và
  `detectBtcAddressType()`.

Rule: bech32 `bc1…` → lowercase (BIP-173). Legacy `1…`/`3…` → **chỉ trim**, giữ nguyên case.

## 2. Các vị trí đã vá

| File | Vị trí cũ | Sau vá |
|---|---|---|
| `scan-btc-transactions/index.ts` | `normalizeBtcAddr()` (dòng 33) | gọi `btcNormalizeAddress` |
| `btc-wallet-audit/index.ts` | `norm()` (34) | gọi `btcNormalizeAddress` |
| `btc-history-repair/index.ts` | `lower()` (35) | gọi `btcNormalizeAddress` |
| `btc-parser-v2/resolver.ts` | 19, 34, 56, 77, 99, 103 | 6/6 dùng helper |
| `btc-parser-v2/classifier.ts` | `lc()` (18) | gọi `btcNormalizeAddress` |
| `btc-discovery-v2/index.ts` | 61 | helper |
| `btc-discovery-v2/guards.ts` | `detectAddressType()` (18), 48 | `detectBtcAddressType` + helper |
| `btc-ownership-reverify/index.ts` | 69, 91, 114, 134, 136, 152 | 6/6 dùng helper |
| `_shared/btcProviderManager.ts` | `detectAddrType()` (81), cache key (158) | `detectBtcAddressType` + helper |
| `src/hooks/usePublicDonationHistory.ts` | 319, 344, 365, 370 | `normalizeAddressForCompare` |
| `src/components/donations/gift-dialog/BtcWalletPanel.tsx` | `detectAddressKind()` (30) | `detectBtcAddressType` |

Đã vá trước đó: `wallet-reconciliation-cron` (`btcNorm`, 6 vị trí), `useWatchedWallets.ts`,
`btc-ownership-verify`.

## 3. Grep xác nhận (toàn repo, loại docs + test)

```
### GREP 1: toLowerCase trên field/biến địa chỉ BTC
rg -e '(btc_address|scriptpubkey_address|btcAddress|btcAddr|counterparty_address).{0,60}toLowerCase' \
   -e 'toLowerCase.{0,40}(btc_address|scriptpubkey_address)' src supabase pdk scripts e2e
→ 0 kết quả

### GREP 2: toLowerCase còn lại trong các file BTC-specific
supabase/functions/_shared/btcAddress.ts:15      /^bc1[a-z0-9]+$/i.test(t) ? t.toLowerCase() : t   ← CHUẨN
src/lib/btc/addressNormalize.ts:12               /^0x…$/i → lowercase (EVM)                        ← CHUẨN
src/lib/btc/btcOwnershipResolver.ts:26           bech32-only lowercase                             ← CHUẨN
supabase/functions/btc-ownership-verify/index.ts:64  bech32-only lowercase                          ← CHUẨN
supabase/functions/btc-parser-v2/index.ts:92,95   tx_hash (hex, case-insensitive)                   ← không phải địa chỉ
supabase/functions/btc-discovery-v2/guards.ts:62  username                                          ← không phải địa chỉ
supabase/functions/btc-parser-v2/resolver.ts:59   source string                                     ← không phải địa chỉ
```

⇒ **0 vị trí lowercase vô điều kiện cho địa chỉ BTC.** Các hit còn lại chỉ là tx_hash,
username, source, địa chỉ EVM, hoặc chính hàm chuẩn có điều kiện bech32.

## 4. Deploy

Đã deploy 6 function bị ảnh hưởng bởi edit trực tiếp và `_shared/btcAddress.ts`:
`scan-btc-transactions`, `btc-wallet-audit`, `btc-history-repair`, `btc-parser-v2`,
`btc-discovery-v2`, `btc-ownership-reverify`.

`_shared/btcProviderManager.ts` chỉ được import bởi `btc-ownership-reverify` (grep xác nhận)
⇒ đã nằm trong danh sách trên. `wallet-reconciliation-cron` không thay đổi ở lần này
(đã vá + deploy đợt trước). Typecheck `tsgo` sạch; test `btc-ownership-resolver` +
`btc-ownership-verify-edge` 22/22 pass.

## 5. Chưa làm (chờ CTO)

- **KHÔNG bật** `system_config.btc_shadow_write_enabled` (vẫn `{"enabled": false}`).
- 605 dòng shadow-log cũ vẫn gắn nhãn `PRE_LOWERCASE_FIX_NOT_BASELINE`, không dùng làm baseline.
- Cửa sổ quan sát 7 ngày MỚI chỉ bắt đầu sau khi CTO xác nhận grep sạch và công bố mốc.
