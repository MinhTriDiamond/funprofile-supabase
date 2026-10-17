# Chat và cuộc gọi Agora — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Mỗi task có test riêng; không dùng production làm môi trường ghi.

**Goal:** Khôi phục gọi Agora an toàn và sửa các lỗi đã xác nhận ở quyền truy cập, Realtime, vòng đời gọi, nhắn tin và media.

**Architecture:** Migration mới thiết lập quyền tối thiểu, RPC SECURITY DEFINER có xác thực `auth.uid()`, RLS và publication. `agora-call-token` chỉ cấp token cho call row hợp lệ; frontend dùng RPC/Agora session-scoped cleanup. Message CRUD giữ client flow nhưng được bảo vệ bằng RLS; upload chat được kiểm tra owner prefix. Các test DB cần PostgreSQL local/staging riêng.

**Tech Stack:** Supabase PostgreSQL/RLS/SQL, Supabase Edge Functions/Deno, React/TypeScript, Agora RTC SDK Web 4.24.8, Vitest, Deno.

**Spec:** `docs/superpowers/specs/2026-10-17-chat-call-hardening-design.md`

## Global Constraints

- Không deploy Edge Function, không áp migration, không đổi secret và không ghi dữ liệu production trong task.
- Production project ref chỉ được xác nhận là `tljfqavndndfsvtazibe`; mọi thao tác production cần target check lại.
- Không sửa `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, hoặc project-level `supabase/config.toml`.
- Không đọc/in giá trị Agora/R2/Supabase secrets; không log JWT, Agora token, signed URL hoặc credential.
- Không chạy toàn bộ `db push`; migration mới phải đi qua review/approval riêng.
- Không claim SQL/RLS đã xác minh thật khi chỉ có mock/fixture; hiện không có local PostgreSQL, Docker hoặc Podman.
- Không gọi người dùng thật, không ghi âm, không kiểm chứng Safari/iPhone nếu không có thiết bị thật.

## Review Focus

- Token endpoint bị gọi với session ID của người ngoài hoặc call đã terminal → 401/403/404 ổn định, không phát hành token; test endpoint policy và SQL access.
- Hai request tạo/nhận call cùng lúc → chỉ một call mở cho một conversation; loser nhận kết quả xung đột/idempotent; test transaction SQL.
- Callback Agora hoặc realtime cũ tới sau khi đổi session → state của call mới không đổi; test reducer/orchestrator generation.
- Rời group rồi thử đọc/gửi/reply hoặc gọi → bị RLS/RPC từ chối; test bằng hai conversation và hai user trong SQL.
- Upload được nhưng gửi message lỗi hoặc retry → composer giữ file/nội dung, không tạo message trùng; test helper và kiểm chứng bằng UI sau khi triển khai.

---

## Kế hoạch theo lát cắt

### Task 1: DB security baseline, conversation membership và Realtime

**Files:**
- Create: `supabase/migrations/20261017110000_chat_security_realtime.sql`
- Create: `supabase/tests/chat_security_realtime.sql`
- Create: `src/modules/chat/chatRpc.ts`
- Modify: `src/modules/chat/hooks/useConversations.ts`
- Modify: `src/modules/chat/hooks/useGroupConversations.ts`
- Modify: `src/modules/chat/components/GroupSettingsDialog.tsx`
- Create: `src/modules/chat/components/AddGroupMemberDialog.tsx`
- Modify: `src/modules/chat/hooks/useBlocks.ts`
- Test: `src/__tests__/chat-conversation-contract.test.ts`

**Interfaces:**
- Produces RPCs: `create_direct_conversation(p_other_user_id uuid) -> uuid`, `create_group_conversation(p_name text, p_member_ids uuid[]) -> uuid`, `manage_conversation_member(p_conversation_id uuid, p_user_id uuid, p_action text) -> boolean`, `leave_conversation(p_conversation_id uuid) -> boolean`, `get_my_block_relationships() -> table(blocker_id uuid, blocked_id uuid, created_at timestamptz)`.
- RPCs derive actor only from `auth.uid()`; they do not accept caller identity.

- [ ] **Step 1: Write failing contract tests** for malformed policy names/definitions, required RPC names, fixed search paths, grants only to intended roles, and publication additions guarded with `IF NOT EXISTS`/catalog checks.
- [ ] **Step 2: Run the tests red** with `bunx vitest run src/__tests__/chat-conversation-contract.test.ts`; expected failure identifies missing secure RPC/policy definitions.
- [ ] **Step 3: Implement migration** that drops the two malformed policies; removes self-join policy path; creates atomic DM/group/member/leave/block relationship RPCs; revokes `anon` access, direct conversation/participant writes and unnecessary `TRUNCATE`, `REFERENCES`, `TRIGGER`; preserves only required authenticated SELECT/DML and service-role access. All SECURITY DEFINER functions set a fixed `search_path`, validate actor, and grant EXECUTE narrowly.
- [ ] **Step 4: Fix frontend conversation operations** to use RPCs, check returned errors, invalidate affected queries, and connect the existing group “Thêm” control to the admin add-member flow. Update `useBlocks` to read only relationships involving the current user via the scoped RPC.
- [ ] **Step 5: Add transactional SQL tests** for cross-conversation isolation, self-join denial, direct/group creation atomicity, admin add/remove vs non-admin denial, leave, block-row scope, grants and publication preservation.
- [ ] **Step 6: Run static contract test and DB test where available.** Run `bunx vitest run src/__tests__/chat-conversation-contract.test.ts`; run SQL test only against local/staging PostgreSQL with rollback. If unavailable, record the SQL test as not run and preserve the environment blocker; do not use production for writes.

### Task 2: Message access rules and existing messaging errors

**Files:**
- Create/modify: migration `supabase/migrations/20261017111000_chat_message_access.sql` (or fold into Task 1 only if one migration is still un-applied and review confirms clean boundaries)
- Modify: `src/modules/chat/hooks/useMessages.ts`
- Modify: `src/modules/chat/components/MessageSearch.tsx`
- Modify: `src/hooks/useTypingIndicator.ts`
- Modify: `src/modules/chat/hooks/usePins.ts`
- Modify: `src/modules/chat/hooks/useChatNotifications.ts`
- Modify: `src/modules/chat/hooks/useConversations.ts`
- Modify: `src/modules/chat/components/ChatInput.tsx`
- Test: `src/__tests__/chat-message-policy.test.ts`
- Test: add SQL cases in `supabase/tests/chat_security_realtime.sql`

**Interfaces:**
- Consumes: membership and block policy/RPCs from Task 1.
- Message send/edit/delete/read/reaction/pin remains scoped to the authenticated sender and active conversation.

- [ ] **Step 1: Write failing tests** for a blocked direct-message send, reply-to-message from a different conversation, editing/deleting after leaving, and upload/send failure preserving text and selected file state.
- [ ] **Step 2: Run focused tests red** with `bunx vitest run src/__tests__/chat-message-policy.test.ts`.
- [ ] **Step 3: Implement RLS/message policy changes**: insert and update require current sender and active membership; reply target must belong to the same conversation; delete requires sender plus active membership; a non-enumerating boolean predicate enforces direct-message block rules. Keep reactions and read receipts scoped to visible messages.
- [ ] **Step 4: Check errors in `useMessages` and `useConversations`** for profile/reply/read/unread queries and read-receipt writes; retain pagination, optimistic rollback and dedupe by persisted message UUID. Ensure send retries do not clear composer content or local media after failure.
- [ ] **Step 5: Audit `MessageSearch`, `usePins`, `useChatNotifications` and `useTypingIndicator`** for conversation scoping and subscription lifecycle. Keep typing ephemeral and do not edit schema `realtime`; test search uses the requested conversation and existing RLS remains the server boundary.
- [ ] **Step 6: Extend SQL tests** with two users/two conversations to prove reply, mutation, read and block isolation; add a code contract test for search scoping and typing payload excluding message content.
- [ ] **Step 7: Run message tests and SQL test when local/staging is available.** Record unverified DB behavior honestly if no DB is available.

### Task 3: Agora call token endpoint and atomic call RPCs

**Files:**
- Create: `supabase/functions/agora-call-token/index.ts`
- Create: `supabase/functions/_shared/agoraCallTokenPolicy.ts`
- Create: `src/modules/chat/agoraCallToken.ts`
- Create: `src/modules/chat/agoraCallToken.test.ts`
- Create: `src/__tests__/agora-call-token.test.ts`
- Create: migration `supabase/migrations/20261017112000_agora_call_lifecycle.sql`
- Modify: `supabase/config.toml` (add only `[functions.agora-call-token] verify_jwt = false` function block; do not edit project-level fields)
- Modify: `src/lib/agoraRtc.ts`
- Modify: `src/modules/chat/hooks/useAgoraCall.ts`
- Test: `src/lib/agoraRtc.test.ts`
- Test: `supabase/functions/agora-call-token/index.test.ts`
- Test: add call cases in `supabase/tests/chat_security_realtime.sql`

**Interfaces:**
- Frontend: `getAgoraCallToken(callSessionId: string): Promise<{ appId: string; token: string; uid: number; channel: string; expiresAt: number }>`; client passes these exact values to `client.join(appId, channel, token, uid)`.
- Edge payload: `{ call_session_id: string }`; channel and user identity come only from authenticated DB state.
- Edge response: `{ app_id: string; token: string; uid: number; channel: string; expires_at: number }`.
- Client calls new RPCs through typed wrappers in `src/modules/chat/chatRpc.ts`; keep the generated Supabase type file untouched.
- SQL RPCs: `start_call_session(p_conversation_id uuid, p_call_type text) -> call_sessions`, `get_agora_call_token_context(p_call_session_id uuid) -> table(channel_name text, agora_uid integer, call_status text)`, `accept_call_session(p_call_session_id uuid) -> boolean`, `decline_call_session(p_call_session_id uuid) -> boolean`, `end_call_session(p_call_session_id uuid, p_duration_seconds integer) -> boolean`, `mark_call_missed(p_call_session_id uuid) -> boolean`, `update_call_participant(p_call_session_id uuid, p_is_muted boolean, p_is_video_off boolean) -> boolean`.

- [ ] **Step 1: Write failing policy tests** for unauthenticated/CORS behavior, invalid payload, forged `channel_name` ignored/rejected, nonmember, terminal status, block in either direction, active-member caller/recipient and safe Vietnamese error codes.
- [ ] **Step 2: Run token-policy tests red** with `bunx vitest run src/modules/chat/agoraCallToken.test.ts src/__tests__/agora-call-token.test.ts`.
- [ ] **Step 3: Implement pure policy helper** to validate call status/membership/block facts and sanitized response/error codes.
- [ ] **Step 4: Implement Edge Function** using `OPTIONS`, `requireUser`, `createAuthedClient(req).rpc('get_agora_call_token_context', ...)`, DB-derived channel/UID/status, and existing `AGORA_APP_ID`/`AGORA_APP_CERTIFICATE` names. Build publisher token with the stored UID; never log credential or token. Return 401/403/404/409/500 with stable `code` and Vietnamese message; do not return provider internals.
- [ ] **Step 5: Implement SQL call RPCs** with conditional status changes, active membership, two-way block checks and conversation-level advisory serialization. Production read-only preflight found three conversations with multiple open call rows (including three old active rows in one conversation), so do not add a global unique open-call index or mutate those rows in this migration. `start_call_session` rejects while any non-expired open call remains and marks ringing rows missed after the existing 45-second caller timeout. It generates the channel from its server-created session UUID; it does not accept client channel text. Add nullable `call_participants.agora_uid`, a unique index on non-null per-call UID, and a partial unique index on `(call_session_id,user_id) WHERE left_at IS NULL` (the one historical duplicate pair is ended). `get_agora_call_token_context` creates/returns the same stable UID on every renewal and derives `channel_name` from the session. Revoke direct authenticated writes to call status/participant identity; return false/stable SQLSTATE for lost races without overwriting terminal state.
- [ ] **Step 6: Add SQL integration cases** for token caller authorization predicates, stable UID reuse and uniqueness within one call, block, duplicate start, concurrent start serialization, accept/decline/end/timeout idempotency, terminal state protection, and exact publication membership.
- [ ] **Step 7: Replace `agora-token` call sites** with `getAgoraCallToken(sessionId)` and remove the generic `agora-token` fallback from `getLiveToken`; leave `live-token` as the live-session API and surface its own failure. Assert `rg -n "agora-token" src supabase/functions` has no remaining runtime caller.
- [ ] **Step 8: Run focused Vitest, `deno test supabase/functions/agora-call-token/index.test.ts`, and `deno check supabase/functions/agora-call-token/index.ts`;** run SQL tests on isolated PostgreSQL only. No secrets/API token calls are used in tests.

### Task 4: Call client lifecycle, renewal and stale-event fencing

**Files:**
- Create: `src/modules/chat/callLifecycle.ts`
- Create: `src/modules/chat/callLifecycle.test.ts`
- Modify: `src/modules/chat/hooks/useAgoraCall.ts`
- Modify: `src/modules/chat/components/CallRoom.tsx`
- Modify: `src/modules/chat/components/IncomingCallDialog.tsx`
- Modify: `src/modules/chat/components/MessageThread.tsx`
- Modify: `src/contexts/CallContext.tsx` (global incoming-call decline and terminal event handling share the conditional call RPCs)

**Interfaces:**
- `CallAttempt` identifies `sessionId` and monotonically increasing local `generation`.
- `cleanupCallAttempt(attempt, deps)` closes tracks, leaves the matching RTC client, clears timers and only calls status RPC for that attempt/session.
- `isCurrentCallAttempt(current, eventAttempt)` gates every asynchronous completion and Agora callback.

- [ ] **Step 1: Add failing pure tests** for duplicate start/answer guard, late event from call A after call B starts, terminal DB result after join/publish race, cleanup after token/join/publish/DB failure, timeout only while `ringing`, and renew only for current session.
- [ ] **Step 2: Run lifecycle tests red** with `bunx vitest run src/modules/chat/callLifecycle.test.ts`.
- [ ] **Step 3: Implement testable lifecycle guards** and one shared cleanup path.
- [ ] **Step 4: Refactor `useAgoraCall`** so manual answer and URL auto-answer share the same handler; check all critical DB/RPC results; perform conditional state transitions; close both tracks, screen track, client and timers on failure/unmount; keep session ID/generation checks around all awaited work and callbacks.
- [ ] **Step 5: Implement Agora renewal** using SDK 4.24.8 event typings (`token-privilege-will-expire`, and expiry event if exposed) and `client.renewToken(newToken)`. Re-fetch by session ID; do not renew terminal/stale sessions.
- [ ] **Step 6: Handle browser playback safely** by catching remote `.play()` rejection and exposing a user gesture to resume audio; preserve camera/mic permission requests inside user gesture path.
- [ ] **Step 7: Run lifecycle and token tests, `tsgo --noEmit`, and `deno check`;** note Safari/iPhone behavior remains unverified absent hardware.

### Task 5: Chat media ownership and privacy boundary

**Files:**
- Modify: `supabase/functions/_shared/mediaLimits.ts` only if current validators can be extended without changing other media contracts
- Modify: `supabase/functions/get-upload-url/index.ts`
- Modify: `src/utils/mediaUpload.ts`
- Modify: `src/modules/chat/components/ChatInput.tsx`
- Modify: `src/modules/chat/components/MessageBubble.tsx`
- Modify: `src/modules/chat/components/FileAttachment.tsx`
- Create: `src/modules/chat/chatMedia.test.ts`

**Interfaces:**
- Chat keys use `chat-media/<authenticated-user-id>/<generated-file-path>` inside the existing R2 account bucket so the server can enforce ownership without changing comment media keys.
- Before changing download privacy, determine whether an existing signed-read function can safely authorize a caller against message/conversation membership. If no such path exists, keep current URL semantics, fix upload ownership/size validation, and report the public-read privacy limitation rather than changing shared comment media behavior.

- [ ] **Step 1: Write failing media policy tests** for another user’s key prefix, malformed path, unsupported MIME, oversized upload, and composer retry retaining file/text after upload or send failure.
- [ ] **Step 2: Run media tests red** with `bunx vitest run src/modules/chat/chatMedia.test.ts`.
- [ ] **Step 3: Enforce owner prefix and chat MIME/size rules** for `chat-media` in `get-upload-url`/`mediaLimits`; leave existing post/comment upload contracts unchanged. Make client key generation use `chat-media/<user-id>/...` and retain already uploaded file descriptors when message sending fails.
- [ ] **Step 4: Verify download/read contract** across `delete-from-r2`, upload URL response and current public host without printing signed credentials. Implement conversation-authorized signed reads only if a safe existing signing integration is found; otherwise document that public R2 URLs are not private.
- [ ] **Step 5: Run media tests, focused Edge Function `deno check`, and upload contract checks.** No real upload to production in the task.

### Task 6: SQL integration, docs and release handoff

**Files:**
- Modify: `supabase/tests/chat_security_realtime.sql`
- Modify: `docs/mailboxes/quang-vu.md`
- Modify: add release/test matrix under `docs/chat-call-hardening-2026-10-17/` only if the code/migration ships to production

- [ ] **Step 1: Run all chat/call regression tests** with only relevant Vitest files; run `bunx --package @typescript/native-preview tsgo --noEmit`; run Deno checks for changed functions; run `git diff --check`.
- [ ] **Step 2: Run SQL integration against a disposable local/staging Supabase/PostgreSQL.** Local PostgreSQL 17.11 became available. All three migrations and `supabase/tests/chat_security_realtime.sql` ran against `supabase/tests/chat_security_realtime_fixture.sql`; RLS/grants/search_path/publication/policies and historical duplicate call rows passed under `authenticated` + JWT GUCs. Concurrent psql tests verified duplicate starts, accept/decline, and dual end fencing. This is a production-shaped local fixture, not a full Supabase/GoTrue/Realtime integration; staging confirmation remains outstanding.
- [ ] **Step 3: Record confirmed code findings, files, tests, unverified DB/browser behavior, migration/function/frontend release order, target ref and rollback notes in `docs/mailboxes/quang-vu.md`.** State clearly whether migrations were only prepared or applied (expected: prepared only).
- [ ] **Step 4: Prepare manual two-account desktop/iPhone matrix.** Do not test real user calls; Cha/testers run it on preview after functions and migrations are separately released.
- [ ] **Step 5: Review exact diff and protected paths.** Confirm no `supabase/.temp/`, secrets, generated Supabase client/types, `.env`, unrelated lockfile or production mutations.

## Expected release order

1. Review and apply new migrations individually on verified target after a safe SQL test environment passes; do not run full `db push`.
2. Deploy `agora-call-token` and any changed upload function by explicit function name after target verification.
3. Release frontend on a preview branch; test with two controlled accounts on desktop and iPhone.
4. Monitor token denials, SQL/RPC error codes, call setup/cleanup, Realtime delivery, message upload failures and duplicate open calls; keep rollback SQL/function/frontend artifacts ready.

## Environment limits at implementation review

- A disposable PostgreSQL 17.11 server was started on `/tmp:55432`; no Docker/Podman is installed. Catalog-backed fixture tests ran locally, but full Supabase/GoTrue/Realtime staging integration remains outstanding. Production was queried read-only only.
- No physical iPhone/Safari validation environment is available in this workspace.
- Message R2 files use a public host; conversation-authorized reads are not supported by the observed flow. No privacy claim is allowed until this contract is changed and verified.

## Self-review

- Spec coverage: token endpoint and renewal (Tasks 3–4); RLS, grants, membership, blocks and Realtime (Task 1); call transitions/races/cleanup (Tasks 3–4); message query/retry and media (Tasks 2 and 5); SQL/device tests, mailbox and release order (Task 6).
- Type consistency: token response fields are `appId/token/uid/channel/expiresAt` in frontend and snake_case in Edge JSON; RPCs take session/conversation identifiers and derive authenticated actor from JWT.
- Review focus tests map to Tasks 1–5. SQL claims remain conditional on a safe PostgreSQL environment.
- No production migration, deploy, secret, cron or data mutation is part of this plan.
