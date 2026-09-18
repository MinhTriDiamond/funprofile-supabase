# Facebook-style RTMP/OBS Live Producer for Fun Profile

Tai lieu nay dong goi tinh nang **Facebook-style RTMP/OBS Live Producer for Fun Profile** de gui sang Lovable.

## Muc tieu

Khi creator chon **Live bang RTMP/OBS**, Fun Profile hien giao dien Live Producer chuyen nghiep gom 3 buoc:

1. Ket noi nguon video
2. Hoan tat chi tiet bai viet
3. Phat truc tiep

OBS co the push stream truoc, nhung live **chua public len feed/profile** cho den khi creator nhap du title/description va bam **Phat truc tiep**.

## Flow moi

```text
Creator mo /live/obs
-> Backend tao/resume Cloudflare Stream Live Input
-> status = waiting_for_obs
-> UI hien RTMPS URL + Stream Key
-> Creator copy vao OBS va Start Streaming
-> Cloudflare webhook/polling detect connected
-> status = source_connected
-> Creator nhap title + description
-> status = ready_to_go_live
-> Nut Phat truc tiep enabled
-> Creator bam Phat truc tiep
-> status = live
-> Tao LIVE post tren feed/profile
-> Viewer xem live
-> OBS disconnected hoac user end live
-> status = ended/processing
-> Cloudflare video READY
-> Export MP4
-> Upload R2
-> Tao/cap nhat replay post
-> Delete Cloudflare Stream video sau khi archive thanh cong
```

## Audit hien tai truoc khi sua

Code lien quan:

- OBS/RTMP page:
  - `src/modules/live/pages/RtmpLivePage.tsx`
- Live routes:
  - `src/App.tsx`
- Live types/service:
  - `src/modules/live/types.ts`
  - `src/modules/live/liveService.ts`
- Cloudflare Stream Live Input:
  - `supabase/functions/_shared/cloudflareStreamService.ts`
- Stream key encryption:
  - `supabase/functions/_shared/streamKeyCrypto.ts`
- RTMP Edge Functions:
  - `supabase/functions/create-rtmp-live-session/index.ts`
  - `supabase/functions/get-rtmp-live-session-credentials/index.ts`
  - `supabase/functions/end-rtmp-live-session/index.ts`
  - `supabase/functions/reset-rtmp-stream-key/index.ts`
- Cloudflare webhook:
  - `supabase/functions/stream-webhook/index.ts`
- Archive pipeline:
  - `supabase/functions/_shared/archiveReplayService.ts`
  - `supabase/functions/_shared/replayFeedService.ts`
  - `supabase/functions/_shared/livestreamProcessingService.ts`
  - `supabase/functions/live-replay-archive-cron/index.ts`
- Delete post/video:
  - `supabase/functions/delete-post-archive/index.ts`

Van de cua flow cu:

- Tao RTMP session la tao luon live post tren feed.
- Cloudflare `connected` webhook doi thang `status = live`.
- Chua co `source_connected`, `ready_to_go_live`.
- Chua bat buoc title + description truoc khi public live.
- Nut "Phat truc tiep" chua bi khoa theo dieu kien.
- OBS connected co the public live som, khong dung Live Producer.

## Schema migration

File: `supabase/migrations/20260510000100_rtmp_live_producer_flow.sql`

```sql
-- Facebook-style RTMP/OBS Live Producer state.

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS stream_key_last_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS go_live_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS live_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replay_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL;

UPDATE public.live_sessions
SET live_post_id = COALESCE(live_post_id, post_id)
WHERE live_post_id IS NULL AND post_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_sessions_status_check'
      AND conrelid = 'public.live_sessions'::regclass
  ) THEN
    ALTER TABLE public.live_sessions DROP CONSTRAINT live_sessions_status_check;
  END IF;
END $$;

ALTER TABLE public.live_sessions
  ADD CONSTRAINT live_sessions_status_check
  CHECK (status IN (
    'created',
    'waiting_for_obs',
    'source_connected',
    'ready_to_go_live',
    'live',
    'ended',
    'processing',
    'archiving',
    'posted',
    'failed'
  ));

DROP POLICY IF EXISTS "public can read live sessions" ON public.live_sessions;
CREATE POLICY "public can read live sessions"
  ON public.live_sessions FOR SELECT
  TO anon, authenticated
  USING (status IN ('live', 'ended', 'processing', 'archiving', 'posted'));

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_producer_status
  ON public.live_sessions(owner_id, mode, status, updated_at DESC)
  WHERE mode = 'rtmp_obs' AND deleted_at IS NULL;
```

