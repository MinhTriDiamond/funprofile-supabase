# Quan sát scanner-rpc-tick sau 3 bản vá — mở 03/09/2026, đóng khi đủ 24-48h

## 1. Đường triển khai 3 bản vá
- Migration file: `supabase/migrations/20260903230948_7f5a6d8c-3f2a-447a-a9f1-0a65db38cf1d.sql`
  (CHECK constraint `erc20_getlogs_error` + bảng `scanner_tick_log` + GRANT + RLS admin + 2 index).
- Timeout 12s/20s/55s là code edge function, KHÔNG phải SQL:
  `_shared/rpcClient.ts` (`RPC_TIMEOUT_MS=12_000`, `RPC_LOGS_TIMEOUT_MS=20_000`),
  `scanner-rpc-tick/index.ts` (`NATIVE_BUDGET_MS=55_000`).
- Đảo thứ tự "đối chiếu DB trước → advance watermark sau" cũng là code (`pendingAdvances`).
- Migration bổ sung 04/09: cột `scanner_tick_log.rpc_endpoint_stats jsonb` (theo dõi từng endpoint).

## 2-3. Số liệu tick (cập nhật liên tục)
Xem `select * from scanner_tick_log order by created_at desc`.
- Trước vá: 2 tick 133s và 138s (bị kill mốc 150s), rpc_healthy 6/9.
- Sau vá: 24 tick liên tiếp `ok=true`, duration 1,4s–39,2s (điển hình 13,5s), rpc_healthy **9/9**.
- ⇒ "6/9" KHÔNG phải baseline: đó là hệ quả của endpoint treo vô hạn khi chưa có timeout.

## 7. Độ tin cậy 9 endpoint miễn phí
Từ 04/09 00:20 UTC mỗi tick ghi `rpc_endpoint_stats` = [{url, attempts, failures, timeouts}].
Truy vấn tổng hợp:
```sql
select s->>'url' url,
       sum((s->>'attempts')::int) attempts,
       sum((s->>'failures')::int) failures,
       sum((s->>'timeouts')::int) timeouts,
       round(100.0*sum((s->>'failures')::int)/greatest(sum((s->>'attempts')::int),1),2) err_pct
from scanner_tick_log, jsonb_array_elements(rpc_endpoint_stats) s
where created_at > now() - interval '48 hours'
group by 1 order by err_pct desc;
```
Nghẽn chung: tick có `rpc_healthy < 5` hoặc mọi endpoint đều failures > 0.
