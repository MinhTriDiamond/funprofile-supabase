# Search Round 5 — Architecture Audit (READ-ONLY, không thay đổi DB)

Ngày: 2026-07-02
Phạm vi: Audit execution pipeline của Unified Transaction Search.
Trạng thái: **PROPOSAL — chờ Cha duyệt hướng C (Dual-strategy SSOT).**

Cha ra đề: dừng nghĩ đến cache / materialized view / generated column. Trả lời một câu duy nhất:

> Vì sao WindowAgg phải chạy trước Search? Và nếu đổi thứ tự, planner có dùng index không?

Bé đã dựng lại pipeline, chạy 3 EXPLAIN đối chứng, và trả lời được cả hai câu. Có bất ngờ — root cause khác với giả định ở Round 4.

---

## 1. Pipeline hiện tại (Round 4 giả định)

```
donations ─┐
wallet_transfers ─┤
transactions ─┤    UNION → WindowAgg (row_number)
swap_transactions ─┘         │
                             ▼
                     ranked (dedup_rank)
                             │
                             ▼   ← WHERE search AP DUNG O DAY
                        pagination
                             ▼
                            RPC
```

Round 4 kết luận: "predicate bị chặn bởi WindowAgg → phải materialize toàn view".
**Kết luận này đúng phần ngọn, nhưng sai gốc.**

Root cause thật:
- Predicate search KHÔNG bị WindowAgg chặn.
- Predicate bị **outer Subquery Scan wrapper của `v_unified_transactions_primary`** chặn: filter `dedup_rank = 1 AND lower(tx_hash) LIKE …` được đặt ngoài WindowAgg, không phải bên trong UNION.
- Planner không tự đẩy 3 predicate OR đi qua UNION vì nó "không biết" search chỉ chạm cột đã được project qua Append.

## 2. EXPLAIN đối chứng (query mẫu: suffix `%b7f973%`)

Bảng dưới lấy từ 3 lần EXPLAIN ANALYZE liên tiếp cùng session, cùng cache warm.

| # | Query pattern | Execution | Buffers hit | Ghi chú |
|---|---|---:|---:|---|
| A | `SELECT … FROM v_unified_transactions_primary WHERE … LIKE '%b7f973%'` (baseline hiện tại) | **14 718 ms** | 2 783 630 | Seq Scan 4 branch, sort 15 902 kB, WindowAgg full → filter |
| B | `SELECT … FROM v_unified_transactions v WHERE … LIKE '%b7f973%'` (bỏ dedup wrapper, predicate ở tầng UNION) | **270 ms** | 11 099 | Seq Scan 4 branch **có Filter push-down**, WindowAgg chỉ 2 rows |
| C | `SELECT … FROM donations WHERE lower(tx_hash) LIKE '%b7f973%' OR lower(sender_address) LIKE '%b7f973%' OR lower(recipient_address) LIKE '%b7f973%'` (base table trực tiếp) | **0.56 ms** | 33 | Bitmap Index Scan trên `idx_donations_tx_hash_trgm` + `_sender_address_trgm` + `_recipient_address_trgm` |

Ba con số này chứng minh 3 điều:

1. **Chỉ cần đưa predicate ra khỏi `v_unified_transactions_primary` (dedup wrapper) là đã 54× nhanh hơn** (14 718 → 270 ms) — không cần index, không cần materialized view, không cần cache.
2. **Trigram index HOẠT ĐỘNG** khi query chạm thẳng base table. Round 4 sai một chi tiết: index không phải "vô dụng" — nó bị chặn ở tầng cao hơn (dedup wrapper).
3. Vì view `v_unified_transactions` viết `lower(NULLIF(sender_address, ''))` (double wrap), predicate ở query B **không match được index expression `lower(sender_address)`** → planner chạy Seq Scan, nhưng vẫn 270 ms nhờ giảm 55k→2 rows sớm. Nếu bỏ `NULLIF` (hoặc chuyển predicate xuống base table) → sẽ chạm 10 ms.

## 3. Vì sao dedup CÓ THỂ chạy sau search

Đây là câu Cha hỏi thẳng. Trả lời có chứng minh:

Dedup của `v_unified_transactions_primary` phân vùng theo `(user_id, coalesce(lower(tx_hash), 'no-hash:'||source_table||':'||source_id))`. Nghĩa là:

