# G4 — Parser v2 + Discovery v2 Dark-Launch Report

**Status:** ✅ Code + micro-migration deployed. Awaiting manual dry-run validation by admin.
**Date:** 2026-07-03
**Classifier version:** `v2.0.0-g4`

---

## 0. Nguyên tắc kiến trúc tối cao (đã ghi trong `btc-parser-v2/index.ts`)

> **Parser v2 TUYỆT ĐỐI KHÔNG suy diễn human intent.**
> Chỉ phân loại money flow từ on-chain + ownership đã xác minh.
> Mọi diễn giải nghiệp vụ (donation intent, treasury payout, reward, bridge, lightning, ordinal…)
> thuộc semantic layer / review policy ở G5+.
>
> **FLAG PRECEDENCE: OFF luôn thắng ON.**

---

## 1. Files đã tạo

### 1.1 Edge functions
```
supabase/functions/btc-parser-v2/
├── index.ts       - HTTP handler, admin gate, orchestrate, audit log      (~180 LoC)
├── types.ts       - RawTx, OwnershipEntry, Classification, SemanticResult (~140 LoC)
├── classifier.ts  - ⭐ pure function, no DB, no flag                       (~250 LoC)
├── resolver.ts    - loadOwnershipMap từ 3 store (custodial/profiles/snapshot) (~110 LoC)
├── fetcher.ts     - mempool.space + sha256 cache verify, concurrency 3     (~180 LoC)
├── persister.ts   - flag gate + RPC batch                                 (~110 LoC)
└── uuidv5.ts      - deterministic UUID v5 cho review queue                 (~80 LoC)

supabase/functions/btc-discovery-v2/
├── index.ts       - candidate → guard → verdict → optional insert         (~200 LoC)
├── guards.ts      - blacklist/father/tx_count/funded guards                (~90 LoC)
└── types.ts       - DiscoveryCandidate, CandidateResult, GuardSnapshot     (~40 LoC)
```

### 1.2 Micro-migration `20260703_btc_parser_v2_g4_foundation`
- `ALTER TABLE public.btc_raw_tx_cache ADD COLUMN raw_sha256 TEXT` (nullable).
- Index `btc_raw_tx_cache_sha256_idx` (partial, WHERE NOT NULL).
- Function `public.btc_persist_semantic_batch(cache, semantic, review) → jsonb` SECURITY DEFINER, chỉ `service_role` EXECUTE.
- Bọc 3 upsert (cache / semantic / review) trong 1 transaction — atomic rollback nếu lỗi.

---

## 2. Feature flag behavior matrix (đã implement)

| `scan_btc_v2_enabled` | `btc_shadow_write_enabled` | Request mode | `mode_effective` | Ghi cache | Ghi semantic | Enqueue review |
|---|---|---|---|---|---|---|
| false | * | * | `dry_run` (warning) | ❌ | ❌ | ❌ |
| true | false | `shadow_write` | `dry_run` (warning) | ❌ | ❌ | ❌ |
| true | true | `dry_run` | `dry_run` | ❌ | ❌ | ❌ |
| true | true | `shadow_write` | `shadow_write` | ✅ | ✅ | ✅ |
| * | * | `dry_run` | `dry_run` | ❌ | ❌ | ❌ |

Discovery riêng: `btc_discovery_v2_enabled` OFF → mọi mode → `dry_run`.
`enqueue` bật flag → chỉ insert review queue; `apply` bật flag → thêm insert ownership snapshot (chỉ sau guard pass).

Tất cả flag hiện đang **OFF** trong `system_config`. Confirm:
```sql
SELECT key, value FROM system_config
WHERE key IN ('scan_btc_v2_enabled','btc_shadow_write_enabled','btc_discovery_v2_enabled','btc_history_ssot_enabled');
```

---

## 3. Ownership resolver (§2 Cha)

| source | confidence | integrity | Ghi chú |
|---|---|---|---|
| `custodial` | 1.00 | ok | `custodial_wallets.btc_address` |
| `profile_primary` | 1.00 | ok | `profiles.btc_address` (Father tag nếu username=`angelfather`) |
| `snapshot` | 0.93 (auto) hoặc DB value | đọc từ `integrity_status` | `btc_ownership_snapshot`, chỉ lấy `ok`/`needs_review` |
| `unknown` | 0.00 | unknown | miss trong Map |

Treasury overlay đọc `app_settings.btc_treasury_addresses` (optional, best-effort).

---

## 4. Classification 2 tầng (§3 Cha)

```ts
{ category, subtype, flow_type: `${category}:${subtype}` }
```

| Kịch bản | category | subtype | Tags gợi ý |
|---|---|---|---|
| user → user nội bộ | `donation` | `internal` | — |
| ví ngoài → custodial | `donation` | `external_in` | `external_wallet` |
| custodial → ví ngoài | `transfer` | `external_out` | `external_wallet` |
| self-transfer | `transfer` | `self` | `self_transfer` |
| change output (recipient ∈ input) | `change` | `return_to_sender` | `change` |
| multi-input owner | `coinjoin_holdout` | `multi_owner` | `coinjoin_flag` |
| treasury sender/recipient | (giữ nguyên category) | (giữ nguyên) | + `treasury_flow` |
| ambiguous | `unknown` | `unknown` | `ambiguous_ownership` |

