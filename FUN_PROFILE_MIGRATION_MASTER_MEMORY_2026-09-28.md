# FUN PROFILE MIGRATION — MASTER PROJECT MEMORY
Checkpoint: 2026-09-28

## 1) Mục tiêu & kiến trúc
Migrate toàn bộ production FUN Profile từ Lovable Cloud sang Lovable project mới + Supabase mới.
Kiến trúc: Lovable Cloud source READ ONLY -> Mac Migration Runner -> target direct PostgreSQL.
Bulk migration là point-in-time snapshot, KHÔNG phải CDC. Final cutover vẫn cần freeze/delta/reconcile.

## 2) Source / Target / Local
SOURCE
- Lovable Project ID: f06fbccb-088c-4170-8736-4f1a09d4d572
- Workspace: ANGEL DIỆU NGỌC / yohX8dBZcFxsKNVvapcP
- Source ref: bhtsnervqiwchluwuxki
- Source là Lovable Cloud, không phải standalone Supabase direct DB.
- Source luôn READ ONLY.

TARGET
- Lovable Project ID: 331267a9-893e-47d1-8309-12038b7636f7
- Workspace: MinhTriCamlycoin / kEqZkfNNC3nu5Nvl41aV
- Supabase ref: tljfqavndndfsvtazibe
- Direct DB: db.tljfqavndndfsvtazibe.supabase.co
- Region Singapore
- Data API ON; expose new tables OFF; Automatic RLS OFF.

LOCAL
- Repo: ~/Web-project/funprofile
- branch main
- source helper: scripts/fun-sql.sh (use bash scripts/fun-sql.sh)
- target env: TARGET=host=db.tljfqavndndfsvtazibe.supabase.co port=5432 dbname=postgres user=postgres sslmode=require
- PGPASSFILE: $HOME/.postgresql/fun-migration-pgpass, chmod 600
- .env.migration.local ignored; NEVER store FUN_JWT there.
- New shell:
  cd ~/Web-project/funprofile
  source .env.migration.local

## 3) Security rules
- Never paste/request/repeat passwords, private keys, JWTs, DB secrets.
- FUN_JWT local only; it expires often.
- Source helper read-only by code/default.
- Passwords migrate as hashes only; hashes are sensitive.
- migration artifacts contain prod data.
- .gitignore includes migration-auth/, migration-temp/, migration-state/, migration-snapshot/, scripts/__pycache__/, *.bak, *.pgpass, .pgpass, .env.migration.local.
- PGPASSFILE outside repo.
- Never git add . before ignore + secret audit.
- Final cleanup: rotate/expire tokens, audit repo/history, wipe/encrypt artifacts, delete unneeded .bak, maybe rotate target DB password, clipboard hygiene.
- Raw FUN_JWT appeared in earlier uploaded logs; treat exposed and rotate/sign out after migration stage.
- oauth_clients rotated secrets stay local in migration-state/oauth-clients-rotated-secrets.json mode 600.
- Never copy old OAuth access/refresh tokens, RTMP/Cloudflare credentials.

## 4) Schema baseline
SOURCE
- public tables 275 (11 backup/audit excluded)
- views 15
- current public functions 332 + 5 deferred
- current triggers 160 + 4 deferred
- RLS policies 594
- storage buckets 6
- matviews 0

TARGET CORE PASS
- enums 26
- sequences 6
- tables 275
- columns incl. views 3543
- generated columns 2
- constraints 780 = 172 check + 227 FK + 275 PK + 106 unique
- indexes 946 / standalone 565
- RLS enabled 275/275
- views 15
- functions 332
- triggers 160
- policies 594
- grants exact
- sequence ownership exact

Deferred functions:
cleanup_old_system_data
cron_unschedule_by_name
trg_profile_impersonation_rescan
trg_profile_impersonation_scan
trigger_pplp_v25_vvu_calc

