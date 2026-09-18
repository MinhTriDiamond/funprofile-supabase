# Live Replay Archiving Pipeline

File nay dong goi tinh nang **Live Replay Archiving Pipeline** de gui cho Lovable.

Muc tieu: Cloudflare Stream chi dung lam lop xu ly/transcoding tam thoi. Replay cuoi cung phai nam tren Cloudflare R2. Sau khi upload va verify R2 thanh cong moi duoc xoa video khoi Cloudflare Stream.

## Flow

1. User livestream realtime bang Agora.
2. Chunk recording duoc finalize va dua vao Cloudflare Stream de transcode.
3. Khi Cloudflare Stream bao READY qua webhook/poll:
   - request MP4 download
   - poll MP4 ready
   - download MP4 server-side
   - upload MP4 sang R2
   - verify object R2 bang HEAD
   - update DB provider = r2
   - update feed replay post
   - upsert creator_library
   - delete Cloudflare Stream video
4. Neu archive fail:
   - khong xoa Stream
   - set archive_status = failed
   - luu archive_error
   - retry bang live-replay-archive-cron

## Env Can Co

```env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_R2_BUCKET_NAME=
CLOUDFLARE_R2_PUBLIC_URL=
CLOUDFLARE_ACCESS_KEY_ID=
CLOUDFLARE_SECRET_ACCESS_KEY=
CLOUDFLARE_STREAM_ACCOUNT_ID=
CLOUDFLARE_STREAM_TOKEN=
CLOUDFLARE_STREAM_API_TOKEN=
CLOUDFLARE_STREAM_WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CRON_SECRET=
CRON_SHARED_SECRET=
```

## File Da Them/Sua

- `supabase/functions/_shared/cloudflareStreamService.ts`
- `supabase/functions/_shared/r2StorageService.ts`
- `supabase/functions/_shared/archiveReplayService.ts`
- `supabase/functions/_shared/replayFeedService.ts`
- `supabase/functions/_shared/agoraService.ts`
- `supabase/functions/live-replay-archive-cron/index.ts`
- `supabase/functions/delete-post-archive/index.ts`
- `supabase/migrations/20260507000100_archive_live_replays_to_r2.sql`
- `supabase/functions/stream-webhook/index.ts`
- `supabase/functions/live-replay-poll-status/index.ts`
- `src/hooks/live/useLiveReplayStatus.ts`
- `src/components/feed/FeedVideoPlayer.tsx`
- `src/components/feed/FacebookPostCard.tsx`
- `src/hooks/useFeedPosts.ts`
- `src/integrations/supabase/types.ts`
- `supabase/config.toml`

---

## supabase/functions/_shared/cloudflareStreamService.ts

```ts
export interface StreamPlaybackUrls {
  hls: string;
  dash: string;
  mp4: string;
  thumbnail: string;
}

export interface StreamDownloadStatus {
  url: string | null;
  ready: boolean;
  percentComplete: number | null;
  raw: unknown;
}

export function getStreamAccountId(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
}

export function getStreamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

export function getStreamPlaybackUrls(uid: string): StreamPlaybackUrls {
  const code = Deno.env.get('CLOUDFLARE_STREAM_CUSTOMER_CODE');
  const base = code ? `https://customer-${code}.cloudflarestream.com/${uid}` : `https://videodelivery.net/${uid}`;
  return {
    hls: `${base}/manifest/video.m3u8`,
    dash: `${base}/manifest/video.mpd`,
    mp4: `${base}/downloads/default.mp4`,
    thumbnail: `${base}/thumbnails/thumbnail.jpg?time=3s`,
  };
}

export async function getStreamVideo(uid: string): Promise<Record<string, unknown> | null> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.success) return null;
  return data.result || null;
}

export async function requestMp4Download(uid: string): Promise<StreamDownloadStatus> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || data?.success === false) {
    throw new Error(`Cloudflare Stream MP4 request failed: ${resp.status}`);
  }

  const info = data?.result?.default || {};
  const url = info.url || getStreamPlaybackUrls(uid).mp4;
  const percent = typeof info.percentComplete === 'number' ? info.percentComplete : null;
  return { url, ready: !!url && (percent === null || percent >= 100), percentComplete: percent, raw: data };
}

export async function pollMp4DownloadUrl(uid: string, attempts = 6, delayMs = 2500): Promise<StreamDownloadStatus> {
  let last: StreamDownloadStatus | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await requestMp4Download(uid);
    if (last.ready && last.url) return last;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last || { url: null, ready: false, percentComplete: null, raw: null };
}

export async function deleteStreamVideo(uid: string): Promise<{ deleted: boolean; status: number; raw: string }> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const raw = await resp.text().catch(() => '');
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Cloudflare Stream delete failed: ${resp.status} ${raw.slice(0, 200)}`);
  }
  return { deleted: true, status: resp.status, raw };
}
```

## supabase/functions/_shared/r2StorageService.ts

```ts
interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
  host: string;
}

export interface R2UploadResult {
  key: string;
  bucket: string;
  url: string;
  size: number;
}

function getR2Config(): R2Config {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY');
  const bucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME');
  const publicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    throw new Error('Missing Cloudflare R2 config');
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl: publicUrl.replace(/\/$/, ''),
    host: `${accountId}.r2.cloudflarestorage.com`,
  };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function getSignatureKey(key: string, dateStamp: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${key}`).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, 'auto');
  const kService = await hmacSha256(kRegion, 's3');
  return hmacSha256(kService, 'aws4_request');
}

