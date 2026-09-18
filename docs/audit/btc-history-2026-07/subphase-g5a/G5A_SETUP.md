# Sub-phase G5A — Ownership Re-verification (Setup + KPI queries)

**Trạng thái:** SCAFFOLDED. Feature flag `btc_ownership_reverify_enabled` = OFF.
**Nhiệm vụ:** Xây `btc_ownership_snapshot` đủ tin cậy để parser v2 dựa vào mà không cần đoán.

---

## 1. Edge function

`supabase/functions/btc-ownership-reverify/index.ts` — POST admin-only.

### Body

```jsonc
{
  "mode": "dry_run" | "apply",   // apply cần flag ON
  "batch_size": 50,               // tối đa 200
  "offset": 0,
  "user_ids": ["uuid", ...],      // filter tuỳ chọn
  "include_primary": true,        // profiles.btc_address
  "include_aux": true,            // profile_btc_aux_addresses (active)
  "address": "bc1..."             // one-off recheck
}
```

Trả về `results[]` (verdict + reason + guard_snapshot + confidence + review_id nếu có) + `next_offset` để pagination.

### Nguồn ứng viên (candidate source, KHÔNG phải SSOT)

1. `profiles.btc_address` → `source='profile_primary'`, confidence 1.000, không gọi mempool (user-declared).
2. `profile_btc_aux_addresses` **active** (`disabled_at IS NULL`) → chạy full guard cascade.

### Guard cascade (aux)

Thứ tự | Guard | Fail → verdict
---|---|---
1 | Đã sở hữu user khác trong `btc_ownership_snapshot` | `review_queue` (reason `ambiguous_ownership`, severity critical)
2 | Class-A blacklist (77 exchange addr disabled ở E-phase + `blacklisted_wallets`) | `rejected` (hard, không vào review)
3 | Fetch mempool.space fail | `review_queue` (reason `hd_change_needs_verify`, low)
4 | User là Father / treasury | `review_queue` (reason `father_aux_manual`, high) — **không auto-apply**
5 | `tx_count > 20` | `review_queue` (reason `hd_change_needs_verify`, medium)
6 | `funded_btc > 1.0` | `review_queue` (reason `hd_change_needs_verify`, medium)
7 | PASS toàn bộ | `accepted` → insert vào `btc_ownership_snapshot`

### Confidence heuristic (accepted rows)

Base 0.90 (`hd_change_verified`), điều chỉnh:
- `tx_count <= 5` → +0.05
- `funded_btc > 0.1` → −0.05
- Clamp [0.80, 0.95].

Primary luôn 1.000.

### Evidence trong review_queue (đầy đủ theo yêu cầu Cha)

```json
{
  "source": "g5a_reverify",
  "address": "bc1...",
  "candidate_user": "uuid",
  "candidate_source": "aux_legacy",
  "legacy_row_id": "uuid",
  "first_seen_tx": "hash",
  "guard_snapshot": { "tx_count": 12, "funded_btc": 0.03, "address_type": "p2wpkh", "fetched_at": "..." },
  "guard_fail": "tx_count>20"
}
```

---

## 2. Workflow chạy G5A

```
1. Dry-run toàn bộ (flag OFF)
   POST btc-ownership-reverify { mode:"apply", batch_size:50, offset:0 }
   → server tự downgrade → dry_run, đọc kết quả để review.

2. Xem kết quả (results[] cho từng batch), sanity check.

3. Cha duyệt bật flag:
   UPDATE system_config SET value='{"enabled": true}'::jsonb WHERE key='btc_ownership_reverify_enabled';

4. Loop apply theo batch (offset += slice_size cho đến khi next_offset=null).

5. Sau khi xong: TẮT flag ngay
   UPDATE system_config SET value='{"enabled": false}'::jsonb WHERE key='btc_ownership_reverify_enabled';

6. Sinh 2 report bằng SQL bên dưới, xuất ra CSV vào docs/audit/btc-history-2026-07/subphase-g5a/.

7. Kiểm tra KPI PASS G5A.
```

---

## 3. KPI PASS G5A (Cha chốt)

