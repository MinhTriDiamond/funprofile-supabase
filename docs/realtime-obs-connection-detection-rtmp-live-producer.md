# Realtime OBS Connection Detection for RTMP Live Producer

## Mục tiêu

Tính năng này giúp FUN Profile Live Producer tự động nhận biết gần như realtime khi OBS/Restream/vMix bắt đầu gửi tín hiệu RTMP lên Cloudflare Stream.

Khi user bấm **Start Streaming** trong OBS:

```txt
OBS
-> Cloudflare Stream Live Input nhận tín hiệu RTMP
-> Cloudflare Stream chuyển trạng thái LIVE
-> Backend detect LIVE bằng webhook hoặc polling
-> DB live_sessions được update
-> Supabase Realtime emit event
-> Live Producer tự update UI
-> Preview video xuất hiện
-> Nút "Phát trực tiếp" enable nếu title + description hợp lệ
```

Preview trong Live Producer không phụ thuộc việc user đã bấm **Phát trực tiếp** hay chưa.

## Audit hiện tại

Các file liên quan:

```txt
src/modules/live/pages/RtmpLivePage.tsx
supabase/functions/stream-webhook/index.ts
supabase/functions/get-rtmp-live-session-status/index.ts
supabase/functions/create-rtmp-live-session/index.ts
supabase/functions/go-live-rtmp-session/index.ts
supabase/migrations/20260512000300_rtmp_obs_realtime_connection_detection.sql
```

Vấn đề trước khi sửa:

- Frontend chủ yếu dựa vào polling và state local.
- `RtmpLivePage` chưa subscribe realtime trực tiếp vào row `live_sessions`.
- Backend chưa chuẩn hóa đủ field realtime như `preview_ready`, `preview_url`, `live_input_status`, `connected_at`, `disconnected_at`.
- Khi Cloudflare đã LIVE nhưng frontend chưa nhận state mới, UI vẫn hiện “Đang chờ OBS kết nối”.
- Preview source đôi lúc dùng URL theo `live_input_id`, trong khi Cloudflare Stream playback HLS nên lấy theo video UID khi có live video.
- Polling cũ có thể khiến disconnect trước khi public live bị xử lý như ended quá sớm.

## Database migration

File:

```txt
supabase/migrations/20260512000300_rtmp_obs_realtime_connection_detection.sql
```

```sql
-- Realtime OBS connection detection for RTMP Live Producer.

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_connection_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_input_status text,
  ADD COLUMN IF NOT EXISTS preview_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS reconnect_count integer NOT NULL DEFAULT 0;

UPDATE public.live_sessions
SET connected_at = COALESCE(connected_at, source_connected_at),
    disconnected_at = COALESCE(disconnected_at, last_disconnected_at),
    preview_url = COALESCE(preview_url, hls_url, playback_url),
    preview_ready = COALESCE(preview_ready, false) OR (
      COALESCE(source_connected, false)
      AND COALESCE(hls_url, playback_url) IS NOT NULL
    )
WHERE mode = 'rtmp_obs';

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_realtime_connection
  ON public.live_sessions (mode, connection_status, source_connected, preview_ready, updated_at)
  WHERE mode = 'rtmp_obs' AND deleted_at IS NULL;

ALTER TABLE public.live_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
```

## Backend: Cloudflare webhook detection

File:

```txt
supabase/functions/stream-webhook/index.ts
```

Import cần có:

```ts
import { getStreamPlaybackUrls, getStreamVideo, isStreamVideoLive, listStreamLiveInputVideos } from '../_shared/cloudflareStreamService.ts';
```

Trong `handleLiveInputEvent`, session query phải bao gồm `disconnect_grace`:

```ts
const { data: session } = await admin
  .from('live_sessions')
  .select('*')
  .eq('cloudflare_live_input_id', liveInputId)
  .in('status', ['waiting_for_obs', 'source_connected', 'ready_to_go_live', 'live', 'disconnect_grace'])
  .order('updated_at', { ascending: false })
  .limit(1)
  .maybeSingle();
```

Khi webhook connected, lấy live video UID và preview HLS URL:

```ts
const now = new Date().toISOString();
const detailsComplete = !!session.title?.trim() && !!session.description?.trim();
const liveInputVideos = isConnected
  ? await listStreamLiveInputVideos(liveInputId).catch((error) => {
    console.warn('[WEBHOOK] failed to list live input videos for OBS preview', {
      liveInputId,
      liveSessionId: session.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return [] as any[];
  })
  : [];
const liveVideo = liveInputVideos.find((item: any) => isStreamVideoLive(item))
  || liveInputVideos.find((item: any) => item?.uid)
  || null;
const videoUid = liveVideo?.uid ? String(liveVideo.uid) : (session.cloudflare_video_uid || null);
const streamUrls = videoUid ? getStreamPlaybackUrls(videoUid) : null;
const previewUrl = streamUrls?.hls || session.preview_url || session.hls_url || session.playback_url || null;
const previewReady = isConnected && !!videoUid && !!previewUrl;
```

Connected update:

```ts
if (isConnected) {
  const wasDisconnected = !!(session.source_disconnected_at || session.last_disconnected_at || session.disconnected_at || session.auto_end_at);
  const wasInGrace = (session.status === 'live' || session.status === 'disconnect_grace') && wasDisconnected;
  const nextStatus = session.status === 'live'
    ? 'live'
    : (detailsComplete ? 'ready_to_go_live' : 'source_connected');

  await admin.from('live_sessions').update({
    status: nextStatus,
    source_connected: true,
    connection_status: 'connected',
    source_connected_at: session.source_connected_at || now,
    connected_at: session.connected_at || session.source_connected_at || now,
    disconnected_at: null,
    last_disconnected_at: null,
    last_connection_check_at: now,
    live_input_status: 'live',
    preview_ready: previewReady,
    preview_url: previewUrl,
    hls_url: previewUrl || session.hls_url,
    playback_url: previewUrl || session.playback_url,
    cloudflare_video_uid: videoUid || session.cloudflare_video_uid,
    reconnect_count: wasDisconnected ? Number(session.reconnect_count || 0) + 1 : Number(session.reconnect_count || 0),
    recording_status: 'recording',
    archive_error: null,
    source_disconnected_at: null,
    auto_end_at: null,
  }).eq('id', session.id);

  console.log('[WEBHOOK] OBS source connected', {
    live_session_id: session.id,
    status: nextStatus,
    previewReady,
    previewUrlExists: !!previewUrl,
    cloudflareVideoUidExists: !!videoUid,
    reconnected: !!wasInGrace,
  });

  return json({
    ok: true,
    status: nextStatus,
    live_session_id: session.id,
    source_connected: true,
    preview_ready: previewReady,
    previewUrlExists: !!previewUrl,
    reconnected: !!wasInGrace,
  });
}
```

Disconnected khi đang public live:

```ts
const isPublicLive = session.status === 'live' && (!!session.post_id || !!session.live_post_id);

if (isPublicLive) {
  const disconnectedAt = session.source_disconnected_at || now;
  const autoEndAt = new Date(new Date(disconnectedAt).getTime() + 5 * 60_000).toISOString();

  await admin.from('live_sessions').update({
    status: 'disconnect_grace',
    source_connected: false,
    connection_status: 'disconnected',
    source_disconnected_at: disconnectedAt,
    last_disconnected_at: disconnectedAt,
    disconnected_at: disconnectedAt,
    last_connection_check_at: now,
    live_input_status: 'disconnected',
    preview_ready: false,
    auto_end_at: autoEndAt,
    recording_status: 'source_disconnected',
  }).eq('id', session.id);

  return json({
    ok: true,
    status: 'disconnect_grace',
    live_session_id: session.id,
    auto_end_at: autoEndAt,
  });
}
```

Disconnected trước khi user bấm **Phát trực tiếp**:

```ts
await admin.from('live_sessions').update({
  status: 'waiting_for_obs',
  source_connected: false,
  connection_status: 'disconnected',
  source_disconnected_at: now,
  last_disconnected_at: now,
  disconnected_at: now,
  last_connection_check_at: now,
  live_input_status: 'disconnected',
  preview_ready: false,
  preview_url: null,
  recording_status: 'waiting',
}).eq('id', session.id);

return json({
  ok: true,
  status: 'waiting_for_obs',
  live_session_id: session.id,
  source_connected: false,
});
```

