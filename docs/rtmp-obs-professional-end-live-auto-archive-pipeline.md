# RTMP/OBS Professional End Live & Auto Archive Pipeline

Tài liệu này đóng gói tính năng **RTMP/OBS Professional End Live & Auto Archive Pipeline** cho FUN Profile Live Producer để gửi Lovable.

Mục tiêu: khi creator kết thúc live RTMP/OBS, hoặc OBS mất tín hiệu quá thời gian grace, hệ thống phải đóng phiên phát sóng, chuyển feed sang trạng thái replay processing, xử lý recording từ Cloudflare Stream, archive MP4 sang Cloudflare R2, verify R2, cập nhật replay post, rồi mới xóa Cloudflare Stream video.

## 1. Tên tính năng

**RTMP/OBS Professional End Live & Auto Archive Pipeline**

Tên ngắn:

**RTMP End Live + Disconnect Timeout + R2 Replay Archive**

## 2. Audit hiện tại

Các file/path liên quan:

| File | Vai trò |
| --- | --- |
| `src/modules/live/pages/RtmpLivePage.tsx` | Live Producer UI, preview player, nút “Kết thúc live”, polling trạng thái |
| `supabase/functions/end-rtmp-live-session/index.ts` | Manual end live khi owner bấm “Kết thúc live” |
| `supabase/functions/get-rtmp-live-session-status/index.ts` | Poll Cloudflare Live Input/video để cập nhật producer status |
| `supabase/functions/stream-webhook/index.ts` | Nhận Cloudflare webhook: connected/disconnected/video ready/error |
| `supabase/functions/live-replay-archive-cron/index.ts` | Background cron xử lý archive replay và watchdog auto-end |
| `supabase/functions/_shared/cloudflareStreamService.ts` | Cloudflare Stream API: Live Input, videos, MP4 export, delete video |
| `supabase/functions/_shared/rtmpEndLiveService.ts` | Helper chung để manual end và auto-end dùng cùng logic |
| `supabase/functions/_shared/archiveReplayService.ts` | Export MP4, upload R2, verify R2, update replay post, delete Stream video |
| `supabase/functions/_shared/replayFeedService.ts` | Update/create replay post trên feed sau khi R2 ready |
| `src/components/feed/PostMedia.tsx` | Feed render processing/replay; không render player khi R2 chưa ready |
| `src/hooks/live/useLiveReplayStatus.ts` | Realtime hydrate replay khi R2 archive ready |
| `supabase/migrations/20260512000100_rtmp_end_live_disconnect_grace.sql` | Migration thêm trạng thái/fields cho end-live và disconnect grace |

Thiếu trước khi triển khai:

- Manual end chỉ set `status = ended`, chưa disable Cloudflare Live Input.
- Polling đang coi `session.status === 'live'` là còn connected, nên không detect OBS disconnect chính xác.
- Webhook disconnected trước đó có thể end live quá sớm, chưa có grace 5 phút.
- Chưa có watchdog polling fallback nếu webhook miss/delay.
- DB thiếu các field production cần thiết: `connection_status`, `source_connected`, `last_disconnected_at`, `end_reason`, `live_input_disabled_at`, `live_input_disable_error`.
- Live post cần chuyển sang replay processing ngay sau end, và replay player chỉ hiện khi R2 ready.

## 3. Flow mới

### 3.1 Manual end

```txt
Creator bấm “Kết thúc live”
  -> UI confirm
  -> Edge Function verify auth + owner
  -> Idempotency check
  -> Disable Cloudflare Live Input enabled=false
  -> status=ended, end_reason=manual
  -> live post chuyển ended/processing
  -> live_replays upsert archive_status=pending
  -> cron/archive export MP4
  -> upload R2
  -> verify R2 playable
  -> update replay post
  -> delete Cloudflare Stream video
```

Không delete Cloudflare Stream video ngay khi bấm end. Chỉ delete sau khi R2 + replay post OK.

### 3.2 Disconnect timeout

```txt
OBS/Restream/vMix mất tín hiệu
  -> webhook hoặc polling detect disconnected
  -> status=disconnect_grace
  -> last_disconnected_at=now
  -> UI cảnh báo mất nguồn
  -> nếu reconnect trong 5 phút: clear last_disconnected_at, tiếp tục live
  -> nếu quá 5 phút: auto end
  -> end_reason=disconnect_timeout
  -> replay archive pipeline giống manual end
```