| # | KPI | Ngưỡng | Query |
|---|---|---|---|
| 1 | Coverage 3 user G1 | **≥ 98%** | §4 Phần B |
| 2 | Class-A trong ownership snapshot | **= 0** | §5.1 |
| 3 | Ownership conflict (1 address ↔ 2 user) | **= 0** | §5.2 (bảng đã có unique nhưng vẫn check) |
| 4 | Mọi row snapshot có confidence + verified_at + source + tx_count_at_verify + funded_btc_at_verify (aux) | **100%** | §5.3 |
| 5 | Mọi review item có đầy đủ evidence | **100%** | §5.4 |

---

## 4. OWNERSHIP_COVERAGE.md — SQL sinh dữ liệu

### Phần A — Toàn hệ thống

```sql
WITH primary_addrs AS (
  SELECT lower(btc_address) AS address, id AS user_id
  FROM public.profiles WHERE btc_address IS NOT NULL
),
aux_active AS (
  SELECT lower(address) AS address, user_id
  FROM public.profile_btc_aux_addresses WHERE disabled_at IS NULL
),
all_cand AS (
  SELECT address, user_id FROM primary_addrs
  UNION
  SELECT address, user_id FROM aux_active
),
verified AS (
  SELECT lower(address) AS address FROM public.btc_ownership_snapshot WHERE integrity_status='ok'
),
review AS (
  SELECT DISTINCT (evidence->>'address') AS address
  FROM public.btc_review_queue
  WHERE (evidence->>'source')='g5a_reverify' AND status='pending'
)
SELECT
  (SELECT count(*) FROM all_cand) AS candidate_total,
  (SELECT count(*) FROM primary_addrs) AS primary_count,
  (SELECT count(*) FROM verified) AS verified_snapshot,
  (SELECT count(*) FROM review) AS pending_review,
  (SELECT count(*) FROM all_cand WHERE address NOT IN (SELECT address FROM verified) AND address NOT IN (SELECT address FROM review)) AS unknown,
  round(100.0 * (SELECT count(*) FROM verified) / NULLIF((SELECT count(*) FROM all_cand),0), 2) AS coverage_pct;
```

### Phần B — 3 user G1 (angelkim / angelutopia / angelthienhanh68)

### Phần C — 7 user QA (bổ sung: angelthuha / angelhoangtydo / trogiauco / father)

```sql
WITH targets(username) AS (
  VALUES
    ('angelkim'),('angelutopia'),('angelthienhanh68'),
    ('angelthuha'),('angelhoangtydo'),('trogiauco'),('angelfather')
),
u AS (SELECT p.id, p.username FROM public.profiles p JOIN targets t ON p.username=t.username),
cand AS (
  SELECT u.username, lower(p.btc_address) AS address FROM u JOIN public.profiles p ON p.id=u.id WHERE p.btc_address IS NOT NULL
  UNION
  SELECT u.username, lower(a.address) FROM u JOIN public.profile_btc_aux_addresses a ON a.user_id=u.id WHERE a.disabled_at IS NULL
),
verified AS (SELECT lower(address) AS address, user_id FROM public.btc_ownership_snapshot WHERE integrity_status='ok'),
review AS (SELECT DISTINCT (evidence->>'address') AS address, (evidence->>'candidate_user')::uuid AS user_id FROM public.btc_review_queue WHERE (evidence->>'source')='g5a_reverify' AND status='pending')
SELECT
  u.username,
  count(DISTINCT c.address) AS candidate_total,
  count(DISTINCT c.address) FILTER (WHERE EXISTS (SELECT 1 FROM verified v WHERE v.address=c.address AND v.user_id=u.id)) AS verified,
  count(DISTINCT c.address) FILTER (WHERE EXISTS (SELECT 1 FROM review r WHERE r.address=c.address AND r.user_id=u.id)) AS pending_review,
  count(DISTINCT c.address) FILTER (
    WHERE NOT EXISTS (SELECT 1 FROM verified v WHERE v.address=c.address AND v.user_id=u.id)
      AND NOT EXISTS (SELECT 1 FROM review r WHERE r.address=c.address AND r.user_id=u.id)
  ) AS unknown,
  round(100.0 * count(DISTINCT c.address) FILTER (WHERE EXISTS (SELECT 1 FROM verified v WHERE v.address=c.address AND v.user_id=u.id))
        / NULLIF(count(DISTINCT c.address),0), 2) AS coverage_pct
FROM u
LEFT JOIN cand c ON c.username=u.username
GROUP BY u.username
ORDER BY u.username;
```