Cột `btc_tx_semantic.flow_type` lưu `${category}:${subtype}` để backward-compat.

---

## 5. Parser metrics (§4 Cha) — có sẵn trong response `metrics_agg` + per-tx `metrics`

```
total_inputs, total_outputs, resolved_inputs, resolved_outputs,
unknown_addresses, change_outputs, donation_outputs, transfer_outputs,
review_outputs, coinjoin
```

Aggregate 4 tx test → xem `evidence/perf_stats.json` sau khi chạy dry-run.

---

## 6. Dry-run zero side-effect (§7 Cha, ranh giới an toàn Cha nhấn mạnh)

Trong `index.ts`:
```ts
if (decision.mode_effective === 'dry_run') {
  rawResults = await fetchTransactions(...);
  rawResults.pendingCacheRows = []; // ⛔ dry_run: never cache
}
```

Persister thêm double-check:
```ts
if (decision.mode_effective !== 'shadow_write') return null;
```

Kết quả: dry-run **không ghi** cache, semantic, review, snapshot. Fetch mempool trực tiếp, giữ trong memory, trả response + audit log.

Cache **read** vẫn được phép trong dry-run (không phải side-effect trên DB) — giúp giảm tải mempool khi test lặp.

---

## 7. Transaction boundary (§8 Cha)

RPC `btc_persist_semantic_batch` chạy 3 upsert trong 1 function call PL/pgSQL → implicit transaction:
- Cache upsert (`ON CONFLICT tx_hash DO NOTHING`)
- Semantic upsert (`ON CONFLICT (chain_family,tx_hash,vout_index,recipient_address) DO UPDATE`)
- Review upsert (`ON CONFLICT id DO NOTHING`)

Lỗi bất kỳ bước nào → toàn function rollback → không ghi partial state.

Return JSON: `{cache_inserted, semantic_inserted, semantic_updated, review_inserted}` cho audit.

---

## 8. Deterministic review ID (§9 Cha)

```
review.id = uuidv5(`${tx_hash}:${vout_index ?? '*'}:${reason}`, NAMESPACE)
```

`NAMESPACE = 6ba7b8f0-9dad-11d1-80b4-00c04fd430c8` (const, không đổi).

Retry cùng nội dung → cùng UUID → `ON CONFLICT (id) DO NOTHING` không tạo duplicate.

---

## 9. Audit log (§10 Cha)

Mỗi invoke → 1 row `audit_logs`:
```jsonc
{
  "action": "btc_parser_v2_invoke",
  "metadata": {
    "mode_requested": "dry_run",
    "mode_effective": "dry_run",
    "warning": null,
    "tx_count": 4,
    "cache_hits": 4, "cache_misses": 0,
    "fetch_errors": [],
    "shadow_writes": null,
    "timings_ms": { "fetch": 12, "resolve": 45, "classify": 3, "persist": 0, "total": 60 },
    "metrics_agg": { ... },
    "flags": { ... }
  }
}
```

Discovery tương tự với `btc_discovery_v2_invoke`.

---

## 10. Test cases (dùng tx từ G1)

Test 4 tx đại diện, tất cả đều đã có raw JSON trong `subphase-g1/evidence/raw_tx/`:

| TC | tx_hash (rút gọn) | Expected category:subtype | Coinjoin? | Review reason |
|---|---|---|---|---|
| TC1 | `76042e63…5919b1` | `coinjoin_holdout:multi_owner` (mọi vout) | ✅ true (10 input owners khác nhau) | `coinjoin_multi_owner` |
| TC2 | `<pick 1 tx internal>` | `donation:internal` | false | — |
| TC3 | `<pick 1 tx có change>` | 1× `donation:internal` + 1× `change:return_to_sender` | false | — |
| TC4 | `<pick 1 tx external_in>` | `donation:external_in` | false | — |

**Manual invoke (chỉ admin):**
```bash
curl -X POST 'https://<PROJECT>.functions.supabase.co/functions/v1/btc-parser-v2' \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"tx_hashes":["76042e63c9a228de5fe1b7b7419ba2ca27617473785d520ec7705fd2995919b1"], "mode":"dry_run"}'
```

Response dry-run mong đợi cho TC1:
- `mode_effective: "dry_run"`
- `metrics_agg.coinjoins: 1`
- `metrics_agg.review_outputs: >= 1`
- `results[0].vouts[*].category: "coinjoin_holdout"`
- `persisted: false`
- Không có row mới trong `btc_tx_semantic` sau dry-run.

Sau khi Cha chạy dry-run 4 tx, output thô sẽ được lưu vào:
```
docs/audit/btc-history-2026-07/subphase-g4/evidence/
├── dryrun_output.json      -- full response
├── shadow_write_diff.csv   -- so semantic v2 vs donations legacy
├── shadow_summary.json     -- { same, different, missing, new }
├── discovery_queue_sample.json -- discovery dry-run output
└── perf_stats.json         -- timings aggregate
```