Grace period dùng env:

```env
RTMP_DISCONNECT_GRACE_SECONDS=300
```

## 4. Database migration

File: `supabase/migrations/20260512000100_rtmp_end_live_disconnect_grace.sql`

```sql
-- Professional RTMP/OBS end-live lifecycle.
-- Adds manual end metadata, disconnect grace tracking, and Live Input disable state.

ALTER TABLE public.live_sessions
  DROP CONSTRAINT IF EXISTS live_sessions_status_check;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check
  CHECK (status IN (
    'created',
    'waiting_for_obs',
    'source_connected',
    'ready_to_go_live',
    'disconnect_grace',
    'live',
    'ended',
    'processing',
    'archiving',
    'posted',
    'processing_stream',
    'stream_ready',
    'exporting_mp4',
    'uploading_r2',
    'verifying_r2',
    'archived',
    'replay_posted',
    'stream_deleted',
    'failed'
  ));

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS connection_status text,
  ADD COLUMN IF NOT EXISTS source_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_reason text,
  ADD COLUMN IF NOT EXISTS live_input_disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_input_disable_error text,
  ADD COLUMN IF NOT EXISTS replay_post_id uuid,
  ADD COLUMN IF NOT EXISTS live_post_id uuid;

UPDATE public.live_sessions
SET source_connected = true,
    connection_status = COALESCE(connection_status, 'connected')
WHERE source_connected_at IS NOT NULL
  AND status IN ('source_connected', 'ready_to_go_live', 'live');

UPDATE public.live_sessions
SET connection_status = COALESCE(connection_status, 'ended')
WHERE status IN ('ended', 'processing_stream', 'stream_ready', 'exporting_mp4', 'uploading_r2', 'verifying_r2', 'archived', 'replay_posted', 'stream_deleted');

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_active_connection
  ON public.live_sessions (mode, status, connection_status, last_disconnected_at)
  WHERE mode = 'rtmp_obs' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_disconnect_grace
  ON public.live_sessions (last_disconnected_at)
  WHERE mode = 'rtmp_obs' AND status = 'disconnect_grace';

DROP POLICY IF EXISTS "public can read live sessions" ON public.live_sessions;
CREATE POLICY "public can read live sessions"
  ON public.live_sessions FOR SELECT
  TO anon, authenticated
  USING (status IN (
    'live',
    'disconnect_grace',
    'ended',
    'processing',
    'archiving',
    'posted',
    'processing_stream',
    'stream_ready',
    'exporting_mp4',
    'uploading_r2',
    'verifying_r2',
    'archived',
    'replay_posted',
    'stream_deleted'
  ));

SELECT cron.unschedule('live-replay-archive-every-2min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-replay-archive-every-2min');

SELECT cron.unschedule('rtmp-live-watchdog-every-1min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rtmp-live-watchdog-every-1min');

SELECT cron.schedule(
  'rtmp-live-watchdog-every-1min',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-replay-archive-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <SUPABASE_ANON_OR_SERVICE_ROLE_TOKEN>"}'::jsonb,
    body:='{"limit":5}'::jsonb
  );
  $$
);
```

Lưu ý bảo mật: trong production nên thay token hardcoded bằng secret/cron secret nếu hạ tầng hiện tại hỗ trợ.

## 5. Cloudflare Stream service

File: `supabase/functions/_shared/cloudflareStreamService.ts`

Thêm API bật/tắt Cloudflare Live Input. Theo Cloudflare API, Live Input có field `enabled`; khi `enabled=false`, input không nhận stream mới.

```ts
export async function setStreamLiveInputEnabled(inputId: string, enabled: boolean): Promise<{ enabled: boolean; status: number; raw: unknown }> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${inputId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || data?.success === false) {
    throw new Error(`Cloudflare Live Input update failed: ${resp.status} ${JSON.stringify(data?.errors || data).slice(0, 300)}`);
  }
  return { enabled, status: resp.status, raw: data };
}
```

## 6. Helper end-live dùng chung

File: `supabase/functions/_shared/rtmpEndLiveService.ts`

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getStreamPlaybackUrls, listStreamLiveInputVideos, setStreamLiveInputEnabled } from './cloudflareStreamService.ts';

