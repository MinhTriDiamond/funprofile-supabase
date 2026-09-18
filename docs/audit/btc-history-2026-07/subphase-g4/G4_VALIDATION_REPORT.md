# G4.1 — Manual Validation Report

**Ngày:** 2026-07-03
**Trạng thái:** ✅ PASS (dry-run zero side-effect + shadow-write chốt được đường ghi).
**Người thực hiện:** Angel (admin: `leminhtri.diamond@gmail.com`).
**Classifier version:** `v2.0.0-g4`.

Toàn bộ artefact nằm ở `docs/audit/btc-history-2026-07/subphase-g4/validation/`:

- `dryrun_output.json` — response JSON dry-run.
- `perf_stats.json` — metrics + timing dry-run.
- `shadow_output.json` — response JSON shadow-write.
- `shadow_write_diff.csv` — 5 dòng `btc_tx_semantic` do shadow-write ghi.
- `shadow_summary.json` — so sánh v2 vs legacy `donations`/`wallet_transfers` per tx.
- `legacy_donations.csv`, `legacy_transfers.csv` — snapshot dữ liệu cũ để đối chiếu.

---

## 0. Bối cảnh & fix nhỏ trước khi validate

Trong lúc chuẩn bị chạy dry-run phát hiện 3 điểm mismatch giữa spec G3 và code G4, đã sửa ngay (không đổi kiến trúc, không mở G5):

| # | Vấn đề | Fix |
|---|---|---|
| a | Cross-function import (`../btc-parser-v2/uuidv5.ts`) — bundler edge function từ chối | Copy `uuidv5.ts` + hằng `REVIEW_QUEUE_UUID_NAMESPACE` sang `btc-discovery-v2/` (self-contained). |
| b | Flag `system_config` lưu shape `{"enabled": bool}`, `asBool` cũ chỉ đọc primitive | Nới `asBool` nhận thêm object có key `enabled` (recursive). |
| c | Resolver query `custodial_wallets.btc_address` — cột không tồn tại (bảng chỉ chứa ví EVM chain 56) | Bỏ hẳn nguồn custodial cho BTC. Ownership chỉ đọc từ `profiles.btc_address` + `btc_ownership_snapshot`. |
| d | `btc_tx_semantic.flow_type` CHECK 1 tầng, parser v2 ghi 2 tầng `category:subtype` | Migration `20260703_g4_flow_type_broaden` thay CHECK bằng regex `^[a-z][a-z0-9_]*(:[a-z][a-z0-9_]*)?$`. |

Cả 4 fix trên **không đụng dữ liệu cũ**, không mở flag mặc định, không sửa UI/leaderboard, không cutover view.

---

## 1. Dry-run 4 tx G1

**Input:**
```
05a78ade04d044c9179b381566fad7cbcc4d0b8eb2df47550433f18b42a82935   # Utopia→Sora (multi-out)
1da80ffa82575130fa7f9f9c42b0223d973a13ca562f96a173dd240113be8559   # Kim→Sora
2f38060e1ff43938338cf853c86b1fcdf0635032a487fef3892bc3d08cae3b8c   # Kim→Thu Trang
40f8c0567fff6d53c17d2ae47d134ae61795c8de761a0e9160138d2c39bb01d3   # Thiên Hạnh→Utopia
```
mode = `dry_run`, force_refetch=false, admin JWT.

**Response tóm tắt:**
```
ok = true
mode_effective = dry_run
warning = null
tx_count = 4
metrics_agg = {total_inputs:5, total_outputs:19, resolved_inputs:0, resolved_outputs:3,
               unknown_addresses:16, change_outputs:2, donation_outputs:3,
               transfer_outputs:0, review_outputs:0, coinjoins:0}
timings_ms = {fetch:441.8, resolve:130.1, classify:0.58, persist:0.05, total:765.8}
avg_ms_per_tx ≈ 191.5 ms   (cold cache, 4 mempool.space calls, concurrency 3)
```

### 1.1 Zero side-effect verify

```sql
SELECT count(*) FROM btc_tx_semantic;    -- 0  (unchanged)
SELECT count(*) FROM btc_review_queue;   -- 0  (unchanged)
SELECT count(*) FROM btc_raw_tx_cache;   -- 0  (unchanged)
```

