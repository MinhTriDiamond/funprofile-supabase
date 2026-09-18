# G3 · Schema Migration Foundation — REPORT

**Status:** ✅ APPLIED
**Scope:** Chỉ đặt nền schema. Không parser, không backfill, không cutover, không UI, không đụng Father data.
**Spec nguồn:** `docs/audit/btc-history-2026-07/subphase-g2/`

---

## 1. Điều chỉnh so với G2 (theo 10 điểm Cha chốt)

| # | Điểm Cha yêu cầu | Trạng thái |
|---|---|---|
| 1 | `btc_tx_semantic` chỉ dùng `amount_sat` (không `amount_btc`) | ✅ áp dụng |
| 2 | Unique key có `chain_family`: `(chain_family, tx_hash, vout_index, recipient_address)` | ✅ áp dụng cho cả `btc_tx_semantic` + partial index `donations`/`wallet_transfers` |
| 3 | `classifier_version` format cố định `btc-semantic-v2.0.0` | ✅ ghi chú trong spec, cột `TEXT NOT NULL` (parser G4 emit string chuẩn) |
| 4 | `btc_review_queue.severity` enum critical/high/medium/low | ✅ cột `severity` + CHECK, default `medium` |
| 5 | `btc_raw_tx_cache` có `block_height`, `block_time` | ✅ áp dụng |
| 6 | `btc_ownership_snapshot.confidence NUMERIC(4,3)` | ✅ áp dụng, default `1.000`, CHECK `[0,1]` |
| 7 | Quy ước `tags`: lowercase, snake_case | ✅ ghi chú spec; enforcement ở parser G4 |
| 8 | Thêm flag `btc_history_ssot_enabled=false` | ✅ áp dụng |
| 9 | `ON DELETE SET NULL` cho `superseded_by` + `review_queue_id` | ✅ áp dụng |
| 10 | Chuẩn hoá enum `integrity_status`: ok/needs_review/suspect_aux_exchange/superseded/legacy | ✅ ghi chú trong spec (cột giữ `TEXT` mềm để không phá row cũ; CHECK sẽ siết ở migration sau khi backfill xong) |

**Ghi chú role:** `btc_review_queue` policy hiện chỉ check `has_role('admin')` vì enum `public.app_role` hiện chỉ có `{admin, user}`. Khi bổ sung `founder` vào enum sẽ mở rộng policy trong migration riêng.

---

## 2. Bảng mới (4)

### 2.1 `btc_tx_semantic` — SSOT store per-vout
- 24 cột, PK `id`.
- Unique: `(chain_family, tx_hash, vout_index, recipient_address)` → idempotency BTC.
- Index: `(sender_user, block_time DESC)`, `(recipient_user, block_time DESC)`, `(tx_hash)`, `(flow_type)`.
- CHECK: `chain_family='bitcoin'`, `vout_index>=0`, `amount_sat>=0`, `flow_type IN (internal_donation|external_in|external_out|self_transfer|change|treasury_flow|coinjoin_holdout)`.
- FK: `review_queue_id → btc_review_queue(id) ON DELETE SET NULL`.
- RLS: `authenticated` read; `service_role` full.

### 2.2 `btc_review_queue` — ambiguous review queue
- 14 cột.
- CHECK: `reason IN (coinjoin_multi_owner|father_aux_manual|hd_change_needs_verify|ambiguous_ownership|class_b_suspect|treasury_flow_unclassified)`; `severity IN (critical|high|medium|low)`; `status IN (pending|approved|rejected|deferred)`.
- Index: `(status, severity, created_at DESC)`, `(tx_hash)`.
- RLS: chỉ `admin` xem/sửa qua `has_role`; `service_role` full.

### 2.3 `btc_ownership_snapshot` — immutable ownership store
- 13 cột.
- Unique `(address)`; index `(user_id)`.
- CHECK: `source IN (custodial|profile_primary|hd_change_verified|manual_review)`, `confidence ∈ [0,1]`, `integrity_status IN (ok|needs_review|revoked)`.
- RLS: `authenticated` read; `service_role` full.

