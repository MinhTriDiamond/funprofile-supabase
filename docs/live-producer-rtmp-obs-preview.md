# Live Producer RTMP/OBS Preview

## Mục tiêu

Nâng cấp Live Producer cho RTMP/OBS để preview phát ngay khi OBS bắt đầu gửi tín hiệu lên Cloudflare Stream, dù user chưa bấm **Phát trực tiếp**.

Flow mong muốn:

```text
OBS Start Streaming
-> Cloudflare Stream nhận tín hiệu
-> Fun Profile detect source_connected
-> Live Producer preview phát ngay trong dashboard
-> User kiểm tra hình/âm thanh
-> User nhập title/description
-> User bấm "Phát trực tiếp"
-> Live post mới public lên feed
```

Điểm quan trọng:

- Preview trong Live Producer khác public live trên feed.
- Preview chỉ cần `sourceConnected = true` và có `hlsUrl/playbackUrl`.
- Nút **Phát trực tiếp** chỉ quyết định public live post lên feed.
- Preview không được chờ live post, replay, R2 archive, recording ready.

## Audit hiện tại

Các file/path liên quan:

- `src/modules/live/pages/RtmpLivePage.tsx`
  - Route `/live/obs` và `/live/obs/:sessionId`.
  - Tạo/resume RTMP session.
  - Poll trạng thái OBS/Cloudflare.
  - Render preview player.
  - Điều khiển nút **Phát trực tiếp**.

- `supabase/functions/get-rtmp-live-session-status/index.ts`
  - Edge Function kiểm tra DB + Cloudflare Live Input.
  - Detect `source_connected`.
  - Trả trạng thái cho frontend.

- `supabase/functions/create-rtmp-live-session/index.ts`
  - Tạo Cloudflare Live Input.
  - Lưu `hls_url` / `playback_url` theo Live Input.

- `supabase/functions/go-live-rtmp-session/index.ts`
  - Chỉ public session lên feed.
  - Tạo/update post live.
  - Set `status = live`.

- `src/components/ui/ReplayPlayer.tsx`
  - HLS/native video player dùng cho preview.
  - Dùng `hls.js` khi browser không hỗ trợ native HLS.

- `src/components/feed/LiveVolumeControl.tsx`
  - Overlay volume control dùng chung cho live preview/feed.

## Nguyên nhân preview chưa hiện ngay hoặc bị giật

1. Polling frontend 5 giây nên OBS connected có thể thấy chậm.
2. `ReplayPlayer` key phụ thuộc `credentials.status`, nên khi status đổi `source_connected -> ready_to_go_live -> live`, player bị remount dù URL không đổi.
3. Có retry tự tăng `previewReloadToken` mỗi 5 giây khi chưa ready, dễ làm preview reload/nhấp nháy.
4. Status API trả dữ liệu trong `live_session`, nhưng thiếu field top-level rõ ràng như `sourceConnected`, `playbackUrl`, `hlsUrl`, `updatedAt`.

## Thiết kế mới

State chính:

```ts
const playbackUrl = credentials?.hls_url || credentials?.playback_url || null;
const canShowPreview =
  !!playbackUrl &&
  sourceConnected &&
  credentials?.status !== 'ended' &&
  credentials?.status !== 'posted';
```

Ý nghĩa:

- `waiting_for_obs`: chưa có tín hiệu OBS, hiển thị hướng dẫn kết nối.
- `source_connected`: OBS đã gửi tín hiệu, preview phát ngay, chưa public feed.
- `ready_to_go_live`: OBS connected + title/description hợp lệ, preview vẫn phát.
- `live`: đã bấm **Phát trực tiếp**, preview vẫn phát, feed có live post.
- `ended/posted`: preview dừng hoặc hiển thị trạng thái khác.

## Source Code

### 1. Edge Function status payload

File: `supabase/functions/get-rtmp-live-session-status/index.ts`

Đảm bảo function có logic này:

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  getStreamLiveInput,
  getStreamPlaybackUrls,
  isLiveInputConnected,
  isStreamVideoLive,
  listStreamLiveInputVideos,
} from '../_shared/cloudflareStreamService.ts';
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';