const PROCESSING_MESSAGE = 'Đang xử lý video replay. Video sẽ sẵn sàng sau ít phút.';
const TERMINAL_STATUSES = new Set(['ended', 'processing_stream', 'stream_ready', 'exporting_mp4', 'uploading_r2', 'verifying_r2', 'archived', 'replay_posted', 'stream_deleted']);

export type RtmpEndReason = 'manual' | 'disconnect_timeout' | 'cloudflare_error' | 'admin_force';

export async function createRtmpReplayIfVideoExists(admin: SupabaseClient, session: any): Promise<string | null> {
  if (!session.cloudflare_live_input_id) return session.cloudflare_video_uid || null;
  const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
  const video = videos.find((item: any) => item?.uid) as any;
  const uid = String(video?.uid || session.cloudflare_video_uid || '');
  if (!uid) return null;

  const urls = getStreamPlaybackUrls(uid);
  await (admin as any)
    .from('live_sessions')
    .update({
      cloudflare_video_uid: uid,
      hls_url: session.hls_url && String(session.hls_url).includes(uid) ? session.hls_url : urls.hls,
      playback_url: session.playback_url && String(session.playback_url).includes(uid) ? session.playback_url : urls.hls,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  await (admin as any).from('live_replays').upsert({
    live_session_id: session.id,
    user_id: session.owner_id || session.host_user_id || session.user_id,
    chunked_recording_id: session.id,
    stream_uid: uid,
    cloudflare_video_uid: uid,
    playback_hls: urls.hls,
    playback_dash: urls.dash,
    playback_mp4: urls.mp4,
    cloudflare_playback_url: urls.hls,
    status: video?.readyToStream ? 'ready' : 'processing',
    processing_started_at: new Date().toISOString(),
    storage_provider: 'cloudflare_stream',
    playback_provider: 'cloudflare_stream',
    archive_status: 'pending',
    archive_error: null,
    cloudflare_vod_enabled: true,
    last_cf_response: video || null,
  }, { onConflict: 'chunked_recording_id' });

  return uid;
}

export async function endRtmpLiveSession(
  admin: SupabaseClient,
  session: any,
  reason: RtmpEndReason,
): Promise<{ ended: boolean; idempotent: boolean; cloudflare_video_uid: string | null; disable_error: string | null }> {
  const now = new Date().toISOString();
  const postId = session.post_id || session.live_post_id || null;
  const shouldArchivePublicLive = session.status === 'live' || !!postId;

  if (TERMINAL_STATUSES.has(session.status) && session.ended_at) {
    return {
      ended: true,
      idempotent: true,
      cloudflare_video_uid: session.cloudflare_video_uid || null,
      disable_error: session.live_input_disable_error || null,
    };
  }

  let disableError: string | null = null;
  if (session.cloudflare_live_input_id) {
    try {
      await setStreamLiveInputEnabled(session.cloudflare_live_input_id, false);
    } catch (error) {
      disableError = error instanceof Error ? error.message : String(error);
      console.warn('[RTMP_END_LIVE_INPUT_DISABLE_FAILED]', {
        live_session_id: session.id,
        live_input_id: session.cloudflare_live_input_id,
        reason,
        error: disableError,
      });
    }
  }

  const uid = shouldArchivePublicLive ? await createRtmpReplayIfVideoExists(admin, session) : (session.cloudflare_video_uid || null);

  await (admin as any).from('live_sessions').update({
    status: 'ended',
    connection_status: 'ended',
    ended_at: session.ended_at || now,
    end_reason: reason,
    source_connected: false,
    last_disconnected_at: session.last_disconnected_at || now,
    recording_status: shouldArchivePublicLive ? 'processing' : session.recording_status,
    processing_started_at: shouldArchivePublicLive ? (session.processing_started_at || now) : session.processing_started_at,
    archive_status: shouldArchivePublicLive ? 'pending' : session.archive_status,
    archive_error: null,
    cloudflare_video_uid: uid || session.cloudflare_video_uid,
    live_input_disabled_at: session.cloudflare_live_input_id ? now : session.live_input_disabled_at,
    live_input_disable_error: disableError,
    updated_at: now,
  }).eq('id', session.id);

  if (postId) {
    const { data: post } = await (admin as any).from('posts').select('metadata').eq('id', postId).maybeSingle();
    await (admin as any).from('posts').update({
      live_status: 'ended',
      video_url: null,
      replay_status: 'processing',
      playback_provider: 'r2',
      replay_ready: false,
      processing_message: PROCESSING_MESSAGE,
      metadata: {
        ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
        live_status: 'ended',
        live_mode: 'rtmp_obs',
        live_session_id: session.id,
        end_reason: reason,
        archive_status: 'pending',
        playback_type: 'r2_pending',
        playback_provider: 'r2',
        storage_provider: 'r2',
        replay_status: 'processing',
        replay_ready: false,
        processing_message: PROCESSING_MESSAGE,
      },
      updated_at: now,
    }).eq('id', postId);
  }

  console.log('[RTMP_END_LIVE_SESSION]', {
    live_session_id: session.id,
    reason,
    hasPost: !!postId,
    hasCloudflareVideoUid: !!uid,
    inputDisabled: !!session.cloudflare_live_input_id && !disableError,
    disableError: !!disableError,
  });

  return { ended: true, idempotent: false, cloudflare_video_uid: uid || session.cloudflare_video_uid || null, disable_error: disableError };
}

export function getDisconnectGraceSeconds(): number {
  const raw = Number(Deno.env.get('RTMP_DISCONNECT_GRACE_SECONDS') || '300');
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

export function disconnectGraceExpired(lastDisconnectedAt: string | null | undefined, graceSeconds = getDisconnectGraceSeconds()): boolean {
  if (!lastDisconnectedAt) return false;
  const disconnectedAt = new Date(lastDisconnectedAt).getTime();
  if (!Number.isFinite(disconnectedAt)) return false;
  return Date.now() - disconnectedAt >= graceSeconds * 1000;
}
```

## 7. Manual end Edge Function

File: `supabase/functions/end-rtmp-live-session/index.ts`

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';
import { endRtmpLiveSession } from '../_shared/rtmpEndLiveService.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
    if (!liveSessionId) return json({ error: 'Missing live_session_id' }, 400);

    const admin = createAdminClient() as any;
    const { data: session, error } = await admin
      .from('live_sessions')
      .select('*')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    const result = await endRtmpLiveSession(admin, session, 'manual');
    return json({ ok: true, status: 'ended', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

## 8. Producer status polling

File: `supabase/functions/get-rtmp-live-session-status/index.ts`

Các điểm quan trọng:

- Không coi `session.status === 'live'` là connected.
- Connected phải dựa vào Cloudflare Live Input hoặc live video hiện đang live.
- Nếu disconnected quá grace thì gọi `endRtmpLiveSession(..., 'disconnect_timeout')`.

```ts
import { disconnectGraceExpired, endRtmpLiveSession, getDisconnectGraceSeconds } from '../_shared/rtmpEndLiveService.ts';

let connected = false;
let liveInput: Record<string, unknown> | null = null;
let liveVideo: Record<string, unknown> | null = null;
let cloudflareVideoUid: string | null = session.cloudflare_video_uid || null;

if (session.cloudflare_live_input_id) {
  liveInput = await getStreamLiveInput(session.cloudflare_live_input_id).catch(() => null);
  const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
  const liveVideoCandidate = videos.find((item) => isStreamVideoLive(item)) || null;
  liveVideo = (liveVideoCandidate || videos.find((item: any) => item?.uid) || null) as Record<string, unknown> | null;
  if (liveVideo) cloudflareVideoUid = String((liveVideo as { uid?: unknown }).uid || cloudflareVideoUid || '');
  connected = isLiveInputConnected(liveInput) || !!liveVideoCandidate;
}

const now = new Date().toISOString();
const activeStatuses = ['source_connected', 'ready_to_go_live', 'live', 'disconnect_grace'];
let disconnectedAt = session.last_disconnected_at || null;

if (!connected && activeStatuses.includes(session.status) && !disconnectedAt) disconnectedAt = now;

if (!connected && activeStatuses.includes(session.status) && disconnectGraceExpired(disconnectedAt)) {
  const result = await endRtmpLiveSession(
    admin,
    { ...session, cloudflare_video_uid: cloudflareVideoUid || session.cloudflare_video_uid, last_disconnected_at: disconnectedAt },
    'disconnect_timeout',
  );

  return json({
    ok: true,
    sessionId: session.id,
    status: 'ended',
    sourceConnected: false,
    playbackUrl: null,
    hlsUrl: null,
    cloudflareVideoUid: result.cloudflare_video_uid,
    updatedAt: now,
    disconnectGraceSeconds: getDisconnectGraceSeconds(),
    live_session: {
      ...session,
      status: 'ended',
      connection_status: 'ended',
      ended_at: now,
      end_reason: 'disconnect_timeout',
      cloudflare_video_uid: result.cloudflare_video_uid,
    },
    source_connected: false,
    details_complete: !!session.title?.trim() && !!session.description?.trim(),
    can_go_live: false,
    auto_ended: true,
  });
}

const status = !connected && activeStatuses.includes(session.status)
  ? 'disconnect_grace'
  : nextProducerStatus(session, connected);

await admin
  .from('live_sessions')
  .update({
    status,
    connection_status: connected ? 'connected' : (status === 'disconnect_grace' ? 'disconnected' : session.connection_status),
    source_connected: connected,
    last_disconnected_at: connected ? null : disconnectedAt,
    source_connected_at: connected ? (session.source_connected_at || now) : session.source_connected_at,
    cloudflare_video_uid: cloudflareVideoUid || session.cloudflare_video_uid,
    hls_url: hlsUrl,
    playback_url: playbackUrlOut,
    updated_at: now,
  })
  .eq('id', liveSessionId);
```

## 9. Webhook connected/disconnected

File: `supabase/functions/stream-webhook/index.ts`

Connected:

```ts
const patch: Record<string, unknown> = isConnected
  ? {
      status: detailsComplete ? 'ready_to_go_live' : 'source_connected',
      connection_status: 'connected',
      source_connected: true,
      last_disconnected_at: null,
      source_connected_at: session.source_connected_at || now,
      recording_status: 'recording',
      archive_error: null,
    }
  : {
      status: session.status === 'live' || session.status === 'source_connected' || session.status === 'ready_to_go_live'
        ? 'disconnect_grace'
        : 'waiting_for_obs',
      connection_status: 'disconnected',
      source_connected: false,
      last_disconnected_at: session.last_disconnected_at || now,
      recording_status: session.status === 'live' ? 'recording' : session.recording_status,
    };

await admin.from('live_sessions').update(patch).eq('id', session.id);
```

Feed metadata warning khi disconnected:

```ts
await admin.from('posts').update({
  metadata: {
    ...metadata,
    live_status: isConnected ? session.status : (session.status === 'live' ? 'disconnect_grace' : session.status),
    live_mode: 'rtmp_obs',
    live_session_id: session.id,
    connection_status: isConnected ? 'connected' : 'disconnected',
    last_disconnected_at: isDisconnected ? (session.last_disconnected_at || now) : null,
    disconnect_warning: isDisconnected && session.status === 'live'
      ? 'Nguon video da mat ket noi. Live se tu ket thuc neu OBS khong ket noi lai.'
      : null,
    archive_status: session.archive_status,
    playback_type: 'cloudflare_live_input',
  },
}).eq('id', postId);
```

## 10. Watchdog cron auto-end

File: `supabase/functions/live-replay-archive-cron/index.ts`

```ts
import {
  getStreamLiveInput,
  getStreamPlaybackUrls,
  isLiveInputConnected,
  isStreamVideoLive,
  listStreamLiveInputVideos,
} from '../_shared/cloudflareStreamService.ts';
import { archiveReplay } from '../_shared/archiveReplayService.ts';
import { disconnectGraceExpired, endRtmpLiveSession, getDisconnectGraceSeconds } from '../_shared/rtmpEndLiveService.ts';

async function autoEndDisconnectedRtmpSessions(admin: any): Promise<number> {
  const graceSeconds = getDisconnectGraceSeconds();
  const { data: sessions } = await admin
    .from('live_sessions')
    .select('*')
    .eq('mode', 'rtmp_obs')
    .in('status', ['source_connected', 'ready_to_go_live', 'live', 'disconnect_grace'])
    .not('cloudflare_live_input_id', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(30);

  let ended = 0;
  for (const session of sessions || []) {
    const liveInput = await getStreamLiveInput(session.cloudflare_live_input_id).catch(() => null);
    const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
    const liveVideo = videos.find((item: any) => isStreamVideoLive(item)) || null;
    const connected = isLiveInputConnected(liveInput) || !!liveVideo;
    const now = new Date().toISOString();

    if (connected) {
      await admin.from('live_sessions').update({
        status: session.status === 'disconnect_grace'
          ? (session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected')
          : session.status,
        connection_status: 'connected',
        source_connected: true,
        last_disconnected_at: null,
        updated_at: now,
      }).eq('id', session.id);
      continue;
    }

    const lastDisconnectedAt = session.last_disconnected_at || now;
    if (!session.last_disconnected_at || session.status !== 'disconnect_grace') {
      await admin.from('live_sessions').update({
        status: 'disconnect_grace',
        connection_status: 'disconnected',
        source_connected: false,
        last_disconnected_at: lastDisconnectedAt,
        updated_at: now,
      }).eq('id', session.id);
    }

    if (!disconnectGraceExpired(lastDisconnectedAt, graceSeconds)) continue;

    await endRtmpLiveSession(admin, { ...session, last_disconnected_at: lastDisconnectedAt }, 'disconnect_timeout');
    ended += 1;
  }

  return ended;
}
```

Cron handler gọi watchdog trước archive:

```ts
const auto_ended_rtmp_sessions = await autoEndDisconnectedRtmpSessions(admin as any);
const recovered_rtmp_replays = await recoverMissingRtmpReplays(admin as any);

return json({
  ok: true,
  auto_ended_rtmp_sessions,
  recovered_rtmp_replays,
  processed: results.length,
  results,
});
```

## 11. Live Producer UI

File: `src/modules/live/pages/RtmpLivePage.tsx`

Thêm fields:

```ts
interface ProducerSession {
  live_session_id: string;
  status: string;
  source_connected_at?: string | null;
  source_connected?: boolean | null;
  connection_status?: string | null;
  last_disconnected_at?: string | null;
  end_reason?: string | null;
}

interface StatusPayload {
  status?: string;
  sourceConnected?: boolean;
  connectionStatus?: string;
  lastDisconnectedAt?: string | null;
  disconnectGraceSeconds?: number;
  auto_ended?: boolean;
}
```

Toast khi mất nguồn/reconnect/auto-ended:

```ts
const connectionNoticeRef = useRef<string | null>(null);

const nextStatus = payload.status || liveSession.status || credentials.status;

if (payload.auto_ended || liveSession.end_reason === 'disconnect_timeout') {
  toast.warning('Live đã tự kết thúc vì nguồn video mất kết nối quá lâu.');
  setLockedLiveSessionId(null);
  connectionNoticeRef.current = 'auto_ended';
} else if (!nextSourceConnected && nextStatus === 'disconnect_grace' && connectionNoticeRef.current !== 'disconnected') {
  toast.warning('Nguồn video đã mất kết nối. Live sẽ tự kết thúc sau 5 phút nếu OBS không kết nối lại.');
  connectionNoticeRef.current = 'disconnected';
} else if (nextSourceConnected && connectionNoticeRef.current === 'disconnected') {
  toast.success('Nguồn video đã kết nối lại.');
  connectionNoticeRef.current = 'connected';
}
```

Confirm khi bấm “Kết thúc live”:

```ts
const endSession = async () => {
  if (!credentials?.live_session_id) return;
  const confirmed = window.confirm('Bạn có chắc muốn kết thúc live? Hệ thống sẽ xử lý video replay sau khi kết thúc.');
  if (!confirmed) return;

  setEnding(true);
  try {
    const { error } = await supabase.functions.invoke('end-rtmp-live-session', {
      body: { live_session_id: credentials.live_session_id },
    });
    if (error) throw error;
    setCredentials({ ...credentials, status: 'ended', connection_status: 'ended', end_reason: 'manual' });
    setSourceConnected(false);
    setLockedLiveSessionId(null);
    toast.success('Đã kết thúc live. Replay đang được xử lý.');
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Kết thúc live thất bại');
  } finally {
    setEnding(false);
  }
};
```

UI warning:

```tsx
{credentials?.status === 'disconnect_grace' && (
  <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
    <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
    <span>Nguồn video đã mất kết nối. Live sẽ tự kết thúc sau 5 phút nếu OBS không kết nối lại.</span>
  </div>
)}

{credentials?.status === 'ended' && (
  <div className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
    <Check className="h-4 w-4 shrink-0 mt-0.5" />
    <span>
      {credentials.end_reason === 'disconnect_timeout'
        ? 'Live đã tự kết thúc vì nguồn video mất kết nối quá lâu. Đang xử lý video replay...'
        : 'Live đã kết thúc. Đang xử lý video replay...'}
    </span>
  </div>
)}
```

## 12. Create/resume session và persistent stream

File: `supabase/functions/create-rtmp-live-session/index.ts`

Khi dùng persistent stream cũ, cần bật lại Live Input nếu phiên trước đã disable:

```ts
import { createStreamLiveInput, getStreamPlaybackUrls, setStreamLiveInputEnabled } from '../_shared/cloudflareStreamService.ts';

if (existingConfig) {
  rtmpConfigId = existingConfig.id;
  liveInputId = existingConfig.cloudflare_live_input_id;
  rtmpsUrl = existingConfig.rtmps_url;
  encryptedKey = existingConfig.stream_key_encrypted;
  streamKey = encryptedKey ? await decryptStreamKey(encryptedKey) : null;

  await setStreamLiveInputEnabled(liveInputId, true).catch((error) => {
    console.warn('[RTMP_CREATE_REENABLE_PERSISTENT_INPUT_FAILED]', {
      liveInputId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
```

Khi tạo session mới:

```ts
await admin
  .from('live_sessions')
  .insert({
    status: 'waiting_for_obs',
    connection_status: 'waiting',
    source_connected: false,
    archive_status: 'pending',
    storage_provider: 'cloudflare_stream',
    playback_provider: 'cloudflare_stream',
  });
```

## 13. Go live update

File: `supabase/functions/go-live-rtmp-session/index.ts`

Khi user bấm “Phát trực tiếp”:

```ts
await admin
  .from('live_sessions')
  .update({
    status: 'live',
    connection_status: 'connected',
    source_connected: true,
    last_disconnected_at: null,
    end_reason: null,
    started_at: session.started_at || now,
    source_connected_at: session.source_connected_at || now,
    go_live_clicked_at: now,
    ended_at: null,
    post_id: postId,
    live_post_id: postId,
    cloudflare_video_uid: cloudflareVideoUid,
    hls_url: playbackUrl,
    playback_url: playbackUrl,
    recording_status: 'recording',
    recording_error: null,
    archive_status: 'pending',
    archive_error: null,
    updated_at: now,
  })
  .eq('id', session.id);
```

## 14. Update details guard

File: `supabase/functions/update-rtmp-live-details/index.ts`

Không được đổi session đang disconnect grace về ready chỉ vì có title/description:

```ts
function producerStatus(session: any, title: string, description: string): string {
  if (session.status === 'live' || session.status === 'ended' || session.status === 'processing' || session.status === 'posted') {
    return session.status;
  }
  if (session.status === 'disconnect_grace' || session.connection_status === 'disconnected') return 'disconnect_grace';

  const connected = session.source_connected === true || (!!session.source_connected_at && session.connection_status !== 'disconnected');
  if (connected && title && description) return 'ready_to_go_live';
  if (connected) return 'source_connected';
  return 'waiting_for_obs';
}
```

## 15. Archive pipeline sau end

Pipeline archive nằm ở `supabase/functions/_shared/archiveReplayService.ts` và `live-replay-archive-cron`.

Sau khi session `ended`:

1. Cron recover/upsert replay nếu thiếu.
2. `archiveReplay` poll Cloudflare MP4 download.
3. Upload MP4 streaming sang R2.
4. Verify R2 bằng HEAD/range.
5. Update `live_replays`:
   - `status = ready`
   - `archive_status = archived/replay_posted/stream_deleted`
   - `playback_provider = r2`
   - `storage_provider = r2`
   - `r2_video_url`
6. Update/create replay post.
7. Sau khi replay post + R2 OK, gọi delete Cloudflare Stream video.

Không bao giờ delete Cloudflare Stream video trước khi:

- R2 upload thành công.
- R2 verify thành công.
- Replay post update thành công.

## 16. Feed behavior

Feed phải giữ logic:

- Khi live ended mà R2 chưa ready: hiển thị “Đang xử lý video replay”.
- Không render video player nếu source null.
- Khi R2 ready: post chuyển `replay_status = ready`, `playback_provider = r2`, `replay_ready = true`, `video_url = r2_video_url`.

Realtime rule:

- `.on('postgres_changes', ...)` phải đăng ký trước `.subscribe()`.
- Chỉ hydrate replay khi `archive_status IN ('archived','replay_posted','stream_deleted')` và có `r2_video_url`.

## 17. Security

- Manual end cần `requireUser`.
- Chỉ owner/admin được end live.
- Frontend không gọi Cloudflare/R2 trực tiếp.
- Không log Stream Key.
- Không log Cloudflare token.
- Không log R2 secret.
- Webhook phải verify `CLOUDFLARE_STREAM_WEBHOOK_SECRET`.
- Cron nên dùng service role hoặc `X-Cron-Secret`.

## 18. Idempotency

Các action phải idempotent:

- User bấm “Kết thúc live” nhiều lần: return success nếu session đã ended/processing/archive.
- Webhook disconnected gửi nhiều lần: chỉ giữ `disconnect_grace`, không tạo replay trùng.
- Cron chạy nhiều lần: không duplicate replay post vì upsert theo `chunked_recording_id = live_session_id`.
- Delete Cloudflare video 404: coi như đã xóa.
- Persistent stream sau khi end: tạo/resume session mới sẽ re-enable Live Input.

## 19. Test checklist

Manual end:

1. Start OBS streaming.
2. Mở `/live/obs/:sessionId`.
3. Bấm “Phát trực tiếp”.
4. Feed có live post.
5. Bấm “Kết thúc live”.
6. Confirm dialog hiện.
7. Session chuyển `ended`, `end_reason = manual`.
8. Cloudflare Live Input `enabled=false`.
9. Feed không còn badge LIVE, hiển thị replay processing.
10. Archive cron export MP4, upload R2, verify R2.
11. Replay post phát từ R2.
12. Cloudflare Stream video bị delete sau archive.

Disconnect timeout:

1. Start OBS streaming.
2. Bấm “Phát trực tiếp”.
3. Stop Streaming trong OBS.
4. Webhook/polling set `disconnect_grace`.
5. UI báo mất nguồn.
6. Reconnect trước 5 phút: live tiếp tục, clear `last_disconnected_at`.
7. Stop lại và chờ quá 5 phút.
8. Watchdog auto-end, `end_reason = disconnect_timeout`.
9. Replay archive sang R2.
10. Feed replay phát từ R2.

Edge cases:

- Bấm end nhiều lần.
- Webhook disconnected gửi duplicate.
- Cloudflare video ready chậm.
- R2 upload fail.
- OBS reconnect sau 4 phút.
- OBS reconnect sau khi session đã auto-ended.
- Persistent stream bị disable sau end rồi session mới re-enable input.

## 20. Verification đã chạy

```bash
npx tsc --noEmit
```

Kết quả: pass.

Không chạy được:

```bash
deno check
```

Lý do: máy local hiện không có `deno` trong PATH.

## 21. Rollback

Nếu production có lỗi:

1. Tắt cron `rtmp-live-watchdog-every-1min`.
2. Revert `get-rtmp-live-session-status` để không auto-end.
3. Revert `end-rtmp-live-session` nếu disable input gây vấn đề.
4. Có thể re-enable Cloudflare Live Input thủ công bằng API `PUT live_inputs/{id} { enabled: true }`.
5. Không rollback feed guard replay R2 nếu đang tránh loading vô hạn.

Rollback SQL gợi ý:

```sql
SELECT cron.unschedule('rtmp-live-watchdog-every-1min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rtmp-live-watchdog-every-1min');
```

## 22. Files changed

- `src/modules/live/pages/RtmpLivePage.tsx`
- `supabase/functions/_shared/cloudflareStreamService.ts`
- `supabase/functions/_shared/rtmpEndLiveService.ts`
- `supabase/functions/create-rtmp-live-session/index.ts`
- `supabase/functions/end-rtmp-live-session/index.ts`
- `supabase/functions/get-rtmp-live-session-status/index.ts`
- `supabase/functions/go-live-rtmp-session/index.ts`
- `supabase/functions/live-replay-archive-cron/index.ts`
- `supabase/functions/stream-webhook/index.ts`
- `supabase/functions/update-rtmp-live-details/index.ts`
- `supabase/migrations/20260512000100_rtmp_end_live_disconnect_grace.sql`