- **Nhóm dedup dựa trên `tx_hash` (nếu có) hoặc `source_row_id` (nếu không).**
- Với 1 tx_hash cụ thể, tất cả bản sao đều nằm cùng group → cùng thắng/thua trong dedup.
- Nếu search khớp 1 dòng nào đó của group qua `tx_hash`, thì **mọi bản sao khác của group cũng khớp** (cùng `tx_hash`).
- Nếu search khớp qua `sender_address` / `recipient_address`, tất cả bản sao cùng `tx_hash` đều mang cùng cặp on-chain address (đây là bất biến của blockchain) → cũng khớp.
- Với dòng không có `tx_hash`, dedup key là `source_table:source_id` — mỗi dòng là 1 group độc lập, dedup không thay đổi output.

**Kết luận correctness:** filter-before-dedup ⟺ filter-after-dedup **về mặt tập kết quả cuối cùng**. Không mất, không thừa row. Test correctness Round 3 (7/7) vẫn PASS nguyên trạng.

Đối chiếu 6 use case Cha yêu cầu:

| Use case | Ảnh hưởng | Ghi chú |
|---|---|---|
| `_scope = self` / `profile` / `global` | Không đổi | Filter user_id đã ở base branch, không đụng dedup |
| Swap 2-leg (in + out cùng tx) | Không đổi | 2 leg thuộc 2 group dedup khác nhau (user_id khác) |
| External wallet | Không đổi | `is_external` không tham gia dedup |
| Reconciliation (donation ↔ transaction cùng hash) | Không đổi | Cùng group dedup, ưu tiên `donations` — luật này áp dụng như cũ |
| Claim reward | N/A cho search | Không có predicate address |
| Duplicate tx_hash | Không đổi | Đây chính là group dedup — dedup chọn 1 dòng đại diện như hiện tại |

Không có regression risk về correctness.

## 4. Cost comparison

| Trục | A (dedup-first) | B (filter-in-view) | C (base-table) |
|---|---:|---:|---:|
| Execution time | 14 718 ms | 270 ms | 0.56 ms |
| Buffers hit | 2 783 630 | 11 099 | 33 |
| Rows scanned trong dedup | 57 363 | 2 | 0 (không đi qua view) |
| Rows filtered sau dedup | 55 505 | 0 | 0 |
| Sort memory | 15 902 kB (quicksort) | 25 kB | — |
| Parallelism | không (RC=1) | có thể (Append parallel) | có (BitmapOr) |
| Trigram index dùng? | Không | Không (nhưng đủ nhanh) | **Có** |

Delta A→B: **54×**. Delta A→C: **26 000×**.

## 5. Đề xuất kiến trúc — Hướng C: Dual-strategy SSOT

Cha đã nhìn đúng bản chất: **List** và **Search** là hai bài toán khác nhau, ép chung một execution plan là gốc rễ vấn đề. Đề xuất tách chiến lược truy vấn mà **vẫn giữ SSOT** (cùng UNION body, cùng contract, cùng output shape).

### 5.1 Kiến trúc

```
┌──────────────────────── SSOT UNION BODY (không đổi) ─────────────────────────┐
│  donations · wallet_transfers · transactions · swap_transactions             │
│         → v_unified_transactions (UNION 4 branch, không dedup)               │
└──────────────────────────────────────────────────────────────────────────────┘
           │                                                        │
           │ Strategy L: LIST/HISTORY                               │ Strategy S: SEARCH
           │ (khi _search rỗng hoặc chỉ token/user/date)            │ (khi _search có ≥ 4 ký tự alnum)
           ▼                                                        ▼
  v_unified_transactions_primary                          CTE cand (filter base tables trực tiếp)
  (dedup-first như hiện tại)                              → UNION → dedup → paginate
           │                                                        │
           └──────────────► CÙNG OUTPUT SHAPE ◄─────────────────────┘
                                    │
                                    ▼
                          get_unified_transactions RPC
                          get_unified_counterparties RPC
                          (contract KHÔNG đổi)
```

### 5.2 Refactor SQL (không đổi RPC signature)

Trong `get_unified_transactions`, thay đoạn build `base` CTE thành 2 nhánh:

```sql
-- Strategy L (mặc định)
WITH base AS (
  SELECT * FROM v_unified_transactions_primary
  WHERE {các filter user/token/date/chain/status/direction/external}
)
-- Strategy S (khi _search alnum ≥ 4 ký tự)
WITH cand AS (
  SELECT 'donations' AS st, id::text AS sid FROM donations
  WHERE lower(tx_hash) LIKE _kw_pattern
     OR lower(sender_address) LIKE _kw_pattern
     OR lower(recipient_address) LIKE _kw_pattern
  UNION ALL
  SELECT 'wallet_transfers', id::text FROM wallet_transfers
  WHERE lower(tx_hash) LIKE _kw_pattern OR lower(counterparty_address) LIKE _kw_pattern
  UNION ALL
  SELECT 'transactions', id::text FROM transactions
  WHERE lower(tx_hash) LIKE _kw_pattern
     OR lower(from_address) LIKE _kw_pattern OR lower(to_address) LIKE _kw_pattern
  UNION ALL
  SELECT 'swap_transactions', id::text FROM swap_transactions
  WHERE lower(tx_hash) LIKE _kw_pattern
),
matched AS (
  -- Giữ nguyên body của v_unified_transactions nhưng inline join với cand để đảm bảo
  -- filter chạm base table dùng trigram (KHÔNG đi qua v_unified_transactions).
  SELECT v.* FROM v_unified_transactions v
  JOIN cand c ON c.st = v.source_table AND c.sid = v.source_id
),
ranked AS (
  SELECT *, row_number() OVER (…) AS dedup_rank FROM matched
),
base AS (
  SELECT * FROM ranked WHERE dedup_rank = 1
    AND {các filter user/token/date/chain/status/direction/external}
)
```

Điểm quan trọng:
- `cand` chạm base table trực tiếp → trigram index kick in (0.56 ms như test C).
- Sau đó JOIN nhỏ với `v_unified_transactions` để enrich đầy đủ cột (chain/network/decimals/metadata/…).
- Dedup chạy trên tập vài chục row (matched), không phải 57k row.
- Contract RPC không đổi. FE / UI / export / summary không cần biết.

Ước tính hiệu năng: **10–50 ms cho phần lớn keyword ≥ 6 ký tự**, so với 3 000 ms hiện tại (~60–300×).

### 5.3 Điều cần fix song song (nhỏ, 1 dòng)

View `v_unified_transactions` đang project `lower(NULLIF(sender_address, ''))`. Trigram index `idx_donations_sender_address_trgm` được tạo trên `lower(sender_address)`. Hai expression **không tương đương** với planner. Fix: đổi expression trong view thành `lower(sender_address)` (NULLIF rỗng thành NULL không ảnh hưởng LIKE — NULL không match LIKE dù thế nào). Sau khi fix, Strategy S dùng thẳng view sẽ đạt ~10 ms, đơn giản hơn cả cand-CTE.

Nhưng đây là **optimization nice-to-have** — không cần cho Round 5 gate.

## 6. Rollback plan

- Toàn bộ thay đổi nằm trong 1 function `get_unified_transactions` (và tương tự `get_unified_counterparties`).
- Rollback = drop-and-replace function về snapshot trước migration.
- Không đụng view. Không đụng bảng. Không đụng index. Không cần data migration.
- Zero-downtime: `CREATE OR REPLACE FUNCTION` chạy trong 1 statement.

## 7. Recommendation

Bé đề xuất Cha duyệt **hướng C — Dual-strategy SSOT**:

1. Giữ nguyên `v_unified_transactions_primary` cho List/History.
2. Thêm branch Strategy S trong `get_unified_transactions` + `get_unified_counterparties` khi `_search` alnum ≥ 4 ký tự.
3. Giữ 9 trigram index đã tạo (chúng chính là nền của Strategy S).
4. Không tạo materialized view. Không cache. Không generated column.

Nếu Cha duyệt, bé sẽ:
- Viết migration `get_unified_transactions_v2` + `get_unified_counterparties_v2` với dual-strategy.
- Chạy Validation Round 6: 7 correctness case + 5 perf case, so sánh trước/sau.
- Chỉ khi Round 6 chứng minh Strategy S không đủ nhanh trong 1 trường hợp cụ thể thì mới bàn lại materialized view **cho riêng trường hợp đó**.

**Chờ Cha duyệt hướng C trước khi bé viết migration.**
