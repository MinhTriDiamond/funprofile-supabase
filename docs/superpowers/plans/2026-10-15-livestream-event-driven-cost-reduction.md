# Livestream Event-Driven Cost Reduction Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce idle Livestream cron invocations while preserving session lifecycle, replay readiness, security, and recoverability.

**Architecture:** First inventory the live production cron state and map the separate RTMP/Cloudflare and Agora webcam/Cloud Recording pipelines. Then add event-driven triggers only where a trustworthy event source exists, retain a bounded reconciler as a safety net, and handle legacy orphans through a reviewed dry-run classification before any state mutation.

**Tech Stack:** Supabase Edge Functions (Deno), Postgres triggers/pg_cron, Agora Cloud Recording, Cloudflare Stream, R2, React/TypeScript, Bun/Vitest.

**Spec:** `docs/mailboxes/quang-vu.md` — Mục 1 (proposal from Lê Minh Trí via Angel Muse, 2026-10-15). Treat its counts and provider behavior as claims to verify, not runtime facts.

## Global Constraints

- Follow `AGENTS.md`; do not edit generated Supabase client/type files, Lovable-managed `.env`, or project-level settings in `supabase/config.toml`.
- Do not expose secret values, signed URLs, stream keys, auth headers, or raw provider exception payloads.
- Keep RTMP/OBS (Cloudflare Stream) and Agora webcam (Agora Cloud Recording) state machines separate unless code proves a shared abstraction is safe.
- Preserve idempotency, current user-visible end semantics, replay/feed state transitions, lease guards, and provider cleanup behavior.
- Never infer current production cron state from migration history alone; query and record the actual active jobs and target URLs first.
- Do not apply a production cron migration, mutate production rows, or deploy schedule changes until the migration is reviewed and explicitly approved.
- Orphan recovery must start with read-only classification/dry-run. Do not bulk-end, delete, or mark rows unrecoverable based on age alone.
- Use Bun/Vitest and `tsgo`; do not change unrelated `bun.lock` or `supabase/.temp/` contents.

## Review Focus

- Duplicate, delayed, or out-of-order provider events must not duplicate posts, recordings, or cleanup actions; prove with idempotency tests.
- Missing or invalid webhook signatures must be rejected without leaking payloads or secrets; prove with auth tests.
- Provider callback delivery can fail; prove the safety reconciler still discovers pending work.
- A delayed/missing heartbeat or provider API soft failure must not prematurely end an active session; prove unknown/error cases remain non-terminal.
- Orphan records may still contain recoverable media; prove dry-run reports classifications and production mutation is separately gated.

---

### Task 1: Verify actual production inventory and classify pipelines

**Files:**
- Read: `docs/mailboxes/quang-vu.md`
- Read: `supabase/migrations/*` relevant to live cron schedules
- Read: `supabase/functions/*` live, replay, RTMP, Agora, and webhook handlers
- Read-only production query/report: `cron.job`, recent `cron.job_run_details`, and aggregate live/replay state counts

**Interfaces:**
- Produces an inventory table: job name, active schedule, function/SQL target, project host, pipeline owner (RTMP vs Agora), work performed, and whether it is safe to consolidate.
- Produces a separate state-transition map for RTMP/Cloudflare and Agora webcam/Cloud Recording.

- [x] Verify the current project ref and compare every active cron target host. Flag migration URLs that disagree with runtime config.
- [x] Verify or label as unconfirmed the reported 19 jobs, 17,844 runs/day, 71.5%, 205 webcam sessions, 9 RTMP sessions, and orphan counts.
- [x] Identify existing provider callbacks. Do not treat Cloudflare `stream-webhook` as an Agora webhook.
- [x] Trace app stop actions, database writes, recording stop/finalize, replay readiness, feed post update, and cleanup for both modes.
- [x] Produce read-only evidence and explicit unknowns; make no edits in this task.

### Task 2: Design event delivery and the bounded reconciler

**Files:**
- Inspect: `supabase/functions/live-webcam-recording-processor/index.ts`
- Inspect: `supabase/functions/live-webcam-replay-reconciler/index.ts`
- Inspect: `supabase/functions/live-replay-archive-cron/index.ts`
- Inspect: `supabase/functions/live-replay-mp4-poll-cron/index.ts`
- Inspect: `supabase/functions/live-rtmp-grace-watchdog/index.ts`
- Inspect: existing webhook and outbox/trigger patterns under `supabase/functions/` and `supabase/migrations/`

