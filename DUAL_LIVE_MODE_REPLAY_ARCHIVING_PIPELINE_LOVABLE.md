# Dual Live Mode + Live Replay Archiving Pipeline

Tai lieu nay dong goi tinh nang livestream moi cho Fun Profile de gui sang Lovable.

## Ten tinh nang

**Dual Live Mode + Live Replay Archiving Pipeline**

He thong co 2 che do live:

1. **Webcam Live**
   - User live truc tiep trong app bang camera/microphone.
   - Realtime duoc xu ly bang Agora RTC.

2. **OBS/RTMP Live**
   - Creator dung OBS/Streamlabs/XSplit.
   - Backend tao Cloudflare Stream Live Input.
   - Creator copy RTMPS URL + Stream Key vao OBS.

Sau khi bat ky livestream nao ket thuc:

```text
Cloudflare Stream video READY
-> Export MP4
-> Upload MP4 sang Cloudflare R2
-> Verify object tren R2
-> Tao replay/feed post
-> Delete video khoi Cloudflare Stream
```

Cloudflare Stream chi la lop ingest/recording/transcoding tam thoi. Video replay lau dai nam tren Cloudflare R2.

## Audit he thong hien tai

Repo da co san:

- Agora RTC webcam live:
  - `src/lib/agoraRtc.ts`
  - `src/modules/live/hooks/useLiveRtc.ts`
  - `src/modules/live/pages/LiveHostPage.tsx`
  - `src/modules/live/pages/LiveAudiencePage.tsx`
- Start/end live flow:
  - `src/modules/live/liveService.ts`
- Live replay/archive pipeline hien co:
  - `supabase/functions/_shared/cloudflareStreamService.ts`
  - `supabase/functions/_shared/r2StorageService.ts`
  - `supabase/functions/_shared/archiveReplayService.ts`
  - `supabase/functions/_shared/replayFeedService.ts`
  - `supabase/functions/_shared/livestreamProcessingService.ts`
  - `supabase/functions/live-replay-archive-cron/index.ts`
  - `supabase/functions/delete-post-archive/index.ts`
- Webhook Cloudflare Stream:
  - `supabase/functions/stream-webhook/index.ts`

Thieu truoc khi trien khai:

- Chua co OBS/RTMP live mode.
- Chua co Cloudflare Stream Live Input creation flow.
- Chua co UI creator copy RTMPS URL / Stream Key.
- Chua co encrypted stream key storage.
- Webhook chua xu ly live input connected/disconnected.
- `live_sessions` chua day du field cho dual live mode va archive status.

## Migration

File: `supabase/migrations/20260509000100_live_modes_rtmp_obs.sql`

```sql
-- Add dual livestream modes: Agora webcam and Cloudflare Stream Live Input (OBS/RTMP).

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'agora_webcam',
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS agora_channel_name text,
  ADD COLUMN IF NOT EXISTS agora_uid integer,
  ADD COLUMN IF NOT EXISTS cloudflare_live_input_id text,
  ADD COLUMN IF NOT EXISTS cloudflare_video_uid text,
  ADD COLUMN IF NOT EXISTS rtmps_url text,
  ADD COLUMN IF NOT EXISTS stream_key_encrypted text,
  ADD COLUMN IF NOT EXISTS playback_url text,
  ADD COLUMN IF NOT EXISTS hls_url text,
  ADD COLUMN IF NOT EXISTS cloudflare_mp4_download_url text,
  ADD COLUMN IF NOT EXISTS r2_object_key text,
  ADD COLUMN IF NOT EXISTS r2_bucket text,
  ADD COLUMN IF NOT EXISTS r2_video_url text,
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'cloudflare_stream',
  ADD COLUMN IF NOT EXISTS playback_provider text NOT NULL DEFAULT 'cloudflare_stream',
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS archive_error text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS stream_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.live_sessions
SET user_id = COALESCE(user_id, owner_id, host_user_id),
    agora_channel_name = COALESCE(agora_channel_name, agora_channel, channel_name),
    agora_uid = COALESCE(agora_uid, agora_uid_host)
WHERE user_id IS NULL OR agora_channel_name IS NULL OR agora_uid IS NULL;

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
  CHECK (status IN ('created', 'waiting_for_obs', 'live', 'ended', 'processing', 'archiving', 'posted', 'failed'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'live_sessions_mode_check'
      AND conrelid = 'public.live_sessions'::regclass
  ) THEN
    ALTER TABLE public.live_sessions
      ADD CONSTRAINT live_sessions_mode_check CHECK (mode IN ('agora_webcam', 'rtmp_obs'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_live_sessions_mode_status
  ON public.live_sessions(mode, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_live_sessions_cloudflare_live_input
  ON public.live_sessions(cloudflare_live_input_id)
  WHERE cloudflare_live_input_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_cloudflare_video_uid
  ON public.live_sessions(cloudflare_video_uid)
  WHERE cloudflare_video_uid IS NOT NULL;

DROP POLICY IF EXISTS "public can read live sessions" ON public.live_sessions;
CREATE POLICY "public can read live sessions"
  ON public.live_sessions FOR SELECT
  TO anon, authenticated
  USING (status IN ('live', 'ended', 'processing', 'archiving', 'posted'));

DROP POLICY IF EXISTS "owner can read own live sessions" ON public.live_sessions;
CREATE POLICY "owner can read own live sessions"
  ON public.live_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = host_user_id OR auth.uid() = owner_id OR auth.uid() = user_id);
```

