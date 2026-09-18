# BTC shadow-log — nguồn sự thật của cờ & wiring 7 điểm RC4

Cập nhật: 2026-08-26.

## 1. Cờ `btc_shadow_write_enabled` — CHỈ 1 nguồn thật

| Bảng | Trạng thái | Ghi chú |
|---|---|---|
| `public.system_config`, key `btc_shadow_write_enabled`, value `{"enabled": bool}` | **NGUỒN THẬT** | Đây là bảng duy nhất code đọc (`supabase/functions/_shared/btcResolverShadowLog.ts` → `isBtcShadowWriteEnabled`). |
| `public.app_settings` | **KHÔNG DÙNG** | Không có row nào cho key này; không có code nào đọc cờ shadow-log từ đây. Nếu ai đó tạo row ở đây, nó là **rác**, không có tác dụng. |

Bật/tắt đúng cách:

```sql
UPDATE public.system_config
SET value = '{"enabled": false}'::jsonb
WHERE key = 'btc_shadow_write_enabled';
```

Cache trong helper: 10 giây (`SHADOW_FLAG_CACHE_MS`), nên thay đổi cờ có hiệu lực chậm nhất ~10s trên mỗi instance edge đang sống.

Fail-safe: đọc cờ lỗi / throw / không có row / value khác `{"enabled": true}` ⇒ **KHÔNG ghi**.

## 2. Wiring — 7 điểm RC4 dùng CHUNG 1 helper

Tất cả 7 điểm gọi qua `dispatchBtcResolverShadowLog()` của
`supabase/functions/_shared/btcResolverShadowLog.ts` — không điểm nào tự gọi RPC
`log_btc_resolver_shadow_comparison` trực tiếp. Vì vậy guard cờ vá 1 chỗ là đủ cho cả 7,
nhưng **phải redeploy cả 7** vì `_shared` được bundle theo từng function lúc deploy.

| # | Function | Call sites | Đã redeploy sau khi vá guard |
|---|---|---|---|
| 1 | `scan-btc-transactions` | 2 (dòng 331, 361) | ✅ |
| 2 | `wallet-reconciliation-cron` | 2 (dòng 213, 225) | ✅ |
| 3 | `btc-wallet-audit` | 1 (dòng 191) | ✅ |
| 4 | `btc-history-repair` | 2 (dòng 174, 187) | ✅ |
| 5 | `btc-ownership-reverify` | 4 (dòng 374, 426, 520, 581) | ✅ |
| 6 | `btc-parser-v2` | 1 (dòng 113) | ✅ |
| 7 | `btc-discovery-v2` | 1 (dòng 160) | ✅ |

## 3. Verify runtime (2026-08-26)

- Trước vá: `count(*) = 605`, `max(created_at) = 2026-08-26 01:30:06.962412+00`, 605/605 đã gắn nhãn
  `PRE_LOWERCASE_FIX_NOT_BASELINE`.
- Sau khi deploy 7 function: `scan-btc-transactions` có nhiều lần boot thật (log 15:15Z, 15:20Z).
- Sau vá: `count(*) = 605` (không đổi), `max(created_at)` vẫn `2026-08-26 01:30:06+00`,
  số dòng `created_at > 15:00Z` = **0**.
- Không có warn `[btc-shadow-log]` trong log ⇒ đường đi là "đọc cờ thành công, cờ = false, bỏ ghi",
  không phải đường lỗi.

## 4. Điều kiện mở cửa sổ quan sát chính thức

Chưa được bật lại cờ cho tới khi: (a) vá xong lowercase vô điều kiện ở toàn bộ đường ghi BTC,
(b) grep sạch, (c) CTO công bố mốc 7 ngày mới. 605 dòng hiện có **không** được dùng làm baseline.
