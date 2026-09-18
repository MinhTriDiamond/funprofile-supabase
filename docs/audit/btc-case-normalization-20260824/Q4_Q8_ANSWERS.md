# BTC case-normalization — trả lời câu 1–8 (đợt 2)

Ngày: 2026-08-24.

## 1. Dòng LEGACY toàn lowercase trong dữ liệu giao dịch → 0

| Nguồn | Dòng khớp `^[13][a-z0-9]{25,39}$` VÀ toàn lowercase |
|---|---|
| `transactions.from_address` | 0 |
| `transactions.to_address` | 0 |
| `donations.sender_address` | 0 |
| `donations.recipient_address` | 0 |

⇒ **Chưa có dòng dữ liệu giao dịch nào bị hỏng qua nhánh `:189/:193`.** Không có ví dụ raw
để liệt kê.

## 2. Khả năng phục hồi

Không áp dụng (0 dòng ở bước 1). Riêng 2 dòng `profiles.btc_address` đã biết: vẫn **mất
vĩnh viễn** — không tìm được case gốc ở bất kỳ nguồn nào (`custodial_wallets` không lưu địa chỉ
BTC; cột duy nhất là `wallet_address` cho EVM).

## 3. Đã sửa `:189/:193` (chỉ chặn hỏng thêm, KHÔNG backfill data cũ)

`supabase/functions/wallet-reconciliation-cron/index.ts`: thêm helper `btcNorm()` mirror
`public.btc_normalize_address` (bech32 → lowercase; legacy → chỉ trim) và thay **6 vị trí**:
`:150/:151` (btcMap), `:164/:165` (father addrs), `:189` (`fromAddr`), `:193` (`toAddr`).
Các vị trí EVM giữ nguyên `toLowerCase()`. `src/hooks/useWatchedWallets.ts:54` cũng đã sửa
key dedupe cho chain `btc`.

## 4. Quy mô ví legacy đang theo dõi

| Nguồn | Legacy (`1…`/`3…`) | Bech32 |
|---|---|---|
| `profiles.btc_address` | 2 (chính là 2 dòng hỏng) | 141 |
| `profile_btc_aux_addresses` | **355** | phần còn lại |

`custodial_wallets` **không có cột địa chỉ BTC** (chỉ `wallet_address` EVM) ⇒ không liên quan.

⇒ **355 ví aux legacy** đang bị query sai địa chỉ bởi bug này (trước khi vá). Toàn bộ 355
dòng aux đều **giữ đúng case trong DB** (0 dòng all-lower) — dữ liệu nguồn sạch, chỉ khâu
query bị hạ hoa in-memory.

## 5. Thử gọi thật mempool.space với địa chỉ đã lowercase

Mẫu thật (aux legacy P2SH):

```
orig  = 3KxvSxUQqHvGmLCK9UAzbpxhuhWbyJbHap  → HTTP 200
lower = 3kxvsxuqqhvgmlck9uazbpxhuhwbyjbhap  → HTTP 400 "Invalid Bitcoin address"
```

⇒ **Trả LỖI, KHÔNG trả nhầm ví khác.** Đây là **bỏ sót quét** (355 ví aux legacy không được
quét), **không phải nguồn corrupt dữ liệu mới**. Phù hợp với kết quả bước 1 (0 dòng hỏng).

## 6. Mọi đường ghi vào `profiles.btc_address`

Grep toàn repo (`src`, `supabase/functions`, `supabase/migrations`, `scripts`):

| Vị trí | Loại | Validate Base58 case-sensitive? |
|---|---|---|
| `src/components/profile/EditProfile.tsx:350` (`updateData.btc_address = …`) | UPDATE (client, PostgREST) | **CÓ** — regex Base58 case-sensitive ở `:308`; hơn nữa đang bị **khoá** bởi trigger `app_settings.btc_address_updates_enabled = false` (migration `20260822035722…`) |
| Migration `20260822035722…:44` | trigger `BEFORE UPDATE OF btc_address` | khoá đổi địa chỉ (kill-switch) |
| Migration `20260611144332…:116` | trigger audit `BEFORE UPDATE OF … btc_address` | chỉ audit |
| Migration `20260402061031…` | `normalize_wallet_addresses` (lịch sử) | — nguồn lowercase LỊCH SỬ tiềm năng, đã bị thay bởi rule mới |

**Không có** đường ghi nào khác: không edge function, không admin tool, không script backfill,
không KYC/wallet-connect flow nào `insert/update` cột này. Các nơi còn lại chỉ **đọc**
(`btc-wallet-audit`, `btc-history-repair`, `btc-ownership-*`, `btc-parser-v2/resolver`,
`wallet-reconciliation-cron`, các component FE).

## 7. P0 mới? → KHÔNG

Không tìm thấy đường ghi nào thiếu validate đang hoạt động ⇒ **không có P0 mới**, không có
nguy cơ đang hỏng data user khác lúc này (cột còn đang bị kill-switch khoá).

## 8. Nguồn gốc 2 dòng hỏng

**KHÔNG XÁC ĐỊNH ĐƯỢC ĐƯỜNG GHI.** Hai dòng (`phongyknb984t341b` 16/06/2026,
`angelthaihoa` 25/06/2026) là `old_value = NULL` → lowercase ngay từ lần khai đầu, nhưng không
đường ghi hiện tại nào tạo ra được kết quả đó (EditProfile chặn bằng regex case-sensitive).
Ứng viên duy nhất còn lại về mặt lịch sử là hàm `normalize_wallet_addresses`
(migration `20260402061031…`) — **chưa xác minh**, không suy diễn thêm.

Chưa làm gì với 2 tài khoản này; chờ Cha quyết.