function nextProducerStatus(session: any, connected: boolean): string {
  if (session.status === 'live' || session.status === 'ended' || session.status === 'processing' || session.status === 'posted') {
    return session.status;
  }
  if (session.status === 'failed' && !connected) return 'failed';
  if (!connected) return 'waiting_for_obs';
  return session.title?.trim() && session.description?.trim() ? 'ready_to_go_live' : 'source_connected';
}

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
      .select('id, owner_id, host_user_id, mode, status, title, description, source_connected_at, cloudflare_live_input_id, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error, rtmp_config_id, is_persistent_stream, updated_at')
      .eq('id', liveSessionId)
      .maybeSingle();

    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    let connected = session.status === 'live';
    let liveInput: Record<string, unknown> | null = null;
    let liveVideo: Record<string, unknown> | null = null;
    let cloudflareVideoUid: string | null = session.cloudflare_video_uid || null;

    if (session.cloudflare_live_input_id) {
      liveInput = await getStreamLiveInput(session.cloudflare_live_input_id).catch(() => null);
      connected = session.status === 'live' || isLiveInputConnected(liveInput);

      const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
      liveVideo = (videos.find((item) => isStreamVideoLive(item)) || videos.find((item: any) => item?.uid) || null) as Record<string, unknown> | null;

      if (liveVideo) {
        cloudflareVideoUid = String((liveVideo as { uid?: unknown }).uid || cloudflareVideoUid || '');
        connected = true;
      }
    }

    const now = new Date().toISOString();
    const status = nextProducerStatus(session, connected);
    let current = session;
    const fallbackUrls = session.cloudflare_live_input_id ? getStreamPlaybackUrls(session.cloudflare_live_input_id) : null;
    const hlsUrl = session.hls_url || session.playback_url || fallbackUrls?.hls || null;

    if (
      status !== session.status ||
      (connected && !session.source_connected_at) ||
      (cloudflareVideoUid && cloudflareVideoUid !== session.cloudflare_video_uid) ||
      (!session.hls_url && hlsUrl)
    ) {
      const { data: updated } = await admin
        .from('live_sessions')
        .update({
          status,
          source_connected_at: connected ? (session.source_connected_at || now) : session.source_connected_at,
          cloudflare_video_uid: cloudflareVideoUid || session.cloudflare_video_uid,
          hls_url: hlsUrl,
          playback_url: session.playback_url || hlsUrl,
          updated_at: now,
        })
        .eq('id', liveSessionId)
        .select('id, status, title, description, source_connected_at, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error, rtmp_config_id, is_persistent_stream, updated_at')
        .single();

      if (updated) current = { ...session, ...updated };
    }

    const titleValid = !!current.title?.trim();
    const descriptionValid = !!current.description?.trim();
    const canGoLive = connected && titleValid && descriptionValid;

    console.log('[RTMP_STATUS]', {
      sessionId: liveSessionId,
      liveInputId: session.cloudflare_live_input_id,
      cloudflareVideoUid,
      mappedSourceConnected: connected,
      titleValid,
      descriptionValid,
      canGoLive,
      inputStatus: liveInput ? {
        status: (liveInput as any).status,
        state: (liveInput as any).state,
        connected: (liveInput as any).connected,
        readyToStream: (liveInput as any).readyToStream,
      } : null,
      liveVideoStatus: liveVideo ? {
        uid: (liveVideo as any).uid,
        status: (liveVideo as any).status,
        state: (liveVideo as any).state,
        live: (liveVideo as any).live,
        readyToStream: (liveVideo as any).readyToStream,
      } : null,
    });

    return json({
      ok: true,
      sessionId: current.id,
      status: current.status,
      sourceConnected: connected,
      playbackUrl: current.playback_url || current.hls_url || hlsUrl,
      hlsUrl: current.hls_url || current.playback_url || hlsUrl,
      cloudflareVideoUid: cloudflareVideoUid || current.cloudflare_video_uid || null,
      updatedAt: current.updated_at || now,
      live_session: current,
      source_connected: connected,
      details_complete: titleValid && descriptionValid,
      can_go_live: canGoLive,
      cloudflare_video_uid: cloudflareVideoUid,
      cloudflare_live_input: liveInput,
      cloudflare_live_video: liveVideo,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

### 2. Frontend status payload type

File: `src/modules/live/pages/RtmpLivePage.tsx`

Add/ensure fields:

```ts
interface StatusPayload {
  live_session?: Partial<ProducerSession> & { id?: string; live_post_id?: string | null; post_id?: string | null };
  source_connected?: boolean;
  sourceConnected?: boolean;
  details_complete?: boolean;
  can_go_live?: boolean;
  status?: string;
  playbackUrl?: string | null;
  hlsUrl?: string | null;
  cloudflareVideoUid?: string | null;
  updatedAt?: string;
}
```

### 3. Preview visibility and stable key

File: `src/modules/live/pages/RtmpLivePage.tsx`

```ts
const playbackUrl = credentials?.hls_url || credentials?.playback_url || null;
const canShowPreview = !!playbackUrl && sourceConnected && credentials?.status !== 'ended' && credentials?.status !== 'posted';

const livePreviewSrc = useMemo(() => {
  if (!playbackUrl) return null;
  if (previewReloadToken === 0) return playbackUrl;
  const separator = playbackUrl.includes('?') ? '&' : '?';
  return `${playbackUrl}${separator}fp_live_preview=${previewReloadToken}`;
}, [playbackUrl, previewReloadToken]);

const livePreviewKey = [
  playbackUrl || 'no-src',
  credentials?.cloudflare_video_uid || credentials?.live_session_id || 'no-video',
  previewReloadToken,
].join(':');
```

Important: do not include `credentials.status` in `livePreviewKey`. Status changes must not remount the player if URL is unchanged.

### 4. Merge status response into frontend state

File: `src/modules/live/pages/RtmpLivePage.tsx`

```ts
const refreshStatus = useCallback(async () => {
  if (!credentials?.live_session_id) return;

  try {
    const { data, error } = await supabase.functions.invoke('get-rtmp-live-session-status', {
      body: { live_session_id: credentials.live_session_id },
    });
    if (error) throw error;

    const payload = data as StatusPayload;
    const liveSession = payload.live_session || {};
    const nextSourceConnected = !!(payload.sourceConnected ?? payload.source_connected);
    const nextHlsUrl = payload.hlsUrl || liveSession.hls_url || liveSession.playback_url;
    const nextPlaybackUrl = payload.playbackUrl || liveSession.playback_url || liveSession.hls_url;
    const nextCloudflareVideoUid = payload.cloudflareVideoUid || liveSession.cloudflare_video_uid;

    setSourceConnected(nextSourceConnected);
    setCredentials((current) => current ? {
      ...current,
      ...liveSession,
      live_session_id: current.live_session_id,
      status: payload.status || liveSession.status || current.status,
      hls_url: nextHlsUrl || current.hls_url,
      playback_url: nextPlaybackUrl || current.playback_url,
      cloudflare_video_uid: nextCloudflareVideoUid || current.cloudflare_video_uid,
      rtmp_config_id: liveSession.rtmp_config_id || current.rtmp_config_id,
      is_persistent_stream: typeof liveSession.is_persistent_stream === 'boolean'
        ? liveSession.is_persistent_stream
        : current.is_persistent_stream,
      post_id: liveSession.post_id || current.post_id,
      live_post_id: liveSession.live_post_id || current.live_post_id,
    } : current);

    console.debug('[RTMP_STATUS_POLL]', {
      sessionId: credentials.live_session_id,
      previousStatus: credentials.status,
      nextStatus: payload.status || liveSession.status || credentials.status,
      sourceConnected: nextSourceConnected,
      playbackUrlExists: !!(nextPlaybackUrl || credentials.playback_url),
      hlsUrlExists: !!(nextHlsUrl || credentials.hls_url),
      cloudflareVideoUid: nextCloudflareVideoUid || credentials.cloudflare_video_uid || null,
      updatedAt: payload.updatedAt,
      previousSourceConnected: sourceConnected,
      disabledReason,
    });
  } catch {
    // Polling is fallback; webhook can still update state.
  }
}, [
  credentials?.cloudflare_video_uid,
  credentials?.hls_url,
  credentials?.live_session_id,
  credentials?.playback_url,
  credentials?.status,
  disabledReason,
  sourceConnected,
]);
```

### 5. Polling interval

File: `src/modules/live/pages/RtmpLivePage.tsx`

```ts
useEffect(() => {
  if (!credentials?.live_session_id || credentials.status === 'ended' || credentials.status === 'posted') return;
  const pollMs = credentials.status === 'live' ? 5000 : 2500;
  const timer = window.setInterval(() => refreshStatus(), pollMs);
  refreshStatus();
  return () => window.clearInterval(timer);
}, [credentials?.live_session_id, credentials?.status, refreshStatus]);
```

### 6. Preview player render

File: `src/modules/live/pages/RtmpLivePage.tsx`

```tsx
<div className="aspect-video bg-black relative rounded-lg overflow-hidden border">
  {canShowPreview ? (
    <ReplayPlayer
      key={livePreviewKey}
      src={livePreviewSrc || playbackUrl}
      className="h-full w-full"
      autoPlay
      muted={previewMuted || previewVolume <= 0}
      volume={previewVolume}
      controls={false}
      onReady={handlePreviewReady}
      onError={handlePreviewError}
      onPlaybackBlocked={() => setPreviewNeedsGesture(true)}
    />
  ) : (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 text-center px-6">
      {creating ? <Loader2 className="h-8 w-8 animate-spin mb-3" /> : <RadioTower className="h-10 w-10 mb-3" />}
      <div className="font-semibold">Kết nối phần mềm phát trực tiếp để lên sóng</div>
      <div className="text-sm text-white/70 mt-1">
        Mở OBS, nhập Server URL và Stream Key, sau đó bấm Start Streaming.
      </div>
    </div>
  )}

  {canShowPreview && (
    <LiveVolumeControl
      muted={previewMuted}
      volume={previewVolume}
      onToggleMuted={togglePreviewMuted}
      onVolumeChange={changePreviewVolume}
      needsUserGesture={previewNeedsGesture}
    />
  )}
</div>
```

### 7. Audio preference for producer preview

File: `src/modules/live/pages/RtmpLivePage.tsx`

```ts
const [previewMuted, setPreviewMuted] = useState(true);
const [previewVolume, setPreviewVolume] = useState(0.8);
const [previewNeedsGesture, setPreviewNeedsGesture] = useState(false);

useEffect(() => {
  try {
    const storedMuted = localStorage.getItem('funprofile_live_muted');
    const storedVolume = localStorage.getItem('funprofile_live_volume');
    if (storedMuted !== null) setPreviewMuted(storedMuted === 'true');
    if (storedVolume !== null) {
      const nextVolume = Number(storedVolume);
      if (Number.isFinite(nextVolume)) setPreviewVolume(Math.max(0, Math.min(1, nextVolume)));
    }
  } catch {
    // Keep autoplay-safe defaults if storage is unavailable.
  }
}, []);

const persistPreviewAudioPreference = useCallback((nextMuted: boolean, nextVolume: number) => {
  try {
    localStorage.setItem('funprofile_live_muted', String(nextMuted));
    localStorage.setItem('funprofile_live_volume', String(Math.max(0, Math.min(1, nextVolume))));
  } catch {
    // Storage can be unavailable in private/browser-restricted contexts.
  }
}, []);

const togglePreviewMuted = useCallback(() => {
  const nextVolume = previewVolume > 0 ? previewVolume : 0.6;
  const nextMuted = !(previewMuted || previewVolume <= 0);
  setPreviewMuted(nextMuted);
  if (previewVolume <= 0) setPreviewVolume(nextVolume);
  setPreviewNeedsGesture(false);
  persistPreviewAudioPreference(nextMuted, nextVolume);
}, [persistPreviewAudioPreference, previewMuted, previewVolume]);

const changePreviewVolume = useCallback((nextVolume: number) => {
  const normalizedVolume = Math.max(0, Math.min(1, nextVolume));
  const nextMuted = normalizedVolume === 0;
  setPreviewVolume(normalizedVolume);
  setPreviewMuted(nextMuted);
  if (normalizedVolume > 0) setPreviewNeedsGesture(false);
  persistPreviewAudioPreference(nextMuted, normalizedVolume);
}, [persistPreviewAudioPreference]);
```

### 8. LiveVolumeControl component

File: `src/components/feed/LiveVolumeControl.tsx`

```tsx
import { useId } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface LiveVolumeControlProps {
  muted: boolean;
  volume: number;
  onToggleMuted: () => void;
  onVolumeChange: (volume: number) => void;
  needsUserGesture?: boolean;
}

export const LiveVolumeControl = ({
  muted,
  volume,
  onToggleMuted,
  onVolumeChange,
  needsUserGesture = false,
}: LiveVolumeControlProps) => {
  const sliderId = useId();
  const effectiveMuted = muted || volume <= 0;
  const toggleLabel = effectiveMuted ? 'Bật âm thanh' : 'Tắt âm thanh';

  return (
    <div
      className="absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-md bg-black/60 px-2 py-1.5 text-white shadow-lg backdrop-blur-sm"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      aria-label="Điều khiển âm lượng live"
    >
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        onClick={onToggleMuted}
        aria-label={toggleLabel}
        title={toggleLabel}
      >
        {effectiveMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>

      <label className="sr-only" htmlFor={sliderId}>Âm lượng</label>
      <input
        id={sliderId}
        type="range"
        min={0}
        max={100}
        step={1}
        value={effectiveMuted ? 0 : Math.round(volume * 100)}
        onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
        className="h-8 w-24 cursor-pointer accent-white sm:w-28"
        aria-label="Âm lượng"
        title="Âm lượng"
      />

      {needsUserGesture && (
        <span className="hidden whitespace-nowrap text-[11px] font-medium text-white/90 sm:inline">
          Bấm để bật tiếng
        </span>
      )}
    </div>
  );
};
```

### 9. ReplayPlayer required props

File: `src/components/ui/ReplayPlayer.tsx`

Ensure props include:

```ts
export interface ReplayPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  volume?: number;
  controls?: boolean;
  loop?: boolean;
  onReady?: () => void;
  onError?: (error: Error) => void;
  onPlaybackBlocked?: () => void;
}
```

Ensure the video element is controlled by `muted` and `volume` without recreating HLS on every slider move:

```ts
const mutedRef = useRef(muted);
const volumeRef = useRef(volume);
const onPlaybackBlockedRef = useRef(onPlaybackBlocked);

useEffect(() => {
  mutedRef.current = muted;
  volumeRef.current = volume;
  onPlaybackBlockedRef.current = onPlaybackBlocked;
}, [muted, volume, onPlaybackBlocked]);

useEffect(() => {
  const video = videoRef.current;
  if (!video) return;
  const normalizedVolume = Math.max(0, Math.min(1, volume));
  video.volume = normalizedVolume;
  video.muted = muted || normalizedVolume === 0;

  if (autoPlay && !video.muted && video.paused) {
    video.play().catch(() => {
      onPlaybackBlocked?.();
    });
  }
}, [autoPlay, muted, volume, onPlaybackBlocked]);
```

In the HLS ready/autoplay path:

```ts
if (autoPlay) {
  const normalizedVolume = Math.max(0, Math.min(1, volumeRef.current));
  video.muted = mutedRef.current || normalizedVolume === 0;
  video.volume = normalizedVolume;
  video.play().catch(() => {
    video.muted = true;
    video.play().catch(() => {
      onPlaybackBlockedRef.current?.();
    });
  });
}
```

## Debug Logging

Safe logs added/expected:

- `[RTMP_STATUS_POLL]`
- `[RTMP_PRODUCER_STATE]`
- `[RTMP_PREVIEW_PLAYER_MOUNTED]`
- `[RTMP_PREVIEW_RELOAD_TRIGGERED]`
- `[RTMP_PREVIEW_READY]`
- `[RTMP_PREVIEW_ERROR]`
- `[RTMP_PREVIEW_MANUAL_RELOAD]`

Log allowed:

- `sessionId`
- `sourceConnected`
- `status`
- `playbackUrlExists`
- `hlsUrlExists`
- `cloudflareVideoUid`
- `disabledReason`

Do not log:

- Stream Key
- Cloudflare token
- R2 secret
- Authorization headers

## Test Checklist

### Case 1: mở Producer trước, OBS start sau

1. Open `/live/obs/:sessionId`.
2. OBS chưa start: preview hiển thị hướng dẫn.
3. OBS Start Streaming.
4. Trong 2-5 giây preview phải hiện và autoplay muted.

### Case 2: OBS start trước, Producer mở sau

1. OBS Start Streaming.
2. Open `/live/obs/:sessionId`.
3. Preview phải hiện gần như ngay sau initial status fetch.

### Case 3: chưa nhập title/description

1. OBS connected.
2. Không nhập title/description.
3. Preview vẫn phát.
4. Nút **Phát trực tiếp** vẫn disabled.

### Case 4: nhập đủ title/description

1. OBS connected.
2. Nhập title + description.
3. Preview vẫn phát.
4. Nút **Phát trực tiếp** enabled.

### Case 5: bấm Phát trực tiếp

1. Bấm **Phát trực tiếp**.
2. Feed có live post.
3. Preview trong Live Producer không giật/reset nếu URL không đổi.

### Case 6: audio preview

1. Preview autoplay muted.
2. Bấm icon loa để bật tiếng.
3. Kéo slider âm lượng.
4. Reload page, preference được giữ.

### Case 7: OBS disconnect/reconnect

1. OBS disconnect.
2. Status update theo polling.
3. OBS reconnect.
4. Preview cập nhật lại đúng, không cần refresh tab.

## Rollback

Nếu cần rollback tính năng này:

1. Revert thay đổi trong `src/modules/live/pages/RtmpLivePage.tsx`.
2. Revert thay đổi trong `supabase/functions/get-rtmp-live-session-status/index.ts`.
3. Nếu không dùng volume overlay nữa, remove import/use `LiveVolumeControl` khỏi Producer preview.

## Verification

Command đã chạy:

```bash
cmd /c npx tsc --noEmit
```

Kết quả: passed.