Deferred triggers:
light_actions x1
pplp_v2_user_actions x1
profiles x2

## 5) Supabase Oct 30 2026 grant change
Existing target grants already exact.
Future rule:
CREATE TABLE -> ENABLE RLS -> POLICIES -> EXPLICIT GRANTS -> VERIFY GRANTS
Do not blindly grant anon/authenticated/service_role all CRUD.
Final SOP must include DATA API GRANT GATE — SUPABASE OCTOBER 30 CHANGE.

## 6) Auth checkpoint
Initial source:
- users 1654
- identities 1788
- password hashes 1554
- no-password users 100
- orphan identities 0
- old-account login on target succeeded.
- auth app triggers intentionally deferred.

Later:
- one source-only user b118f03c-0650-4761-a3e7-323169e1dd71 inserted correctly; generated cols omitted.
Current target:
- auth.users 1655
- auth.identities 1789
- 5 target-only user/identity pairs intentionally remain for final exact reconcile.

## 7) FK graph / cycles / size
- 181 public->public FKs.
Cycles:
profiles_current_live_session_id_fkey
profiles_pinned_post_id_fkey
comments_parent_comment_id_fkey
messages_reply_to_id_fkey
pplp_mint_requests_parent_request_id_fkey
reel_comments_parent_comment_id_fkey
- 275-table import order.
- ~12M rows, ~7.16GB base + ~1.78GB indexes, ~9.02GB total.

## 8) Sensitive/config policy matrix
app_secrets = REBUILD_TARGET
app_secrets_audit = SKIP
connector_config = COPY
connector_links = COPY/no-op if empty
connector_windows = SKIP_EPHEMERAL
oauth_clients = SPECIAL_ROTATE metadata only
oauth_codes = SKIP_EPHEMERAL
rtmp_stream_configs = REBUILD_ROTATE
app_stats_cache = REBUILD_TARGET
token_price_current = REBUILD_TARGET
link_preview_cache = REBUILD_TARGET
cross_platform_tokens = SKIP_EPHEMERAL_REAUTHORIZE

## 9) Manifest / engines
Manifest: migration-snapshot/28-migration-manifest.json
275 tables.
Composite PK:
- pplp_daily_action_mint(action_name,day_utc)
- token_price_fetch_failures(symbol,date)
- token_price_history(symbol,date)
- buddy_members(circle_id,user_id)
0 no-PK tables.
2 generated cols.
98 tables with app triggers.

Engine: scripts/mac-migrator-v4.3.py
Planner: scripts/mac-migrator-v4.4-batch.py
Small executor: scripts/mac-migrator-v4.4-executor.py
Plan: migration-snapshot/29-small-batch-plan.json
v4.4 remains small-wave only; Medium/LARGE/GIANT use direct v4.3. Do not bypass v4.4 gate.

## 10) Core engine behaviors
- empty target preflight except reviewed exceptions.
- DISABLE TRIGGER USER -> COPY -> count -> ENABLE -> COMMIT.
- postcommit count + trigger state + SHA.
- resumable keyset source pagination.
- stable cutoffs.
- work state .work/<table>.json.
- source Lane A <=1000 single statement.
- numeric canonicalization Decimal.
- explicit allowlist.
- security exact for user_roles.
- generated columns omitted where required.

LARGE_STREAM_TABLES:
chunked_recording_chunks
notifications
live_session_events
Sort chunk 25k; target verify pages 1000.

## 11) Major data checkpoints
profiles:
- snapshot 1649
- current_live_session_id + pinned_post_id neutralized.
- 38 pinned_post refs saved.
- current_live_session refs 0.
- final exact required.

posts:
- initial 185730.
- later parent syncs: +17 live_sessions, +570 comments, +422 post_attachments, +94 donations, +760 reactions, +153 notifications, +7 notifications frozen drift, +1 final live_sessions parent.
- current target posts = 187754.
- 9 triggers restored exactly each targeted sync.
- final exact required.

