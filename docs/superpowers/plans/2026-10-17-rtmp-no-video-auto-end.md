# RTMP No-Video Auto-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically end an RTMP live after OBS stops delivering current-session video for the configured reconnect grace period, then preserve the existing replay archive and feed-post pipeline.

**Architecture:** Treat Cloudflare Live Input transport connection and current-session active video as separate signals. Persist a dedicated no-video grace timestamp, have both RTMP watchdog entrypoints use one shared decision policy, and require a final successful Cloudflare recheck before ending. Reuse the existing fenced end-session path and archive/retry pipeline so repeated cron invocations remain safe.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Cloudflare Stream Live Inputs API, PostgreSQL migration, Bun tests.

**Spec:** User report and screenshot from 2026-10-17; repository code in `live-replay-archive-cron`, `live-rtmp-grace-watchdog`, `cloudflareStreamService`, and `rtmpEndLiveService`.

## Global Constraints

- Communicate in Vietnamese with accents; address the user as “Cha”.
- Follow `AGENTS.md`; use Bun and `tsgo`, and do not edit generated Supabase client/types, `.env`, or project-level `supabase/config.toml` fields.
- Do not expose stream keys, bearer tokens, raw Cloudflare payloads, signed playback URLs, or raw request bodies in logs or responses.
- Do not change Agora/webcam lifecycle behavior, maximum live duration, manual end behavior, persistent input ownership, or RTMP end-claim fencing.
- During implementation, do not deploy, apply a production migration, alter cron schedules/secrets/data, or push code. A separate explicit release request authorizes the required migration and deployment steps.
- Cloudflare API failures, unknown states, missing timestamps, and stale videos from older sessions must never be treated as proof that the current source stopped.

## Review Focus

- A connected/persistent Live Input with no current-session active video must begin one grace window instead of refreshing its health timestamp; test connected input + no video.
- A Cloudflare read error or unknown input state must defer auto-end without clearing or advancing the confirmed-loss timestamp; test errors and unknown state.
- Video that resumes before the deadline must clear the loss window and preserve the session; test reconnect before expiry.
- Video that remains absent after grace must be confirmed by a fresh final read and end once through the fenced end-session service; test final-read failure, recovery, and duplicate watchdog runs.
- Ended sessions must still enqueue/retry replay archive and update the same feed post idempotently; test post/replay retry behavior without creating duplicates.
- A black/blank scene that OBS continues to encode is still an active transport stream and cannot be reliably classified as “source absent” from connection metadata alone; document this product limitation.

---

### Task 1: Define explicit no-video grace policy

**Files:**
- Modify: `supabase/functions/_shared/rtmpDisconnectPolicy.ts`
- Modify: `src/modules/live/rtmpDisconnectPolicy.test.ts`
- Modify: `supabase/functions/_shared/rtmpEndLiveService.ts` only if a new grace setting/helper is needed.

**Interfaces:**
- Consume existing `detectRtmpLiveConnection()` result fields: `inputConnected`, `videoStreaming`, `confirmedDisconnected`, `errors`, and `reason`.
- Produce a pure, testable policy that distinguishes input-disconnected from input-connected-without-current-video, and refuses to decide on API errors or unknown state.

- [x] **Step 1: Write failing policy tests** for input connected/no video starting grace; input connected/current video clearing grace; unknown/error preserving safety; and expired no-video grace requiring final confirmation.
- [x] **Step 2: Run the focused Bun test** and confirm the new behavior fails before implementation.
- [x] **Step 3: Implement the minimal pure policy** without changing existing input-disconnect policy semantics.
- [x] **Step 4: Run the focused Bun test** and confirm all policy cases pass.

### Task 2: Persist and apply no-video grace in both watchdog paths

**Files:**
- Create: `supabase/migrations/<timestamp>_rtmp_no_video_grace.sql` adding nullable `video_signal_lost_at timestamptz` to `public.live_sessions` and the smallest useful partial index for active RTMP sessions if query plans require it.
- Modify: `supabase/functions/live-replay-archive-cron/index.ts`
- Modify: `supabase/functions/live-rtmp-grace-watchdog/index.ts`
- Modify: `supabase/functions/_shared/cloudflareStreamService.ts` only if the detector needs a safe semantic correction.

**Interfaces:**
- Both watchdogs must call the same policy/helper and use `video_signal_lost_at` as the no-video grace anchor.
- Reuse the configured RTMP disconnect grace (default 180 seconds) unless existing production configuration is verified and explicitly documented; do not add an unverified timeout default.

- [x] **Step 1: Add migration** for the dedicated nullable timestamp; do not rewrite historical sessions.
- [x] **Step 2: Add focused tests** that pin timestamp creation once, reset after current-session video returns, and no state change on Cloudflare API failure.
- [x] **Step 3: Update both polling paths** so input connection alone does not mean video is healthy. Current-session active video refreshes health and clears no-video grace; successful input-connected/no-video observations start/preserve the grace; disconnected input retains its existing disconnect grace behavior.
- [x] **Step 4: After the deadline, perform a fresh Cloudflare check.** If current-session video has returned, recover; if reads fail or state is unknown, defer; only a successful no-video observation may call `endRtmpLiveSession()` with an explicit auto-end reason.
- [x] **Step 5: Make database read/update errors visible and fail-safe.** Do not silently report a processed session when state persistence failed.
- [x] **Step 6: Run watchdog and policy tests**; verify repeated invocations cannot create competing end effects because end-session fencing remains authoritative.

### Task 3: Preserve archive and feed behavior after automatic end

**Files:**
- Inspect/modify only if regression is demonstrated: `supabase/functions/_shared/rtmpEndLiveService.ts`, `supabase/functions/_shared/archiveReplayService.ts`, `supabase/functions/live-replay-archive-cron/index.ts`, and existing replay archive tests under `src/modules/live/`.

**Interfaces:**
- Automatic no-video end must use the existing end-session service, not directly mutate terminal status, post, replay, or Cloudflare input.
- Existing archive retry and idempotency contracts remain unchanged.

- [x] **Step 1: Add/extend a test** proving auto-end moves an existing live post into processing and queues the replay exactly once.
- [x] **Step 2: Verify archive cron can discover the ended session/replay** and update the existing feed post after R2 verification; no duplicate post may be inserted on retry.
- [x] **Step 3: Change archive/feed code only if that test identifies a concrete gap.** Keep Cloudflare source deletion behind existing verified-R2 guards.
- [x] **Step 4: Run the focused archive and end-fencing tests.**

### Task 4: Verify, document, and report release requirements

**Files:**
- Update: `docs/mailboxes/quang-vu.md` with the root cause, field/policy changes, tests, and exact production release steps.
- Update this plan checklist as completed when implementation is done.

- [x] Run focused Bun tests for policy, both watchdog decision helpers, end fencing, and replay/feed idempotency.
- [x] Run `bunx --package @typescript/native-preview tsgo --noEmit`, relevant `deno check` entrypoints, and `git diff --check`.
- [x] Inspect the final diff and ensure `supabase/.temp/` and secrets are excluded.
- [x] Apply only the requested migration to the confirmed production project, then deploy the three dependent Edge Functions under the user's separate release authorization.
