# BTC Resolver Phase 2 — Divergence Report (cửa sổ 7 ngày)

- Cửa sổ: **2026-08-26 17:06:11+00 → 2026-09-02 17:06:00+00**
- Baseline: chỉ dòng `created_at > 2026-08-26 17:06:11+00`. 605 dòng cũ `PRE_LOWERCASE_FIX_NOT_BASELINE` bị loại.
- Cờ `system_config.btc_shadow_write_enabled` = `{"enabled": true}` (vẫn bật).

## 1. Tổng dòng trong cửa sổ

| Chỉ số | Giá trị |
|---|---|
| Tổng dòng | **524** |
| Dòng đầu / cuối | 2026-08-26 17:06:23+00 / **2026-09-01 06:02:31+00** |
| `is_match = true` | 240 (45,80%) |
| `is_match = false` | **284 (54,20%)** |
| `suspected_legacy_format_mismatch = true` | **0** |
| `priority_account_flag = true` | 67 |

Lưu ý: không có dòng nào sau 01/09 06:02 (≈40h cuối im lặng) — scan BTC không phát sinh giao dịch mới trong giai đoạn đó.

## 2. Phân loại mismatch theo call_site

| call_site | Tổng | Mismatch | % | do legacy-format | lý do khác |
|---|---|---|---|---|---|
| scan-btc-transactions:recipient | 292 | 140 | 47,95 | 0 | 140 |
| scan-btc-transactions:sender | 222 | 134 | 60,36 | 0 | 134 |
| wallet-reconciliation-cron:recipient | 5 | 5 | 100,00 | 0 | 5 |
| wallet-reconciliation-cron:sender | 5 | 5 | 100,00 | 0 | 5 |

5/7 điểm RC4 **không phát sinh dòng nào**: `btc-wallet-audit`, `btc-history-repair`,
`btc-ownership-reverify`, `btc-parser-v2`, `btc-discovery-v2` ⇒ coverage quan sát chưa đủ 7 điểm.

## 3. Bản chất 284 mismatch — KHÔNG PHẢI xung đột chủ ví

| Loại | Số dòng |
|---|---|
| `resolver_user_id IS NULL` trong khi legacy có chủ | **284 / 284 (100%)** |
| resolver trả user KHÁC legacy | **0** |
| `legacy_user_id IS NULL` | 0 |

Root cause đã xác định: `resolve_btc_owner()` đọc `public.btc_address_ownership_history`, bảng này
**đang có 0 dòng** (`btc_ownership_snapshot` cũng 0 dòng). Vì vậy resolver luôn trả NULL.
30 địa chỉ liên quan đều là **bech32** và đều tồn tại ở `profiles.btc_address` (1 địa chỉ ở
`profile_btc_aux_addresses`) ⇒ dữ liệu chủ ví có thật, chỉ **chưa được backfill vào ownership history**.

⇒ 54,20% mismatch là **thiếu dữ liệu resolver**, không phải resolver gán sai người.

## 4. suspected_legacy_format_mismatch

**0 dòng.** Không còn dấu vết hạ hoa địa chỉ legacy ở bất kỳ đường ghi nào trong cửa sổ.
(Trong cửa sổ, 100% địa chỉ ghi log là bech32; các dòng legacy `1…/3…` đã verify giữ nguyên case ở
`FLAG_ON_VERIFY.md` ngày 26/08.)

## 5. priority_account_flag = 67 dòng

| username (legacy) | call_site | Số dòng | Mismatch | Từ | Đến |
|---|---|---|---|---|---|
| angelkim | scan-btc-transactions:sender | 23 | 23 | 27/08 17:20 | 01/09 06:02 |
| angelkim | scan-btc-transactions:recipient | 20 | 20 | 27/08 00:18 | 01/09 06:02 |
| angelgiau | scan-btc-transactions:recipient | 13 | 13 | 30/08 05:35 | 30/08 05:35 |
| angelgiau | scan-btc-transactions:sender | 7 | 7 | 27/08 05:06 | 30/08 05:35 |
| angelkim | wallet-reconciliation-cron:recipient | 2 | 2 | 27/08 07:00 | 30/08 23:00 |
| angelkim | wallet-reconciliation-cron:sender | 2 | 2 | 27/08 07:00 | 30/08 23:00 |

Chỉ 2/5 tài khoản ưu tiên bị chạm (`angelkim`, `angelgiau`); `angelutopia`, `angelthienhanh68`,
`angelqueanh`: 0 dòng. Cả 67 dòng đều thuộc loại `resolver_NULL` nêu ở mục 3.

### Notification admin — hoạt động nhưng dedup 24h RÒ

Trong cửa sổ: 238 notification `btc_shadow_priority_alert` cho 7 admin.

| Ngày | Notif | Admin | Notif/admin |
|---|---|---|---|
| 27/08 | 7 | 7 | 1 ✅ |
| 28/08 | 7 | 7 | 1 ✅ |
| 30/08 | 91 | 7 | 13 ❌ |
| 01/09 | 133 | 7 | 19 ❌ |

Nguyên nhân: guard `NOT EXISTS (... created_at > now() - 24h)` chạy trong **row-level trigger**;
khi scanner ghi nhiều dòng shadow-log trong cùng một statement/lô gần như đồng thời
(13 dòng trong 0,14 giây ngày 30/08), mỗi row-trigger dùng snapshot chưa thấy notification do
row-trigger trước vừa chèn ⇒ spam. **P2, cần vá bằng dedup theo advisory lock hoặc unique index
partial theo (user_id, type, ngày).** Không ảnh hưởng dữ liệu tài chính.

## 6. Lỗi bị nuốt âm thầm

- `dispatchBtcResolverShadowLog` là **fail-open có chủ đích**: mọi lỗi chỉ `console.warn("[btc-shadow-log] …")`, không throw.
- Tra log edge của `scan-btc-transactions` và `wallet-reconciliation-cron` với từ khoá `btc-shadow-log`: **0 kết quả** ⇒ không có warn/exception nào trong phạm vi log còn lưu.
- Không có dấu hiệu ghi log thất bại: 524 dòng ghi thành công, `suspected_legacy_format_mismatch` được trigger tính đủ.

## 7. Kết luận — **NO-GO cho Phase 3**

Không phải vì resolver gán sai, mà vì **resolver chưa có dữ liệu để gán**:
`btc_address_ownership_history` = 0 dòng ⇒ nếu chuyển giao dịch MỚI sang resolver ngay,
**54,20% giao dịch BTC mới sẽ mất attribution chủ ví** (bao gồm `angelkim`, `angelgiau`, `father`).

Điều kiện vào Phase 3 (theo thứ tự):

1. **Backfill `btc_address_ownership_history`** từ `profiles.btc_address` + `profile_btc_aux_addresses`
   (kèm `verified_at` hợp lý, `valid_to` NULL) — hạng mục chặn số 1.
2. Chạy lại quan sát **≥7 ngày sạch sau backfill**, mục tiêu `is_match=false ≤ 1%` và
   **0 dòng resolver trả user KHÁC legacy**.
3. Bật quan sát cho 5 call_site còn im lặng (audit/repair/reverify/parser-v2/discovery-v2)
   để coverage đủ 7 điểm RC4.
4. Vá dedup notification 24h (P2) trước khi mở cửa sổ mới, tránh spam 19 notif/admin/ngày.