## Supabase config

File: `supabase/config.toml`

```toml
[functions.get-rtmp-live-session-status]
  verify_jwt = true

[functions.go-live-rtmp-session]
  verify_jwt = true

[functions.update-rtmp-live-details]
  verify_jwt = true
```

## Cloudflare Stream service additions

File: `supabase/functions/_shared/cloudflareStreamService.ts`

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
```

## Create or resume RTMP session

File: `supabase/functions/create-rtmp-live-session/index.ts`

Y nghia:

- Khi creator mo `/live/obs`, backend tao hoac resume session RTMP chua ket thuc.
- Khong tao live feed post o buoc nay.
- Tra ve RTMPS URL + Stream Key cho owner.
- Stream Key duoc luu encrypted trong DB.

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createStreamLiveInput, getStreamPlaybackUrls } from '../_shared/cloudflareStreamService.ts';
import { decryptStreamKey, encryptStreamKey } from '../_shared/streamKeyCrypto.ts';
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';

function cleanTitle(value: unknown): string {
  const title = typeof value === 'string' ? value.trim() : '';
  return title.slice(0, 160);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const title = cleanTitle(body.title);
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : '';
    const privacy = body.privacy === 'friends' ? 'friends' : 'public';
    const admin = createAdminClient() as any;

    const { data: existing } = await admin
      .from('live_sessions')
      .select('id, status, rtmps_url, stream_key_encrypted, hls_url, post_id, live_post_id, title, description, source_connected_at')
      .eq('owner_id', user.id)
      .eq('mode', 'rtmp_obs')
      .is('deleted_at', null)
      .in('status', ['waiting_for_obs', 'source_connected', 'ready_to_go_live', 'live'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing && body.force_new !== true) {
      return json({
        ok: true,
        resumed: true,
        live_session_id: existing.id,
        post_id: existing.post_id || existing.live_post_id,
        rtmps_url: existing.rtmps_url,
        stream_key: existing.stream_key_encrypted ? await decryptStreamKey(existing.stream_key_encrypted) : null,
        hls_url: existing.hls_url,
        status: existing.status,
        title: existing.title || '',
        description: existing.description || '',
        source_connected_at: existing.source_connected_at || null,
      });
    }

    const sessionId = crypto.randomUUID();
    const channelName = `rtmp_${user.id.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;
    const liveInput = await createStreamLiveInput({ name: title || 'OBS Live', userId: user.id, liveSessionId: sessionId });
    if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) {
      throw new Error('Cloudflare did not return RTMPS credentials');
    }

    const encryptedKey = await encryptStreamKey(liveInput.rtmpsStreamKey);
    const urls = getStreamPlaybackUrls(liveInput.uid);

    const { data: liveSession, error: liveError } = await (admin as any)
      .from('live_sessions')
      .insert({
        id: sessionId,
        user_id: user.id,
        host_user_id: user.id,
        owner_id: user.id,
        mode: 'rtmp_obs',
        title,
        description,
        privacy,
        status: 'waiting_for_obs',
        recording_status: 'processing',
        processing_started_at: new Date().toISOString(),
        channel_name: channelName,
        cloudflare_live_input_id: liveInput.uid,
        rtmps_url: liveInput.rtmpsUrl,
        stream_key_encrypted: encryptedKey,
        stream_key_last_reset_at: new Date().toISOString(),
        playback_url: urls.hls,
        hls_url: urls.hls,
        storage_provider: 'cloudflare_stream',
        playback_provider: 'cloudflare_stream',
        archive_status: 'pending',
      })
      .select('id, status, cloudflare_live_input_id, rtmps_url, hls_url, post_id, live_post_id, title, description, source_connected_at')
      .single();
    if (liveError) throw liveError;

    return json({
      ok: true,
      live_session: liveSession,
      live_session_id: sessionId,
      post_id: null,
      rtmps_url: liveInput.rtmpsUrl,
      stream_key: liveInput.rtmpsStreamKey,
      hls_url: urls.hls,
      status: 'waiting_for_obs',
      title,
      description,
      source_connected_at: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[create-rtmp-live-session] failed', message);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

## Update RTMP live details

File: `supabase/functions/update-rtmp-live-details/index.ts`

Y nghia:

- Owner luu title + description.
- Title bat buoc.
- Description bat buoc.
- Neu OBS da connected va details hop le thi status = `ready_to_go_live`.

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';

function clean(value: unknown, max: number): string {
  return (typeof value === 'string' ? value.trim() : '').slice(0, max);
}

function producerStatus(session: any, title: string, description: string): string {
  if (session.status === 'live' || session.status === 'ended' || session.status === 'processing' || session.status === 'posted') {
    return session.status;
  }
  if (session.source_connected_at && title && description) return 'ready_to_go_live';
  if (session.source_connected_at) return 'source_connected';
  return 'waiting_for_obs';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
    if (!liveSessionId) return json({ error: 'Missing live_session_id' }, 400);

    const title = clean(body.title, 160);
    const description = clean(body.description, 2000);
    if (!title) return json({ error: 'Tieu de la bat buoc' }, 400);
    if (!description) return json({ error: 'Mo ta la bat buoc' }, 400);

    const admin = createAdminClient() as any;
    const { data: session, error } = await admin
      .from('live_sessions')
      .select('id, owner_id, host_user_id, mode, status, source_connected_at')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    const status = producerStatus(session, title, description);
    const { data: updated, error: updateError } = await admin
      .from('live_sessions')
      .update({ title, description, status, updated_at: new Date().toISOString() })
      .eq('id', liveSessionId)
      .select('id, title, description, status, source_connected_at, hls_url, playback_url, post_id, live_post_id')
      .single();
    if (updateError) throw updateError;
    return json({ ok: true, live_session: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

## Poll RTMP source status

File: `supabase/functions/get-rtmp-live-session-status/index.ts`

Y nghia:

- Fallback polling neu webhook cham.
- Kiem tra Cloudflare Live Input connected.
- Cap nhat `source_connected_at`.
- Tinh `can_go_live`.

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getStreamLiveInput, isLiveInputConnected } from '../_shared/cloudflareStreamService.ts';
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';

function nextProducerStatus(session: any, connected: boolean): string {
  if (session.status === 'live' || session.status === 'ended' || session.status === 'processing' || session.status === 'posted' || session.status === 'failed') {
    return session.status;
  }
  if (!connected && !session.source_connected_at) return 'waiting_for_obs';
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
      .select('id, owner_id, host_user_id, mode, status, title, description, source_connected_at, cloudflare_live_input_id, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    let connected = !!session.source_connected_at || session.status === 'live';
    let liveInput: Record<string, unknown> | null = null;
    if (!connected && session.cloudflare_live_input_id) {
      liveInput = await getStreamLiveInput(session.cloudflare_live_input_id).catch(() => null);
      connected = isLiveInputConnected(liveInput);
    }

    const now = new Date().toISOString();
    const status = nextProducerStatus(session, connected);
    let current = session;
    if (status !== session.status || (connected && !session.source_connected_at)) {
      const { data: updated } = await admin
        .from('live_sessions')
        .update({
          status,
          source_connected_at: connected ? (session.source_connected_at || now) : session.source_connected_at,
          updated_at: now,
        })
        .eq('id', liveSessionId)
        .select('id, status, title, description, source_connected_at, hls_url, playback_url, post_id, live_post_id, archive_status, archive_error')
        .single();
      if (updated) current = { ...session, ...updated };
    }

    return json({
      ok: true,
      live_session: current,
      source_connected: connected,
      details_complete: !!current.title?.trim() && !!current.description?.trim(),
      can_go_live: connected && !!current.title?.trim() && !!current.description?.trim() && !!(current.hls_url || current.playback_url),
      cloudflare_live_input: liveInput,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

## Go live endpoint

File: `supabase/functions/go-live-rtmp-session/index.ts`

Y nghia:

- Chi endpoint nay moi tao live post public.
- Verify owner.
- Verify OBS connected.
- Verify title + description.
- Verify playback URL.
- Set `status = live`.
- Set `go_live_clicked_at`.
- Tao LIVE post tren feed/profile.

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
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
    if (!session.source_connected_at && session.status !== 'source_connected' && session.status !== 'ready_to_go_live') {
      return json({ error: 'OBS chua ket noi nguon video' }, 409);
    }
    if (!session.title?.trim()) return json({ error: 'Tieu de la bat buoc' }, 400);
    if (!session.description?.trim()) return json({ error: 'Mo ta la bat buoc' }, 400);
    if (!session.hls_url && !session.playback_url) return json({ error: 'Playback URL chua san sang' }, 409);

    const now = new Date().toISOString();
    let postId = session.post_id || session.live_post_id || null;
    if (!postId) {
      const { data: post, error: postError } = await admin
        .from('posts')
        .insert({
          user_id: user.id,
          content: `${session.title}\n\n${session.description}`,
          visibility: session.privacy === 'friends' ? 'friends' : 'public',
          post_type: 'live',
          video_url: session.hls_url || session.playback_url,
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
            playback_url: session.hls_url || session.playback_url,
            hls_url: session.hls_url || session.playback_url,
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
        video_url: session.hls_url || session.playback_url,
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
          playback_url: session.hls_url || session.playback_url,
          hls_url: session.hls_url || session.playback_url,
          started_at: session.started_at || now,
        },
      }).eq('id', postId);
    }

    const { data: updated, error: updateError } = await admin
      .from('live_sessions')
      .update({
        status: 'live',
        started_at: session.started_at || now,
        go_live_clicked_at: now,
        post_id: postId,
        live_post_id: postId,
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

## Reset stream key changes

File: `supabase/functions/reset-rtmp-stream-key/index.ts`

Y nghia:

- Khong reset am tham neu source dang connected hoac dang live.
- Neu can reset khi active, client phai gui `confirm_reset = true`.
- Reset key se tao Live Input moi, xoa Live Input cu neu co, va quay ve `waiting_for_obs`.

Patch logic:

```ts
const activeStatuses = ['source_connected', 'ready_to_go_live', 'live'];
if (activeStatuses.includes(session.status) && body.confirm_reset !== true) {
  return json({ error: 'OBS dang ket noi hoac dang live. Can confirm_reset=true de reset stream key.' }, 409);
}

await admin.from('live_sessions').update({
  cloudflare_live_input_id: liveInput.uid,
  rtmps_url: liveInput.rtmpsUrl,
  stream_key_encrypted: await encryptStreamKey(liveInput.rtmpsStreamKey),
  stream_key_last_reset_at: new Date().toISOString(),
  playback_url: urls.hls,
  hls_url: urls.hls,
  status: 'waiting_for_obs',
  source_connected_at: null,
  updated_at: new Date().toISOString(),
}).eq('id', liveSessionId);
```

## End RTMP session changes

File: `supabase/functions/end-rtmp-live-session/index.ts`

Y nghia:

- Neu session chua public live thi end khong can tao replay archive.
- Neu session da live/public post thi moi tao replay processing.

Patch logic:

```ts
const shouldArchivePublicLive = session.status === 'live' || !!session.post_id || !!session.live_post_id;
const uid = shouldArchivePublicLive ? await createReplayIfVideoExists(admin, session) : null;

const postId = session.post_id || session.live_post_id;
if (postId) {
  const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
  await admin.from('posts').update({
    metadata: {
      ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
      live_status: 'ended',
      archive_status: 'pending',
      playback_type: 'r2_pending',
    },
  }).eq('id', postId);
}
```

## Cloudflare webhook producer changes

File: `supabase/functions/stream-webhook/index.ts`

Y nghia:

- `connected` khong public live nua.
- `connected` chi set:
  - `source_connected_at`
  - `status = source_connected` hoac `ready_to_go_live`
- `disconnected` moi end session.
- Chi archive neu session da public/live hoac da co post.

Patch logic:

```ts
const detailsComplete = !!session.title?.trim() && !!session.description?.trim();
const patch: Record<string, unknown> = isConnected
  ? {
      status: detailsComplete ? 'ready_to_go_live' : 'source_connected',
      source_connected_at: session.source_connected_at || now,
      recording_status: 'recording',
      archive_error: null,
    }
  : {
      status: 'ended',
      ended_at: session.ended_at || now,
      recording_status: 'processing',
      processing_started_at: session.processing_started_at || now,
    };
await admin.from('live_sessions').update(patch).eq('id', session.id);

if (session.post_id || session.live_post_id) {
  const postId = session.post_id || session.live_post_id;
  const { data: post } = await admin.from('posts').select('metadata').eq('id', postId).maybeSingle();
  await admin.from('posts').update({
    metadata: {
      ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
      live_status: isConnected ? session.status : 'ended',
      live_mode: 'rtmp_obs',
      live_session_id: session.id,
      archive_status: isDisconnected ? 'pending' : session.archive_status,
      playback_type: isDisconnected ? 'r2_pending' : 'cloudflare_live_input',
    },
  }).eq('id', postId);
}

if (isDisconnected && (session.status === 'live' || session.post_id || session.live_post_id)) {
  const videos = await listStreamLiveInputVideos(liveInputId).catch(() => []);
  const video = videos.find((item: any) => item?.uid) as any;
  if (video?.uid) await findOrCreateReplayForVideo(admin, String(video.uid), event, video);
}
```

## Archive service sync

File: `supabase/functions/_shared/archiveReplayService.ts`

Y nghia:

- Sau khi replay post duoc tao/cap nhat, mirror `replay_post_id` ve `live_sessions`.

```ts
await admin.from('live_sessions').update({
  status: postId ? 'posted' : 'processing',
  recording_status: 'ready',
  recording_ready_at: now,
  recording_error: null,
  archive_status: postId ? 'archived' : 'failed',
  archive_error: postId ? null : 'Replay post not created',
  archived_at: postId ? (replay.archived_at || now) : null,
  posted_at: postId ? now : null,
  replay_post_id: postId,
  storage_provider: postId ? 'r2' : (replay.storage_provider || 'cloudflare_stream'),
  playback_provider: postId ? 'r2' : (replay.playback_provider || 'cloudflare_stream'),
  r2_object_key: replay.r2_object_key || null,
  r2_bucket: replay.r2_bucket || null,
  r2_video_url: r2Url,
  playback_url: r2Url,
  cloudflare_video_uid: replay.stream_uid || replay.cloudflare_video_uid || null,
  cloudflare_mp4_download_url: replay.cloudflare_mp4_download_url || null,
}).eq('id', replay.live_session_id);
```

## Frontend Live Producer UI

File: `src/modules/live/pages/RtmpLivePage.tsx`

Y nghia:

- Layout 3 cot:
  - Left: progress checklist.
  - Center: live preview + post details.
  - Right: RTMPS settings + action buttons.
- Nut **Phat truc tiep** chi enabled khi:
  - `sourceConnected === true`
  - title hop le
  - description hop le
  - co HLS/playback URL
  - session chua live

Source code:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clipboard, Loader2, Play, RadioTower, RotateCcw, Square, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { ReplayPlayer } from '@/components/ui/ReplayPlayer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

interface ProducerSession {
  live_session_id: string;
  live_post_id?: string | null;
  post_id?: string | null;
  rtmps_url: string;
  stream_key: string;
  hls_url?: string | null;
  playback_url?: string | null;
  status: string;
  title?: string | null;
  description?: string | null;
  source_connected_at?: string | null;
}

interface StatusPayload {
  live_session?: Partial<ProducerSession> & { id?: string; live_post_id?: string | null; post_id?: string | null };
  source_connected?: boolean;
  details_complete?: boolean;
  can_go_live?: boolean;
}

async function copyText(value: string, label: string) {
  await navigator.clipboard.writeText(value);
  toast.success(`${label} da sao chep`);
}

function stepState(done: boolean, active: boolean) {
  if (done) return 'border-emerald-500 bg-emerald-500/10 text-emerald-700';
  if (active) return 'border-primary bg-primary/10 text-primary';
  return 'border-muted bg-card text-muted-foreground';
}

export default function RtmpLivePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sourceConnected, setSourceConnected] = useState(false);
  const [credentials, setCredentials] = useState<ProducerSession | null>(null);

  const detailsComplete = title.trim().length > 0 && description.trim().length > 0;
  const playbackUrl = credentials?.hls_url || credentials?.playback_url || null;
  const canGoLive = !!credentials && sourceConnected && detailsComplete && !!playbackUrl && credentials.status !== 'live';

  const createOrResumeSession = useCallback(async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-rtmp-live-session', {
        body: { privacy: 'public' },
      });
      if (error) throw error;
      if (!data?.rtmps_url || !data?.stream_key) throw new Error('Khong nhan duoc OBS credentials');
      const next = data as ProducerSession;
      setCredentials(next);
      setTitle(next.title || '');
      setDescription(next.description || '');
      setSourceConnected(!!next.source_connected_at || ['source_connected', 'ready_to_go_live', 'live'].includes(next.status));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Tao OBS live that bai');
    } finally {
      setCreating(false);
    }
  }, []);

  useEffect(() => {
    createOrResumeSession();
  }, [createOrResumeSession]);

  const refreshStatus = useCallback(async () => {
    if (!credentials?.live_session_id) return;
    try {
      const { data, error } = await supabase.functions.invoke('get-rtmp-live-session-status', {
        body: { live_session_id: credentials.live_session_id },
      });
      if (error) throw error;
      const payload = data as StatusPayload;
      const liveSession = payload.live_session || {};
      setSourceConnected(!!payload.source_connected);
      setCredentials((current) => current ? {
        ...current,
        ...liveSession,
        live_session_id: current.live_session_id,
        status: liveSession.status || current.status,
        hls_url: liveSession.hls_url || current.hls_url,
        playback_url: liveSession.playback_url || current.playback_url,
        post_id: liveSession.post_id || current.post_id,
        live_post_id: liveSession.live_post_id || current.live_post_id,
      } : current);
    } catch {
      // Polling is fallback; webhook can still update state.
    }
  }, [credentials?.live_session_id]);

  useEffect(() => {
    if (!credentials?.live_session_id || credentials.status === 'ended' || credentials.status === 'posted') return;
    const timer = window.setInterval(() => refreshStatus(), 5000);
    refreshStatus();
    return () => window.clearInterval(timer);
  }, [credentials?.live_session_id, credentials?.status, refreshStatus]);

  const saveDetails = async (): Promise<boolean> => {
    if (!credentials?.live_session_id) return false;
    if (!detailsComplete) {
      toast.error('Tieu de va mo ta la bat buoc');
      return false;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('update-rtmp-live-details', {
        body: { live_session_id: credentials.live_session_id, title, description },
      });
      if (error) throw error;
      const liveSession = (data as StatusPayload).live_session || {};
      setCredentials((current) => current ? { ...current, ...liveSession, live_session_id: current.live_session_id } : current);
      toast.success('Da luu chi tiet bai live');
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Luu chi tiet that bai');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goLive = async () => {
    if (!credentials?.live_session_id || !canGoLive) return;
    setPublishing(true);
    try {
      const saved = await saveDetails();
      if (!saved) return;
      const { data, error } = await supabase.functions.invoke('go-live-rtmp-session', {
        body: { live_session_id: credentials.live_session_id },
      });
      if (error) throw error;
      const liveSession = (data as StatusPayload).live_session || {};
      setCredentials((current) => current ? {
        ...current,
        ...liveSession,
        live_session_id: current.live_session_id,
        status: 'live',
        live_post_id: (data as { live_post_id?: string }).live_post_id || current.live_post_id,
      } : current);
      toast.success('Da phat truc tiep len feed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Phat truc tiep that bai');
    } finally {
      setPublishing(false);
    }
  };

  const resetKey = async () => {
    if (!credentials?.live_session_id) return;
    const confirmReset = sourceConnected || credentials.status === 'live'
      ? window.confirm('OBS dang ket noi hoac dang live. Reset key se lam key cu khong dung duoc. Tiep tuc?')
      : true;
    if (!confirmReset) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-rtmp-stream-key', {
        body: { live_session_id: credentials.live_session_id, confirm_reset: confirmReset },
      });
      if (error) throw error;
      setCredentials({ ...credentials, ...(data as ProducerSession) });
      setSourceConnected(false);
      toast.success('Da dat lai Stream Key');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reset Stream Key that bai');
    } finally {
      setResetting(false);
    }
  };

  const endSession = async () => {
    if (!credentials?.live_session_id) return;
    setEnding(true);
    try {
      const { error } = await supabase.functions.invoke('end-rtmp-live-session', {
        body: { live_session_id: credentials.live_session_id },
      });
      if (error) throw error;
      setCredentials({ ...credentials, status: 'ended' });
      toast.success('Da ket thuc live. Replay dang duoc xu ly.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ket thuc live that bai');
    } finally {
      setEnding(false);
    }
  };

  const statusLabel = useMemo(() => {
    if (!credentials) return 'Dang tao';
    if (credentials.status === 'live') return 'Dang live';
    if (credentials.status === 'ended') return 'Da ket thuc';
    if (sourceConnected && detailsComplete) return 'San sang phat';
    if (sourceConnected) return 'Da ket noi OBS';
    return 'Cho OBS ket noi';
  }, [credentials, detailsComplete, sourceConnected]);

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main className="pt-16 px-3 md:px-6 pb-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <RadioTower className="h-6 w-6 text-primary" />
                Live Producer
              </h1>
              <p className="text-sm text-muted-foreground">Phat truc tiep bang phan mem OBS/RTMP.</p>
            </div>
            <Badge variant={credentials?.status === 'live' ? 'destructive' : 'secondary'}>{statusLabel}</Badge>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_380px] gap-4">
            <aside className="border bg-card p-4 space-y-3 rounded-lg">
              <h2 className="font-semibold text-sm">Tien trinh</h2>
              {[
                { label: 'Ket noi nguon video', done: sourceConnected, active: !sourceConnected },
                { label: 'Hoan tat chi tiet bai viet', done: detailsComplete, active: sourceConnected && !detailsComplete },
                { label: 'Phat truc tiep', done: credentials?.status === 'live', active: canGoLive },
              ].map((step, index) => (
                <div key={step.label} className={`border p-3 rounded-md ${stepState(step.done, step.active)}`}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {step.done ? <Check className="h-4 w-4" /> : <span className="h-4 w-4 text-center">{index + 1}</span>}
                    {step.label}
                  </div>
                </div>
              ))}
            </aside>

            <section className="space-y-4">
              <div className="aspect-video bg-black relative rounded-lg overflow-hidden border">
                {sourceConnected && playbackUrl ? (
                  <ReplayPlayer src={playbackUrl} className="h-full w-full" autoPlay muted controls />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 text-center px-6">
                    {creating ? <Loader2 className="h-8 w-8 animate-spin mb-3" /> : <RadioTower className="h-10 w-10 mb-3" />}
                    <div className="font-semibold">Ket noi phan mem phat truc tiep de len song</div>
                    <div className="text-sm text-white/70 mt-1">Mo OBS, nhap Server URL va Stream Key, sau do bam Start Streaming.</div>
                  </div>
                )}
              </div>

              <div className="border bg-card p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">Hoan tat chi tiet bai viet</h2>
                  {detailsComplete ? <Badge variant="secondary">Completed</Badge> : <Badge variant="outline">Required</Badge>}
                </div>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tieu de live bat buoc" maxLength={160} />
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mo ta live bat buoc" rows={5} />
                <Button onClick={saveDetails} disabled={saving || !credentials || !detailsComplete}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Luu chi tiet
                </Button>
              </div>
            </section>

            <aside className="border bg-card p-4 rounded-lg space-y-4">
              <div>
                <h2 className="font-semibold">Ket noi nguon video</h2>
                <p className="text-sm text-muted-foreground">OBS &gt; Settings &gt; Stream &gt; Service Custom.</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Server URL / RTMPS URL</label>
                <div className="flex gap-2">
                  <Input value={credentials?.rtmps_url || ''} readOnly className="font-mono text-xs" />
                  <Button variant="outline" size="icon" disabled={!credentials?.rtmps_url} onClick={() => copyText(credentials!.rtmps_url, 'Server URL')}>
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Stream Key</label>
                <div className="flex gap-2">
                  <Input value={credentials?.stream_key || ''} readOnly type="password" className="font-mono text-xs" />
                  <Button variant="outline" size="icon" disabled={!credentials?.stream_key} onClick={() => copyText(credentials!.stream_key, 'Stream Key')}>
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button variant="outline" onClick={resetKey} disabled={resetting || !credentials}>
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Dat lai Stream Key
              </Button>

              {!canGoLive && credentials?.status !== 'live' && (
                <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Can OBS connected, tieu de va mo ta hop le truoc khi phat truc tiep.</span>
                </div>
              )}

              <div className="pt-2 border-t flex flex-col gap-2">
                <Button onClick={goLive} disabled={!canGoLive || publishing}>
                  {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Phat truc tiep
                </Button>
                <Button variant="destructive" onClick={endSession} disabled={ending || !credentials || credentials.status === 'ended'}>
                  {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  Ket thuc live
                </Button>
                {(credentials?.live_post_id || credentials?.post_id) && (
                  <Button variant="secondary" onClick={() => navigate(`/post/${credentials.live_post_id || credentials.post_id}`)}>
                    Xem bai live tren feed
                  </Button>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
```

## Live types update

File: `src/modules/live/types.ts`

```ts
export type LiveStatus =
  | 'created'
  | 'waiting_for_obs'
  | 'source_connected'
  | 'ready_to_go_live'
  | 'live'
  | 'ended'
  | 'processing'
  | 'archiving'
  | 'posted'
  | 'failed';

export interface LiveSession {
  stream_key_last_reset_at?: string | null;
  source_connected_at?: string | null;
  go_live_clicked_at?: string | null;
  live_post_id?: string | null;
  replay_post_id?: string | null;
}
```

## liveService update

File: `src/modules/live/liveService.ts`

Them vao normalize/select fields:

```ts
stream_key_last_reset_at: row.stream_key_last_reset_at ?? null,
source_connected_at: row.source_connected_at ?? null,
go_live_clicked_at: row.go_live_clicked_at ?? null,
live_post_id: row.live_post_id ?? null,
replay_post_id: row.replay_post_id ?? null,
```

Select query can include:

```sql
stream_key_last_reset_at,
source_connected_at,
go_live_clicked_at,
live_post_id,
replay_post_id
```

## Environment variables

```env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_WEBHOOK_SECRET=
STREAM_KEY_ENCRYPTION_SECRET=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=
R2_PUBLIC_DOMAIN=
R2_SIGNED_URL_EXPIRES_SECONDS=
```

## Test checklist

### Flow chuan

1. User chon **Live bang OBS**.
2. Vao `/live/obs`.
3. Backend tao/resume RTMP session.
4. UI hien RTMPS URL + Stream Key.
5. User copy vao OBS:
   - OBS -> Settings -> Stream
   - Service = Custom
   - Server = RTMPS URL
   - Stream Key = Stream Key
6. User bam Start Streaming trong OBS.
7. Webhook/polling detect connected.
8. UI buoc **Ket noi nguon video** completed.
9. User nhap title + description.
10. UI buoc **Hoan tat chi tiet bai viet** completed.
11. Nut **Phat truc tiep** enabled.
12. User bam **Phat truc tiep**.
13. Backend tao LIVE post tren feed/profile.
14. Viewer xem live tren feed/profile.
15. User stop OBS hoac bam Ket thuc live.
16. Status ended/processing.
17. Cloudflare video READY.
18. Export MP4 -> upload R2 -> replay post -> delete Stream video.

### Edge cases

- OBS connected truoc khi nhap title: khong public live, nut disabled.
- Nhap title/description truoc khi OBS connected: nut disabled cho den khi OBS connected.
- Refresh browser: session resume, OBS van live doc lap.
- Dong tab browser: OBS van stream, session khong auto end.
- Reset stream key khi connected/live: yeu cau confirm.
- OBS disconnect truoc khi bam Phat truc tiep: khong tao live post public.
- Create live post fail: khong doi thanh public live.
- R2 archive fail: giu Stream video, set `archive_status = failed`, retry.

## Rollback

Neu loi truoc khi bam **Phat truc tiep**:

- Chi co private `live_sessions`.
- Khong co public feed post.
- Co the end/delete session staging.

Neu loi sau khi live public:

- Live post da co `live_post_id`.
- Stop OBS se dua ve ended/processing.
- Archive fail thi giu Cloudflare Stream video va retry.
- Khong delete Cloudflare Stream truoc khi R2 + DB + replay post thanh cong.

Neu can rollback code:

- Revert migration `20260510000100_rtmp_live_producer_flow.sql` neu chua apply production.
- Revert cac functions moi:
  - `update-rtmp-live-details`
  - `get-rtmp-live-session-status`
  - `go-live-rtmp-session`
- Revert patch trong:
  - `RtmpLivePage.tsx`
  - `create-rtmp-live-session`
  - `stream-webhook`
  - `reset-rtmp-stream-key`
  - `end-rtmp-live-session`

## Verification

Da chay:

```bash
npx tsc --noEmit
npx eslint src/modules/live/pages/RtmpLivePage.tsx src/modules/live/liveService.ts src/modules/live/types.ts
npx vite build
```

Ket qua:

- TypeScript: pass
- ESLint: pass
- Vite build: pass

