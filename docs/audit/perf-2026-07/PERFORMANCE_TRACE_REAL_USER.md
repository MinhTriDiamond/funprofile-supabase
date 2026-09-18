# PERFORMANCE TRACE — Unified Transaction History (07/2026)

**Chế độ:** PERFORMANCE DEBUG MODE — chưa vá, chờ Cha duyệt.
**Trạng thái:** Đã xác định chính xác root cause + query chậm nhất. **KHÔNG đoán.**

---

## 1. Tóm tắt bằng chứng (numbers, not opinions)

Đo trực tiếp trên production Postgres qua `psql` (bỏ overhead PostgREST + mạng):

| RPC | Scope | Filters | Limit | Rows | **Duration** |
|---|---|---|---|---|---|
| `get_unified_transactions` (list page 1) | `global` | — | 50 | 50 | **7,069 ms** |
| `get_unified_transactions` (rowsForSummary) | `global` | — | 5000 | 5000 | **7,209 ms** |
| `get_unified_counterparties` | `global` | — | 300 | 300 | **7,051 ms** |
| `EXPLAIN ANALYZE` `v_unified_transactions_primary` LIMIT 50 | — | — | 50 | 50 | **16,303 ms** |

Kết luận số học đầu tiên: **thời gian gần như không phụ thuộc `_limit`.**
50 rows và 5000 rows đều ~7s → toàn bộ pipeline scan xong mới cắt LIMIT.
Đây là root cause khiến "refresh cũng chậm, filter cũng chậm".

---

## 2. Waterfall thực tế mỗi lần vào `/wallet/history` (hoặc `/donations`, `/profile/:u/history`)

Mount `TransactionHistoryPage` phát **4 RPC song song** (React Query + fetch, cùng 1 origin):

| # | Hook | RPC | Payload đặc biệt | Ghi chú |
|---|---|---|---|---|
| 1 | `useUnifiedTransactionHistory` | `get_unified_transactions` | `_limit=50` | List page đầu |
| 2 | `useUnifiedRowsForSummary` (summary) | `get_unified_transactions` | **`_limit=5000`** | Tính Summary client-side |
| 3 | `useUnifiedRowsForSummary` (options) | `get_unified_transactions` | **`_limit=5000`**, bỏ token+chain | Chỉ để dựng dropdown Token/Chain |
| 4 | `useUnifiedCounterparties` (trong `TransactionFilters`) | `get_unified_counterparties` | `_limit=300` | Dropdown "Người dùng" |

Mỗi request ~7s. Trình duyệt song song 4 kết nối, nhưng RPC #2, #3, #4 đều nặng như #1 → **user thấy 7–8s trắng màn hình**, đúng như Cha mô tả.

Ngoài ra:
- Mỗi lần filter đổi (token, chain, date, direction, externalOnly, counterpartyUserId, search, status, type) → key React Query đổi → **cả 4 refetch lại**.
- Clear filter = 1 lần đổi filters → cũng full 4 refetch.
- `optionsRowsQ` có filter đã bỏ `token+chain` nhưng **vẫn phụ thuộc mọi filter khác** → gần như không cache lại được giữa các thao tác thực tế.

---

## 3. Request chậm nhất & root cause chính xác

**Chậm nhất: mọi call qua `v_unified_transactions_primary`** (nền cho cả 3 RPC list/summary/counterparties). `EXPLAIN ANALYZE ... LIMIT 50` = **16.3s**, buffers hit = **2.576.207 pages**.

Trích đoạn kill switch từ plan:

```
->  Bitmap Heap Scan on donations d_2  (loops=11567)
      Recheck Cond: (lower(tx_hash) = lower(t.tx_hash))
      Buffers: shared hit=2576207
->  Bitmap Index Scan on idx_donations_tx_hash_trgm  (loops=11567)
      Index Cond: (lower(tx_hash) = lower(t.tx_hash))
```

Nguyên nhân nằm ở CTE `tx` bên trong view `v_unified_transactions`:

```sql
FROM transactions t
LEFT JOIN profiles p ON p.id = t.user_id
WHERE ...
  AND NOT EXISTS (SELECT 1 FROM donations d
                  WHERE lower(d.tx_hash) = lower(t.tx_hash) AND d.chain_id = t.chain_id)
  AND NOT EXISTS (SELECT 1 FROM wallet_transfers w
                  WHERE lower(w.tx_hash) = lower(t.tx_hash) ...)
```

- `transactions` có **55.460 row**, sau filter còn ~11.567 candidate.
- Mỗi candidate loop 1 lần vào `donations` (27.971 row) qua bitmap index trigram → 11.567 × ~223 buffers = ~2.5M buffers.
- Kết quả: nested-loop O(N·M) không lệ thuộc `LIMIT` vì filter nằm ở CTE base, planner phải materialize xong toàn bộ union rồi mới `WindowAgg` (dedup_rank) rồi mới `LIMIT`.

Đây là **cùng barrier "filter-sau-dedup" mà Round 5 đã chẩn đoán cho search**, giờ tái phát ở nhánh non-search vì `NOT EXISTS` đứng ngay trong CTE base.

---

## 4. FE có gọi dư không? (audit `useUnifiedTransactionHistory.ts` + `TransactionHistoryPage.tsx` + `TransactionFilters.tsx`)

| Câu hỏi Cha đặt | Sự thật đo được | Verdict |
|---|---|---|
| `summaryRows limit=5000` có chạy mỗi lần filter? | queryKey chứa toàn bộ `n` filters → **Có**. | ⚠ Gọi dư |
| `optionsRows limit=5000` có chạy mỗi lần filter? | queryKey chứa filters (đã bỏ token+chain) → **Có, gần như mọi thao tác**. | ⚠ Gọi dư nặng nhất |
| `counterparties` có refetch quá nhiều? | queryKey chứa filters → **Có, refetch mỗi lần filter**. | ⚠ Gọi dư |
| List + summary + options + counterparties có cùng lúc? | 4 hook mount cùng frame, không debounce → **Có**. | ⚠ Nghẽn |
| Clear filter có trigger double/triple refetch? | Reset state 1 lần → 4 refetch cùng lúc → **Có**. | ⚠ |

Không có prefetch export nào — `TransactionExportMenu` chỉ chạy khi click.

---

## 5. EXPLAIN ANALYZE — tóm tắt các RPC

Chi tiết đã lưu ở: `docs/audit/perf-2026-07/evidence/explain_*.txt` (chạy lại bằng script section 8).

- `get_unified_transactions('global',…,50,0)` → 7.069 ms
- `get_unified_transactions('global',…,5000,0)` → 7.209 ms
- `get_unified_counterparties('global',…,300)` → 7.051 ms
- View `v_unified_transactions_primary` LIMIT 50 → **16.303 ms**, 2.576.207 buffers, nested loop 11.567 × donations trigram lookup.
- RPC `get_unified_summary` (chưa profiled riêng — nhưng chạy trên cùng view → cùng cost).

---

## 6. Đề xuất Phase 7 — theo đúng thứ tự an toàn Cha yêu cầu

**Nguyên tắc chung:**
- Không đổi UI lớn.
- Không đổi product principle (SSOT vẫn là `v_unified_transactions_primary`).
- Không materialized view (giữ đúng ràng buộc Round 5/6).
- Chỉ vá SQL + query orchestration ở FE.

### Phase 7A — Fast List First (giá trị lớn nhất, rủi ro thấp)
**Mục tiêu: page đầu list < 1.5s, phần còn lại lazy.**

1. `TransactionHistoryPage.tsx`:
   - Render list ngay khi `history` xong. **Không** block chờ `summaryRows` / `optionsRows` / `counterparties`.
   - `UnifiedTransactionSummary` chuyển sang skeleton riêng, không giữ layout.
   - Đặt `placeholderData: keepPreviousData` cho cả 3 RPC → filter đổi giữ data cũ, chỉ hiện spinner nhẹ.
2. `useUnifiedRowsForSummary` (cả 2 lần dùng) + `useUnifiedCounterparties`:
   - Thêm `startTransition` / defer mount 200–300 ms sau list.
   - Với `optionsRows`: gộp queryKey chỉ theo scope + owner, **KHÔNG** phụ thuộc filters (options là để chọn filter, không cần filter theo chính nó).