live_replays 10745 exact; final exact.
messages 37601 initial +118 donation parent = 37719; 3 reply refs backfilled; final exact.
reel_comments 57 PASS.
pplp_mint_requests 2584; 371 parent refs backfilled PASS.
mint_allocations 2679; 1046 updated; final exact.

live_sessions:
- initial 10703.
- runtime-safe neutralization policy.
- later +8 missing parents for frozen live_session_events.
- current target = 10711.
Null fields:
  rtmp_config_id
  stream_key_encrypted
  armed_session_token
  rtmps_url
  cloudflare_live_input_id
  cloudflare_input_id
False fields:
  is_input_armed
  source_connected
  preview_ready
- policy HISTORICAL_WITH_RUNTIME_NEUTRALIZATION
- RTMP policy REBUILD_ROTATE_NOT_COPIED
- 7 triggers restored.
- final exact is policy-aware.

Other exact checkpoints:
chunked_recordings 4232
creator_library 5897
live_co_hosts 1
live_messages 1122
live_reactions 6941
buddy_members 13
pplp_daily_action_mint 52
token_price_fetch_failures 79
token_price_history 1252
scanner_tick_log 15990
transactions 69901
external_tx_filter_log 69001
pplp_v25_vvu_log 150276
pet_interactions 117975
identity_epoch_snapshots 130985
scanner_block_gaps 128298
wallet_reconciliation_findings 220692
comments 79354 current; 611 cycle refs backfilled; +39 reaction parent drift
post_attachments 49572
donations 35441; deps +6 conversations +94 posts +118 messages
light_actions 388564 exact; SHA 790115...; 2 triggers restored; trg_v25_vvu_light_actions deferred

Specials:
connector_windows source913 -> target0 SKIP
oauth_codes source1335 -> target0 SKIP
app_stats_cache target1 rebuild
token_price_current target6 rebuild
link_preview_cache target0 rebuild
rtmp_stream_configs target0 rebuild/rotate
oauth_clients source4 metadata copied, secrets rotated locally
cross_platform_tokens source204 -> target0 skip/reauthorize

reactions:
- cutoff 2026-09-27T07:06:42.902521+00:00
- 574197 exact
- SHA d330d8d77451745effc8ddf3739550e127d7036af731f59cde33831b25050f30
- deps fixed +760 posts +39 comments

chunked_recording_chunks:
- 1116392 exact
- SHA cc76245fd2b0d8e5d0edd4db88ff66c66f37716dbb9470bcc88c4cf165fbda14

notifications:
- cutoff 2026-09-27T14:33:42.055272+00:00
- 1604797 exact
- SHA 2fda50801397f5256d1d286ed61a2c1f4158a79436841eda4fb5ee90271bb2e7
- 7 frozen missing posts synced before final apply
- final parent gaps zero

## 12) GIANT live_session_events — authoritative final record
This is the final true-COPY table.

GIANT mode:
- id BIGINT/int8.
- FK live_session_id -> live_sessions(id).
- no USER triggers.
- frozen cutoff 2026-09-27T18:06:18.30874+00:00
- pagination by created_at <= cutoff plus id > cursor, ORDER BY id ASC
- no upfront full count
- exact row count after pagination.

Frozen source:
- rows 7163612
- min id 1
- max id 7163654
- JSONL migration-temp/live_session_events-v4.3-rows.jsonl
- JSONL bytes 6181441908
- CSV migration-temp/live_session_events-v4.3.csv
- CSV bytes 5708856811
- distinct live_session refs 6523

Dependency drift:
- initially target had 6515/6523 live_sessions, missing 8.
- those 8 source sessions verified.
- their deps: profiles 5/5; posts initially 6/7.
- missing post d03fa706-c13d-465e-8062-04e3e87f6595 synced exact; posts triggers restored.
- then 8 live_sessions synced with safe neutralization.
- final frozen dependency = 6523/6523, missing 0.