## Backend shared auth helper

File: `supabase/functions/_shared/httpAuth.ts`

```ts
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function createAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function createAuthedClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

export async function requireUser(req: Request): Promise<{ id: string; email?: string | null }> {
  const client = createAuthedClient(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Unauthorized');
  return { id: data.user.id, email: data.user.email };
}
```

## Stream key encryption

File: `supabase/functions/_shared/streamKeyCrypto.ts`

```ts
function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => binary += String.fromCharCode(byte));
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function cryptoKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('STREAM_KEY_ENCRYPTION_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('Missing STREAM_KEY_ENCRYPTION_SECRET');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptStreamKey(plainText: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await cryptoKey(),
    new TextEncoder().encode(plainText),
  );
  return `v1.${base64Encode(iv)}.${base64Encode(new Uint8Array(encrypted))}`;
}

export async function decryptStreamKey(cipherText: string): Promise<string> {
  const [version, iv64, encrypted64] = cipherText.split('.');
  if (version !== 'v1' || !iv64 || !encrypted64) throw new Error('Invalid encrypted stream key');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64Decode(iv64) },
    await cryptoKey(),
    base64Decode(encrypted64),
  );
  return new TextDecoder().decode(decrypted);
}
```

## Cloudflare Stream service additions

File: `supabase/functions/_shared/cloudflareStreamService.ts`

