# RTMP/OBS Source Connected Detection Fix

Tai lieu nay dong goi fix **RTMP/OBS Source Connected Detection Fix** cho Fun Profile de gui sang Lovable.

## Ten tinh nang/fix

**RTMP/OBS Source Connected Detection Fix**

Ten day du:

**RTMP/OBS Live Producer Source Detection & Go Live Enablement Fix**

## Van de

Trong flow `/live/obs`:

- User da nhap title hop le.
- User da nhap description hop le.
- OBS da Start Streaming thanh cong.
- Cloudflare Stream dashboard da hien video dang LIVE.
- Nhung Fun Profile van hien thong bao:

```text
Can OBS connected, tieu de va mo ta hop le truoc khi phat truc tiep.
```

- Nut **Phat truc tiep** van disabled.

## Nguyen nhan audit

File chinh:

- `src/modules/live/pages/RtmpLivePage.tsx`
- `supabase/functions/get-rtmp-live-session-status/index.ts`
- `supabase/functions/go-live-rtmp-session/index.ts`
- `supabase/functions/_shared/cloudflareStreamService.ts`

Trong UI, nut **Phat truc tiep** dang disabled bang:

```tsx
<Button onClick={goLive} disabled={!canGoLive || publishing}>
```

Dieu kien cu cua `canGoLive`:

```ts
const canGoLive = !!credentials && sourceConnected && detailsComplete && !!playbackUrl && credentials.status !== 'live';
```

Dieu kien tren co 2 van de:

1. `sourceConnected` khong duoc set true neu webhook cham hoac app khong map duoc trang thai Cloudflare video LIVE.
2. UI bat buoc `playbackUrl` moi enable button, trong khi day la live public, khong phai replay. Button chi nen phu thuoc:
   - OBS/Cloudflare source connected
   - title hop le
   - description hop le
   - khong dang submit/loading

Backend polling cu chi goi Live Input status:

```ts
liveInput = await getStreamLiveInput(session.cloudflare_live_input_id).catch(() => null);
connected = isLiveInputConnected(liveInput);
```

Nhung co truong hop Cloudflare dashboard da hien video LIVE, Live Input raw lai khong map dung thanh connected. Can fallback bang cach doc danh sach video cua Live Input:

```text
GET /accounts/{account_id}/stream/live_inputs/{live_input_id}/videos
```

Neu co video dang LIVE/ready/streaming thi phai coi la `sourceConnected = true`.

## Muc tieu fix

Khi Cloudflare Stream dashboard da hien video LIVE:

- Fun Profile phai nhan biet `source_connected = true`.
- Checklist **Ket noi nguon video** completed.
- Neu title + description hop le thi nut **Phat truc tiep** enabled.
- Khong yeu cau replay ready.
- Khong yeu cau R2 archive.
- Khong yeu cau viewer.
- Khong yeu cau post da ton tai.
- Khong yeu cau end live.

## Dieu kien moi cua button

Button **Phat truc tiep** chi disabled khi:

1. OBS/Cloudflare source chua connected.
2. Title rong.
3. Description rong.
4. Dang loading/submitting.
5. Session da public live.

Dieu kien moi:

```ts
const detailsComplete = title.trim().length > 0 && description.trim().length > 0;
const canGoLive = !!credentials && sourceConnected && detailsComplete && credentials.status !== 'live';
```

## Source code changes

---

## 1. Cloudflare Stream service

File: `supabase/functions/_shared/cloudflareStreamService.ts`

Them helper `isStreamVideoLive()` de map video LIVE tu Cloudflare:

```ts
export function isStreamVideoLive(video: Record<string, unknown> | null): boolean {
  if (!video) return false;
  const statusObject = (video as { status?: Record<string, unknown> }).status || {};
  const state = String(
    statusObject.state
      || statusObject.current
      || video.status
      || video.state
      || video.live
      || video.readyToStream
      || '',
  ).toLowerCase();
  return video.live === true
    || video.readyToStream === true
    || state.includes('live')
    || state.includes('ready')
    || state.includes('stream');
}
```

Context lien quan da co san trong file:

```ts
export async function getStreamLiveInput(inputId: string): Promise<Record<string, unknown> | null> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${inputId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.success) return null;
  return data.result || null;
}

export function isLiveInputConnected(input: Record<string, unknown> | null): boolean {
  if (!input) return false;
  const rtmps = (input as { rtmps?: Record<string, unknown> }).rtmps || {};
  const status = String(
    input.status
      || input.state
      || input.live
      || input.connected
      || rtmps.status
      || rtmps.state
      || '',
  ).toLowerCase();
  return input.connected === true
    || input.readyToStream === true
    || status.includes('connect')
    || status.includes('live')
    || status.includes('active');
}

export async function listStreamLiveInputVideos(inputId: string): Promise<Record<string, unknown>[]> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${inputId}/videos`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.success) return [];
  return Array.isArray(data.result) ? data.result : [];
}
```

---

## 2. RTMP status polling endpoint

File: `supabase/functions/get-rtmp-live-session-status/index.ts`

Muc tieu:

- Poll server-side moi 3-5 giay tu frontend.
- Doc DB session.
- Goi Cloudflare Live Input.
- Goi Cloudflare Live Input videos.
- Neu co video LIVE thi map `source_connected = true`.
- Update DB `status`, `source_connected_at`, `cloudflare_video_uid`, `hls_url`, `playback_url`.
- Tra `can_go_live = sourceConnected && titleValid && descriptionValid`.

Full source:

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
  if (session.status === 'live' || session.status === 'ended' || session.status === 'processing' || session.status === 'posted' || session.status === 'failed') {
    return session.status;
  }
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
      .select('id, owner_id, host_user_id, mode, status, title, description, source_connected_at, cloudflare_live_input_id, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error')
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
      connected = isLiveInputConnected(liveInput);

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
      status !== session.status
      || (connected && !session.source_connected_at)
      || (cloudflareVideoUid && cloudflareVideoUid !== session.cloudflare_video_uid)
      || (!session.hls_url && hlsUrl)
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
        .select('id, status, title, description, source_connected_at, cloudflare_video_uid, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error')
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

---

## 3. Frontend Live Producer button logic

File: `src/modules/live/pages/RtmpLivePage.tsx`

Truoc fix:

```ts
const detailsComplete = title.trim().length > 0 && description.trim().length > 0;
const playbackUrl = credentials?.hls_url || credentials?.playback_url || null;
const canGoLive = !!credentials && sourceConnected && detailsComplete && !!playbackUrl && credentials.status !== 'live';
```

Sau fix:

```ts
const detailsComplete = title.trim().length > 0 && description.trim().length > 0;
const playbackUrl = credentials?.hls_url || credentials?.playback_url || null;
const canGoLive = !!credentials && sourceConnected && detailsComplete && credentials.status !== 'live';
const disabledReason = useMemo(() => {
  if (publishing) return 'Dang phat truc tiep...';
  if (!sourceConnected) return 'Dang cho OBS ket noi.';
  if (!title.trim() || !description.trim()) return 'Vui long nhap tieu de va mo ta.';
  if (credentials?.status === 'live') return 'Live da public.';
  return null;
}, [credentials?.status, description, publishing, sourceConnected, title]);
```

Button:

```tsx
<Button onClick={goLive} disabled={!canGoLive || publishing}>
  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
  Phat truc tiep