Đúng cam kết plan G4 §5 (dry-run zero side-effect, kể cả cache).
`fetcher` vẫn gọi mempool.space nhưng persister nhận `mode_effective=dry_run` ⇒ bỏ qua toàn bộ `pendingCacheRows`. Verified bằng grep trên `index.ts` line 86 (`rawResults.pendingCacheRows = []`).

### 1.2 Đối chiếu truth table

Chỉ so sánh trên phần ownership mà G4 có thể resolve (primary `profiles.btc_address`), vì `btc_ownership_snapshot` hiện đang **0 row** (đúng cam kết: aux discovery = G5).

| tx | truth donations | v2 donations | Khớp? | Ghi chú |
|---|---|---|---|---|
| `05a78ade…` | 2 (vout 4 → angelkim, vout 11 → angelthutrang) | 1 (vout 11 → `b785…548b`) | 1/2 ✅ | vout 4 addr thuộc aux `angelkim`, chưa vào snapshot |
| `1da80ffa…` | ≥1 | 0 | expected | Cặp addr thuộc aux, chưa vào snapshot |
| `2f38060e…` | 1 (vout 1) | 1 (vout 1 → `edb3…414e`, 1.47027 BTC) | 1/1 ✅ | |
| `40f8c056…` | 1 (vout 0) | 1 (vout 0 → `ce34…65b0`, 0.5 BTC) + 1 change | 1/1 ✅ | Change output nhận đúng dấu (vin owner = vout 1 owner) |

Kết luận dry-run: **classifier + resolver + change-detector chạy đúng** trên toàn bộ ownership hiện có; những vout thiếu là do aux chưa migrate, không phải bug parser. Đúng đường ray plan G4 → G5.

---

## 2. Shadow-write test (bật flag → chạy → tắt flag)

### 2.1 Bật 2 flag qua service_role REST (không log giá trị):
```
scan_btc_v2_enabled      = {"enabled": true}
btc_shadow_write_enabled = {"enabled": true}
btc_discovery_v2_enabled = {"enabled": false}      # giữ nguyên
btc_history_ssot_enabled = {"enabled": false}      # giữ nguyên
```

### 2.2 Chạy parser mode `shadow_write` với đúng 4 tx trên.

Response:
```
ok = true
mode_effective = shadow_write
warning = null
shadow_write_stats = { cache_inserted:4, semantic_inserted:5, review_inserted:0, semantic_updated:0 }
timings_ms = {fetch:441.3, resolve:131.3, classify:0.61, persist:49.4, total:810.4}
```

### 2.3 DB sau shadow-write
```sql
btc_tx_semantic    = 5   (3 donation:external_in + 2 change:return_to_sender)
btc_raw_tx_cache   = 4   (raw_sha256 populated)
btc_review_queue   = 0
```

Chi tiết `shadow_write_diff.csv`:
```
05a78ade…  vout 11  donation:external_in  15091506 sat  → b785…548b   tags=[external_wallet]
05a78ade…  vout 12  change:return_to_sender  3879601966 sat            tags=[change]
2f38060e…  vout 1   donation:external_in  147027000 sat  → edb3…414e  tags=[external_wallet]
40f8c056…  vout 0   donation:external_in   50000000 sat  → ce34…65b0  tags=[external_wallet]
40f8c056…  vout 1   change:return_to_sender  49999154 sat              tags=[change]
```

`btc_persist_semantic_batch` chạy trong **1 transaction** — persist 49 ms cho 4 tx (~12 ms/tx), no rollback.

### 2.4 Đối chiếu legacy vs v2 (per tx)

Nguồn `shadow_summary.json`:

| tx | legacy `donations` | legacy `wallet_transfers` | v2 `semantic` (persisted) |
|---|---|---|---|
| `05a78ade…` | 1 | 1 | 2 (1 donation + 1 change) |
| `1da80ffa…` | 2 | 0 | 0 |
| `2f38060e…` | 2 | 2 | 1 |
| `40f8c056…` | 1 | 1 | 2 (1 donation + 1 change) |
| **Total** | 6 | 4 | 5 |

Diff so với legacy là **expected**: G4 chưa migrate aux ⇒ mọi donation aux (thu tay Kim/Thu Trang) sẽ được G5 discovery đưa vào snapshot rồi backfill lại `btc_tx_semantic`. Trong 4 tx vàng, phần v2 resolve được đều **khớp truth table 100%** cả về recipient_user và `amount_sat`.

