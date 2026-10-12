# FUN PROFILE — POST-COPY RECONCILIATION AGENT PROMPT

You are working inside the FUN Profile migration repository.

## SOURCE OF TRUTH
Use this file as the authoritative migration memory and policy source:

`FUN_PROFILE_MIGRATION_MASTER_MEMORY_2026-09-28.md`

Read it fully before changing code.

The current migration phase is:

**POST-COPY COMPLETION / FINAL CUTOVER PREPARATION**

The true-COPY bulk phase is complete. The task now is to build a safe, resumable, auditable reconciliation runner for mutable production drift and final cutover preparation.

---

# 1. NON-NEGOTIABLE SAFETY RULES

1. SOURCE IS READ ONLY. Never INSERT/UPDATE/DELETE/DDL on source.
2. Never print, request, echo, persist, or commit passwords, JWTs, access tokens, refresh tokens, private keys, DB secrets, OAuth secrets, RTMP/Cloudflare credentials, or raw password hashes.
3. `FUN_JWT` is local-only and may expire. Do not write it to `.env.migration.local` or logs.
4. Never use `git add .`.
5. Never bypass `.gitignore`, secret scanning, allowlists, or non-empty safety gates.
6. Target writes must be explicit and gated. Default mode is DRY RUN / READ ONLY.
7. No target write may occur unless all dependency, trigger, schema, row-count, and policy prechecks pass.
8. Parent before child.
9. Preserve exact trigger state before/after every target write.
10. Generated columns must never be inserted directly; let target recompute them.
11. Do not blindly enable deferred functions/triggers.
12. Do not copy stale runtime credentials or secrets from source.
13. Runtime-sensitive tables must follow policy-aware exactness, not blind byte-for-byte copy.
14. Every apply transaction must rollback on any mismatch.
15. Do not treat timestamp cutoffs as sufficient exactness for mutable tables. Use PK set-diff/full reconciliation logic where required.
16. Never make destructive target changes merely to force row counts to match.
17. Do not start cutover writes or app switching. This task is reconciliation tooling + dry-run audit unless explicitly instructed otherwise.

---

# 2. CURRENT VERIFIED CHECKPOINTS

Use the MASTER MEMORY as authoritative, plus these latest confirmed post-copy results:

## Table accounting
- Manifest tables: 275
- Root state verified: 209
- Deferred root state: 4
  - app_stats_cache
  - link_preview_cache
  - rtmp_stream_configs
  - token_price_current
- 62 missing root-state tables were proven to be intentional `empty_source_tables`.
- 63 total empty-source tables were target-audited and all 63 had target row count 0.
- No unexpected nonzero target tables in that group.

## Cycle / backfill audit — CLOSED PASS
- profiles.pinned_post_id: 38/38 exact
- profiles.current_live_session_id: 0 non-null
- messages.reply_to_id: 3/3 exact
- comments.parent_comment_id: 611/611 exact
- pplp_mint_requests.parent_request_id: 371/371 exact
- reel_comments.parent_comment_id: 0 refs; target 57 rows; orphan refs 0

## Profiles drift reconciliation checkpoint
At an earlier checkpoint:
- source profiles: 1651
- target profiles before sync: 1649
- PK set diff: source_only 2, target_only 0
- corresponding auth dependency was missing on target

Auth dependency sync completed successfully:
- 2 auth.users inserted exact
- 2 auth.identities inserted exact
- generated columns excluded:
  - auth.users.confirmed_at
  - auth.identities.email
- orphan identities: 0

Profiles sync completed successfully:
- 2 profiles inserted exact
- target profiles became 1651
- 19/19 USER triggers restored enabled
- 0 disabled
- current_live_session_id remained 0

Important: source production continued changing after this checkpoint.

## Latest source counts observed on 2026-10-01
- profiles: 1653
- posts: 189289
- live_sessions: 10732

## Existing target counts at prior checkpoint
- profiles: 1651 after latest successful profile sync
- posts: 187754
- live_sessions: 10711

## Posts post-cutoff set-diff latest observed
Original posts cutoff:
`2026-09-23T09:34:04.592674+00:00`

Latest source rows after cutoff: 3557
Target rows after cutoff: 2024
Common IDs: 2024
Source-only IDs after cutoff: 1533
Target-only IDs after cutoff: 0

Total source-target posts count gap at latest checkpoint: 1535.
Therefore there appear to be 2 additional source-only posts at/before original cutoff, proving that cutoff-only delta logic is insufficient for final exact reconciliation.

## live_sessions
Original snapshot cutoff:
`2026-09-26T06:57:26.315742+00:00`

Policy:
`HISTORICAL_WITH_RUNTIME_NEUTRALIZATION`

Runtime fields that must remain neutralized / not blindly copied include:
- rtmp_config_id
- stream_key_encrypted
- armed_session_token
- rtmps_url
- cloudflare_live_input_id
- cloudflare_input_id