FD failure:
- source hash 287 chunks failed at soft ulimit 256 with Too many open files.
- hard limit unlimited.
- cleaned only temp hash-sort dir; preserved JSONL/work state.
- set ulimit -n 1024.
- rerun source prep successful.
Lesson: GIANT external merges must check FD limit or multipass merge.

COPY timeout:
- first COPY canceled around line 3952371.
- target statement_timeout was 2min.
- transaction rolled back fully, target returned 0.
- lock_timeout 0; idle_in_transaction_session_timeout 0.
Fix: session-only PGOPTIONS='-c statement_timeout=0'.

Hash mismatch bug:
- successful COPY produced 7163612 target rows.
- original source hash 9945b54038840ef42fa4f1a8220aade7cda4ada94136facb46807e492b6246f4
- target hash bbacdf2667ec317244fc55d9ba31a5db38757e234d473db2ca2381d67f95d273
- 22 sample rows exact field-by-field.
Root cause: source external sort used str(row[pk]) causing BIGINT lexical ordering, while PostgreSQL target ORDER BY bigint used numeric ordering.
True engine-equivalent source numeric-order hash:
bbacdf2667ec317244fc55d9ba31a5db38757e234d473db2ca2381d67f95d273
exact target match.

BIGINT hash-order patch:
backup scripts/mac-migrator-v4.3.py.pre-bigint-hash-order-fix.bak
- integer PK types smallint/integer/bigint -> int(value) sort key
- noninteger -> string key
- both chunk.sort and heapq.merge fixed
- py_compile PASS
- synthetic lexical [1,10,100,11,2,99]
- numeric [1,2,10,11,99,100]

Verify-only gate bug:
- verify-only had been hardcoded only for posts.
- live_session_events target full caused target-preflight expected0 error.
Patch:
- verify-only allowed only for posts + live_session_events.
backup scripts/mac-migrator-v4.3.py.pre-live-session-events-verify-only.bak
- py_compile PASS.

FINAL live_session_events:
=== MAC MIGRATOR V4.3 APPLY SUCCESS ===
SOURCE ROWS 7163612
TARGET ROWS 7163612
SOURCE SHA256 bbacdf2667ec317244fc55d9ba31a5db38757e234d473db2ca2381d67f95d273
TARGET SHA256 bbacdf2667ec317244fc55d9ba31a5db38757e234d473db2ca2381d67f95d273
HASH MATCH True
TRIGGERS BEFORE []
TRIGGERS AFTER []
TRIGGER STATE RESTORED True
WORK STATE migration-state/.work/live_session_events.json
STATE FILE migration-state/live_session_events.json
success timestamp 2026-09-28T07:03:34.921761+00:00

Conclusion:
TRUE-COPY PHASE COMPLETE.

## 13) Known engine backups
scripts/mac-migrator-v4.3.py.pre-large-streaming-verifier.bak
scripts/mac-migrator-v4.3.py.pre-source-prep-stop-gate.bak
scripts/mac-migrator-v4.3.py.pre-chunked-recording-chunks.bak
scripts/mac-migrator-v4.3.py.pre-notifications.bak
scripts/mac-migrator-v4.3.py.pre-live-session-events-giant.bak
scripts/mac-migrator-v4.3.py.pre-giant-policy-gate.bak
scripts/mac-migrator-v4.3.py.pre-bigint-hash-order-fix.bak
scripts/mac-migrator-v4.3.py.pre-live-session-events-verify-only.bak

## 14) Remaining work — authoritative
A. Cycle/backfill audit
- profiles.pinned_post_id 38 pending backfill/verify
- profiles.current_live_session_id initial 0 but final verify
- messages.reply_to_id final verify
- comments.parent_comment_id final verify
- pplp_mint_requests.parent_request_id final verify
- reel_comments.parent_comment_id final verify