## Backend: fallback polling

File:

```txt
supabase/functions/get-rtmp-live-session-status/index.ts
```

Polling detect Cloudflare state bằng Live Input + live video list:

```ts
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
```

Status rules:

```ts
const connectedStatuses = ['source_connected', 'ready_to_go_live', 'live', 'disconnect_grace'];
const graceStatuses = ['live', 'disconnect_grace'];

let disconnectedAt = session.last_disconnected_at || null;
if (!connected && connectedStatuses.includes(session.status) && !disconnectedAt) disconnectedAt = now;

if (!connected && graceStatuses.includes(session.status) && disconnectGraceExpired(disconnectedAt)) {
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
      preview_ready: false,
      cloudflare_video_uid: result.cloudflare_video_uid,
    },
    source_connected: false,
    preview_ready: false,
    details_complete: !!session.title?.trim() && !!session.description?.trim(),
    can_go_live: false,
    auto_ended: true,
  });
}
```

Build preview URL bằng Cloudflare video UID:

```ts
const playbackUid = cloudflareVideoUid || session.cloudflare_video_uid || null;
const fallbackUrls = playbackUid ? getStreamPlaybackUrls(playbackUid) : null;
const storedUrlValid = !!(session.hls_url && playbackUid && session.hls_url.includes(playbackUid));
const hlsUrl = storedUrlValid ? session.hls_url : (fallbackUrls?.hls || null);
const playbackUrlOut = storedUrlValid
  ? (session.playback_url && session.playback_url.includes(playbackUid!) ? session.playback_url : hlsUrl)
  : hlsUrl;
const previewReady = connected && !!hlsUrl;
const liveInputStatus = connected ? 'live' : (disconnectedAt ? 'disconnected' : 'waiting');
```

Update session khi Cloudflare state thay đổi:

```ts
await admin
  .from('live_sessions')
  .update({
    status,
    connection_status: connected ? 'connected' : (disconnectedAt ? 'disconnected' : 'waiting'),
    source_connected: connected,
    last_disconnected_at: connected ? null : disconnectedAt,
    connected_at: connected ? (session.connected_at || session.source_connected_at || now) : session.connected_at,
    disconnected_at: connected ? null : disconnectedAt,
    last_connection_check_at: now,
    live_input_status: liveInputStatus,
    preview_ready: previewReady,
    preview_url: hlsUrl,
    reconnect_count: connected && session.last_disconnected_at ? Number(session.reconnect_count || 0) + 1 : Number(session.reconnect_count || 0),
    source_connected_at: connected ? (session.source_connected_at || now) : session.source_connected_at,
    cloudflare_video_uid: cloudflareVideoUid || session.cloudflare_video_uid,
    hls_url: hlsUrl,
    playback_url: playbackUrlOut,
    updated_at: now,
  })
  .eq('id', liveSessionId);
```

Response cần trả về:

```ts
return json({
  ok: true,
  sessionId: current.id,
  status: current.status,
  sourceConnected: connected,
  playbackUrl: hlsUrl,
  hlsUrl: hlsUrl,
  previewReady,
  previewUrl: hlsUrl,
  cloudflareVideoUid: cloudflareVideoUid || current.cloudflare_video_uid || null,
  updatedAt: current.updated_at || now,
  connectionStatus: current.connection_status || (connected ? 'connected' : 'disconnected'),
  lastDisconnectedAt: current.last_disconnected_at || null,
  disconnectGraceSeconds: getDisconnectGraceSeconds(),
  live_session: current,
  source_connected: connected,
  preview_ready: previewReady,
  details_complete: titleValid && descriptionValid,
  can_go_live: connected && previewReady && titleValid && descriptionValid,
  cloudflare_video_uid: cloudflareVideoUid,
  cloudflare_live_input: liveInput,
  cloudflare_live_video: liveVideo,
});
```

## Backend: create/resume session response

File:

```txt
supabase/functions/create-rtmp-live-session/index.ts
```

`serializeSession` cần trả thêm field realtime:

```ts
return {
  ok: true,
  live_session: session,
  live_session_id: session.id,
  post_id: session.post_id || session.live_post_id || null,
  live_post_id: session.live_post_id || null,
  rtmps_url: session.rtmps_url,
  stream_key: streamKey,
  hls_url: session.hls_url,
  playback_url: session.playback_url || session.hls_url || null,
  cloudflare_video_uid: session.cloudflare_video_uid || null,
  status: session.status,
  title: session.title || '',
  description: session.description || '',
  source_connected: !!session.source_connected,
  source_connected_at: session.source_connected_at || null,
  connection_status: session.connection_status || 'waiting',
  connected_at: session.connected_at || null,
  disconnected_at: session.disconnected_at || null,
  last_connection_check_at: session.last_connection_check_at || null,
  live_input_status: session.live_input_status || null,
  preview_ready: !!session.preview_ready,
  preview_url: session.preview_url || null,
  reconnect_count: Number(session.reconnect_count || 0),
  rtmp_config_id: session.rtmp_config_id || null,
  is_persistent_stream: !!session.is_persistent_stream,
  producer_url: `/live/obs/${session.id}`,
  ...extras,
};
```

Khi insert session mới:

```ts
{
  status: 'waiting_for_obs',
  connection_status: 'waiting',
  source_connected: false,
  connected_at: null,
  disconnected_at: null,
  last_connection_check_at: null,
  live_input_status: 'waiting',
  preview_ready: false,
  preview_url: null,
  reconnect_count: 0,
  archive_status: 'pending',
}
```

## Backend: go live guard

File:

```txt
supabase/functions/go-live-rtmp-session/index.ts
```

Source connected check:

```ts
let sourceConnected = !!session.source_connected
  || !!session.source_connected_at
  || session.status === 'source_connected'
  || session.status === 'ready_to_go_live'
  || session.status === 'live';
let cloudflareVideoUid: string | null = session.cloudflare_video_uid || null;

if ((!sourceConnected || !cloudflareVideoUid || !session.preview_ready) && session.cloudflare_live_input_id) {
  const liveInput = await getStreamLiveInput(session.cloudflare_live_input_id).catch(() => null);
  const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
  const liveVideo = videos.find((item) => isStreamVideoLive(item)) || videos.find((item: any) => item?.uid) || null;

  sourceConnected = isLiveInputConnected(liveInput) || !!liveVideo;
  cloudflareVideoUid = liveVideo
    ? String((liveVideo as any).uid || cloudflareVideoUid || '')
    : cloudflareVideoUid;
}
```

Playback URL ưu tiên preview/video UID:

```ts
const fallbackUrls = cloudflareVideoUid ? getStreamPlaybackUrls(cloudflareVideoUid) : null;
const playbackUrl = session.preview_url || session.hls_url || session.playback_url || fallbackUrls?.hls || null;
if (!playbackUrl) return json({ error: 'Playback URL chưa sẵn sàng' }, 409);
```

Update khi public live:

```ts
await admin
  .from('live_sessions')
  .update({
    status: 'live',
    connection_status: 'connected',
    source_connected: true,
    last_disconnected_at: null,
    connected_at: session.connected_at || session.source_connected_at || now,
    disconnected_at: null,
    last_connection_check_at: now,
    live_input_status: 'live',
    preview_ready: true,
    preview_url: playbackUrl,
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

## Frontend: Live Producer realtime update

File:

```txt
src/modules/live/pages/RtmpLivePage.tsx
```

Types:

```ts
interface ProducerSession {
  live_session_id: string;
  live_post_id?: string | null;
  post_id?: string | null;
  rtmps_url: string;
  stream_key: string;
  hls_url?: string | null;
  playback_url?: string | null;
  cloudflare_video_uid?: string | null;
  rtmp_config_id?: string | null;
  is_persistent_stream?: boolean;
  producer_url?: string | null;
  status: string;
  title?: string | null;
  description?: string | null;
  source_connected_at?: string | null;
  source_connected?: boolean | null;
  connection_status?: string | null;
  connected_at?: string | null;
  disconnected_at?: string | null;
  last_disconnected_at?: string | null;
  last_connection_check_at?: string | null;
  live_input_status?: string | null;
  preview_ready?: boolean | null;
  preview_url?: string | null;
  reconnect_count?: number | null;
  end_reason?: string | null;
}