3. Search / filter đổi:
   - Debounce 250 ms trước khi bắn RPC (đã có ở search, mở rộng cho user/token/chain).

### Phase 7B — Root cause SQL (giảm 7s → mục tiêu <1s)
**Vá `v_unified_transactions` để bỏ nested-loop `NOT EXISTS` trên `transactions`.**

Options an toàn (không đổi contract):

- **B1 (khuyến nghị):** thay 2 `NOT EXISTS` bằng `LEFT JOIN … WHERE match IS NULL` với hash join. Cần index bổ trợ:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_donations_lower_tx_hash_chain
    ON public.donations (lower(tx_hash), chain_id) WHERE tx_hash IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_wallet_transfers_lower_tx_hash
    ON public.wallet_transfers (lower(tx_hash)) WHERE tx_hash IS NOT NULL;
  ```
  Planner sẽ chọn Hash Anti Join → O(N+M) thay vì O(N·M).
- **B2:** tạo cột generated `tx_hash_lower` trên `donations`, `wallet_transfers`, `transactions` + unique index → equality trực tiếp, plan siêu sạch.
- **B3:** nếu quy tắc "transactions chỉ giữ khi không trùng donations/wallet_transfers" đã ổn định, cân nhắc chuyển ra bước background reconcile ghi cờ `is_dedup_hidden` trên `transactions` (nhưng đây là thay đổi lớn hơn, để sau khi B1 xong).

Sau B1 kỳ vọng list page 1 xuống **~200–500 ms** (đã chứng minh ở Round 5 cho pipeline không barrier).

### Phase 7C — Tách "fast list" và "heavy aggregates"
Sau khi 7B xong, Summary/Counterparties vẫn không cần fetch 5000 row client-side:
- Đổi `useUnifiedRowsForSummary` → **gọi thẳng `get_unified_summary`** (đã có RPC riêng, hiện đang bị bỏ phí vì FE tính lại client-side).
- `get_unified_counterparties` giữ nguyên, nhưng chạy sau list, debounce 400 ms.

### Phase 7D — Guard đề phòng
- Thêm `SET LOCAL statement_timeout = '3s'` trong `get_unified_transactions` với `_limit ≤ 50` để bảo vệ list.
- Log slow query > 1s vào `api_slow_query_log` (đã có bảng ở M6).

---

## 7. Mục tiêu KPI sau Phase 7 (chờ Cha duyệt trước khi implement)

| KPI | Hiện tại | Sau 7A | Sau 7B | Sau 7C |
|---|---|---|---|---|
| List page 1 (global) | 7.0s | ~2s (data cũ giữ nguyên, list render trước) | **<0.5s** | <0.5s |
| Filter đổi → phản hồi | 7s trắng | tức thì (keepPreviousData) | tức thì | tức thì |
| Summary + Counterparties xong | cùng 7s | 5–7s (không block UI) | 1–2s | **<1s** |
| Refetch dư khi clear filter | 4 song song | 2 song song (lazy) | 2 | 2 |

---

## 8. Cách reproduce (dành cho Cha / QA)

```bash
psql -c "\timing on" \
     -c "SELECT COUNT(*) FROM get_unified_transactions('global',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,50,0,NULL,NULL);" \
     -c "SELECT COUNT(*) FROM get_unified_transactions('global',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,5000,0,NULL,NULL);" \
     -c "SELECT COUNT(*) FROM get_unified_counterparties('global',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,300);" \
     -c "EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM v_unified_transactions_primary v ORDER BY v.occurred_at DESC LIMIT 50;"
```

Waterfall Network trong DevTools: mở `/donations`, tab Network, filter `rpc/` → sẽ thấy đúng 4 request nói trên, mỗi request ~7s.

---

## 9. Chờ duyệt

Đề xuất Cha duyệt theo lô nhỏ:
1. **7A + 7C phần "gọi thẳng get_unified_summary"** — an toàn nhất, chỉ đụng FE + query key.
2. **7B (B1)** — 2 index + refactor view (1 migration).
3. **7D** — timeout guard.

Bé **không tự chạy** cho tới khi có "Cha duyệt Phase 7A" / "Cha duyệt 7B".