B. Mutable-table exact final reconciliation
At minimum:
profiles, posts, live_replays, messages, comments, mint_allocations, live_sessions, reactions, notifications, live_session_events, auth.
Parents before children.
Policy-aware exactness for neutralized/rebuilt tables.

C. Auth final exact
- current target 1655 users / 1789 identities
- 5 target-only pairs known
- source may have changed.
- reconcile source-only, target-only, identities, hashes, generated cols.

D. Sequences
- final setval after all deltas.
- verify no collision.

E. Storage
- source baseline 6 buckets.
- storage object migration/completion is NOT documented as completed.
- verify buckets, objects, metadata, policies, actual access.

F. Deferred funcs/triggers
Review and deliberately enable/rebuild only after dependencies/runtime ready.

G. Sensitive rebuild/rotate verification
Recheck entire COPY/SKIP/REBUILD/ROTATE matrix.
No stale source credentials.

H. Final schema exact audit
tables, cols, constraints, indexes, RLS, policies, grants, views, functions, triggers, sequence ownership.
Apply Data API grant gate for any later-created objects.

I. Final cutover runner
Suggested:
T-24h/T-6h large delta
T-30min second delta
T-5min freeze
final delta/update/delete reconcile
parent before child
sequence setval
enable deferred pieces
switch app
smoke tests
reopen writes after PASS

J. Smoke tests
login, signup, profile, posts, comments, reactions, messages, live, replay/media, storage, RLS roles, functions/triggers, background jobs, rebuilt runtime integrations.

K. Security cleanup
rotate JWT/session/db creds as appropriate
remove/encrypt migration artifacts
remove unnecessary .bak
remove rotated-secret files after securely stored
repo + Git history secret scan
verify .gitignore
clipboard cleanup
revoke exposed tokens
confirm no prod data committed.

## 15) Final SOP lessons to document
PRE-MIGRATION SECURITY GATE
MIGRATION SECURITY CONTROLS
PRE-COMMIT SECRET SCAN
CUTOVER SECURITY CHECK
POST-MIGRATION CLEANUP & ROTATION

Also include:
- never git add . before ignore+secret audit
- no credential hardcoding
- source default read-only
- password hashes sensitive
- auth/temp/state/snapshot local only
- scanner never prints values
- clipboard hygiene
- distinguish v4.3 engine / v4.4 planner
- explicit allowlist / nonempty guard
- security exact precommit compare
- single-statement snapshot for small mutable/security tables
- generated cols excluded + verify recompute
- dependency drift parent watermark handling
- cycle neutralization/backfill
- target streaming verify for large
- psql \copy one physical line
- final cutover delta architecture
- Supabase Oct30 explicit Data API grants
- SPECIAL_ROTATE avoids old secrets; fingerprints only
- policy-aware exact reconcile for runtime/secrets
- GIANT: frozen cutoff + PK pagination + no full count upfront + deferred exact count + FD limits + timeout override + type-aware PK sorting + verify-only recovery.

## 16) Canonical current checkpoint
As of 2026-09-28:
- schema bulk PASS
- auth bulk snapshot PASS, final drift pending
- true-COPY data PASS COMPLETE
- final GIANT live_session_events PASS exact:
  rows 7163612
  SHA bbacdf2667ec317244fc55d9ba31a5db38757e234d473db2ca2381d67f95d273
  hash match True
- Current phase: POST-COPY COMPLETION / FINAL CUTOVER PREPARATION
- Operating rule: ONE command / ONE verification step at a time; inspect output before advancing; never ask for secrets; never write source.

## 17) Recommended next first step
Run a READ-ONLY post-copy completion audit:
- final state files for all 275 tables
- PASS / skipped / rebuilt / pending
- cycle backfill flags
- final reconcile flags
- deferred runtime pieces
- storage status
- auth status
- sequence status

Do not begin cutover writes until this audit is complete.