interface StatusPayload {
  live_session?: Partial<ProducerSession> & { id?: string; live_post_id?: string | null; post_id?: string | null };
  source_connected?: boolean;
  sourceConnected?: boolean;
  details_complete?: boolean;
  can_go_live?: boolean;
  status?: string;
  playbackUrl?: string | null;
  hlsUrl?: string | null;
  previewReady?: boolean;
  previewUrl?: string | null;
  preview_ready?: boolean;
  cloudflareVideoUid?: string | null;
  updatedAt?: string;
  connectionStatus?: string;
  lastDisconnectedAt?: string | null;
  disconnectGraceSeconds?: number;
  auto_ended?: boolean;
}
```

Preview source và enable rule:

```ts
const playbackUrl = credentials?.preview_url || credentials?.hls_url || credentials?.playback_url || null;
const producerPreviewReady = !!credentials?.preview_ready || (!!playbackUrl && sourceConnected);
const canShowPreview = !!playbackUrl
  && sourceConnected
  && credentials?.status !== 'ended'
  && credentials?.status !== 'posted';

const canGoLive = !!credentials
  && sourceConnected
  && producerPreviewReady
  && detailsComplete
  && credentials.status !== 'live'
  && !isLockedLive;
```

Realtime subscription, quan trọng là `.on(...)` phải đứng trước `.subscribe()`:

```ts
useEffect(() => {
  const liveSessionId = credentials?.live_session_id;
  if (!liveSessionId) return;

  const channel = supabase
    .channel(`rtmp-live-session-${liveSessionId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${liveSessionId}` },
      (payload) => {
        const row = payload.new as Partial<ProducerSession> & { id?: string };
        const nextPreviewUrl = row.preview_url || row.hls_url || row.playback_url || null;
        const nextSourceConnected = !!row.source_connected
          || !!row.source_connected_at
          || ['source_connected', 'ready_to_go_live', 'live'].includes(String(row.status || ''));
        const nextPreviewReady = !!row.preview_ready || (!!nextPreviewUrl && nextSourceConnected);

        setSourceConnected(nextSourceConnected);
        setCredentials((current) => current ? {
          ...current,
          ...row,
          live_session_id: current.live_session_id,
          hls_url: row.hls_url || current.hls_url,
          playback_url: row.playback_url || current.playback_url,
          preview_url: row.preview_url || current.preview_url,
          preview_ready: nextPreviewReady,
          cloudflare_video_uid: row.cloudflare_video_uid || current.cloudflare_video_uid,
        } : current);

        if (nextSourceConnected && connectionNoticeRef.current === 'disconnected') {
          toast.success('Nguon video da ket noi lai.');
          connectionNoticeRef.current = 'connected';
        } else if (nextSourceConnected && connectionNoticeRef.current !== 'connected') {
          toast.success('OBS da ket noi. Preview live dang san sang.');
          connectionNoticeRef.current = 'connected';
        } else if (!nextSourceConnected && row.status === 'disconnect_grace' && connectionNoticeRef.current !== 'disconnected') {
          toast.warning('Nguon video da mat ket noi. Dang cho OBS ket noi lai.');
          connectionNoticeRef.current = 'disconnected';
        } else if (!nextSourceConnected && row.status === 'waiting_for_obs' && connectionNoticeRef.current !== 'waiting') {
          toast.warning('OBS da ngat ket noi. Hay bam Start Streaming de ket noi lai.');
          connectionNoticeRef.current = 'waiting';
        }

        console.debug('[RTMP_REALTIME_SESSION_UPDATE]', {
          sessionId: liveSessionId,
          status: row.status,
          sourceConnected: nextSourceConnected,
          previewReady: nextPreviewReady,
          previewUrlExists: !!nextPreviewUrl,
          liveInputStatus: row.live_input_status,
          connectionStatus: row.connection_status,
        });
      },
    )
    .subscribe((status, error) => {
      if (error) {
        console.warn('[RTMP_REALTIME_SUBSCRIBE_FAILED]', {
          sessionId: liveSessionId,
          error: error.message,
        });
        return;
      }
      console.debug('[RTMP_REALTIME_SUBSCRIBE_STATUS]', { sessionId: liveSessionId, status });
    });

  return () => {
    supabase.removeChannel(channel);
  };
}, [credentials?.live_session_id]);
```

Polling fallback 5 giây, tạm dừng khi tab hidden:

```ts
useEffect(() => {
  if (!credentials?.live_session_id || credentials.status === 'ended' || credentials.status === 'posted') return;

  const pollMs = 5000;
  const tick = () => {
    if (document.hidden) return;
    refreshStatus();
  };

  const timer = window.setInterval(tick, pollMs);
  refreshStatus();

  return () => window.clearInterval(timer);
}, [credentials?.live_session_id, credentials?.status, refreshStatus]);
```

Khi player preview thật sự ready:

```ts
const handlePreviewReady = useCallback(() => {
  setPreviewReady(true);
  setCredentials((current) => current ? { ...current, preview_ready: true } : current);
  console.debug('[RTMP_PREVIEW_READY]', {
    sessionId: credentials?.live_session_id,
    status: credentials?.status,
    playbackUrl,
  });
}, [credentials?.live_session_id, credentials?.status, playbackUrl]);
```

## Flow mới

### OBS connected

```txt
OBS Start Streaming
-> Cloudflare webhook connected OR polling detects live video
-> live_sessions:
   source_connected = true
   connection_status = connected
   connected_at = now()
   live_input_status = live
   preview_ready = true when HLS URL exists
   preview_url = Cloudflare HLS URL by video UID