async function signedR2Request(method: string, key: string, headers: Record<string, string> = {}, body?: BodyInit): Promise<Response> {
  const r2 = getR2Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalUri = `/${r2.bucketName}/${key.split('/').map(encodeURIComponent).join('/')}`;

  const allHeaders: Record<string, string> = {
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    host: r2.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sorted = Object.keys(allHeaders).sort();
  const signedHeaders = sorted.join(';');
  const canonicalHeaders = sorted.map((k) => `${k}:${allHeaders[k]}`).join('\n') + '\n';
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const requestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, requestHash].join('\n');
  const signature = toHex(await hmacSha256(await getSignatureKey(r2.secretAccessKey, dateStamp), stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(`https://${r2.host}${canonicalUri}`, {
    method,
    headers: { ...allHeaders, Authorization: authorization },
    body,
  });
}

export async function uploadMp4ToR2(key: string, blob: Blob): Promise<R2UploadResult> {
  const r2 = getR2Config();
  const resp = await signedR2Request('PUT', key, {
    'content-type': 'video/mp4',
    'cache-control': 'public, max-age=31536000, immutable',
  }, blob);
  if (!resp.ok) throw new Error(`R2 upload failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  const verified = await headR2Object(key);
  if (!verified.exists || verified.size <= 0) throw new Error('R2 upload verification failed');
  return { key, bucket: r2.bucketName, url: `${r2.publicUrl}/${key}`, size: verified.size };
}

export async function headR2Object(key: string): Promise<{ exists: boolean; size: number }> {
  const resp = await signedR2Request('HEAD', key);
  if (resp.status === 404) return { exists: false, size: 0 };
  if (!resp.ok) throw new Error(`R2 HEAD failed: ${resp.status}`);
  return { exists: true, size: Number(resp.headers.get('content-length') || 0) };
}

export async function deleteR2Object(key: string): Promise<void> {
  const resp = await signedR2Request('DELETE', key);
  if (!resp.ok && resp.status !== 404) throw new Error(`R2 delete failed: ${resp.status}`);
}
```

## supabase/functions/_shared/archiveReplayService.ts

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { deleteStreamVideo, getStreamPlaybackUrls, pollMp4DownloadUrl } from './cloudflareStreamService.ts';
import { headR2Object, uploadMp4ToR2 } from './r2StorageService.ts';
import { createOrUpdateReplayPost, upsertCreatorLibrary } from './replayFeedService.ts';

function nextRetryIso(attempts: number): string {
  const seconds = Math.min(3600, Math.max(30, 30 * (2 ** Math.min(attempts, 7))));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function archiveReplay(admin: SupabaseClient, replayId: string): Promise<Record<string, unknown>> {
  const { data: replay, error } = await (admin as any)
    .from('live_replays')
    .select('*')
    .eq('id', replayId)
    .maybeSingle();
  if (error) throw error;
  if (!replay) throw new Error('Replay not found');

  if (replay.archive_status === 'archived' && replay.r2_object_key && replay.r2_video_url) {
    const exists = await headR2Object(replay.r2_object_key);
    if (exists.exists && replay.stream_uid && !replay.stream_deleted_at) {
      await deleteStreamVideo(replay.stream_uid);
      await (admin as any).from('live_replays').update({ stream_deleted_at: new Date().toISOString() }).eq('id', replay.id);
    }
    return { ok: true, status: 'already_archived', replay_id: replay.id };
  }

  const uid = replay.stream_uid || replay.cloudflare_video_uid;
  if (!uid) throw new Error('Missing Cloudflare Stream UID');

  const attempts = Number(replay.archive_attempts || 0) + 1;
  const urls = getStreamPlaybackUrls(uid);
  await (admin as any).from('live_replays').update({
    archive_status: 'archiving',
    archive_attempts: attempts,
    archive_error: null,
    cloudflare_video_uid: uid,
    cloudflare_playback_url: replay.cloudflare_playback_url || urls.hls,
  }).eq('id', replay.id);

  try {
    const mp4 = await pollMp4DownloadUrl(uid);
    if (!mp4.ready || !mp4.url) throw new Error(`Cloudflare MP4 not ready (${mp4.percentComplete ?? 0}%)`);

    const videoResp = await fetch(mp4.url);
    if (!videoResp.ok) throw new Error(`MP4 download failed: ${videoResp.status}`);
    const videoBlob = await videoResp.blob();
    if (videoBlob.size <= 0) throw new Error('MP4 download returned empty file');

    const objectKey = replay.r2_object_key || `live-replays/${replay.user_id}/${replay.live_session_id}/${uid}.mp4`;
    const uploaded = await uploadMp4ToR2(objectKey, videoBlob);
    const now = new Date().toISOString();

    const { data: updatedReplay, error: updateErr } = await (admin as any)
      .from('live_replays')
      .update({
        status: 'ready',
        playback_mp4: uploaded.url,
        cloudflare_video_uid: uid,
        cloudflare_playback_url: replay.cloudflare_playback_url || urls.hls,
        cloudflare_mp4_download_url: mp4.url,
        r2_object_key: uploaded.key,
        r2_bucket: uploaded.bucket,
        r2_video_url: uploaded.url,
        storage_provider: 'r2',
        playback_provider: 'r2',
        archive_status: 'archived',
        archive_error: null,
        archived_at: now,
        filesize_bytes: uploaded.size,
        expires_at: null,
      })
      .eq('id', replay.id)
      .select('*')
      .single();
    if (updateErr) throw updateErr;

    const postId = await createOrUpdateReplayPost(admin, updatedReplay, uploaded.url);
    await upsertCreatorLibrary(admin, { ...updatedReplay, title: updatedReplay.title }, postId);
    await (admin as any).from('live_replays').update({
      replay_post_id: postId,
      auto_posted_at: now,
    }).eq('id', replay.id);

    await admin.from('live_sessions').update({
      recording_status: 'ready',
      recording_ready_at: now,
      recording_error: null,
    }).eq('id', replay.live_session_id);

    await deleteStreamVideo(uid);
    await (admin as any).from('live_replays').update({ stream_deleted_at: new Date().toISOString() }).eq('id', replay.id);

    return { ok: true, status: 'archived', replay_id: replay.id, r2_video_url: uploaded.url, post_id: postId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await (admin as any).from('live_replays').update({
      archive_status: 'failed',
      archive_error: message.slice(0, 1000),
      archive_next_retry_at: nextRetryIso(attempts),
      last_error_at: new Date().toISOString(),
      error_message: message.slice(0, 1000),
    }).eq('id', replay.id);
    throw err;
  }
}
```

## supabase/functions/_shared/replayFeedService.ts

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export async function createOrUpdateReplayPost(
  admin: SupabaseClient,
  replay: Record<string, any>,
  r2Url: string,
): Promise<string | null> {
  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('id, post_id, title, ended_at, privacy, host_user_id, owner_id')
    .eq('id', replay.live_session_id)
    .maybeSingle();
  if (!liveSession?.post_id) return null;

  const { data: post } = await admin
    .from('posts')
    .select('metadata, content')
    .eq('id', liveSession.post_id)
    .maybeSingle();

  const metadata = {
    ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
    live_title: liveSession.title,
    live_status: 'ended',
    live_session_id: replay.live_session_id,
    replay_id: replay.id,
    replay_badge: 'REPLAY',
    playback_url: r2Url,
    playback_type: 'r2',
    playback_provider: 'r2',
    storage_provider: 'r2',
    r2_video_url: r2Url,
    r2_object_key: replay.r2_object_key,
    r2_bucket: replay.r2_bucket,
    stream_uid: replay.stream_uid || replay.cloudflare_video_uid,
    cloudflare_video_uid: replay.stream_uid || replay.cloudflare_video_uid,
    thumbnail_url: replay.thumbnail_url,
    duration_seconds: replay.duration_seconds,
    archived_at: replay.archived_at || new Date().toISOString(),
    ended_at: liveSession.ended_at || new Date().toISOString(),
  };

  await admin.from('posts').update({
    video_url: r2Url,
    image_url: null,
    post_type: 'live',
    metadata,
  }).eq('id', liveSession.post_id);

  return liveSession.post_id as string;
}

export async function upsertCreatorLibrary(
  admin: SupabaseClient,
  replay: Record<string, any>,
  postId: string | null,
): Promise<void> {
  await (admin as any).from('creator_library').upsert({
    user_id: replay.user_id,
    post_id: postId,
    live_session_id: replay.live_session_id,
    live_replay_id: replay.id,
    title: replay.title || 'Live replay',
    media_type: 'video',
    storage_provider: 'r2',
    playback_provider: 'r2',
    r2_object_key: replay.r2_object_key,
    r2_bucket: replay.r2_bucket,
    r2_video_url: replay.r2_video_url,
    thumbnail_url: replay.thumbnail_url,
    duration_seconds: replay.duration_seconds,
    archived_at: replay.archived_at || new Date().toISOString(),
    deleted_at: null,
  }, { onConflict: 'live_replay_id' });
}
```

## supabase/functions/_shared/agoraService.ts

```ts
export function buildAgoraChannelName(userId: string, now = Date.now()): string {
  return `live_${userId}_${now}`;
}

export function uuidToAgoraNumericUid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash) + uuid.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 10001;
}
```

## supabase/functions/live-replay-archive-cron/index.ts

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { archiveReplay } from '../_shared/archiveReplayService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  return authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    !!(cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { replay_id, limit = 5 } = await req.json().catch(() => ({}));

  let replays: any[] = [];
  if (replay_id) {
    const { data } = await (admin as any)
      .from('live_replays')
      .select('id')
      .eq('id', replay_id)
      .limit(1);
    replays = data || [];
  } else {
    const nowIso = new Date().toISOString();
    const { data } = await (admin as any)
      .from('live_replays')
      .select('id, archive_status, archive_next_retry_at')
      .eq('cloudflare_vod_enabled', true)
      .not('stream_uid', 'is', null)
      .in('status', ['ready', 'processing'])
      .order('updated_at', { ascending: true })
      .limit(50);
    replays = (data || [])
      .filter((row: any) => {
        if (!row.archive_status || row.archive_status === 'pending') return true;
        if (row.archive_status !== 'failed') return false;
        return !row.archive_next_retry_at || row.archive_next_retry_at <= nowIso;
      })
      .slice(0, Math.min(Number(limit) || 5, 10));
  }

  const results: any[] = [];
  for (const replay of replays) {
    try {
      results.push(await archiveReplay(admin, replay.id));
    } catch (error) {
      results.push({
        ok: false,
        replay_id: replay.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return json({ ok: true, processed: results.length, results });
});
```

## supabase/functions/delete-post-archive/index.ts

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { deleteStreamVideo } from '../_shared/cloudflareStreamService.ts';
import { deleteR2Object } from '../_shared/r2StorageService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

  const { post_id } = await req.json().catch(() => ({}));
  if (!post_id) return json({ error: 'Missing post_id' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: post } = await admin
    .from('posts')
    .select('id, user_id, metadata')
    .eq('id', post_id)
    .maybeSingle();
  if (!post) return json({ error: 'Post not found' }, 404);
  if (post.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

  const metadata = (post.metadata && typeof post.metadata === 'object') ? post.metadata as any : {};
  const replayId = metadata.replay_id;
  const liveSessionId = metadata.live_session_id;

  let replay: any = null;
  if (replayId) {
    const { data } = await (admin as any).from('live_replays').select('*').eq('id', replayId).maybeSingle();
    replay = data;
  } else if (liveSessionId) {
    const { data } = await (admin as any)
      .from('live_replays')
      .select('*')
      .eq('live_session_id', liveSessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    replay = data;
  }

  const cleanup: Record<string, unknown>[] = [];
  if (replay?.r2_object_key) {
    try {
      await deleteR2Object(replay.r2_object_key);
      cleanup.push({ provider: 'r2', deleted: true, key: replay.r2_object_key });
    } catch (error) {
      cleanup.push({ provider: 'r2', deleted: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const uid = replay?.stream_uid || replay?.cloudflare_video_uid || metadata.stream_uid || metadata.cloudflare_video_uid;
  if (uid && !replay?.stream_deleted_at) {
    try {
      await deleteStreamVideo(uid);
      cleanup.push({ provider: 'cloudflare_stream', deleted: true, uid });
    } catch (error) {
      cleanup.push({ provider: 'cloudflare_stream', deleted: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const now = new Date().toISOString();
  await admin.from('posts').update({
    deleted_at: now,
    video_url: null,
    image_url: null,
    media_urls: [],
    metadata: { ...metadata, deleted_at: now, cleanup },
  }).eq('id', post_id);

  if (replay?.id) {
    await (admin as any).from('live_replays').update({
      deleted_at: now,
      stream_deleted_at: uid ? (replay.stream_deleted_at || now) : replay.stream_deleted_at,
      archive_status: replay.archive_status === 'archived' ? 'deleted' : replay.archive_status,
    }).eq('id', replay.id);
    await (admin as any).from('creator_library').update({ deleted_at: now }).eq('live_replay_id', replay.id);
  }

  return json({ ok: true, post_id, replay_id: replay?.id || null, cleanup });
});
```

## supabase/migrations/20260507000100_archive_live_replays_to_r2.sql

```sql
-- Archive livestream replays to Cloudflare R2 immediately after Cloudflare Stream processing.

ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS cloudflare_video_uid text,
  ADD COLUMN IF NOT EXISTS cloudflare_playback_url text,
  ADD COLUMN IF NOT EXISTS cloudflare_mp4_download_url text,
  ADD COLUMN IF NOT EXISTS r2_object_key text,
  ADD COLUMN IF NOT EXISTS r2_bucket text,
  ADD COLUMN IF NOT EXISTS r2_video_url text,
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 'cloudflare_stream',
  ADD COLUMN IF NOT EXISTS playback_provider text NOT NULL DEFAULT 'cloudflare_stream',
  ADD COLUMN IF NOT EXISTS archive_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS archive_error text,
  ADD COLUMN IF NOT EXISTS archive_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archive_next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS stream_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_post_id uuid;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_replays_archive_retry
  ON public.live_replays(archive_status, archive_next_retry_at)
  WHERE archive_status IN ('pending', 'failed', 'archiving');

CREATE INDEX IF NOT EXISTS idx_live_replays_r2_object_key
  ON public.live_replays(r2_object_key)
  WHERE r2_object_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_replays_stream_cleanup
  ON public.live_replays(stream_uid, stream_deleted_at)
  WHERE stream_uid IS NOT NULL AND stream_deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_posts_deleted_at
  ON public.posts(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.creator_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL,
  live_session_id uuid REFERENCES public.live_sessions(id) ON DELETE SET NULL,
  live_replay_id uuid UNIQUE REFERENCES public.live_replays(id) ON DELETE SET NULL,
  title text,
  media_type text NOT NULL DEFAULT 'video',
  storage_provider text NOT NULL DEFAULT 'r2',
  playback_provider text NOT NULL DEFAULT 'r2',
  r2_object_key text,
  r2_bucket text,
  r2_video_url text,
  thumbnail_url text,
  duration_seconds integer,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_library_user_created
  ON public.creator_library(user_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.creator_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own creator library" ON public.creator_library;
CREATE POLICY "Users can view own creator library"
  ON public.creator_library FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own creator library" ON public.creator_library;
CREATE POLICY "Users can update own creator library"
  ON public.creator_library FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_creator_library_updated_at ON public.creator_library;
CREATE TRIGGER update_creator_library_updated_at
BEFORE UPDATE ON public.creator_library
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
```

## Integration Patch Cho Existing Files

Do cac file existing nhu `stream-webhook`, `live-replay-poll-status`, `FacebookPostCard`, `useLiveReplayStatus`, `FeedVideoPlayer`, `useFeedPosts`, `supabase/config.toml`, `src/integrations/supabase/types.ts` da co san rat dai, day la patch can apply len source hien co.

```diff
diff --git a/supabase/functions/stream-webhook/index.ts b/supabase/functions/stream-webhook/index.ts
--- a/supabase/functions/stream-webhook/index.ts
+++ b/supabase/functions/stream-webhook/index.ts
@@
 import { createClient } from 'npm:@supabase/supabase-js@2';
+import { archiveReplay } from '../_shared/archiveReplayService.ts';
+import { getStreamPlaybackUrls, getStreamVideo, requestMp4Download } from '../_shared/cloudflareStreamService.ts';
@@
-function streamToken(): string | null { ... }
-function accountId(): string | null { ... }
-function playbackUrls(uid: string) { ... }
-async function getVideo(uid: string) { ... }
-async function requestMp4Download(uid: string): Promise<string | null> { ... }
@@
 async function markReady(admin, replay, uid, event, video) {
-  const urls = playbackUrls(uid);
-  const mp4Url = await requestMp4Download(uid);
+  const urls = getStreamPlaybackUrls(uid);
+  const mp4 = await requestMp4Download(uid).catch(() => null);
@@
   await live_replays.update({
     status: 'ready',
     playback_hls: urls.hls,
     playback_dash: urls.dash,
-    playback_mp4: mp4Url || urls.mp4,
+    playback_mp4: mp4?.url || urls.mp4,
+    cloudflare_video_uid: uid,
+    cloudflare_playback_url: urls.hls,
+    cloudflare_mp4_download_url: mp4?.url || urls.mp4,
+    archive_status: 'pending',
+    archive_error: null,
   })
@@
-  await posts.update({ video_url: urls.hls, metadata: playback_type_cloudflare_stream })
+  await archiveReplay(admin, replay.id).catch((error) => {
+    console.error('[WEBHOOK] archive after ready failed; retry cron will handle it', error);
+  });
 }
@@
-const video = await getVideo(uid);
+const video = await getStreamVideo(uid);

diff --git a/supabase/functions/live-replay-poll-status/index.ts b/supabase/functions/live-replay-poll-status/index.ts
--- a/supabase/functions/live-replay-poll-status/index.ts
+++ b/supabase/functions/live-replay-poll-status/index.ts
@@
 import { createClient } from 'npm:@supabase/supabase-js@2';
+import { archiveReplay } from '../_shared/archiveReplayService.ts';
+import { getStreamAccountId, getStreamPlaybackUrls, getStreamToken, requestMp4Download } from '../_shared/cloudflareStreamService.ts';
@@
-const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
-const token = streamToken();
+const accountId = getStreamAccountId();
+const token = getStreamToken();
@@
-const mp4Url = await requestMp4Download(accountId, token, uid);
+const mp4 = await requestMp4Download(uid).catch(() => null);
+const mp4Url = mp4?.url || null;
@@
+await archiveReplay(admin, replay.id).catch((error) => {
+  console.error('[POLL] archive after ready failed; retry cron will handle it', error);
+});

diff --git a/src/hooks/live/useLiveReplayStatus.ts b/src/hooks/live/useLiveReplayStatus.ts
--- a/src/hooks/live/useLiveReplayStatus.ts
+++ b/src/hooks/live/useLiveReplayStatus.ts
@@
-playback_type?: 'cloudflare_stream';
+playback_type?: 'r2';
+playback_provider?: 'r2';
+storage_provider?: 'r2';
@@
-.select('status, playback_hls, thumbnail_url, stream_uid')
+.select('status, playback_hls, r2_video_url, archive_status, thumbnail_url, stream_uid')
 .eq('status', 'ready')
+.eq('archive_status', 'archived')
 .eq('live_session_id', liveSessionId)
-.not('playback_hls', 'is', null)
+.not('r2_video_url', 'is', null)
@@
-playback_hls: data.playback_hls,
-playback_type: 'cloudflare_stream',
+playback_hls: data.r2_video_url,
+r2_video_url: data.r2_video_url,
+playback_type: 'r2',
+playback_provider: 'r2',
+storage_provider: 'r2',

diff --git a/src/components/feed/FeedVideoPlayer.tsx b/src/components/feed/FeedVideoPlayer.tsx
--- a/src/components/feed/FeedVideoPlayer.tsx
+++ b/src/components/feed/FeedVideoPlayer.tsx
@@
-LIVE Replay
+REPLAY

diff --git a/src/components/feed/FacebookPostCard.tsx b/src/components/feed/FacebookPostCard.tsx
--- a/src/components/feed/FacebookPostCard.tsx
+++ b/src/components/feed/FacebookPostCard.tsx
@@
-const { error } = await supabase.from('posts').delete().eq('id', post.id);
+const { data: { session } } = await supabase.auth.getSession();
+if (!session?.access_token) throw new Error('Unauthorized');
+const { error } = await supabase.functions.invoke('delete-post-archive', {
+  body: { post_id: post.id },
+  headers: { Authorization: `Bearer ${session.access_token}` },
+});

diff --git a/src/hooks/useFeedPosts.ts b/src/hooks/useFeedPosts.ts
--- a/src/hooks/useFeedPosts.ts
+++ b/src/hooks/useFeedPosts.ts
@@
 .eq('post_type', 'gift_celebration')
+.is('deleted_at', null)
@@
 .neq('post_type', 'gift_celebration')
+.is('deleted_at', null)

diff --git a/supabase/config.toml b/supabase/config.toml
--- a/supabase/config.toml
+++ b/supabase/config.toml
@@
+[functions.live-replay-archive-cron]
+verify_jwt = false
+[functions.delete-post-archive]
+verify_jwt = true
```

## Cach Test

```bash
npx tsc -p tsconfig.app.json --noEmit
npx eslint supabase/functions/_shared/cloudflareStreamService.ts supabase/functions/_shared/r2StorageService.ts supabase/functions/_shared/replayFeedService.ts supabase/functions/_shared/archiveReplayService.ts supabase/functions/live-replay-archive-cron/index.ts supabase/functions/delete-post-archive/index.ts src/hooks/live/useLiveReplayStatus.ts src/components/feed/FacebookPostCard.tsx src/components/feed/FeedVideoPlayer.tsx
```

Luu y: `npm run build` trong repo hien phu thuoc `bun` o `prebuild`; neu may chua cai bun se fail voi loi `bun is not recognized`.

## Rollback / Retry

- Neu upload R2 fail: khong xoa Cloudflare Stream, set `archive_status = failed`, luu `archive_error`.
- Retry bang `live-replay-archive-cron`.
- Neu da archive R2 nhung delete Stream fail: replay van phat tu R2, cron/delete cleanup co the goi lai.
- Neu creator xoa post: goi `delete-post-archive`, soft delete post, xoa R2 object, va xoa Stream neu UID con ton tai.

---

# Cap Nhat Moi Nhat - 2026-05-08

Phan nay la source moi nhat sau lan audit cuoi. Neu trung voi cac section cu o tren, hay uu tien version trong phan nay.

## Kien Truc Chuan

```text
Agora realtime livestream
  -> Cloudflare Stream recording/transcoding tam thoi
  -> Stream READY
  -> request/poll MP4
  -> upload MP4 sang R2
  -> verify R2 object bang HEAD
  -> update DB + create replay/feed post + creator_library
  -> delete Cloudflare Stream video
```

## Env Alias Duoc Ho Tro

```env
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_STREAM_TOKEN=
CLOUDFLARE_STREAM_API_TOKEN=
CLOUDFLARE_STREAM_ACCOUNT_ID=
CLOUDFLARE_STREAM_WEBHOOK_SECRET=

R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=
R2_PUBLIC_DOMAIN=

# Backward compatibility
CLOUDFLARE_ACCESS_KEY_ID=
CLOUDFLARE_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
CLOUDFLARE_R2_PUBLIC_URL=
```

## supabase/functions/_shared/livestreamProcessingService.ts

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { archiveReplay } from './archiveReplayService.ts';
import { getStreamPlaybackUrls, requestMp4Download } from './cloudflareStreamService.ts';

export interface MarkStreamReadyInput {
  replay: any;
  uid: string;
  video?: any;
  event?: any;
  mp4Url?: string | null;
}

function durationFrom(input: MarkStreamReadyInput): number | null {
  const value = input.video?.duration || input.event?.duration || input.event?.data?.duration || 0;
  return Math.round(Number(value || 0)) || null;
}

export async function markStreamReadyAndArchive(
  admin: SupabaseClient,
  input: MarkStreamReadyInput,
): Promise<Record<string, unknown>> {
  const urls = getStreamPlaybackUrls(input.uid);
  const mp4 = input.mp4Url ? { url: input.mp4Url } : await requestMp4Download(input.uid).catch(() => null);
  const now = new Date().toISOString();

  await (admin as any).from('live_replays').update({
    status: 'ready',
    playback_hls: urls.hls,
    playback_dash: urls.dash,
    playback_mp4: mp4?.url || urls.mp4,
    thumbnail_url: urls.thumbnail,
    duration_seconds: durationFrom(input),
    cloudflare_video_uid: input.uid,
    cloudflare_playback_url: urls.hls,
    cloudflare_mp4_download_url: mp4?.url || urls.mp4,
    archive_status: 'pending',
    archive_error: null,
    webhook_received_at: input.event ? now : input.replay.webhook_received_at,
    last_webhook_event: input.event ? 'ready' : input.replay.last_webhook_event,
    last_cf_status: 'ready',
    last_cf_response: input.video || input.event || null,
    error_message: null,
    last_error_at: null,
  }).eq('id', input.replay.id);

  await admin.from('live_sessions').update({
    recording_status: 'ready',
    recording_ready_at: now,
    recording_error: null,
  }).eq('id', input.replay.live_session_id);

  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('post_id')
    .eq('id', input.replay.live_session_id)
    .maybeSingle();

  if (liveSession?.post_id) {
    const { data: post } = await admin
      .from('posts')
      .select('metadata')
      .eq('id', liveSession.post_id)
      .maybeSingle();
    const metadata = {
      ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
      live_status: 'ended',
      live_session_id: input.replay.live_session_id,
      archive_status: 'pending',
      playback_type: 'r2_pending',
      playback_provider: 'r2',
      storage_provider: 'r2',
    };
    await admin.from('posts').update({ metadata }).eq('id', liveSession.post_id);
  }

  return archiveReplay(admin, input.replay.id);
}
```

## supabase/functions/_shared/cloudflareStreamService.ts

```ts
export interface StreamPlaybackUrls {
  hls: string;
  dash: string;
  mp4: string;
  thumbnail: string;
}

export interface StreamDownloadStatus {
  url: string | null;
  ready: boolean;
  percentComplete: number | null;
  raw: unknown;
}

export function getStreamAccountId(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
}

export function getStreamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') ||
    Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN') ||
    Deno.env.get('CLOUDFLARE_API_TOKEN');
}

export function getStreamPlaybackUrls(uid: string): StreamPlaybackUrls {
  const code = Deno.env.get('CLOUDFLARE_STREAM_CUSTOMER_CODE');
  const base = code ? `https://customer-${code}.cloudflarestream.com/${uid}` : `https://videodelivery.net/${uid}`;
  return {
    hls: `${base}/manifest/video.m3u8`,
    dash: `${base}/manifest/video.mpd`,
    mp4: `${base}/downloads/default.mp4`,
    thumbnail: `${base}/thumbnails/thumbnail.jpg?time=3s`,
  };
}

export async function getStreamVideo(uid: string): Promise<Record<string, unknown> | null> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || !data?.success) return null;
  return data.result || null;
}

export async function requestMp4Download(uid: string): Promise<StreamDownloadStatus> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || data?.success === false) {
    throw new Error(`Cloudflare Stream MP4 request failed: ${resp.status}`);
  }

  const info = data?.result?.default || {};
  const url = info.url || getStreamPlaybackUrls(uid).mp4;
  const percent = typeof info.percentComplete === 'number' ? info.percentComplete : null;
  return { url, ready: !!url && (percent === null || percent >= 100), percentComplete: percent, raw: data };
}

export async function pollMp4DownloadUrl(uid: string, attempts = 6, delayMs = 2500): Promise<StreamDownloadStatus> {
  let last: StreamDownloadStatus | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await requestMp4Download(uid);
    if (last.ready && last.url) return last;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last || { url: null, ready: false, percentComplete: null, raw: null };
}

export async function deleteStreamVideo(uid: string): Promise<{ deleted: boolean; status: number; raw: string }> {
  const accountId = getStreamAccountId();
  const token = getStreamToken();
  if (!accountId || !token) throw new Error('Missing Cloudflare Stream config');

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const raw = await resp.text().catch(() => '');
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Cloudflare Stream delete failed: ${resp.status} ${raw.slice(0, 200)}`);
  }
  return { deleted: true, status: resp.status, raw };
}
```

## supabase/functions/_shared/r2StorageService.ts

```ts
interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
  host: string;
}

export interface R2UploadResult {
  key: string;
  bucket: string;
  url: string;
  size: number;
}

function getR2Config(): R2Config {
  const accountId = Deno.env.get('R2_ACCOUNT_ID') || Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') || Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') || Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY');
  const bucketName = Deno.env.get('R2_BUCKET_NAME') || Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME');
  const publicUrl = Deno.env.get('R2_PUBLIC_DOMAIN') || Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    throw new Error('Missing Cloudflare R2 config');
  }
  const endpoint = Deno.env.get('R2_ENDPOINT');
  const endpointHost = endpoint ? new URL(endpoint).host : null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl: publicUrl.replace(/\/$/, ''),
    host: endpointHost || `${accountId}.r2.cloudflarestorage.com`,
  };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function getSignatureKey(key: string, dateStamp: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${key}`).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, 'auto');
  const kService = await hmacSha256(kRegion, 's3');
  return hmacSha256(kService, 'aws4_request');
}

async function signedR2Request(method: string, key: string, headers: Record<string, string> = {}, body?: BodyInit): Promise<Response> {
  const r2 = getR2Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalUri = `/${r2.bucketName}/${key.split('/').map(encodeURIComponent).join('/')}`;

  const allHeaders: Record<string, string> = {
    ...Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])),
    host: r2.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sorted = Object.keys(allHeaders).sort();
  const signedHeaders = sorted.join(';');
  const canonicalHeaders = sorted.map((k) => `${k}:${allHeaders[k]}`).join('\n') + '\n';
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const requestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, requestHash].join('\n');
  const signature = toHex(await hmacSha256(await getSignatureKey(r2.secretAccessKey, dateStamp), stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(`https://${r2.host}${canonicalUri}`, {
    method,
    headers: { ...allHeaders, Authorization: authorization },
    body,
  });
}

export async function uploadMp4ToR2(
  key: string,
  body: Blob | ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array,
  options?: { contentLength?: number },
): Promise<R2UploadResult> {
  const r2 = getR2Config();
  const headers: Record<string, string> = {
    'content-type': 'video/mp4',
    'cache-control': 'public, max-age=31536000, immutable',
  };
  if (options?.contentLength && options.contentLength > 0) {
    headers['content-length'] = String(options.contentLength);
  }
  const resp = await signedR2Request('PUT', key, headers, body as BodyInit);
  if (!resp.ok) throw new Error(`R2 upload failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  const verified = await headR2Object(key);
  if (!verified.exists || verified.size <= 0) throw new Error('R2 upload verification failed');
  return { key, bucket: r2.bucketName, url: `${r2.publicUrl}/${key}`, size: verified.size };
}

export async function headR2Object(key: string): Promise<{ exists: boolean; size: number }> {
  const resp = await signedR2Request('HEAD', key);
  if (resp.status === 404) return { exists: false, size: 0 };
  if (!resp.ok) throw new Error(`R2 HEAD failed: ${resp.status}`);
  return { exists: true, size: Number(resp.headers.get('content-length') || 0) };
}

export async function deleteR2Object(key: string): Promise<void> {
  const resp = await signedR2Request('DELETE', key);
  if (!resp.ok && resp.status !== 404) throw new Error(`R2 delete failed: ${resp.status}`);
}
```

## supabase/migrations/20260508000100_live_replay_posted_at_alias.sql

```sql
-- Backward-compatible alias for replay/feed post creation time.

ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

ALTER TABLE public.creator_library
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

UPDATE public.live_replays
SET posted_at = COALESCE(posted_at, auto_posted_at)
WHERE posted_at IS NULL AND auto_posted_at IS NOT NULL;

UPDATE public.creator_library
SET posted_at = COALESCE(posted_at, archived_at)
WHERE posted_at IS NULL AND archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_replays_posted_at
  ON public.live_replays(posted_at DESC)
  WHERE posted_at IS NOT NULL;
```

## src/components/feed/PostMedia.tsx

```tsx
import { useMemo, memo } from 'react';
import { MediaGrid } from './MediaGrid';
import { LivePostEmbed } from './LivePostEmbed';
import { HeartAnimation } from './HeartAnimation';
import { Radio } from 'lucide-react';
import type { PostData } from './types';

interface PostMediaProps {
  post: PostData;
  showHeartAnimation: boolean;
  onHeartComplete: () => void;
  onDoubleTap: () => void;
}

export const PostMedia = memo(function PostMedia({
  post, showHeartAnimation, onHeartComplete, onDoubleTap,
}: PostMediaProps) {
  const metadata = post.metadata;
  const isLive = post.post_type === 'live';
  const replayStatusText = metadata?.archive_status === 'archiving' || metadata?.archive_status === 'pending'
    ? 'Dang luu video...'
    : 'Dang xu ly replay...';

  const mediaItems = useMemo(() => {
    const items: Array<{ url: string; type: 'image' | 'video'; poster?: string; isLiveReplay?: boolean }> = [];
    const r2Url = isLive
      ? ((metadata?.r2_video_url as string | undefined)
        || ((metadata?.playback_provider === 'r2' || metadata?.playback_type === 'r2')
          ? (metadata?.playback_url as string | undefined)
          : undefined))
      : undefined;
    const hlsUrl = isLive ? (metadata?.playback_hls as string | undefined) : undefined;
    const chunkedFallbackUrl = isLive && metadata?.allow_chunked_fallback
      ? ((metadata?.fallback_playback_url as string | undefined) || (metadata?.playback_url as string | undefined))
      : undefined;
    const liveVideoUrl = r2Url || hlsUrl || chunkedFallbackUrl || (isLive ? (post.video_url || undefined) : undefined);
    const poster = metadata?.thumbnail_url as string | undefined;

    if (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0) {
      if (isLive) {
        if (!liveVideoUrl) return [];
        return post.media_urls.map(m => ({
          ...m,
          url: m.type === 'video' ? liveVideoUrl : m.url,
          isLiveReplay: m.type === 'video',
          poster: m.type === 'video' ? poster : undefined,
        }));
      }
      return post.media_urls;
    }

    if (post.image_url) {
      items.push({ url: post.image_url, type: 'image' as const });
    }
    const videoUrl = isLive ? liveVideoUrl : post.video_url;
    if (videoUrl) {
      items.push({ url: videoUrl, type: 'video' as const, poster, isLiveReplay: isLive });
    }
    return items;
  }, [post.media_urls, post.image_url, post.video_url, metadata, isLive]);

  if (isLive && metadata?.live_status === 'live') {
    return (
      <LivePostEmbed
        metadata={metadata}
        hostName={post.profiles?.display_name || post.profiles?.username || ''}
      />
    );
  }

  return (
    <div className="relative" onClick={onDoubleTap}>
      {mediaItems.length > 0 ? (
        <MediaGrid media={mediaItems} feedId={post.id} />
      ) : isLive && metadata?.live_status === 'ended' ? (
        metadata?.recording_failed ? (
          <div className="flex items-center justify-center p-6 bg-muted/50 text-muted-foreground text-sm gap-2">
            <Radio className="w-4 h-4" />
            <span>Phien live nay khong co ban ghi</span>
          </div>
        ) : (
          <div className="flex items-center justify-center p-6 bg-muted/50 text-muted-foreground text-sm gap-2">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>{replayStatusText}</span>
          </div>
        )
      ) : null}
      <HeartAnimation show={showHeartAnimation} onComplete={onHeartComplete} />
    </div>
  );
});
```