</Button>
```

Debug log an toan:

```ts
useEffect(() => {
  if (!credentials?.live_session_id) return;
  console.debug('[RTMP_PRODUCER_STATE]', {
    sessionId: credentials.live_session_id,
    sessionStatus: credentials.status,
    sourceConnected,
    titleValid: !!title.trim(),
    descriptionValid: !!description.trim(),
    canGoLive,
    disabledReason,
  });
}, [canGoLive, credentials?.live_session_id, credentials?.status, description, disabledReason, sourceConnected, title]);
```

Warning message:

```tsx
{!canGoLive && credentials?.status !== 'live' && (
  <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
    <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
    <span>
      {sourceConnected && detailsComplete
        ? 'OBS da ket noi. Ban co the phat truc tiep.'
        : disabledReason || 'Can OBS connected, tieu de va mo ta hop le truoc khi phat truc tiep.'}
    </span>
  </div>
)}
```

---

## 4. Go live endpoint fallback source check

File: `supabase/functions/go-live-rtmp-session/index.ts`

Muc tieu:

- Khi user bam **Phat truc tiep**, backend khong chi tin DB.
- Backend reload session va tu check Cloudflare Live Input + Live Input videos.
- Neu Cloudflare dang LIVE that thi cho public.
- Khong tao duplicate post.

Full source:

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

    let sourceConnected = !!session.source_connected_at || session.status === 'source_connected' || session.status === 'ready_to_go_live' || session.status === 'live';
    let cloudflareVideoUid = session.cloudflare_video_uid || null;

    if (!sourceConnected && session.cloudflare_live_input_id) {
      const liveInput = await getStreamLiveInput(session.cloudflare_live_input_id).catch(() => null);
      const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
      const liveVideo = videos.find((item) => isStreamVideoLive(item)) || videos.find((item: any) => item?.uid) || null;

      sourceConnected = isLiveInputConnected(liveInput) || !!liveVideo;
      cloudflareVideoUid = liveVideo ? String((liveVideo as any).uid || cloudflareVideoUid || '') : cloudflareVideoUid;

      console.log('[RTMP_GO_LIVE_SOURCE_CHECK]', {
        sessionId: liveSessionId,
        liveInputId: session.cloudflare_live_input_id,
        mappedSourceConnected: sourceConnected,
        cloudflareVideoUid,
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
    }

    if (!sourceConnected) {
      return json({ error: 'OBS chua ket noi nguon video' }, 409);
    }
    if (!session.title?.trim()) return json({ error: 'Tieu de la bat buoc' }, 400);
    if (!session.description?.trim()) return json({ error: 'Mo ta la bat buoc' }, 400);

    const now = new Date().toISOString();
    const fallbackUrls = session.cloudflare_live_input_id ? getStreamPlaybackUrls(session.cloudflare_live_input_id) : null;
    const playbackUrl = session.hls_url || session.playback_url || fallbackUrls?.hls || null;
    if (!playbackUrl) return json({ error: 'Playback URL chua san sang' }, 409);

    let postId = session.post_id || session.live_post_id || null;
    if (!postId) {
      const { data: post, error: postError } = await admin
        .from('posts')
        .insert({
          user_id: user.id,
          content: `${session.title}\n\n${session.description}`,
          visibility: session.privacy === 'friends' ? 'friends' : 'public',
          post_type: 'live',
          video_url: playbackUrl,
          metadata: {
            live_title: session.title,
            live_description: session.description,
            live_status: 'live',
            live_mode: 'rtmp_obs',
            live_session_id: session.id,
            badge: 'LIVE',
            media_type: 'live_video',
            playback_type: 'cloudflare_live_input',
            playback_provider: 'cloudflare_stream',
            storage_provider: 'cloudflare_stream',
            playback_url: playbackUrl,
            hls_url: playbackUrl,
            cloudflare_live_input_id: session.cloudflare_live_input_id,
            viewer_count: 0,
            started_at: now,
          },
        })
        .select('id')
        .single();
      if (postError) throw postError;
      postId = post.id;
    } else {
      const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
      await admin.from('posts').update({
        content: `${session.title}\n\n${session.description}`,
        video_url: playbackUrl,
        post_type: 'live',
        metadata: {
          ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
          live_title: session.title,
          live_description: session.description,
          live_status: 'live',
          live_mode: 'rtmp_obs',
          live_session_id: session.id,
          badge: 'LIVE',
          media_type: 'live_video',
          playback_type: 'cloudflare_live_input',
          playback_provider: 'cloudflare_stream',
          storage_provider: 'cloudflare_stream',
          playback_url: playbackUrl,
          hls_url: playbackUrl,
          started_at: session.started_at || now,
        },
      }).eq('id', postId);
    }

    const { data: updated, error: updateError } = await admin
      .from('live_sessions')
      .update({
        status: 'live',
        started_at: session.started_at || now,
        source_connected_at: session.source_connected_at || now,
        go_live_clicked_at: now,
        post_id: postId,
        live_post_id: postId,
        cloudflare_video_uid: cloudflareVideoUid,
        hls_url: playbackUrl,
        playback_url: playbackUrl,
        updated_at: now,
      })
      .eq('id', session.id)
      .select('id, status, title, description, hls_url, playback_url, post_id, live_post_id, started_at, go_live_clicked_at')
      .single();
    if (updateError) throw updateError;

    return json({ ok: true, live_session: updated, live_post_id: postId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

## Expected behavior sau fix

Neu Cloudflare dashboard da hien video LIVE:

1. Frontend `/live/obs` poll `get-rtmp-live-session-status`.
2. Backend goi:
   - `getStreamLiveInput()`
   - `listStreamLiveInputVideos()`
3. Neu co video LIVE:
   - `source_connected = true`
   - `status = source_connected` hoac `ready_to_go_live`
   - `source_connected_at = now`
   - `cloudflare_video_uid` duoc luu neu co
   - `hls_url/playback_url` duoc backfill neu thieu
4. UI checklist **Ket noi nguon video** completed.
5. Neu title + description hop le:
   - `canGoLive = true`
   - nut **Phat truc tiep** enabled.

## Debug logging

Frontend:

```ts
console.debug('[RTMP_PRODUCER_STATE]', {
  sessionId,
  sessionStatus,
  sourceConnected,
  titleValid,
  descriptionValid,
  canGoLive,
  disabledReason,
});
```

Backend polling:

```ts
console.log('[RTMP_STATUS]', {
  sessionId,
  liveInputId,
  cloudflareVideoUid,
  mappedSourceConnected,
  titleValid,
  descriptionValid,
  canGoLive,
  inputStatus,
  liveVideoStatus,
});
```

Backend go live:

```ts
console.log('[RTMP_GO_LIVE_SOURCE_CHECK]', {
  sessionId,
  liveInputId,
  mappedSourceConnected,
  cloudflareVideoUid,
  inputStatus,
  liveVideoStatus,
});
```

Khong log:

- Stream Key
- Cloudflare API token
- R2 secret

## Test checklist

### Test chuan

1. Vao `/live/obs`.
2. Nhap title + description.
3. Copy RTMPS URL + Stream Key vao OBS.
4. Start Streaming trong OBS.
5. Xac nhan Cloudflare Stream dashboard hien video LIVE.
6. Doi 3-10 giay.
7. Fun Profile phai:
   - completed buoc **Ket noi nguon video**
   - enabled nut **Phat truc tiep**
8. Bam **Phat truc tiep**.
9. Live post xuat hien tren feed/profile.
10. Viewer xem duoc live.

### Edge cases

- OBS connected truoc khi nhap title/description:
  - source connected completed
  - button van disabled den khi title/description hop le

- Nhap title/description truoc khi OBS connected:
  - details completed
  - button disabled den khi OBS connected

- Webhook khong chay:
  - polling van phai map Cloudflare LIVE video thanh `source_connected = true`

- Refresh tab sau khi OBS connected:
  - session resume
  - polling set lai state
  - button enabled neu details hop le

- Bam **Phat truc tiep** nhieu lan:
  - backend dung `post_id/live_post_id` cu
  - khong tao duplicate live post

- OBS disconnect truoc khi bam **Phat truc tiep**:
  - polling ve not connected/ended
  - button disabled

## Verification da chay

```bash
npx tsc --noEmit
npx eslint src/modules/live/pages/RtmpLivePage.tsx src/modules/live/liveService.ts src/modules/live/types.ts
npx vite build
```

Ket qua:

- TypeScript: pass
- ESLint: pass
- Vite build: pass

## Rollback

Neu can rollback fix nay, revert 4 file:

```text
src/modules/live/pages/RtmpLivePage.tsx
supabase/functions/_shared/cloudflareStreamService.ts
supabase/functions/get-rtmp-live-session-status/index.ts
supabase/functions/go-live-rtmp-session/index.ts
```

Khong co migration moi trong fix nay.

