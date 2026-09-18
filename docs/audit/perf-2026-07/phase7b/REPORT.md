# Phase 7B — SQL Root Cause Fix Report

**Date:** 02/07/2026  
**Migration:** `20260702_phase7b_unified_tx_antijoin_indexes.sql` (auto-named)  
**Scope:** DB layer only. No RPC contract change. No FE change.

---

## 1. Root cause (recap)

`v_unified_transactions.tx` CTE was filtering `transactions` rows using two `NOT EXISTS`
sub-selects against `donations` and `wallet_transfers` on the expression
`lower(tx_hash)`. There was **no btree index on `(lower(tx_hash), chain_id)`** on those
tables, so the planner fell back to a **Nested Loop Anti Join** that re-scanned the heap
for every candidate row.

Effect: even a page-1 read for a user with ~1.9k unified rows touched **~223k buffers /
760+ ms** just on that anti join.

## 2. Fix applied

1. Three functional btree indexes:
   - `idx_donations_lower_tx_hash_chain           (lower(tx_hash), chain_id) WHERE tx_hash IS NOT NULL`
   - `idx_wallet_transfers_lower_tx_hash_chain    (lower(tx_hash), chain_id) WHERE tx_hash IS NOT NULL`
   - `idx_transactions_lower_tx_hash_chain        (lower(tx_hash), chain_id) WHERE tx_hash IS NOT NULL`
2. Rewrote the `tx` CTE inside `v_unified_transactions` to use
   `LEFT JOIN donations d ON lower(d.tx_hash)=lower(t.tx_hash) AND d.chain_id=t.chain_id`
   + `LEFT JOIN wallet_transfers w ON …` + `WHERE d.tx_hash IS NULL AND w.tx_hash IS NULL`.
   Postgres now picks Anti Join with the new indexes.

Column list, types and dedup semantics of `v_unified_transactions` and
`v_unified_transactions_primary` are **unchanged**. RPCs are untouched.

## 3. Benchmarks (target user `80c0a487…`, 1906 unified rows)

| Query | Before | After | Speedup |
|---|---:|---:|---:|
| `SELECT * FROM v_unified_transactions_primary WHERE user_id=X ORDER BY occurred_at DESC LIMIT 50` | **872 ms / 223,470 buf** | **127 ms / 12,385 buf** | **6.9×** |
| `SELECT COUNT(*) FROM v_unified_transactions_primary WHERE user_id=X` | 874 ms / 223,560 buf | (equivalent, ~130 ms projected) | ~6.7× |
| `get_unified_transactions('profile', X, …limit=50)` | ~7.0 s (user report) | **161 ms** | **~43×** |
| `get_unified_summary('profile', X)` | ~7.1 s (audit) | **149 ms** | **~47×** |
| `get_unified_counterparties('profile', X)` | ~7.1 s (audit) | **139 ms** | **~51×** |

Before/after EXPLAIN traces: see `EXPLAIN_BEFORE.txt` and `EXPLAIN_AFTER.txt`.

Key sub-plan change on the tx CTE:

- Before: `Nested Loop Anti Join … Bitmap Heap Scan on donations` → 762 ms, 214k buffers
- After:  `Nested Loop Anti Join … Index Scan using idx_donations_lower_tx_hash_chain` →
  15 ms, ~3k buffers. `Index Scan using idx_wallet_transfers_lower_tx_hash_chain` for the
  second anti join.

## 4. Regression matrix

Correctness re-verified: row count on primary view for the target user unchanged
(**1906**), page-1 rows unchanged (spot-checked identical `id` set for LIMIT 50).
No RPC signature changed; no FE change required.

## 5. Next

- Phase 7A (FE): render list first, defer summary/counterparties, drop 5000-row summary
  fetch in favor of `get_unified_summary`, decouple `optionsRows` from filters.
- Phase 7C: aggregate cleanup once 7A is in.
- Phase 7D (guardrails) later.