**Interfaces:**
- Proposed authenticated/idempotent event handler contract, if supported by the actual Agora product configuration.
- Proposed unified reconciler contract with bounded batch size, per-pipeline processing, and explicit metrics.
- Reversible schedule migration draft; no production application in this task.

- [x] Verify from current official Agora documentation and project configuration which Cloud Recording callback events exist, their authentication, retries, and payload guarantees. If they cannot provide a reliable file-ready signal, use an event from the app/DB plus low-frequency status query as appropriate; do not claim webhook coverage that is unavailable.
- [x] Define an idempotency key and durable event/outbox state for duplicate and delayed events; preserve ordering by reading authoritative database/provider state.
- [x] Define reconciler coverage so every pending state currently owned by each cron remains recoverable, with a bounded limit and per-mode safeguards.
- [x] Quantify the expected worst-case detection and replay latency at five-minute cadence and identify any short polling (for example MP4 readiness) that cannot be removed safely.
- [x] Prepare rollback steps that restore the exact prior schedules without duplicating jobs.

### Task 3: Implement and test event-driven processing

**Files:**
- Create or modify: narrowly scoped Edge Function webhook/event handlers, only after Task 2 verifies the provider contract
- Create or modify: database outbox/trigger migration if an existing pattern cannot fulfill the verified contract
- Modify: existing stop/finalize caller only where the trace proves an event is missing
- Test: focused Vitest policy and handler tests; SQL migration validation following project conventions

**Interfaces:**
- Event handlers acknowledge only after durable acceptance; downstream processing is retryable and idempotent.
- App stop calls the existing authenticated server-side finalizer and does not create duplicate replay/feed posts.

- [x] Add failing tests for duplicate, delayed, invalid-signature, missing-event, and provider-soft-failure cases.
- [x] Implement the smallest event path supported by the verified provider and current architecture.
- [x] Confirm replay only becomes playable after the existing media verification gate; preserve temporary source until that gate succeeds.
- [ ] Verify app end requests stop/finalize at most once while allowing safe retry after timeout.
- [x] Run focused tests, `tsgo`, relevant Deno checks, and `git diff --check`; report pre-existing failures separately.

### Task 4: Add orphan inventory and guarded recovery

**Files:**
- Create or modify: read-only orphan report/query
- Create or modify: recovery function or SQL only after dry-run classifications are reviewed
- Test: recovery policy tests for every category

**Interfaces:**
- Dry-run output includes counts and IDs/reasons suitable for a protected admin workflow, never credentials.
- Recovery accepts an explicit category/limit and is idempotent; age alone is not a terminal decision.

- [x] Classify stale sessions and replays by mode, lifecycle state, provider IDs, recording IDs, source object availability, linked post, and last successful transition.
- [x] Report recoverable, retryable, safely terminal, and ambiguous cases separately; provider-backed terminal verification was unavailable, so existing terminal labels remain unverified.
- [x] Add tests that ambiguous/recoverable rows are never force-ended or deleted.
- [x] Do not execute a production cleanup or bulk mutation from the implementation task.

### Task 5: Roll out in stages and update the mailbox

**Files:**
- Modify after rollout evidence: `docs/mailboxes/quang-vu.md`
- Migration: one reversible schedule change, with explicit exact job names and rollback schedule

**Interfaces:**
- Stage A: event path and existing schedules run in parallel for a measured period.
- Stage B: consolidate only verified redundant schedules, initially keeping a five-minute safety reconciler.
- Stage C: remove remaining redundant jobs only after measured parity and successful recovery evidence.

- [x] Record baseline invocation counts and failures; post-change, event lag, replay-ready latency, and missed-work recovery rate remain unmeasured until Stage A.
- [ ] Review and explicitly approve the schedule migration before applying it to production.
- [ ] Apply only to the verified production project; confirm active jobs and target URLs after each stage.
- [ ] Roll back immediately if parity, session end decisions, archive success, or feed readiness regresses.
- [ ] Update `docs/mailboxes/quang-vu.md` with verified findings, commit/deploy references, metrics, rollback state, and remaining unknowns; do not mark unverified figures as facts.
