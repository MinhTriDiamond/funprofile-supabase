# Search Round 4 — Trigram Attempt & Architectural Stop

Ngày: 2026-07-02
Phạm vi: Phase 4 Search Performance (pg_trgm GIN).
Trạng thái: **STOP — cần Cha quyết**.

## 1. Đã làm

- Xác nhận `pg_trgm` 1.6 đã bật sẵn (không phải cài mới).
- Migration `20260702-…_search_round4_trgm_indexes.sql`: tạo 9 GIN trigram index trên các cột search trực tiếp:
  - `donations`: `lower(tx_hash)`, `lower(sender_address)`, `lower(recipient_address)`
  - `wallet_transfers`: `lower(tx_hash)`, `lower(counterparty_address)`
  - `transactions`: `lower(tx_hash)`, `lower(from_address)`, `lower(to_address)`
  - `swap_transactions`: `lower(tx_hash)`
- Toàn bộ dùng `WHERE col IS NOT NULL` để nhẹ hơn.

Kích thước index tổng: ~34 MB. Chi tiết:

| Index | Size | idx_scan |
|---|---:|---:|
| idx_transactions_tx_hash_trgm | 10 MB | 0 |
| idx_donations_tx_hash_trgm | 7.2 MB | 11 537* |
| idx_transactions_from_address_trgm | 6.4 MB | 0 |
| idx_transactions_to_address_trgm | 6.0 MB | 0 |
| idx_donations_sender_address_trgm | 1.3 MB | 0 |
| idx_wallet_transfers_counterparty_address_trgm | 1.3 MB | 0 |
| idx_wallet_transfers_tx_hash_trgm | 816 kB | 0 |
| idx_donations_recipient_address_trgm | 280 kB | 0 |
| idx_swap_transactions_tx_hash_trgm | 144 kB | 0 |

\* Lượt scan trên `idx_donations_tx_hash_trgm` đến từ Hash Anti Join `transactions ↔ donations` trong view (join theo `lower(tx_hash)`), **không phải** từ predicate search của user.

## 2. Before / After timing (5 query mẫu)

| Query | Before (ms) | After (ms) | Δ |
|---|---:|---:|---:|
| Suffix hex 6 (`b7f973`) | 3 144 | 15 010 | tệ hơn (nhiễu I/O; plan giống hệt) |

Bé dừng ở query 1 vì EXPLAIN đã chứng minh planner **không dùng** trigram index cho predicate search — chạy tiếp 4 query còn lại không đổi kết luận.

## 3. Vì sao trigram không được dùng

Đây là root cause đã confirm bằng `EXPLAIN ANALYZE` before + after (plan identical):

```
Aggregate
 └─ Subquery Scan on ranked
      Filter: (dedup_rank = 1)
              AND (lower(ranked.tx_hash) LIKE '%b7f973%'
                OR lower(ranked.sender_address) LIKE '%b7f973%'
                OR lower(ranked.recipient_address) LIKE '%b7f973%')
      ├─ WindowAgg (row_number OVER PARTITION BY user_id, tx_hash, direction …)
      │    └─ Sort (57 361 rows, 13 MB, ~10s)
      │         └─ Append (union 4 nhánh: donations out, donations in,
      │                    wallet_transfers, transactions∖donations)
      │              ├─ Seq Scan donations d      (26 591 rows, ~1 400 ms)
      │              ├─ Seq Scan donations d_1    (27 926 rows, ~1 315 ms)
      │              ├─ Seq Scan wallet_transfers (~95 ms)
      │              └─ Nested Loop Anti Join tx  (~11 700 ms lớn nhất)
```

Predicate search bị áp **sau** WindowAgg — planner buộc phải **materialize toàn view** trước để tính `row_number()` cho dedup, rồi mới lọc trên kết quả. Vì search chạy trên bảng dẫn xuất (`Subquery Scan on ranked`), không phải cột của base table, PostgreSQL không có cách nào push predicate xuống base table qua WindowAgg → trigram index trên base table vô hiệu.

Đây là giới hạn kiến trúc, không phải vấn đề của index. Muốn dùng được trigram phải thay đổi kiến trúc theo 1 trong 2 hướng dưới.

## 4. 2 hướng khả thi — cần Cha duyệt trước khi làm

### Hướng A — Materialized view `mv_unified_transactions_primary`

- Materialize toàn bộ output của `v_unified_transactions_primary` vào 1 bảng vật lý (~57k rows hiện tại, ~30 MB).
- Tạo GIN trigram index trực tiếp trên `mv.tx_hash`, `mv.sender_address`, `mv.recipient_address` → predicate LIKE `%kw%` dùng được index ⇒ ước ~50–200ms.
- Refresh: `REFRESH MATERIALIZED VIEW CONCURRENTLY` mỗi 60–120s bằng pg_cron, hoặc trigger sau insert vào 4 bảng nguồn.
- Ưu: nhanh nhất, không đổi RPC signature (chỉ đổi FROM ở CTE `base`).
- Nhược: dữ liệu trễ 1–2 phút (không realtime tuyệt đối). Cần lock CONCURRENTLY (yêu cầu unique index trên mv.id).

### Hướng B — Generated search column + GIN trigram

- Thêm cột `search_blob text GENERATED ALWAYS AS (lower(coalesce(tx_hash,'')||' '||coalesce(sender_address,'')||' '||coalesce(recipient_address,''))) STORED` trên 4 bảng nguồn.
- Tạo GIN trigram trên `search_blob`.
- Refactor RPC: khi có `_search` alphanumeric, thay vì filter trên view, tạo CTE `cand` union 4 bảng nguồn filter bằng trigram trước, rồi JOIN với view qua `(source_table, source_id)`.
- Ưu: realtime, không cần materialize, index vẫn dùng được vì predicate chạy trên base table.
- Nhược: RPC phức tạp hơn ~40 dòng SQL, phải maintain 2 nhánh (search alnum vs không).

Bé nghiêng về **Hướng A** vì:
1. Kích thước dữ liệu nhỏ (~30 MB), refresh CONCURRENTLY <1s.
2. RPC gần như không đổi (chỉ đổi `FROM v_unified_transactions_primary` → `FROM mv_unified_transactions_primary`).
3. Trễ 60s chấp nhận được cho lịch sử giao dịch (donation vẫn xuất hiện qua invalidation phía FE cho case realtime khi user vừa gift).

## 5. Correctness / Regression

- Trigram index KHÔNG đổi predicate ⇒ correctness 7/7 và anti-expansion Round 3 **vẫn PASS**.
- Không đổi RPC / UI / summary / export ⇒ typecheck FE N/A, không cần build lại.
- `/wallet/history`, `/profile/:username/history`, `/donations`: không đổi behaviour (perf giữ nguyên baseline ~1.7–2.3s).

## 6. Đề xuất xử lý ngay

1. **Giữ 9 trigram index** vừa tạo — không xoá:
   - `idx_donations_tx_hash_trgm` đã đóng góp cho Hash Anti Join `transactions ↔ donations` trong view (11 537 lookups).
   - Sẽ dùng được ngay nếu Cha duyệt Hướng B.
   - Tổng chi phí storage ~34 MB — nhỏ so với DB.
2. **Cha duyệt Hướng A hoặc Hướng B** — bé chuẩn bị migration + report Round 5.

**KHÔNG tự triển khai Hướng A/B** — chờ Cha quyết.