---

## 5. Sanity queries (KPI 2–5)

### 5.1 Class-A rò rỉ vào snapshot (KPI 2)

```sql
WITH classA AS (
  SELECT lower(address) AS address FROM public.profile_btc_aux_addresses
  WHERE disabled_at IS NOT NULL AND disabled_reason ILIKE '%exchange%'
  UNION
  SELECT lower(wallet_address) FROM public.blacklisted_wallets
)
SELECT count(*) AS class_a_leak
FROM public.btc_ownership_snapshot s
JOIN classA c ON c.address = lower(s.address);
```

Ngưỡng: `= 0`.

### 5.2 Ownership conflict (KPI 3)

```sql
SELECT address, count(DISTINCT user_id) AS user_count
FROM public.btc_ownership_snapshot
GROUP BY address HAVING count(DISTINCT user_id) > 1;
```

Ngưỡng: `0 row`.

### 5.3 Metadata completeness cho aux rows (KPI 4)

```sql
SELECT count(*) AS aux_missing_metadata
FROM public.btc_ownership_snapshot
WHERE source='hd_change_verified'
  AND (confidence IS NULL OR verified_at IS NULL OR tx_count_at_verify IS NULL OR funded_btc_at_verify IS NULL);
```

Ngưỡng: `= 0`.

### 5.4 Evidence completeness cho review queue (KPI 5)

```sql
SELECT count(*) AS review_missing_evidence
FROM public.btc_review_queue
WHERE (evidence->>'source')='g5a_reverify'
  AND (
    evidence->>'address' IS NULL
    OR evidence->>'candidate_user' IS NULL
    OR evidence->>'candidate_source' IS NULL
    OR evidence->>'guard_fail' IS NULL
    OR (
      (evidence->>'candidate_source')='aux_legacy'
      AND evidence->'guard_snapshot' IS NULL
      AND (evidence->>'guard_fail') NOT LIKE 'address_already_owned%'
    )
  );
```

Ngưỡng: `= 0` (schema function đã đảm bảo insert đầy đủ; query dùng để double-check).

---

## 6. OWNERSHIP_CONFIDENCE_DISTRIBUTION.md — SQL

```sql
SELECT confidence, count(*) AS cnt
FROM public.btc_ownership_snapshot
GROUP BY confidence
ORDER BY confidence DESC;
```

Bucket phân loại thủ công theo yêu cầu Cha:

```sql
SELECT
  CASE
    WHEN confidence = 1.000 THEN '1.000'
    WHEN confidence >= 0.950 THEN '0.950-0.999'
    WHEN confidence >= 0.900 THEN '0.900-0.949'
    WHEN confidence >= 0.800 THEN '0.800-0.899'
    ELSE '< 0.800'
  END AS bucket,
  count(*) AS cnt
FROM public.btc_ownership_snapshot
GROUP BY 1 ORDER BY 1 DESC;
```

---

## 7. Rollback

Nếu G5A cần huỷ:

```sql
-- Xoá toàn bộ snapshot + review do G5A tạo (idempotent)
DELETE FROM public.btc_review_queue WHERE (evidence->>'source')='g5a_reverify';
DELETE FROM public.btc_ownership_snapshot WHERE notes LIKE 'g5a_reverify:%';
UPDATE public.system_config SET value='{"enabled": false}'::jsonb WHERE key='btc_ownership_reverify_enabled';
```

---

## 8. Không được làm

- ❌ Import 987+ aux address vào snapshot mà không guard.
- ❌ Auto-apply Father / treasury aux.
- ❌ Học từ input side (RC-10).
- ❌ Cutover view `v_btc_history`.
- ❌ Sửa UI / leaderboard.
- ❌ Chạy replay parser v2 (đó là G5B).