### 2.4 `btc_raw_tx_cache` — mempool.space cache
- 7 cột: `tx_hash PK`, `raw_json JSONB`, `block_height`, `block_time`, `size_bytes`, `source` (default `mempool.space`), `fetched_at`.
- Index: `(fetched_at DESC)`, `(block_time DESC)`.
- RLS: chỉ `service_role`, không expose FE. TTL sẽ handle ở G4.

---

## 3. Cột thêm cho bảng cũ

### `donations`
| Cột | Kiểu | Default |
|---|---|---|
| `vout_index` | INT NULL | – |
| `classifier_version` | TEXT NULL | – |
| `tags` | TEXT[] NOT NULL | `'{}'` |
| `superseded_by` | UUID NULL FK → `btc_tx_semantic(id)` ON DELETE SET NULL | – |

- `chain_family` và `integrity_status` đã có sẵn (không thêm).
- Partial unique: `donations_btc_vout_uniq` on `(chain_family, tx_hash, vout_index, recipient_address) WHERE chain_family='bitcoin' AND vout_index IS NOT NULL`.

### `wallet_transfers`
| Cột | Kiểu | Default |
|---|---|---|
| `vout_index` | INT NULL | – |
| `classifier_version` | TEXT NULL | – |
| `tags` | TEXT[] NOT NULL | `'{}'` |
| `superseded_by` | UUID NULL FK → `btc_tx_semantic(id)` ON DELETE SET NULL | – |
| `integrity_status` | TEXT NOT NULL | `'ok'` |

- Bảng dùng `counterparty_address` (không phải `recipient_address`) → partial unique: `wallet_transfers_btc_vout_uniq` on `(chain_family, tx_hash, vout_index, counterparty_address)`.

**Row count trước/sau migration:** không đổi (chỉ ADD COLUMN nullable / DEFAULT `'{}'`).

---

## 4. Feature flags (system_config)

| Key | Value | Ý nghĩa |
|---|---|---|
| `scan_btc_v2_enabled` | `{"enabled": false}` | Parser v2 (G4) |
| `btc_discovery_v2_enabled` | `{"enabled": false}` | Aux discovery v2 (G4+) |
| `btc_shadow_write_enabled` | `{"enabled": false}` | Dual-write vào `btc_tx_semantic` (G5) |
| `btc_history_ssot_enabled` | `{"enabled": false}` | Cutover view `v_btc_history` (G6) |
| `benefactors_v2_enabled` | `{"enabled": false}` | Leaderboard v2 (G7) |

Insert bằng `ON CONFLICT (key) DO NOTHING` → idempotent, safe re-run.

---

## 5. Triggers
- `trg_btc_tx_semantic_updated_at`, `trg_btc_review_queue_updated_at`, `trg_btc_ownership_snapshot_updated_at` — BEFORE UPDATE gọi `public.update_updated_at_column()`.
- `btc_raw_tx_cache` không cần trigger (chỉ có `fetched_at`).

---

## 6. GRANT / RLS matrix

| Table | anon | authenticated | service_role |
|---|---|---|---|
| `btc_tx_semantic` | – | SELECT | ALL |
| `btc_review_queue` | – | SELECT+UPDATE (chỉ admin qua RLS) | ALL |
| `btc_ownership_snapshot` | – | SELECT | ALL |
| `btc_raw_tx_cache` | – | – | ALL |

Tất cả 4 bảng đều `ENABLE ROW LEVEL SECURITY` + có policy.

---

## 7. Validation checklist

- [x] Migration apply clean (no error sau retry sửa role).
- [x] `donations` row count không đổi (chỉ ADD COLUMN nullable).
- [x] `wallet_transfers` row count không đổi.
- [x] `btc_tx_semantic` = 0 row.
- [x] `btc_review_queue` = 0 row.
- [x] `btc_ownership_snapshot` = 0 row.
- [x] `btc_raw_tx_cache` = 0 row.
- [x] 5 feature flag insert thành công, default `false`.
- [x] RLS enabled trên 4 bảng mới (verify qua linter — không finding mới liên quan G3).
- [x] Không đụng `profile_btc_aux_addresses`, không đụng Father data, không sửa view `v_btc_history` (chưa tạo).
- [x] Rollback SQL prepared (§8).