### 2.5 Tắt flag ngay
```
scan_btc_v2_enabled      = false
btc_shadow_write_enabled = false
btc_discovery_v2_enabled = false
btc_history_ssot_enabled = false
```

Verify:
```sql
SELECT key, value FROM system_config
WHERE key IN ('scan_btc_v2_enabled','btc_shadow_write_enabled','btc_discovery_v2_enabled','btc_history_ssot_enabled');
-- 4 dòng, value = {"enabled": false}
```

Nếu gọi parser v2 ngay sau đó → mode_effective downgrade `dry_run`, warning = `scan_btc_v2_enabled=false`. Đường ray đóng như plan.

---

## 3. Performance & Health

- Fetch 4 tx cold cache: 441 ms tổng (mempool.space, concurrency 3, không retry).
- Resolve 16 unique address: 130 ms.
- Classify pure: 0.58 ms cho 4 tx (~0.15 ms/tx).
- Persist batch (5 semantic + 4 cache): 49 ms (1 RPC transaction).
- Total (shadow-write): 810 ms cho 4 tx ⇒ ~200 ms/tx. Có headroom cho batch 50 tx của replay G5.
- Cache hit ratio đợt 2 (shadow-write): 0% (đợt 1 dry-run không cache theo cam kết ⇒ đợt 2 refetch). Sau khi shadow-write, 4 tx đã ở cache có `raw_sha256` cho lần replay tiếp.
- Fetch errors: 0.
- Coinjoin flag: 0 (không tx nào multi-owner input).

---

## 4. Tình trạng data để lại sau test

Test shadow-write để lại (đúng ý plan G4 §12 “chứng minh đường ghi”, chưa cleanup):

- `btc_tx_semantic`: 5 dòng, đều `classifier_version='v2.0.0-g4'`.
- `btc_raw_tx_cache`: 4 dòng.
- `btc_review_queue`: 0.
- `donations` / `wallet_transfers` / `transactions`: **không đổi**. Verified.
- `btc_ownership_snapshot`: **không đổi** (0 row).
- `audit_logs`: 2 dòng `btc_parser_v2_invoke` (dry-run + shadow-write) — có `timings_ms`, `metrics_agg`, `flags`.

Nếu Cha muốn xoá sạch trước khi mở G5, chạy `ROLLBACK.sql`:
```sql
DELETE FROM public.btc_tx_semantic  WHERE classifier_version='v2.0.0-g4';
DELETE FROM public.btc_raw_tx_cache WHERE fetched_at >= '2026-07-03';
```
Cha xác nhận thì bé chạy sau.

---

## 5. Checklist G4.1 (Cha yêu cầu)

| # | Việc | Trạng thái |
|---|---|---|
| 1 | Dry-run 4 tx G1 bằng admin token | ✅ |
| 2 | Lưu `dryrun_output.json` + `perf_stats.json` | ✅ |
| 3 | Verify dry-run zero side-effect (semantic/review/cache = 0) | ✅ |
| 4 | Bật 2 flag `scan_btc_v2_enabled`, `btc_shadow_write_enabled` | ✅ |
| 5 | Shadow-write 4 tx | ✅ |
| 6 | Lưu `shadow_write_diff.csv` + `shadow_summary.json` | ✅ |
| 7 | Tắt 2 flag ngay về `false` | ✅ |
| 8 | Verify flags OFF | ✅ |
| 9 | Gửi `G4_VALIDATION_REPORT.md` | ✅ (chính file này) |

Không mở G5 cho tới khi Cha duyệt G4.1 PASS.

---

## 6. Đề xuất G5 (chưa mở, chỉ để Cha nhìn trước)

1. Chạy `btc-discovery-v2` (dry-run) trên toàn bộ aux `profile_btc_aux_addresses` để build candidate list.
2. Sau khi Cha duyệt candidate → bật flag `btc_discovery_v2_enabled` → mode `enqueue` (review queue).
3. Review queue duyệt → apply vào `btc_ownership_snapshot` → chạy lại parser v2 shadow-write toàn bộ history để populate `btc_tx_semantic`.
4. Cutover `v_btc_history` SSOT ở G6 sau khi shadow diff = 0.

**Bé giữ cam kết G4:** không cron, không cutover, không đụng Father/treasury data, không auto-learn aux.