-> Supabase Realtime event
-> RtmpLivePage updates state
-> Step 1 completed
-> Preview renders
-> Go Live enabled if title + description valid
```

### OBS disconnected before public live

```txt
OBS Stop Streaming before "Phát trực tiếp"
-> live_sessions:
   status = waiting_for_obs
   source_connected = false
   connection_status = disconnected
   preview_ready = false
   preview_url = null
-> UI returns to waiting state
```

### OBS disconnected during public live

```txt
OBS Stop Streaming during live
-> live_sessions:
   status = disconnect_grace
   source_connected = false
   connection_status = disconnected
   last_disconnected_at = now()
   auto_end_at = now() + grace period
-> UI warns user and waits for reconnect
```

## Logging an toàn

Log được phép:

```txt
sessionId
liveInputId
sourceConnected
previewReady
previewUrlExists
cloudflareVideoUidExists
connectionStatus
liveInputStatus
```

Không log:

```txt
stream_key
Cloudflare token
R2 secret
signed URL dài hạn
```

## Test checklist

1. Mở Live Producer `/live/obs/:sessionId`.
2. Chưa mở OBS: UI hiển thị chờ OBS.
3. OBS bấm **Start Streaming**.
4. Cloudflare nhận RTMP.
5. UI tự update không cần reload.
6. Step “Kết nối nguồn video” chuyển completed.
7. Preview video xuất hiện.
8. Nhập title + description.
9. Nút **Phát trực tiếp** enable.
10. Stop OBS trước khi public: UI quay về waiting.
11. Start OBS lại: UI recover, preview hiện lại.
12. Bấm **Phát trực tiếp**: public live không làm preview reset bất thường.
13. Stop OBS khi đang live: UI vào disconnect grace.
14. Reconnect trong grace: UI báo connected lại.
15. Không có duplicate realtime subscription.
16. Không cần reload tab.

## Verification

Đã chạy frontend typecheck:

```bash
cmd /c npx tsc --noEmit
```

Kết quả: pass.

Ghi chú: môi trường local hiện chưa có `deno`, nên chưa chạy được:

```bash
deno check supabase/functions/stream-webhook/index.ts
```

## Rollback

Nếu cần rollback nhanh:

1. Revert migration `20260512000300_rtmp_obs_realtime_connection_detection.sql`.
2. Revert các thay đổi trong:
   - `RtmpLivePage.tsx`
   - `stream-webhook/index.ts`
   - `get-rtmp-live-session-status/index.ts`
   - `create-rtmp-live-session/index.ts`
   - `go-live-rtmp-session/index.ts`
3. Giữ lại flow polling cũ nếu muốn fallback tạm thời.