Runtime booleans to neutralize:
- is_input_armed = false
- source_connected = false
- preview_ready = false

RTMP policy:
`REBUILD_ROTATE_NOT_COPIED`

## Posts / live_sessions dependency direction
`live_sessions` is CHILD of `posts` through:
- live_post_id -> posts.id
- post_id -> posts.id
- replay_post_id -> posts.id

Therefore posts must reconcile before live_sessions.

---

# 3. EXISTING ENGINE / FILES

Inspect before creating anything new:

- `scripts/mac-migrator-v4.3.py`
- `scripts/mac-migrator-v4.4-batch.py`
- `scripts/mac-migrator-v4.4-executor.py`
- `scripts/fun-sql.sh`
- `migration-snapshot/28-migration-manifest.json`
- `migration-snapshot/29-small-batch-plan.json`
- `migration-state/`
- `migration-state/.work/`
- existing migration-temp artifacts
- existing backups listed in MASTER MEMORY

Do not replace working migration engines unless necessary. Prefer building a reconciliation layer that reuses proven primitives.

`fun-sql.sh` is the READ-ONLY source helper.
Source Lane A may return at most 1000 rows per statement, so use resumable keyset pagination.

---

# 4. PRIMARY DELIVERABLE

Build a safe reconciliation runner, preferably:

`scripts/post-copy-reconcile.py`

and any small helper modules only if justified.

The runner must default to **dry-run/read-only**.

Suggested CLI shape:

```bash
python3 scripts/post-copy-reconcile.py audit
python3 scripts/post-copy-reconcile.py audit --table profiles
python3 scripts/post-copy-reconcile.py audit --table posts
python3 scripts/post-copy-reconcile.py audit --table live_sessions
python3 scripts/post-copy-reconcile.py plan
python3 scripts/post-copy-reconcile.py apply --table <table> --require-plan <plan-file>
python3 scripts/post-copy-reconcile.py verify --table <table>
```

Do not implement an unsafe "apply all" shortcut.

---

# 5. REQUIRED RUNNER BEHAVIOR

## A. Environment / preflight
- Confirm required environment variables exist WITHOUT printing values.
- Confirm source helper works using a harmless read-only probe.
- Confirm target connection works.
- Confirm source helper is still read-only by code/default.
- Confirm target schema compatibility for the table being reconciled.
- Confirm generated columns.
- Confirm target trigger state and record exact pre-state.
- Confirm migration policy for the table.

## B. Full PK set-diff
For mutable tables, compute:
- source count
- target count
- common PKs
- source-only PKs
- target-only PKs

Do not assume `source_count - target_count == source_only` is enough.

For tables >1000 source rows, keyset paginate.
Use type-aware PK ordering. Integer/BIGINT PKs must be numerically ordered, not lexically ordered.
Composite PKs must use stable tuple ordering.

Persist only non-secret reconciliation metadata/artifacts.

## C. Historical-gap detection
Where an original cutoff exists:
- calculate exact set-diff after cutoff
- also audit at/before cutoff for late historical inserts / backfills
- surface discrepancies explicitly

For posts, current known condition is:
- 1533 source-only after cutoff
- total gap 1535
- therefore investigate 2 source-only at/before cutoff

Do not copy posts yet until dependency analysis is complete.

## D. Dependency analysis
Use target PostgreSQL FK metadata to build dependency requirements.
For any source-only row batch:
- identify referenced parents
- check target parent existence
- classify READY / BLOCKED_BY_PARENT / POLICY_BLOCKED

Do not print row-level PII or secrets.

## E. Auth handling
Auth must be treated specially.
- users before identities before profiles
- exclude generated columns
- password hashes may be copied only as existing hashes; never print values
- no raw auth payload files
- exact verify after insert
- target-only pairs must not be deleted automatically
- final Auth exact reconciliation remains a distinct later phase

## F. Trigger preservation
Before any target write:
- snapshot exact non-internal trigger names and tgenabled states
- if writes require trigger suppression, restore exact original state afterward
- never blindly `ENABLE TRIGGER USER` if original state was mixed
- rollback if trigger state after write differs from before

## G. Runtime-sensitive policy
For `live_sessions`, apply policy-aware transform:
- historical row preserved
- runtime credentials/tokens/Cloudflare/RTMP identifiers neutralized as defined in MASTER
- runtime booleans false as defined
- never copy old RTMP credentials
- verify transformed target row against transformed expected row, not raw source row

## H. Exact verification
After every apply transaction:
- exact inserted/updated row count
- exact transformed row comparison
- parent FK existence
- orphan count zero
- trigger state restored exactly
- generated columns recomputed
- count checkpoint

Any mismatch => transaction rollback.

## I. Updates and deletes
Do NOT implement destructive update/delete reconciliation blindly.
First build read-only classification:
- source-only
- target-only
- common-but-different

For common-but-different rows:
- identify differing columns
- classify safe mutable data vs runtime/generated/target-rebuilt/policy fields
- produce a plan only