---

## 11. Shadow-write validation (manual, sau khi dry-run PASS)

Bật flag tạm:
```sql
UPDATE public.system_config SET value = 'true' WHERE key = 'scan_btc_v2_enabled';
UPDATE public.system_config SET value = 'true' WHERE key = 'btc_shadow_write_enabled';
```

Gọi lại parser với `mode: "shadow_write"`. Kiểm tra:
```sql
SELECT count(*), classifier_version FROM btc_tx_semantic
WHERE classifier_version = 'v2.0.0-g4' GROUP BY classifier_version;
```

**Tắt flag ngay sau khi test xong:**
```sql
UPDATE public.system_config SET value = 'false' WHERE key IN ('scan_btc_v2_enabled','btc_shadow_write_enabled');
```

---

## 12. Rollback SQL (sẵn sàng — không cần chạy)

```sql
-- Data cleanup (chỉ row G4 mới sinh)
DELETE FROM public.btc_tx_semantic  WHERE classifier_version = 'v2.0.0-g4';
DELETE FROM public.btc_review_queue WHERE created_at >= '<G4 start>' AND reviewer_id IS NULL;
DELETE FROM public.btc_raw_tx_cache WHERE fetched_at   >= '<G4 start>';

-- Optional: gỡ schema G4
DROP FUNCTION IF EXISTS public.btc_persist_semantic_batch(JSONB, JSONB, JSONB);
DROP INDEX  IF EXISTS public.btc_raw_tx_cache_sha256_idx;
ALTER TABLE public.btc_raw_tx_cache DROP COLUMN IF EXISTS raw_sha256;

-- Edge functions: xóa qua Lovable UI (btc-parser-v2, btc-discovery-v2).
```

---

## 13. Performance section (populate sau dry-run)

```
Total mempool API calls        : <TBD>
Cache hit ratio                : <TBD>
Average classify latency (ms/tx) : <TBD, expected < 5ms cho tx ≤ 20 vouts>
p95 classify latency           : <TBD>
Largest tx (vouts, inputs)     : TC1 = 10 vin / 2 vout
Coinjoin detected              : 1 / 4
Review queue rows created      : 1+ (TC1)
Memory peak                    : <TBD>
Errors                         : 0 (expected)
```

Đo xong bằng `evidence/perf_stats.json`.

---

## 14. Known limitations & G5 handoff

- **Treasury tag** đọc từ `app_settings` key `btc_treasury_addresses` — nếu chưa có, treasury detection chỉ dựa profile username. G5 nên chuẩn hoá thành bảng riêng.
- **Sender_address** chọn address đầu tiên trong `inputAddresses` thuộc `senderUser` — đúng nhưng không nhất thiết là address “canonical”. G5 có thể chọn theo policy khác.
- **Coinjoin** hiện chỉ đánh dấu `is_coinjoin=true` + `coinjoin_holdout`, KHÔNG cố gắng attribute per-vout owner (đúng spec G2 §6). G5+ có thể mở review UI cho reviewer chỉnh tay.
- **Discovery** hiện gọi mempool.space mỗi candidate → khi list dài (~100), thời gian ~100×API. G5 nên batch qua `/addresses/all`.
- **Feature flag reader** đọc `system_config.value` là JSON — kỳ vọng boolean/string; nếu ai set kiểu khác cần fix reader.
- **founder role** chưa có trong enum `app_role` — review queue RLS hiện chỉ check `admin` (đủ cho G4 dark-launch).

**G5 handoff:** parser v2 đã ổn định về contract. G5 chỉ cần: (1) enable flag từng bước theo QA plan G2, (2) chạy historical rebuild + shadow_diff cho 3 P0 user, (3) không đụng schema.

---

## 15. Validation checklist

- [x] Micro-migration applied clean (linter warnings all pre-existing).
- [x] Cột `raw_sha256` nullable, không ảnh hưởng cache cũ.
- [x] RPC `btc_persist_semantic_batch` EXECUTE grant chỉ `service_role`.
- [x] Cả 2 edge function `verify_jwt=true` mặc định + admin role check trong body.
- [x] Feature flags mặc định OFF (đã set từ G3).
- [x] Classifier zero import Supabase.
- [x] Dry-run có 2 lớp guard (`index.ts` clear pendingCacheRows + `persister.ts` return null).
- [x] Deterministic review ID (uuidv5).
- [x] Audit log có timings_ms breakdown.
- [x] Không code cron, không sửa scanner v1, không đụng UI/leaderboard.
- [ ] Manual dry-run 4 tx G1 → truth table khớp 100% (chờ Cha chạy).
- [ ] Shadow-write test → so diff → tắt flag (chờ Cha chạy).

---

**G4 sẵn sàng bàn giao. Cha có thể chạy dry-run bằng admin token bất cứ lúc nào; toàn bộ pipeline zero side-effect.**