**Linter status:** 459 finding tồn tại từ trước (view SECURITY DEFINER, RLS-disabled ở bảng backup `btc_*_backup_20260621`, extension pgcrypto trong public…) — **không phát sinh finding mới từ G3**. Các bảng G3 tạo mới đều có RLS + policy đầy đủ.

---

## 8. Rollback prepared

File: `docs/audit/btc-history-2026-07/subphase-g3/ROLLBACK.sql`

```sql
-- Chạy nếu cần rollback G3. An toàn vì các bảng mới chưa có dữ liệu.
BEGIN;

-- 1. Drop feature flags
DELETE FROM public.system_config WHERE key IN (
  'scan_btc_v2_enabled',
  'btc_discovery_v2_enabled',
  'btc_shadow_write_enabled',
  'btc_history_ssot_enabled',
  'benefactors_v2_enabled'
);

-- 2. Drop partial unique indexes trên legacy tables
DROP INDEX IF EXISTS public.donations_btc_vout_uniq;
DROP INDEX IF EXISTS public.wallet_transfers_btc_vout_uniq;

-- 3. Drop FK constraints trước khi bỏ cột
ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_superseded_by_fk;
ALTER TABLE public.wallet_transfers
  DROP CONSTRAINT IF EXISTS wallet_transfers_superseded_by_fk;

-- 4. Bỏ cột thêm (an toàn — chưa row nào dùng)
ALTER TABLE public.donations
  DROP COLUMN IF EXISTS vout_index,
  DROP COLUMN IF EXISTS classifier_version,
  DROP COLUMN IF EXISTS superseded_by;
-- tags giữ lại nếu đã có row nào set (không strip default '{}')

ALTER TABLE public.wallet_transfers
  DROP COLUMN IF EXISTS vout_index,
  DROP COLUMN IF EXISTS classifier_version,
  DROP COLUMN IF EXISTS superseded_by;
-- integrity_status + tags giữ lại (đã default 'ok' / '{}')

-- 5. Drop 4 bảng mới (CASCADE để bỏ trigger + policy kèm)
DROP TABLE IF EXISTS public.btc_raw_tx_cache        CASCADE;
DROP TABLE IF EXISTS public.btc_ownership_snapshot  CASCADE;
DROP TABLE IF EXISTS public.btc_tx_semantic         CASCADE;
DROP TABLE IF EXISTS public.btc_review_queue        CASCADE;

COMMIT;
```

---

## 9. Điều KHÔNG làm ở G3

- ❌ Không viết parser code.
- ❌ Không backfill data (bảng semantic trống 0 row).
- ❌ Không tạo/thay đổi view `v_btc_history` (để G6).
- ❌ Không sửa UI, hook FE, edge function.
- ❌ Không đụng `profiles`, `profile_btc_aux_addresses`, Father data.
- ❌ Không sửa `benefactors`/leaderboard.
- ❌ Không bật bất kỳ feature flag nào.

---

## 10. Bước tiếp theo — chờ Cha duyệt G4

**G4 sẽ:**
1. Viết edge function `btc-scan-v2` (parser v2 theo `PARSER_SPEC.md`) — gated bởi `scan_btc_v2_enabled`.
2. Viết edge function `btc-aux-discovery-v2` (theo `DISCOVERY_SPEC.md`) — gated bởi `btc_discovery_v2_enabled`.
3. Dark launch: cả 2 flag vẫn OFF. Chỉ chạy manual invoke để verify pipeline.
4. Chưa dual-write. Chưa ghi vào `btc_tx_semantic` thật.

Sau G4 pass → G5 (bật `btc_shadow_write_enabled` cho 3 user G1 để dual-write shadow).