```ts
export interface StreamLiveInput {
  uid: string;
  rtmpsUrl: string | null;
  rtmpsStreamKey: string | null;
  srtUrl?: string | null;
  webRtcUrl?: string | null;
  raw: unknown;
}

export async function createStreamLiveInput(options: {
  name: string;
  userId: string;
  liveSessionId: string;
}): Promise<StreamLiveInput> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      meta: {
        name: options.name,
        source: 'fun-profile-rtmp-obs',
        userId: options.userId,
        liveSessionId: options.liveSessionId,
      },
      recording: {
        mode: 'automatic',
        requireSignedURLs: false,
        allowedOrigins: ['*'],
        timeoutSeconds: 0,
      },
      allowedOrigins: ['*'],
      requireSignedURLs: false,
    }),
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.success || !data?.result?.uid) {
    throw new Error(`Cloudflare Live Input create failed: ${resp.status} ${JSON.stringify(data?.errors || data).slice(0, 300)}`);
  }
  const input = data.result;
  return {
    uid: input.uid,
    rtmpsUrl: input.rtmps?.url || null,
    rtmpsStreamKey: input.rtmps?.streamKey || input.rtmps?.stream_key || null,
    srtUrl: input.srt?.url || null,
    webRtcUrl: input.webRTC?.url || null,
    raw: data,
  };
}

export async function deleteStreamLiveInput(inputId: string): Promise<void> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${inputId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Cloudflare Live Input delete failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  }
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

## Edge Function: create OBS/RTMP live session

File: `supabase/functions/create-rtmp-live-session/index.ts`

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createStreamLiveInput, getStreamPlaybackUrls } from '../_shared/cloudflareStreamService.ts';
import { encryptStreamKey } from '../_shared/streamKeyCrypto.ts';
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
    const title = cleanTitle(body.title) || 'OBS Live';
    const description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : null;
    const privacy = body.privacy === 'friends' ? 'friends' : 'public';
    const visibility = privacy === 'friends' ? 'friends' : 'public';
    const sessionId = crypto.randomUUID();
    const channelName = `rtmp_${user.id.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;

    const liveInput = await createStreamLiveInput({ name: title, userId: user.id, liveSessionId: sessionId });
    if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) {
      throw new Error('Cloudflare did not return RTMPS credentials');
    }

    const encryptedKey = await encryptStreamKey(liveInput.rtmpsStreamKey);
    const urls = getStreamPlaybackUrls(liveInput.uid);
    const admin = createAdminClient();

    const { data: post, error: postError } = await admin
      .from('posts')
      .insert({
        user_id: user.id,
        content: title,
        visibility,
        post_type: 'live',
        metadata: {
          live_title: title,
          live_description: description,
          live_status: 'waiting_for_obs',
          live_mode: 'rtmp_obs',
          live_session_id: sessionId,
          playback_type: 'cloudflare_live_input',
          playback_url: urls.hls,
          hls_url: urls.hls,
          viewer_count: 0,
        },
      } as any)
      .select('id')
      .single();
    if (postError) throw postError;

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
        playback_url: urls.hls,
        hls_url: urls.hls,
        storage_provider: 'cloudflare_stream',
        playback_provider: 'cloudflare_stream',
        archive_status: 'pending',
        post_id: post.id,
      })
      .select('id, status, cloudflare_live_input_id, rtmps_url, hls_url, post_id')
      .single();
    if (liveError) throw liveError;

    return json({
      ok: true,
      live_session: liveSession,
      live_session_id: sessionId,
      post_id: post.id,
      rtmps_url: liveInput.rtmpsUrl,
      stream_key: liveInput.rtmpsStreamKey,
      hls_url: urls.hls,
      status: 'waiting_for_obs',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[create-rtmp-live-session] failed', message);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

## Edge Function: get OBS credentials

File: `supabase/functions/get-rtmp-live-session-credentials/index.ts`

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { decryptStreamKey } from '../_shared/streamKeyCrypto.ts';
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const liveSessionId = typeof body.live_session_id === 'string' ? body.live_session_id : null;
    if (!liveSessionId) return json({ error: 'Missing live_session_id' }, 400);

    const admin = createAdminClient();
    const { data: session, error } = await (admin as any)
      .from('live_sessions')
      .select('id, owner_id, host_user_id, mode, status, rtmps_url, stream_key_encrypted, hls_url')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    return json({
      ok: true,
      live_session_id: session.id,
      status: session.status,
      rtmps_url: session.rtmps_url,
      stream_key: session.stream_key_encrypted ? await decryptStreamKey(session.stream_key_encrypted) : null,
      hls_url: session.hls_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

## Edge Function: end OBS live session

File: `supabase/functions/end-rtmp-live-session/index.ts`

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { deleteStreamLiveInput, listStreamLiveInputVideos } from '../_shared/cloudflareStreamService.ts';
import { corsHeaders, createAdminClient, json, requireUser } from '../_shared/httpAuth.ts';

async function createReplayIfVideoExists(admin: any, session: any): Promise<string | null> {
  if (!session.cloudflare_live_input_id) return null;
  const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
  const video = videos.find((item: any) => item?.uid) as any;
  if (!video?.uid) return null;
  const uid = String(video.uid);
  await admin.from('live_sessions').update({ cloudflare_video_uid: uid }).eq('id', session.id);
  await admin.from('live_replays').upsert({
    live_session_id: session.id,
    user_id: session.owner_id || session.host_user_id,
    chunked_recording_id: `stream:${uid}`,
    stream_uid: uid,
    cloudflare_video_uid: uid,
    status: video?.readyToStream ? 'ready' : 'processing',
    processing_started_at: new Date().toISOString(),
    storage_provider: 'cloudflare_stream',
    playback_provider: 'cloudflare_stream',
    archive_status: 'pending',
    cloudflare_vod_enabled: true,
  }, { onConflict: 'chunked_recording_id' });
  return uid;
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
      .select('*')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    const now = new Date().toISOString();
    const uid = await createReplayIfVideoExists(admin, session);
    await admin.from('live_sessions').update({
      status: 'ended',
      ended_at: session.ended_at || now,
      recording_status: 'processing',
      processing_started_at: session.processing_started_at || now,
      updated_at: now,
    }).eq('id', liveSessionId);

    if (session.post_id) {
      const { data: post } = await admin.from('posts').select('metadata').eq('id', session.post_id).maybeSingle();
      await admin.from('posts').update({
        metadata: {
          ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
          live_status: 'ended',
          archive_status: 'pending',
          playback_type: 'r2_pending',
        },
      }).eq('id', session.post_id);
    }

    if (body.revoke_live_input !== false && session.cloudflare_live_input_id) {
      await deleteStreamLiveInput(session.cloudflare_live_input_id).catch((err) => {
        console.warn('[end-rtmp-live-session] live input revoke failed', String(err));
      });
    }

    return json({ ok: true, status: 'ended', cloudflare_video_uid: uid });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

## Edge Function: reset OBS stream key

File: `supabase/functions/reset-rtmp-stream-key/index.ts`

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createStreamLiveInput, deleteStreamLiveInput, getStreamPlaybackUrls } from '../_shared/cloudflareStreamService.ts';
import { encryptStreamKey } from '../_shared/streamKeyCrypto.ts';
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
      .select('id, owner_id, host_user_id, mode, title, cloudflare_live_input_id')
      .eq('id', liveSessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) return json({ error: 'Live session not found' }, 404);
    if (session.owner_id !== user.id && session.host_user_id !== user.id) return json({ error: 'Forbidden' }, 403);
    if (session.mode !== 'rtmp_obs') return json({ error: 'Not an OBS/RTMP live session' }, 400);

    const liveInput = await createStreamLiveInput({
      name: session.title || 'OBS Live',
      userId: user.id,
      liveSessionId: session.id,
    });
    if (!liveInput.rtmpsUrl || !liveInput.rtmpsStreamKey) throw new Error('Cloudflare did not return RTMPS credentials');

    const urls = getStreamPlaybackUrls(liveInput.uid);
    await admin.from('live_sessions').update({
      cloudflare_live_input_id: liveInput.uid,
      rtmps_url: liveInput.rtmpsUrl,
      stream_key_encrypted: await encryptStreamKey(liveInput.rtmpsStreamKey),
      playback_url: urls.hls,
      hls_url: urls.hls,
      status: 'waiting_for_obs',
      updated_at: new Date().toISOString(),
    }).eq('id', liveSessionId);

    if (session.cloudflare_live_input_id) {
      await deleteStreamLiveInput(session.cloudflare_live_input_id).catch((err) => {
        console.warn('[reset-rtmp-stream-key] old live input cleanup failed', String(err));
      });
    }

    return json({
      ok: true,
      live_session_id: session.id,
      rtmps_url: liveInput.rtmpsUrl,
      stream_key: liveInput.rtmpsStreamKey,
      hls_url: urls.hls,
      status: 'waiting_for_obs',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, message === 'Unauthorized' ? 401 : 500);
  }
});
```

## Cloudflare webhook logic

File: `supabase/functions/stream-webhook/index.ts`

Can them:

```ts
import { getStreamPlaybackUrls, getStreamVideo, listStreamLiveInputVideos } from '../_shared/cloudflareStreamService.ts';
```

Webhook secret fallback:

```ts
const secret = Deno.env.get('CLOUDFLARE_STREAM_WEBHOOK_SECRET') || Deno.env.get('CLOUDFLARE_WEBHOOK_SECRET');
```

Them helpers:

```ts
function extractEventType(event: any): string {
  return String(event?.type || event?.event || event?.name || event?.data?.type || '').toLowerCase();
}

function extractLiveInputId(event: any): string | null {
  return event?.liveInput
    || event?.live_input
    || event?.liveInputUid
    || event?.data?.liveInput
    || event?.data?.live_input
    || event?.data?.liveInputUid
    || event?.data?.input?.uid
    || event?.input?.uid
    || event?.uid
    || null;
}
```

Tao replay idempotent tu Cloudflare video UID:

```ts
async function findOrCreateReplayForVideo(admin: any, uid: string, event: any, video: any): Promise<any | null> {
  const { data: replay } = await admin
    .from('live_replays')
    .select('id, live_session_id, stream_uid, cloudflare_vod_enabled')
    .eq('stream_uid', uid)
    .maybeSingle();
  if (replay) return replay;

  const liveSessionId = event?.meta?.liveSessionId
    || event?.data?.meta?.liveSessionId
    || video?.meta?.liveSessionId
    || video?.meta?.live_session_id
    || event?.liveSessionId
    || event?.data?.liveSessionId
    || null;
  const liveInputId = event?.liveInput
    || event?.data?.liveInput
    || event?.data?.live_input
    || video?.input?.uid
    || video?.liveInput
    || null;

  let query = admin.from('live_sessions').select('*').limit(1);
  if (liveSessionId) query = query.eq('id', liveSessionId);
  else if (liveInputId) query = query.eq('cloudflare_live_input_id', liveInputId);
  else query = query.eq('cloudflare_video_uid', uid);

  const { data: sessions } = await query;
  const session = Array.isArray(sessions) ? sessions[0] : sessions;
  if (!session) return null;

  await admin.from('live_sessions').update({
    cloudflare_video_uid: uid,
    recording_status: 'ready',
    recording_ready_at: new Date().toISOString(),
  }).eq('id', session.id);

  const urls = getStreamPlaybackUrls(uid);
  const { data: created, error } = await admin.from('live_replays').upsert({
    live_session_id: session.id,
    user_id: session.owner_id || session.host_user_id || session.user_id,
    chunked_recording_id: `stream:${uid}`,
    stream_uid: uid,
    cloudflare_video_uid: uid,
    playback_hls: urls.hls,
    playback_dash: urls.dash,
    playback_mp4: urls.mp4,
    cloudflare_playback_url: urls.hls,
    status: 'processing',
    processing_started_at: new Date().toISOString(),
    storage_provider: 'cloudflare_stream',
    playback_provider: 'cloudflare_stream',
    archive_status: 'pending',
    cloudflare_vod_enabled: true,
    last_cf_response: video || event,
  }, { onConflict: 'chunked_recording_id' }).select('id, live_session_id, stream_uid, cloudflare_vod_enabled').single();
  if (error) throw error;
  return created;
}
```

Xu ly live input connected/disconnected:

```ts
async function handleLiveInputEvent(admin: any, event: any, type: string): Promise<Response | null> {
  const isDisconnected = type.includes('live_input.disconnected') || type.includes('live-input.disconnected') || type.includes('disconnected');
  const isConnected = !isDisconnected && (
    type.includes('live_input.connected') || type.includes('live-input.connected') || type.includes('connected')
  );
  if (!isConnected && !isDisconnected) return null;

  const liveInputId = extractLiveInputId(event);
  if (!liveInputId) return json({ ok: true, ignored: 'missing live input id' });

  const { data: session } = await admin
    .from('live_sessions')
    .select('*')
    .eq('cloudflare_live_input_id', liveInputId)
    .maybeSingle();
  if (!session) return json({ ok: true, ignored: 'live input session not found' });

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = isConnected
    ? { status: 'live', started_at: session.started_at || now, recording_status: 'recording', archive_error: null }
    : { status: 'ended', ended_at: session.ended_at || now, recording_status: 'processing', processing_started_at: session.processing_started_at || now };
  await admin.from('live_sessions').update(patch).eq('id', session.id);

  if (session.post_id) {
    const { data: post } = await admin.from('posts').select('metadata').eq('id', session.post_id).maybeSingle();
    await admin.from('posts').update({
      metadata: {
        ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
        live_status: isConnected ? 'live' : 'ended',
        live_mode: 'rtmp_obs',
        live_session_id: session.id,
        archive_status: isDisconnected ? 'pending' : session.archive_status,
        playback_type: isDisconnected ? 'r2_pending' : 'cloudflare_live_input',
      },
    }).eq('id', session.post_id);
  }

  if (isDisconnected) {
    const videos = await listStreamLiveInputVideos(liveInputId).catch(() => []);
    const video = videos.find((item: any) => item?.uid) as any;
    if (video?.uid) await findOrCreateReplayForVideo(admin, String(video.uid), event, video);
  }

  return json({ ok: true, status: isConnected ? 'live' : 'ended', live_session_id: session.id });
}
```

Trong handler chinh:

```ts
const event = JSON.parse(rawBody);
const uid = extractUid(event);
const type = extractEventType(event);

const liveInputResponse = await handleLiveInputEvent(admin as any, event, type);
if (liveInputResponse) return liveInputResponse;

if (!uid) return json({ ok: true, ignored: 'missing uid' });

const video = await getStreamVideo(uid);
const replay = await findOrCreateReplayForVideo(admin as any, uid, event, video);
if (!replay) return json({ ok: true, ignored: 'replay not found' });

const state = normalizeState(event, video);
if (state === 'ready') {
  await markStreamReadyAndArchive(admin, { replay, uid, event, video }).catch((error) => {
    console.error('[WEBHOOK] archive after ready failed; retry cron will handle it', error);
  });
  return json({ ok: true, status: 'ready' });
}
```

## Archive service safety updates

File: `supabase/functions/_shared/archiveReplayService.ts`

Sau khi archive/post thanh cong, mirror state ve `live_sessions`:

```ts
await admin.from('live_sessions').update({
  status: 'posted',
  recording_status: 'ready',
  recording_ready_at: now,
  recording_error: null,
  archive_status: 'archived',
  archive_error: null,
  archived_at: now,
  posted_at: now,
  storage_provider: 'r2',
  playback_provider: 'r2',
  r2_object_key: uploaded.key,
  r2_bucket: uploaded.bucket,
  r2_video_url: uploaded.url,
  playback_url: uploaded.url,
  cloudflare_video_uid: uid,
  cloudflare_mp4_download_url: mp4.url,
}).eq('id', replay.live_session_id);
```

Chi delete Cloudflare Stream sau khi R2 upload + DB update + replay post + creator library OK:

```ts
try {
  await deleteStreamVideo(uid);
  const deletedAt = new Date().toISOString();
  await (admin as any).from('live_replays').update({ stream_deleted_at: deletedAt }).eq('id', replay.id);
  await admin.from('live_sessions').update({ stream_deleted_at: deletedAt }).eq('id', replay.live_session_id);
} catch (_) {
  // Retry/cleanup job co the xu ly tiep. Khong duoc rollback archive da thanh cong.
}
```

Neu archive fail:

```ts
await (admin as any).from('live_replays').update({
  archive_status: 'failed',
  archive_error: message.slice(0, 1000),
  archive_next_retry_at: nextRetryIso(attempts),
  last_error_at: new Date().toISOString(),
  error_message: message.slice(0, 1000),
}).eq('id', replay.id);

await admin.from('live_sessions').update({
  status: 'failed',
  archive_status: 'failed',
  archive_error: message.slice(0, 1000),
  recording_error: message.slice(0, 1000),
}).eq('id', replay.live_session_id);
```

## Replay feed metadata update

File: `supabase/functions/_shared/replayFeedService.ts`

Them `live_mode` vao post metadata:

```ts
const { data: liveSession } = await admin
  .from('live_sessions')
  .select('id, post_id, title, ended_at, privacy, host_user_id, owner_id, mode')
  .eq('id', replay.live_session_id)
  .maybeSingle();

const metadata = {
  ...existingMetadata,
  live_title: liveSession.title,
  live_status: 'ended',
  live_mode: (liveSession as any).mode || 'agora_webcam',
  live_session_id: replay.live_session_id,
  replay_id: replay.id,
  replay_badge: 'REPLAY',
  playback_url: r2Url,
  playback_type: 'r2',
  playback_provider: 'r2',
  storage_provider: 'r2',
  r2_video_url: r2Url,
};
```

## Supabase config

File: `supabase/config.toml`

```toml
[functions.create-rtmp-live-session]
  verify_jwt = true

[functions.get-rtmp-live-session-credentials]
  verify_jwt = true

[functions.end-rtmp-live-session]
  verify_jwt = true

[functions.reset-rtmp-stream-key]
  verify_jwt = true
```

## Frontend route

File: `src/App.tsx`

```tsx
const RtmpLivePage = lazy(() => import("./modules/live/pages/RtmpLivePage").then(m => ({ default: m.default })));

// routes
<Route path="/live/obs" element={<RtmpLivePage />} />
```

## Live types

File: `src/modules/live/types.ts`

```ts
export type LivePrivacy = 'public' | 'friends';
export type LiveMode = 'agora_webcam' | 'rtmp_obs';
export type LiveStatus = 'created' | 'waiting_for_obs' | 'live' | 'ended' | 'processing' | 'archiving' | 'posted' | 'failed';

export interface LiveSession {
  id: string;
  host_user_id: string;
  user_id?: string | null;
  mode?: LiveMode;
  agora_channel?: string | null;
  agora_channel_name?: string | null;
  channel_name: string;
  agora_uid_host?: number | null;
  agora_uid?: number | null;
  recording_uid?: number | null;
  recording_status?: string | null;
  title: string | null;
  description?: string | null;
  privacy: LivePrivacy;
  status: LiveStatus;
  cloudflare_live_input_id?: string | null;
  cloudflare_video_uid?: string | null;
  rtmps_url?: string | null;
  playback_url?: string | null;
  hls_url?: string | null;
  r2_video_url?: string | null;
  playback_provider?: string | null;
  storage_provider?: string | null;
  archive_status?: string | null;
  archive_error?: string | null;
  viewer_count: number;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  post_id: string | null;
  host_profile?: LiveHostProfile | null;
}
```

## Start live dialog

File: `src/modules/live/components/StartLiveDialog.tsx`

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RadioTower, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface StartLiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StartLiveDialog({ open, onOpenChange }: StartLiveDialogProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'webcam' | 'obs'>('webcam');

  const handleStart = () => {
    onOpenChange(false);
    navigate(mode === 'webcam' ? '/live/new' : '/live/obs');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-destructive" />
            Bat dau LIVE
          </DialogTitle>
          <DialogDescription>Chon cach phat truc tiep phu hop voi buoi live.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={mode} onValueChange={(v) => setMode(v as 'webcam' | 'obs')} className="grid grid-cols-2 gap-3">
            <label
              htmlFor="mode-webcam"
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                mode === 'webcam' ? 'border-destructive bg-destructive/5' : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <RadioGroupItem value="webcam" id="mode-webcam" className="sr-only" />
              <Video className="h-6 w-6 text-destructive" />
              <span className="text-sm font-medium">Live webcam</span>
              <span className="text-xs text-muted-foreground text-center">Agora RTC</span>
            </label>

            <label
              htmlFor="mode-obs"
              className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                mode === 'obs' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <RadioGroupItem value="obs" id="mode-obs" className="sr-only" />
              <RadioTower className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Live OBS</span>
              <span className="text-xs text-muted-foreground text-center">Cloudflare RTMPS</span>
            </label>
          </RadioGroup>

          <Button onClick={handleStart} className="w-full">
            {mode === 'webcam' ? 'Bat dau webcam live' : 'Tao OBS live'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

## OBS Live page

File: `src/modules/live/pages/RtmpLivePage.tsx`

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Clipboard, Loader2, RadioTower, RotateCcw, Square } from 'lucide-react';
import { toast } from 'sonner';
import { FacebookNavbar } from '@/components/layout/FacebookNavbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

interface RtmpCredentials {
  live_session_id: string;
  post_id?: string | null;
  rtmps_url: string;
  stream_key: string;
  hls_url?: string | null;
  status: string;
}

async function copyText(value: string, label: string) {
  await navigator.clipboard.writeText(value);
  toast.success(`${label} da copy`);
}

export default function RtmpLivePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [credentials, setCredentials] = useState<RtmpCredentials | null>(null);

  const createSession = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-rtmp-live-session', {
        body: { title, description, privacy: 'public' },
      });
      if (error) throw error;
      if (!data?.rtmps_url || !data?.stream_key) throw new Error('Khong nhan duoc OBS credentials');
      setCredentials(data as RtmpCredentials);
      toast.success('Da tao OBS live');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Tao OBS live that bai');
    } finally {
      setCreating(false);
    }
  };

  const resetKey = async () => {
    if (!credentials?.live_session_id) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-rtmp-stream-key', {
        body: { live_session_id: credentials.live_session_id },
      });
      if (error) throw error;
      setCredentials({ ...credentials, ...(data as RtmpCredentials) });
      toast.success('Da reset stream key');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Reset stream key that bai');
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
      toast.success('Da ket thuc OBS live. Replay dang duoc xu ly.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ket thuc live that bai');
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <FacebookNavbar />
      <main className="pt-16 px-3 md:px-6 pb-6">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <RadioTower className="h-6 w-6 text-primary" />
                Live bang OBS
              </h1>
              <p className="text-sm text-muted-foreground">Dung RTMPS URL va Stream Key nay trong OBS/Streamlabs/XSplit.</p>
            </div>
            <Badge variant={credentials?.status === 'live' ? 'destructive' : 'secondary'}>
              {credentials?.status === 'ended' ? 'Da ket thuc' : credentials ? 'Dang cho OBS ket noi' : 'Chua tao'}
            </Badge>
          </div>

          {!credentials ? (
            <Card>
              <CardHeader>
                <CardTitle>Tao phien OBS live</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tieu de live" maxLength={160} />
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mo ta ngan" rows={4} />
                <Button onClick={createSession} disabled={creating} className="w-full sm:w-auto">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RadioTower className="h-4 w-4" />}
                  Tao RTMP session
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>OBS credentials</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Server</label>
                    <div className="flex gap-2">
                      <Input value={credentials.rtmps_url} readOnly className="font-mono text-xs" />
                      <Button variant="outline" size="icon" onClick={() => copyText(credentials.rtmps_url, 'Server')}>
                        <Clipboard className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Stream Key</label>
                    <div className="flex gap-2">
                      <Input value={credentials.stream_key} readOnly type="password" className="font-mono text-xs" />
                      <Button variant="outline" size="icon" onClick={() => copyText(credentials.stream_key, 'Stream Key')}>
                        <Clipboard className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={resetKey} disabled={resetting || ending}>
                      {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Reset key
                    </Button>
                    <Button variant="destructive" onClick={endSession} disabled={ending || credentials.status === 'ended'}>
                      {ending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                      Ket thuc live
                    </Button>
                    <Button variant="secondary" onClick={() => navigate(`/live/${credentials.live_session_id}`)}>
                      <Check className="h-4 w-4" />
                      Xem trang live
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Trang thai replay</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Khi OBS dung phat, Cloudflare webhook se chuyen live sang ended/processing. Sau do backend export MP4, upload R2, tao replay post, roi moi xoa video Cloudflare Stream.
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
```

## Audience playback for OBS live

File: `src/modules/live/pages/LiveAudiencePage.tsx`

Them import:

```tsx
import { ReplayPlayer } from '@/components/ui/ReplayPlayer';
```

Chi bat Agora RTC neu khong phai OBS:

```tsx
const isRtmpLive = session?.mode === 'rtmp_obs';

const {
  remoteContainerRef,
  statusText,
  hasRemoteVideo,
  isMuted,
  start,
  leave,
  toggleRemoteAudio,
} = useLiveRtc({
  sessionId: resolvedSessionId,
  role: 'audience',
  enabled: !!resolvedSessionId && session?.status === 'live' && !isRtmpLive,
});
```

Render OBS live bang HLS:

```tsx
{isRtmpLive && session.hls_url ? (
  <ReplayPlayer src={session.hls_url} className="h-full w-full" autoPlay muted controls />
) : (
  <div ref={remoteContainerRef} className="h-full w-full" />
)}

{!isRtmpLive && !hasRemoteVideo && (
  <div className="absolute inset-0 flex items-center justify-center text-white/90 bg-black/50 text-center px-4">
    {session.status === 'ended' ? 'Phien Live Stream da ket thuc' : statusText}
  </div>
)}
```

## liveService updates

File: `src/modules/live/liveService.ts`

Khi tao Agora webcam live, them field moi:

```ts
.insert({
  host_user_id: userId,
  owner_id: userId,
  user_id: userId,
  channel_name: channelName,
  agora_channel: channelName,
  agora_channel_name: channelName,
  agora_uid_host: hostUid,
  agora_uid: hostUid,
  title,
  privacy: input.privacy,
  status: 'live',
  mode: 'agora_webcam',
  recording_status: 'idle',
  post_id: postId,
})
```

Normalize live session:

```ts
return {
  id: row.id,
  host_user_id: row.host_user_id || row.owner_id,
  user_id: row.user_id ?? row.owner_id ?? row.host_user_id,
  mode: (row.mode as LiveSession['mode']) || 'agora_webcam',
  agora_channel: row.agora_channel || row.channel_name,
  agora_channel_name: row.agora_channel_name || row.agora_channel || row.channel_name,
  channel_name: row.channel_name,
  agora_uid_host: row.agora_uid_host ?? null,
  agora_uid: row.agora_uid ?? row.agora_uid_host ?? null,
  cloudflare_live_input_id: row.cloudflare_live_input_id ?? null,
  cloudflare_video_uid: row.cloudflare_video_uid ?? null,
  rtmps_url: row.rtmps_url ?? null,
  playback_url: row.playback_url ?? null,
  hls_url: row.hls_url ?? null,
  r2_video_url: row.r2_video_url ?? null,
  playback_provider: row.playback_provider ?? null,
  storage_provider: row.storage_provider ?? null,
  archive_status: row.archive_status ?? null,
  archive_error: row.archive_error ?? null,
};
```

## Env variables

```env
AGORA_APP_ID=
AGORA_APP_CERTIFICATE=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_WEBHOOK_SECRET=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=
R2_PUBLIC_DOMAIN=
R2_SIGNED_URL_EXPIRES_SECONDS=
STREAM_KEY_ENCRYPTION_SECRET=
```

## Cach test

### Test Webcam Live

1. Vao `/live/new`.
2. Start live bang camera/mic.
3. Viewer vao `/live/:liveSessionId`.
4. End live.
5. Dam bao recording vao `processing`.
6. Khi Cloudflare video READY, replay archive sang R2.
7. Feed replay hien badge `REPLAY`, source video la R2.
8. Cloudflare Stream video bi delete sau khi archive/post thanh cong.

### Test OBS Live

1. Vao `/live/obs`.
2. Tao RTMP session.
3. Copy `RTMPS URL` vao OBS -> Settings -> Stream -> Custom Server.
4. Copy `Stream Key` vao OBS.
5. Start Streaming trong OBS.
6. Cloudflare webhook `connected` -> `live_sessions.status = live`.
7. Dong browser tab van khong lam ket thuc live.
8. Stop Streaming trong OBS.
9. Cloudflare webhook `disconnected` -> `ended/processing`.
10. Video READY -> export MP4 -> upload R2 -> create replay/feed post -> delete Stream video.

### Test webhook

1. Dang ky Cloudflare Stream webhook tro vao:

```text
https://<project-ref>.functions.supabase.co/stream-webhook
```

2. Set secret trung voi:

```env
CLOUDFLARE_WEBHOOK_SECRET=
```

3. Confirm webhook log:

```text
live_input.connected
live_input.disconnected
video ready
archive after ready
```

### Test delete

1. Xoa replay post.
2. Backend soft delete post.
3. Xoa R2 object.
4. Neu `cloudflare_video_uid` con ton tai va `stream_deleted_at` null thi delete Cloudflare Stream video.

## Rollback va error handling

Khong bao gio delete Cloudflare Stream video truoc khi:

- R2 upload thanh cong.
- Verify object ton tai tren R2.
- DB update thanh cong.
- Replay/feed post tao thanh cong.

Neu upload R2 fail:

- Giu video tren Cloudflare Stream.
- `archive_status = failed`.
- Luu `archive_error`.
- Retry cron xu ly lai bang exponential backoff.

Neu create post fail:

- Khong delete Stream video.
- Retry tao post.

Neu delete Stream fail sau khi archive thanh cong:

- Replay van dung R2.
- `stream_deleted_at` null.
- Cleanup job co the retry delete.

## Verification da chay

```bash
npx tsc --noEmit
npx eslint src/modules/live/pages/RtmpLivePage.tsx src/modules/live/pages/LiveAudiencePage.tsx src/modules/live/components/StartLiveDialog.tsx src/modules/live/liveService.ts
npx vite build
```

Ket qua:

- TypeScript: pass
- ESLint file live da sua: pass
- Vite build: pass

Luu y: `npm run build` trong repo co `prebuild` goi `bun run ...`; may local can cai `bun` neu muon chay dung script npm day du.

