# Cửa sổ quan sát 7 ngày — BTC resolver shadow-log

- **Bắt đầu:** 2026-08-26 17:06:11+00 (mốc bật `btc_shadow_write_enabled`)
- **Kết thúc / báo cáo divergence:** 2026-09-02
- **Baseline:** chỉ tính dòng `created_at > 2026-08-26 17:06:11+00`.
  605 dòng cũ gắn nhãn `PRE_LOWERCASE_FIX_NOT_BASELINE` — loại khỏi thống kê.

## Trong 7 ngày: chỉ ghi log, KHÔNG báo cáo dồn dập

Báo sớm ngay (không đợi hết 7 ngày) khi gặp bất kỳ điều kiện nào:

1. `suspected_legacy_format_mismatch = true` — dấu hiệu còn lệch case ở đường nào chưa phát hiện.
2. `priority_account_flag = true` — chạm 1 trong 5 tài khoản ưu tiên:
   `angelkim`, `angelutopia`, `angelthienhanh68`, `angelgiau`, `angelqueanh`.
3. Bất kỳ warn/error/exception từ `dispatchBtcResolverShadowLog`
   (`supabase/functions/_shared/btcResolverShadowLog.ts`, prefix log `[btc-shadow-log]`).
   Tuyệt đối không nuốt lỗi âm thầm.

### Query tra sớm

```sql
-- 1 + 2: cờ cảnh báo trong cửa sổ sạch
select id, created_at, call_site, address, is_match,
       suspected_legacy_format_mismatch, priority_account_flag
from public.btc_resolver_shadow_log
where created_at > '2026-08-26 17:06:11+00'
  and (suspected_legacy_format_mismatch or priority_account_flag)
order by created_at desc;
```

Điểm 3 tra qua edge function logs của 7 điểm RC4:
`scan-btc-transactions`, `wallet-reconciliation-cron`, `btc-wallet-audit`,
`btc-history-repair`, `btc-ownership-reverify`, `btc-parser-v2`, `btc-discovery-v2`
(search `[btc-shadow-log]`).

## Đúng 02/09 — divergence report đầy đủ

Phải có:

1. Tỷ lệ `is_match = false` theo % trên tổng dòng trong cửa sổ sạch.
2. Phân loại theo `call_site` (mỗi call_site: tổng, mismatch, %).
3. Tách mismatch **liên quan legacy format** (`suspected_legacy_format_mismatch = true`)
   vs **mismatch vì lý do khác**.
4. Kết luận: đủ / chưa đủ điều kiện vào **Phase 3**.

```sql
select call_site,
       count(*) as total,
       count(*) filter (where not is_match) as mismatch,
       round(100.0 * count(*) filter (where not is_match) / count(*), 2) as mismatch_pct,
       count(*) filter (where not is_match and suspected_legacy_format_mismatch) as mismatch_legacy_fmt,
       count(*) filter (where not is_match and not suspected_legacy_format_mismatch) as mismatch_other
from public.btc_resolver_shadow_log
where created_at > '2026-08-26 17:06:11+00'
group by call_site
order by mismatch desc;
```
