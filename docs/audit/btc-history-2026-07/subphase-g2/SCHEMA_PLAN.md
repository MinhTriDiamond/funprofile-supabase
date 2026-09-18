# G2 · SCHEMA_PLAN — schema mới cho BTC semantic layer

**Spec-only.** Không migration ở G2. G3 sẽ implement.

## 1. Bảng mới

### 1.1 `btc_tx_semantic` — canonical per-vout store (SSOT store)
Nguồn duy nhất cho `v_btc_history`. Mỗi row = 1 vout đã classify.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | uuid PK | |
| tx_hash | text NOT NULL | 64 hex, không `0x` |
| vout_index | int NOT NULL | 0-based |
| block_height | int | |
| block_time | timestamptz | |
| chain_family | text NOT NULL CHECK ('bitcoin') | ép cứng bitcoin |
| flow_type | text NOT NULL | `internal_donation \| external_in \| external_out \| self_transfer \| change \| treasury_flow \| coinjoin_holdout` |
| sender_user | uuid NULL | NULL nếu coinjoin/unknown |
| recipient_user | uuid NULL | |
| sender_address | text | lowercase |
| recipient_address | text NOT NULL | |
| amount_sat | bigint NOT NULL | satoshi, string-safe |
| is_self_transfer | bool DEFAULT false | |
| is_change | bool DEFAULT false | |
| is_treasury | bool DEFAULT false | |
| is_coinjoin | bool DEFAULT false | |
| tags | text[] DEFAULT '{}' | `treasury_flow`, `coinjoin_flag`, `hd_change_verified`, `legacy_no_vout`… |
| classifier_version | text NOT NULL | vd `v2.0.0` |
| classified_at | timestamptz DEFAULT now() | |
| raw_tx_cached_at | timestamptz | thời điểm fetch mempool |
| review_queue_id | uuid NULL | FK `btc_review_queue.id` nếu ambiguous |

**Unique:** `UNIQUE (tx_hash, vout_index, recipient_address)`.
**Index:** `(sender_user, block_time DESC)`, `(recipient_user, block_time DESC)`, `(tx_hash)`, `(flow_type)`.

### 1.2 `btc_review_queue`
| Cột | Kiểu |
|---|---|
| id | uuid PK |
| tx_hash | text NOT NULL |
| vout_index | int NULL | NULL nếu review cả tx |
| reason | text NOT NULL | enum below |
| evidence | jsonb | payload đầy đủ |
| suggested_verdict | jsonb NULL | AI auto-suggest |
| status | text DEFAULT 'pending' | `pending \| approved \| rejected \| deferred` |
| reviewer_id | uuid NULL | |
| reviewer_verdict | jsonb NULL | quyết định cuối |
| reviewed_at | timestamptz NULL |
| created_at | timestamptz DEFAULT now() |

**Reason enum:** `coinjoin_multi_owner | father_aux_manual | hd_change_needs_verify | ambiguous_ownership | class_b_suspect | treasury_flow_unclassified`.

**RLS:** admin/reviewer only.

### 1.3 `btc_ownership_snapshot` — ownership store immutable
Thay `profile_btc_aux_addresses` khi RESOLVE (bảng cũ freeze write, giữ để cross-check).

| Cột | Kiểu |
|---|---|
| id | uuid PK |
| address | text NOT NULL |
| user_id | uuid NOT NULL |
| source | text NOT NULL | `custodial \| profile_primary \| hd_change_verified \| manual_review` |
| integrity_status | text DEFAULT 'ok' | `ok \| needs_review \| revoked` |
| tx_count_at_verify | int |
| funded_btc_at_verify | numeric(20,8) |
| verified_at | timestamptz DEFAULT now() |
| verified_by | uuid NULL |
| notes | text |

**Unique:** `(address)` — 1 address chỉ thuộc 1 user tại 1 thời điểm.

## 2. Cột thêm vào bảng cũ (nullable, không phá row cũ)

### `donations`
- `vout_index INT NULL` — backfill G3, tag `legacy_no_vout` nếu không suy được.
- `classifier_version TEXT NULL` — vd `v1_legacy` cho row cũ.
- `tags TEXT[] DEFAULT '{}'` — bao gồm `treasury_flow`, `coinjoin_flag`, `self_transfer`, `legacy_no_vout`.
- `superseded_by UUID NULL` — FK `btc_tx_semantic.id`.
- `integrity_status TEXT DEFAULT 'ok'` — `ok | superseded | suspect_aux_exchange | needs_review`.

### `wallet_transfers`
- Cột tương tự: `vout_index`, `classifier_version`, `tags`, `superseded_by`, `integrity_status`.

## 3. Unique/index mới
- `donations`: partial unique `(tx_hash, vout_index, recipient_address) WHERE chain_family='bitcoin' AND vout_index IS NOT NULL`.
- `wallet_transfers`: partial unique tương tự.
- `btc_tx_semantic`: xem §1.1.

## 4. View SSOT `v_btc_history`
```sql
-- pseudo
SELECT
  s.tx_hash, s.vout_index, s.block_time,
  s.sender_user, s.recipient_user,
  s.sender_address, s.recipient_address,
  s.amount_sat, s.flow_type, s.tags,
  'v2'::text AS source_version
FROM btc_tx_semantic s

UNION ALL

-- legacy tail: row cũ chưa được supersede (parser v2 chưa cover)
SELECT
  d.tx_hash, d.vout_index, d.created_at,
  d.sender_id, d.recipient_id,
  d.sender_address, d.recipient_address,
  d.amount_sat, 'legacy'::text AS flow_type,
  COALESCE(d.tags, '{}') || ARRAY['legacy_no_vout'],
  'v1_legacy'::text
FROM donations d
WHERE d.chain_family='bitcoin'
  AND d.superseded_by IS NULL
  AND d.integrity_status='ok'
  AND NOT EXISTS (SELECT 1 FROM btc_tx_semantic s WHERE s.tx_hash=d.tx_hash);
```

Consumer chỉ đọc view này. Wallet / History / Benefactors / Treasury migrate cùng lúc ở G6.

## 5. Deprecate (không drop)
- `profile_btc_aux_addresses` — freeze write từ G3; scanner v2 không insert. Data giữ nguyên để cross-check migration + rollback.
- `hd_input_back` source đã disabled ở E — vẫn giữ record với `integrity_status='revoked'`.

## 6. RLS
- `btc_tx_semantic`: service_role write; authenticated read (đi qua view).
- `btc_review_queue`: admin/founder only.
- `btc_ownership_snapshot`: service_role write; authenticated read address→user mapping (không lộ metadata review).

## 7. Grant checklist (G3 sẽ ghi trong migration)
Mọi bảng public mới BẮT BUỘC:
```sql
GRANT SELECT ON public.<t> TO authenticated;
GRANT ALL ON public.<t> TO service_role;
ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;
```