For target-only rows:
- never delete automatically
- report and require explicit review/policy

---

# 6. POLICY MATRIX — MUST HONOR

From MASTER MEMORY:

- app_secrets = REBUILD_TARGET
- app_secrets_audit = SKIP
- connector_config = COPY
- connector_links = COPY/no-op if empty
- connector_windows = SKIP_EPHEMERAL
- oauth_clients = SPECIAL_ROTATE metadata only
- oauth_codes = SKIP_EPHEMERAL
- rtmp_stream_configs = REBUILD_ROTATE
- app_stats_cache = REBUILD_TARGET
- token_price_current = REBUILD_TARGET
- link_preview_cache = REBUILD_TARGET
- cross_platform_tokens = SKIP_EPHEMERAL_REAUTHORIZE

Never convert these into blind COPY behavior.

---

# 7. CURRENT RECONCILIATION ORDER

For the immediate dry-run plan, use this order unless FK analysis proves a stricter dependency:

1. Auth dependency drift for newly discovered profile IDs
2. profiles
3. posts
4. live_sessions
5. live_replays
6. messages
7. comments
8. mint_allocations
9. reactions
10. notifications
11. live_session_events
12. full Auth final exact audit
13. sequences
14. storage
15. deferred functions/triggers
16. sensitive rebuild/rotate verification
17. final schema exact audit
18. final cutover runner

Parents before children always overrides this list.

---

# 8. STATE / PLAN OUTPUTS

Create human-readable and machine-readable reports, for example:

`migration-state/reconcile/<timestamp>-audit.json`
`migration-state/reconcile/<timestamp>-plan.json`
`migration-state/reconcile/<timestamp>-report.md`

Reports must include counts/status only where data is sensitive.
Do not include emails, phone numbers, password hashes, tokens, metadata blobs, secrets, or raw private payloads.

Each table report should include:
- source count
- target count
- PK type
- source-only count
- target-only count
- common count
- common-different count if computed
- dependency blocker count
- generated columns
- trigger pre-state summary
- policy
- recommended next action
- whether APPLY is allowed

---

# 9. RESUMABILITY

Reconciliation must be resumable.
Use work-state files similar to existing migrator conventions.
Never require restarting a multi-million-row audit from zero after interruption if a safe resume point exists.

For GIANT tables, preserve lessons already learned:
- frozen cutoff where appropriate
- PK pagination
- no unnecessary full count upfront
- external merge FD limits
- type-aware PK sorting
- target streaming verification
- timeout override where required
- verify-only recovery

---

# 10. TESTS REQUIRED BEFORE ANY APPLY

At minimum:

1. `python -m py_compile` / syntax check.
2. Unit test PK ordering for UUID, integer/BIGINT, composite PK.
3. Test source pagination at 1000-row boundary.
4. Test historical-gap detection where a source-only row has `created_at <= cutoff`.
5. Test trigger state preservation with mixed enabled/disabled synthetic state logic.
6. Test generated-column exclusion.
7. Test policy-aware live_sessions transform.
8. Test rollback path when exact verification fails.
9. Test no secrets are printed in normal logs/errors.
10. Dry-run against current target/source without writes.

---

# 11. FIRST TASK TO EXECUTE NOW

Do NOT apply writes yet.

Perform the following:

### Step 1 — Inspect
Read MASTER MEMORY and existing migration code/state. Summarize the architecture you found.

### Step 2 — Implement runner
Implement the dry-run reconciliation runner and tests.

### Step 3 — Run current DRY-RUN audit for:
- profiles
- posts
- live_sessions

Refresh counts because production is mutable.

For `profiles`, discover any new source-only IDs beyond the previously reconciled 1651 target checkpoint and audit corresponding auth dependencies.

For `posts`, perform FULL exact PK set-diff, not cutoff-only. Explicitly verify the currently suspected historical-gap rows at/before the original cutoff.

For `live_sessions`, perform full PK set-diff but DO NOT apply. Audit dependencies against posts and profiles and prepare policy-aware transformed plan.

### Step 4 — Stop and report
STOP before any target write.

Return a concise report with:
- files created/modified
- tests run and results
- current source/target counts
- PK set-diff for the 3 tables
- historical-gap findings for posts
- dependency blockers
- any unexpected schema/trigger/policy findings
- exact commands proposed for the first safe APPLY

Do not proceed to APPLY until explicitly authorized.

---

# 12. SUCCESS CRITERIA FOR THIS TASK

This task is successful when:

- a reusable reconciliation runner exists,
- dry-run is the default,
- no source writes occurred,
- no target writes occurred,
- no secrets were printed or committed,
- current drift for profiles/posts/live_sessions is fully classified,
- posts historical-gap issue is explained by exact PK set-diff,
- live_sessions plan respects runtime neutralization,
- the next APPLY step is small, dependency-safe, and auditable.

If any ambiguity exists, STOP and report it rather than guessing.
