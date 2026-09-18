# Cloudflare Stream Full Source Package For Lovable

Generated from the local FUN PROFILE repository source. This document packages the Cloudflare Stream replay pipeline, webhook/polling fallback, admin debug dashboard, frontend playback integration, migrations, and supporting Stream utilities into one Markdown file for Lovable.

## Pipeline Goal

Livestream ends -> replay is queued -> server-side TUS upload to Cloudflare Stream -> Cloudflare processes video -> webhook or poll updates database -> playback_hls and thumbnail_url become available -> frontend plays HLS, with native HLS on iOS Safari.

## Required Environment Variables

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STREAM_TOKEN`
- `CLOUDFLARE_STREAM_CUSTOMER_CODE`
- `CLOUDFLARE_STREAM_WEBHOOK_SECRET`
- `CRON_SECRET` or `CRON_SHARED_SECRET`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not place real secret values in frontend code or this document. Store them in Supabase Edge Function secrets / project environment settings.

## Supabase Function Config Excerpt

Path: `supabase/config.toml`

```toml
[functions.stream-video]
  verify_jwt = false
[functions.live-replay-create-upload]
  verify_jwt = true
[functions.live-replay-mark-uploaded]
  verify_jwt = true
[functions.live-replay-ingest-from-r2]
  verify_jwt = true
[functions.live-replay-stream-ingest]
  verify_jwt = false
[functions.live-replay-poll-status]
  verify_jwt = false
[functions.auto-finalize-recordings]
  verify_jwt = false
[functions.admin-replay-debug]
  verify_jwt = true
[functions.stream-webhook]
  verify_jwt = false
[functions.stream-webhook-register]
  verify_jwt = true
```

## Deploy And Test Notes

1. Apply the SQL migrations included below.
2. Deploy all Supabase Edge Functions included below.
3. Configure the required secrets in Supabase.
4. Register/verify the Cloudflare Stream webhook points to `/functions/v1/stream-webhook`.
5. Open `/admin/replay-debug` as an admin and run `test_cloudflare_api`.
6. Create a new livestream, end it, and verify replay status transitions queued -> uploading -> processing -> ready with `playback_hls` and `thumbnail_url`.

## Full Source Files

## supabase/functions/live-replay-ingest-from-r2/index.ts

``ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

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

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

async function invokeReplayWorkers(): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (cronSecret) headers['X-Cron-Secret'] = cronSecret;

  await Promise.allSettled([
    fetch(`${supabaseUrl}/functions/v1/auto-finalize-recordings`, {
      method: 'POST',
      headers,
      body: '{}',
    }),
    fetch(`${supabaseUrl}/functions/v1/live-replay-stream-ingest`, {
      method: 'POST',
      headers,
      body: '{}',
    }),
  ]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = streamToken();
    const r2PublicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
    if (!accountId || !token || !r2PublicUrl) {
      return json({ error: 'Missing Cloudflare configuration' }, 500);
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { live_session_id, chunked_recording_id } = await req.json();
    if (!live_session_id || !chunked_recording_id) {
      return json({ error: 'Missing live_session_id or chunked_recording_id' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_banned')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.is_banned) return json({ error: 'Account is banned' }, 403);

    const { data: liveSession, error: sessErr } = await supabaseAdmin
      .from('live_sessions')
      .select('id, host_user_id, owner_id, post_id, title')
      .eq('id', live_session_id)
      .maybeSingle();
    if (sessErr || !liveSession) return json({ error: 'Live session not found' }, 404);
    if (liveSession.host_user_id !== user.id && liveSession.owner_id !== user.id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { data: recording, error: recErr } = await supabaseAdmin
      .from('chunked_recordings')
      .select('id, user_id, live_session_id, output_object_key, output_url, total_chunks')
      .eq('id', chunked_recording_id)
      .maybeSingle();
    if (recErr || !recording) return json({ error: 'Recording not found' }, 404);
    if (recording.user_id !== user.id || recording.live_session_id !== live_session_id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { data: existingReplay } = await (supabaseAdmin as any)
      .from('live_replays')
      .select('id, status, stream_uid')
      .eq('chunked_recording_id', chunked_recording_id)
      .in('status', ['queued', 'uploading', 'processing', 'ready'])
      .maybeSingle();
    if (existingReplay) {
      if (existingReplay.status === 'queued' || existingReplay.status === 'uploading') {
        invokeReplayWorkers().catch((err) => console.warn('[live-replay-ingest-from-r2] worker trigger failed:', err));
      }
      return json({
        replay_id: existingReplay.id,
        stream_uid: existingReplay.stream_uid,
        status: existingReplay.status,
        reused: true,
      });
    }

    let sourceUrl = recording.output_url || '';
    const outputKey = recording.output_object_key || '';
    const isManifest = outputKey.endsWith('manifest.json');
    if (!sourceUrl || isManifest) {
      sourceUrl = `${r2PublicUrl}/recordings/${chunked_recording_id}/replay.webm`;
    }

    let sourceReady = false;
    try {
      const headResp = await fetch(sourceUrl, { method: 'HEAD' });
      sourceReady = headResp.ok && parseInt(headResp.headers.get('content-length') || '0', 10) > 0;
    } catch {
      sourceReady = false;
    }

    if (!sourceReady) {
      const { data: replay, error: upsertErr } = await (supabaseAdmin as any)
        .from('live_replays')
        .upsert({
          user_id: user.id,
          live_session_id,
          chunked_recording_id,
          source_webm_key: outputKey || `recordings/${chunked_recording_id}/manifest.json`,
          status: 'queued',
          error_message: null,
          last_error_at: null,
        }, { onConflict: 'chunked_recording_id' })
        .select('id, stream_uid, status')
        .single();
      if (upsertErr || !replay) {
        return json({ error: upsertErr?.message || 'Failed to enqueue replay ingest' }, 500);
      }

      await supabaseAdmin
        .from('live_sessions')
        .update({ recording_status: 'processing', recording_error: null })
        .eq('id', live_session_id);

      invokeReplayWorkers().catch((err) => console.warn('[live-replay-ingest-from-r2] worker trigger failed:', err));

      return json({
        replay_id: replay.id,
        stream_uid: replay.stream_uid,
        status: 'queued',
        message: 'Replay queued for Cloudflare Stream TUS ingest.',
        source_url: sourceUrl,
      }, 202);
    }

    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upload-Creator': user.id.slice(0, 64),
      },
      body: JSON.stringify({
        url: sourceUrl,
        meta: {
          source: 'fun-profile-live-replay-ingest',
          userId: user.id,
          liveSessionId: live_session_id,
          chunkedRecordingId: chunked_recording_id,
          name: liveSession.title || 'FUN Profile live replay',
        },
        requireSignedURLs: false,
        allowedOrigins: ['*'],
      }),
    });

    const cfBody = await cfResp.text().catch(() => '');
    if (!cfResp.ok) {
      console.error('[CF_STREAM] [/copy] failed', { status: cfResp.status, body: cfBody.slice(0, 500) });
      return json({
        error: `Cloudflare Stream copy failed: ${cfResp.status}`,
        detail: cfBody.slice(0, 500),
      }, 502);
    }

    const cfData = JSON.parse(cfBody || '{}');
    const streamUid = cfData?.result?.uid;
    if (!streamUid) return json({ error: 'Invalid Cloudflare /copy response' }, 502);

    const { data: replay, error: upsertErr } = await (supabaseAdmin as any)
      .from('live_replays')
      .upsert({
        user_id: user.id,
        live_session_id,
        chunked_recording_id,
        source_webm_key: outputKey || null,
        stream_uid: streamUid,
        status: 'processing',
        last_cf_status: 'copy_created',
        last_cf_response: cfData,
        error_message: null,
        last_error_at: null,
      }, { onConflict: 'chunked_recording_id' })
      .select('id')
      .single();
    if (upsertErr || !replay) {
      return json({ error: upsertErr?.message || 'Failed to create replay row' }, 500);
    }

    await supabaseAdmin
      .from('live_sessions')
      .update({ recording_status: 'processing', recording_error: null })
      .eq('id', live_session_id);

    return json({
      replay_id: replay.id,
      stream_uid: streamUid,
      status: 'processing',
      source_url: sourceUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('live-replay-ingest-from-r2 error:', error);
    return json({ error: message }, 500);
  }
});
````

## supabase/functions/live-replay-stream-ingest/index.ts

``ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_REPLAYS_PER_RUN = 3;
const PER_REPLAY_BUDGET_MS = 25_000;
const TOTAL_BUDGET_MS = 90_000;
const PATCH_TARGET_BYTES = 6 * 1024 * 1024;
const TUS_ALIGN = 256 * 1024;
const MIN_NON_FINAL_PATCH = 5 * 1024 * 1024;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | undefined {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function cfError(message: string, status: string, response: Record<string, unknown>, fatal = false): Error {
  return Object.assign(new Error(message), { cfStatus: status, cfResponse: response, fatal });
}

async function fetchChunkBytes(url: string, retries = 2): Promise<Uint8Array> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      lastErr = e;
      console.warn('[UPLOAD] chunk fetch retry', { attempt: i + 1, url, error: String(e) });
      await new Promise(res => setTimeout(res, 500 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('fetchChunkBytes failed');
}

async function tusCreate(
  accountId: string,
  token: string,
  filename: string,
  totalBytes: number,
): Promise<{ uid: string; tusUrl: string; response: Record<string, unknown> }> {
  const meta = `name ${b64(filename)},filetype ${b64('video/webm')}`;
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Tus-Resumable': '1.0.0',
      'Upload-Length': String(totalBytes),
      'Upload-Metadata': meta,
    },
  });
  if (r.status !== 201) {
    const text = await r.text().catch(() => '');
    console.error('[CF_STREAM] [TUS] create failed', { status: r.status, body: text.slice(0, 500) });
    throw cfError(
      `TUS create failed ${r.status}: ${text.slice(0, 300)}`,
      `tus_create_${r.status}`,
      { status: r.status, body: text.slice(0, 500) },
      r.status === 401 || r.status === 403,
    );
  }
  const tusUrl = r.headers.get('Location') || '';
  const uid = r.headers.get('stream-media-id') || '';
  if (!tusUrl || !uid) {
    throw cfError('TUS create missing Location/stream-media-id headers', 'tus_create_missing_headers', {
      location: !!tusUrl,
      streamMediaId: !!uid,
    }, true);
  }
  const response = { uid, location: tusUrl, totalBytes, filename };
  console.log('[CF_STREAM] [TUS] created', response);
  return { uid, tusUrl, response };
}

async function tusHead(tusUrl: string, token: string): Promise<number | null> {
  const r = await fetch(tusUrl, {
    method: 'HEAD',
    headers: {
      Authorization: `Bearer ${token}`,
      'Tus-Resumable': '1.0.0',
    },
  });
  const uploadOffset = r.headers.get('Upload-Offset');
  console.log('[CF_STREAM] [OFFSET] HEAD', { status: r.status, uploadOffset });
  if (r.status === 404) return null;
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw cfError(
      `TUS HEAD ${r.status}: ${text.slice(0, 200)}`,
      `tus_head_${r.status}`,
      { status: r.status, body: text.slice(0, 500) },
      r.status === 401 || r.status === 403,
    );
  }
  const offset = parseInt(uploadOffset || '0', 10);
  return Number.isFinite(offset) ? offset : 0;
}

async function tusPatch(tusUrl: string, offset: number, body: Uint8Array, token: string): Promise<number> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    console.log('[TUS] [PATCH] start', { attempt: attempt + 1, offset, bytes: body.byteLength });
    const r = await fetch(tusUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream',
        'Content-Length': String(body.byteLength),
      },
      body,
    });
    lastStatus = r.status;
    if (r.status === 204) {
      const newOffset = parseInt(r.headers.get('Upload-Offset') || '0', 10);
      console.log('[TUS] [OFFSET] PATCH ok', { offset, bytes: body.byteLength, newOffset });
      return newOffset;
    }
    const text = await r.text().catch(() => '');
    if (r.status >= 400 && r.status < 500) {
      console.error('[TUS] [PATCH] client error', {
        status: r.status,
        offset,
        bytes: body.byteLength,
        uploadOffset: r.headers.get('Upload-Offset'),
        body: text.slice(0, 500),
      });
      throw cfError(
        `TUS PATCH ${r.status}: ${text.slice(0, 200)}`,
        `tus_patch_${r.status}`,
        { status: r.status, uploadOffset: r.headers.get('Upload-Offset'), body: text.slice(0, 500) },
        r.status === 401 || r.status === 403,
      );
    }
    console.warn('[TUS] [PATCH] retryable error', { status: r.status, offset, body: text.slice(0, 300) });
    await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
  }
  throw cfError(`TUS PATCH failed after retries, last=${lastStatus}`, `tus_patch_${lastStatus}`, { status: lastStatus });
}

interface ReplayRow {
  id: string;
  user_id: string;
  live_session_id: string;
  chunked_recording_id: string;
  status: string;
  stream_uid: string | null;
  tus_upload_url: string | null;
  tus_offset: number;
  next_chunk_seq: number;
  total_chunks_for_ingest: number | null;
  ingest_attempts: number;
}

async function processOneReplay(
  supabase: ReturnType<typeof createClient>,
  replay: ReplayRow,
  ctx: { accountId: string; token: string; r2PublicUrl: string; deadlineMs: number },
): Promise<{ status: string; bytesUploaded: number; chunksUploaded: number; stream_uid: string | null }> {
  const { data: chunks, error } = await supabase
    .from('chunked_recording_chunks')
    .select('seq, object_key, bytes')
    .eq('recording_id', replay.chunked_recording_id)
    .eq('status', 'uploaded')
    .order('seq', { ascending: true });
  if (error) throw error;
  if (!chunks || chunks.length === 0) throw new Error('no chunks');

  const totalChunks = chunks.length;
  const cum: number[] = new Array(totalChunks + 1).fill(0);
  for (let i = 0; i < totalChunks; i++) cum[i + 1] = cum[i] + Number((chunks[i] as any).bytes || 0);
  const totalBytes = cum[totalChunks];
  if (totalBytes <= 0) throw new Error('total bytes zero');

  let tusUrl = replay.tus_upload_url;
  let uid = replay.stream_uid;

  if (!tusUrl) {
    const created = await tusCreate(ctx.accountId, ctx.token, `replay-${replay.live_session_id}.webm`, totalBytes);
    tusUrl = created.tusUrl;
    uid = created.uid;
    await supabase.from('live_replays').update({
      stream_uid: uid,
      tus_upload_url: tusUrl,
      total_chunks_for_ingest: totalChunks,
      status: 'uploading',
      tus_offset: 0,
      next_chunk_seq: 0,
      ingest_attempts: (replay.ingest_attempts || 0) + 1,
      last_ingest_at: new Date().toISOString(),
      last_cf_status: 'tus_created',
      last_cf_response: { ...created.response, totalChunks },
      error_message: null,
      last_error_at: null,
    }).eq('id', replay.id);
    console.log('[CF_STREAM] [UPLOAD] created upload', { replay_id: replay.id, stream_uid: uid, totalChunks, totalBytes });
  }

  let serverOffset = Number(replay.tus_offset || 0);
  if (tusUrl) {
    const remoteOffset = await tusHead(tusUrl, ctx.token);
    if (remoteOffset !== null && remoteOffset !== serverOffset) {
      console.warn('[CF_STREAM] [OFFSET] reconciled mismatch', {
        replay_id: replay.id,
        stream_uid: uid,
        dbOffset: serverOffset,
        remoteOffset,
      });
      await supabase.from('live_replays').update({
        tus_offset: remoteOffset,
        last_cf_status: 'tus_offset_reconciled',
        last_cf_response: { dbOffset: serverOffset, remoteOffset },
      }).eq('id', replay.id);
      serverOffset = remoteOffset;
    }
  }

  let startChunkIdx = 0;
  while (startChunkIdx < totalChunks && cum[startChunkIdx + 1] <= serverOffset) startChunkIdx++;
  let skipInFirst = serverOffset - cum[startChunkIdx];

  let buffer = new Uint8Array(0);
  let chunksUploadedThisRun = 0;
  let bytesUploadedThisRun = 0;
  let seq = startChunkIdx;

  const appendChunk = async () => {
    const c = chunks[seq] as any;
    console.log('[UPLOAD] chunk fetch', { replay_id: replay.id, stream_uid: uid, seq, offset: serverOffset, object_key: c.object_key });
    const bytes = await fetchChunkBytes(`${ctx.r2PublicUrl}/${c.object_key}`);
    const slice = (seq === startChunkIdx && skipInFirst > 0) ? bytes.slice(skipInFirst) : bytes;
    const merged = new Uint8Array(buffer.byteLength + slice.byteLength);
    merged.set(buffer, 0);
    merged.set(slice, buffer.byteLength);
    buffer = merged;
    seq++;
    chunksUploadedThisRun++;
    skipInFirst = 0;
  };

  const flushAligned = async () => {
    const alignedSize = Math.floor(buffer.byteLength / TUS_ALIGN) * TUS_ALIGN;
    if (alignedSize < MIN_NON_FINAL_PATCH) return;
    const body = buffer.slice(0, alignedSize);
    const newOffset = await tusPatch(tusUrl!, serverOffset, body, ctx.token);
    bytesUploadedThisRun += alignedSize;
    serverOffset = newOffset;
    buffer = buffer.slice(alignedSize);
  };

  const flushFinal = async () => {
    if (buffer.byteLength === 0) return;
    const newOffset = await tusPatch(tusUrl!, serverOffset, buffer, ctx.token);
    bytesUploadedThisRun += buffer.byteLength;
    serverOffset = newOffset;
    buffer = new Uint8Array(0);
  };

  while (seq < totalChunks && Date.now() < ctx.deadlineMs) {
    await appendChunk();
    if (buffer.byteLength >= PATCH_TARGET_BYTES) await flushAligned();
  }

  const reachedEnd = seq >= totalChunks;
  if (reachedEnd) await flushFinal();
  else await flushAligned();

  const done = serverOffset >= totalBytes;
  await supabase.from('live_replays').update({
    tus_offset: serverOffset,
    next_chunk_seq: seq,
    status: done ? 'processing' : 'uploading',
    last_ingest_at: new Date().toISOString(),
    ingest_attempts: (replay.ingest_attempts || 0) + 1,
    last_cf_status: done ? 'tus_upload_complete' : 'tus_uploading',
    last_cf_response: { stream_uid: uid, tus_offset: serverOffset, totalBytes, totalChunks, next_chunk_seq: seq },
    error_message: null,
    last_error_at: null,
  }).eq('id', replay.id);

  console.log('[CF_STREAM] [UPLOAD] replay processed', {
    replay_id: replay.id,
    stream_uid: uid,
    status: done ? 'processing' : 'uploading',
    tus_offset: serverOffset,
    totalBytes,
    chunksUploadedThisRun,
    bytesUploadedThisRun,
  });

  return {
    status: done ? 'processing' : 'uploading',
    bytesUploaded: bytesUploadedThisRun,
    chunksUploaded: chunksUploadedThisRun,
    stream_uid: uid,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const isAuthorized =
    authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    (cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
  if (!isAuthorized) return json({ error: 'Unauthorized' }, 401);

  const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const token = streamToken();
  const r2PublicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
  if (!accountId || !token || !r2PublicUrl) {
    return json({ error: 'Missing Cloudflare configuration' }, 500);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const startTs = Date.now();
  const totalDeadline = startTs + TOTAL_BUDGET_MS;
  const { data: replays, error: queryErr } = await supabase
    .from('live_replays')
    .select('id, user_id, live_session_id, chunked_recording_id, status, stream_uid, tus_upload_url, tus_offset, next_chunk_seq, total_chunks_for_ingest, ingest_attempts')
    .in('status', ['queued', 'uploading'])
    .not('chunked_recording_id', 'is', null)
    .lt('ingest_attempts', 30)
    .order('last_ingest_at', { ascending: true, nullsFirst: true })
    .limit(MAX_REPLAYS_PER_RUN);

  if (queryErr) {
    console.error('[CF_STREAM] [UPLOAD] query error', queryErr);
    return json({ error: queryErr.message }, 500);
  }

  const results: Array<Record<string, unknown>> = [];
  for (const r of (replays || []) as ReplayRow[]) {
    if (Date.now() >= totalDeadline) break;
    const perDeadline = Math.min(Date.now() + PER_REPLAY_BUDGET_MS, totalDeadline);
    try {
      const out = await processOneReplay(supabase, r, { accountId, token, r2PublicUrl, deadlineMs: perDeadline });
      results.push({ replay_id: r.id, ...out });
    } catch (err: any) {
      const fatal = !!err?.fatal;
      console.error('[CF_STREAM] [UPLOAD] replay error', { replay_id: r.id, fatal, message: err?.message });
      const update: Record<string, unknown> = {
        last_ingest_at: new Date().toISOString(),
        ingest_attempts: (r.ingest_attempts || 0) + 1,
        error_message: String(err?.message || err).slice(0, 500),
        last_error_at: new Date().toISOString(),
        last_cf_status: err?.cfStatus || 'ingest_error',
        last_cf_response: err?.cfResponse || { message: String(err?.message || err).slice(0, 500) },
      };
      if (fatal) update.status = 'failed';
      await supabase.from('live_replays').update(update).eq('id', r.id);
      results.push({ replay_id: r.id, error: String(err?.message || err), fatal });
    }
  }

  return json({
    processed: results.length,
    results,
    elapsed_ms: Date.now() - startTs,
    timestamp: new Date().toISOString(),
  });
});
````

## supabase/functions/live-replay-poll-status/index.ts

``ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

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

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

function playbackUrls(uid: string) {
  const code = Deno.env.get('CLOUDFLARE_STREAM_CUSTOMER_CODE');
  const base = code ? `https://customer-${code}.cloudflarestream.com/${uid}` : `https://videodelivery.net/${uid}`;
  return {
    hls: `${base}/manifest/video.m3u8`,
    dash: `${base}/manifest/video.mpd`,
    mp4: `${base}/downloads/default.mp4`,
    thumbnail: `${base}/thumbnails/thumbnail.jpg?time=3s`,
  };
}

async function requestMp4Download(accountId: string, token: string, uid: string): Promise<string | null> {
  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  console.log('[CF_STREAM] [POLL] mp4 download request', { uid, status: resp.status, success: data?.success });
  return data?.result?.default?.url || playbackUrls(uid).mp4;
}

async function markReady(admin: ReturnType<typeof createClient>, replay: any, uid: string, video: any, mp4Url: string | null) {
  const urls = playbackUrls(uid);
  const duration = Math.round(Number(video?.duration || 0)) || null;
  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('id, post_id, title, ended_at')
    .eq('id', replay.live_session_id)
    .maybeSingle();

  await (admin as any).from('live_replays').update({
    status: 'ready',
    playback_hls: urls.hls,
    playback_dash: urls.dash,
    playback_mp4: mp4Url || urls.mp4,
    thumbnail_url: urls.thumbnail,
    duration_seconds: duration,
    last_cf_status: 'ready',
    last_cf_response: video,
    error_message: null,
    last_error_at: null,
  }).eq('id', replay.id);

  await admin.from('live_sessions').update({
    recording_status: 'ready',
    recording_ready_at: new Date().toISOString(),
    recording_error: null,
  }).eq('id', replay.live_session_id);

  if (liveSession?.post_id) {
    const { data: post } = await admin.from('posts').select('metadata').eq('id', liveSession.post_id).maybeSingle();
    const metadata = {
      ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
      live_title: liveSession.title,
      live_status: 'ended',
      live_session_id: replay.live_session_id,
      playback_url: urls.hls,
      playback_type: 'cloudflare_stream',
      stream_uid: uid,
      playback_hls: urls.hls,
      playback_dash: urls.dash,
      playback_mp4: mp4Url || urls.mp4,
      thumbnail_url: urls.thumbnail,
      duration_seconds: duration,
      replay_ready_at: new Date().toISOString(),
      ended_at: liveSession.ended_at || new Date().toISOString(),
    };
    await admin.from('posts').update({ video_url: urls.hls, image_url: null, metadata }).eq('id', liveSession.post_id);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const ok =
    authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    (cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
  if (!ok) return json({ error: 'Unauthorized' }, 401);

  try {
    const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = streamToken();
    if (!accountId || !token) return json({ error: 'Missing Cloudflare Stream config' }, 500);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: pending } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id, stream_uid, status')
      .in('status', ['uploading', 'queued', 'processing'])
      .not('stream_uid', 'is', null)
      .limit(50);

    const results: any[] = [];
    for (const replay of pending || []) {
      const uid = replay.stream_uid as string;
      const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await cfResp.json().catch(() => null);
      console.log('[CF_STREAM] [POLL] video status', { uid, httpStatus: cfResp.status, success: data?.success });
      if (!cfResp.ok || !data?.success) {
        await (admin as any).from('live_replays').update({
          last_cf_status: `poll_${cfResp.status}`,
          last_cf_response: data || { status: cfResp.status },
        }).eq('id', replay.id);
        results.push({ uid, status: 'poll_error', httpStatus: cfResp.status });
        continue;
      }

      const video = data.result;
      const state = String(video?.status?.state || 'processing').toLowerCase();
      if (video?.readyToStream === true || state === 'ready') {
        const mp4Url = await requestMp4Download(accountId, token, uid);
        await markReady(admin, replay, uid, video, mp4Url);
        results.push({ uid, status: 'ready' });
      } else if (state === 'error' || state === 'failed') {
        const reason = video?.status?.errReasonText || video?.status?.errorReasonText || 'Stream encoding failed';
        await (admin as any).from('live_replays').update({
          status: 'failed',
          error_message: reason,
          last_error_at: new Date().toISOString(),
          last_cf_status: state,
          last_cf_response: video,
        }).eq('id', replay.id);
        await admin.from('live_sessions').update({
          recording_status: 'failed',
          recording_error: reason,
        }).eq('id', replay.live_session_id);
        results.push({ uid, status: 'failed', reason });
      } else {
        await (admin as any).from('live_replays').update({
          last_cf_status: state,
          last_cf_response: video,
        }).eq('id', replay.id);
        results.push({ uid, status: replay.status, state });
      }
    }

    return json({ ok: true, processed: results.length, results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('live-replay-poll-status error:', error);
    return json({ error: msg }, 500);
  }
});
````

## supabase/functions/stream-webhook/index.ts

``ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

function accountId(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
}

function parseSignature(header: string | null): { time: string; sig1: string } | null {
  if (!header) return null;
  const parts = Object.fromEntries(header.split(',').map((part) => {
    const [key, value] = part.trim().split('=');
    return [key, value];
  }));
  if (!parts.time || !parts.sig1) return null;
  return { time: parts.time, sig1: parts.sig1 };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyWebhook(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get('CLOUDFLARE_STREAM_WEBHOOK_SECRET');
  const sigHeader = req.headers.get('Webhook-Signature');
  console.log('[WEBHOOK] signature received', { hasSecret: !!secret, hasHeader: !!sigHeader });
  if (!secret || !sigHeader) return false;

  const parsed = parseSignature(sigHeader);
  if (!parsed) {
    console.warn('[WEBHOOK] signature parse failed');
    return false;
  }

  const timestamp = Number(parsed.time);
  if (!Number.isFinite(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 5 * 60) {
    console.warn('[WEBHOOK] timestamp skew', { skewSeconds: now - timestamp });
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${parsed.time}.${rawBody}`));
  const ok = constantTimeEqual(toHex(signature), parsed.sig1);
  if (!ok) console.warn('[WEBHOOK] HMAC mismatch');
  return ok;
}

function playbackUrls(uid: string) {
  const code = Deno.env.get('CLOUDFLARE_STREAM_CUSTOMER_CODE');
  const base = code ? `https://customer-${code}.cloudflarestream.com/${uid}` : `https://videodelivery.net/${uid}`;
  return {
    hls: `${base}/manifest/video.m3u8`,
    dash: `${base}/manifest/video.mpd`,
    mp4: `${base}/downloads/default.mp4`,
    thumbnail: `${base}/thumbnails/thumbnail.jpg?time=3s`,
  };
}

async function getVideo(uid: string): Promise<Record<string, unknown> | null> {
  const id = accountId();
  const token = streamToken();
  if (!id || !token) return null;
  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  console.log('[CF_STREAM] [WEBHOOK] retrieve video', { uid, status: resp.status, success: data?.success });
  if (!resp.ok || !data?.success) return null;
  return data.result || null;
}

async function requestMp4Download(uid: string): Promise<string | null> {
  const id = accountId();
  const token = streamToken();
  if (!id || !token) return null;

  const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream/${uid}/downloads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => null);
  console.log('[CF_STREAM] [WEBHOOK] mp4 download request', { uid, status: resp.status, success: data?.success });
  return data?.result?.default?.url || playbackUrls(uid).mp4;
}

function extractUid(event: any): string | null {
  return event?.uid || event?.data?.uid || event?.video?.uid || event?.result?.uid || null;
}

function normalizeState(event: any, video: any): string {
  const status = event?.status || event?.data?.status || event?.video?.status || video?.status || {};
  const state = status?.state || status?.current || event?.state || event?.data?.state || video?.status?.state;
  if (event?.readyToStream === true || video?.readyToStream === true) return 'ready';
  return typeof state === 'string' ? state.toLowerCase() : 'processing';
}

async function markReady(admin: ReturnType<typeof createClient>, replay: any, uid: string, event: any, video: any) {
  const urls = playbackUrls(uid);
  const mp4Url = await requestMp4Download(uid);
  const durationSeconds = Math.round(Number(video?.duration || event?.duration || event?.data?.duration || 0)) || null;

  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('id, post_id, title, ended_at')
    .eq('id', replay.live_session_id)
    .maybeSingle();

  await (admin as any).from('live_replays').update({
    status: 'ready',
    playback_hls: urls.hls,
    playback_dash: urls.dash,
    playback_mp4: mp4Url || urls.mp4,
    thumbnail_url: urls.thumbnail,
    duration_seconds: durationSeconds,
    webhook_received_at: new Date().toISOString(),
    last_webhook_event: 'ready',
    last_cf_status: 'ready',
    last_cf_response: video || event,
    error_message: null,
    last_error_at: null,
  }).eq('id', replay.id);

  await admin.from('live_sessions').update({
    recording_status: 'ready',
    recording_ready_at: new Date().toISOString(),
    recording_error: null,
  }).eq('id', replay.live_session_id);

  if (liveSession?.post_id) {
    const { data: post } = await admin.from('posts').select('metadata').eq('id', liveSession.post_id).maybeSingle();
    const metadata = {
      ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
      live_title: liveSession.title,
      live_status: 'ended',
      live_session_id: replay.live_session_id,
      playback_url: urls.hls,
      playback_type: 'cloudflare_stream',
      stream_uid: uid,
      playback_hls: urls.hls,
      playback_dash: urls.dash,
      playback_mp4: mp4Url || urls.mp4,
      thumbnail_url: urls.thumbnail,
      duration_seconds: durationSeconds,
      replay_ready_at: new Date().toISOString(),
      ended_at: liveSession.ended_at || new Date().toISOString(),
    };
    await admin.from('posts').update({ video_url: urls.hls, image_url: null, metadata }).eq('id', liveSession.post_id);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rawBody = await req.text();
  if (!(await verifyWebhook(req, rawBody))) return json({ error: 'Invalid signature' }, 401);

  try {
    const event = JSON.parse(rawBody);
    const uid = extractUid(event);
    console.log('[WEBHOOK] event received', {
      type: event?.type || event?.event || event?.name || 'unknown',
      uid,
      hasBody: rawBody.length > 0,
    });
    if (!uid) return json({ ok: true, ignored: 'missing uid' });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: replay } = await (admin as any)
      .from('live_replays')
      .select('id, live_session_id, stream_uid')
      .eq('stream_uid', uid)
      .maybeSingle();
    if (!replay) return json({ ok: true, ignored: 'replay not found' });

    const video = await getVideo(uid);
    const state = normalizeState(event, video);
    console.log('[WEBHOOK] parsed state', { uid, state, readyToStream: video?.readyToStream ?? event?.readyToStream });

    if (state === 'ready') {
      await markReady(admin, replay, uid, event, video);
      return json({ ok: true, status: 'ready' });
    }

    if (state === 'error' || state === 'failed') {
      const reason = (video as any)?.status?.errReasonText || event?.status?.errReasonText || event?.errReasonText || 'Cloudflare Stream processing failed';
      await (admin as any).from('live_replays').update({
        status: 'failed',
        error_message: reason,
        last_error_at: new Date().toISOString(),
        webhook_received_at: new Date().toISOString(),
        last_webhook_event: state,
        last_cf_status: state,
        last_cf_response: video || event,
      }).eq('id', replay.id);
      await admin.from('live_sessions').update({ recording_status: 'failed', recording_error: reason }).eq('id', replay.live_session_id);
      return json({ ok: true, status: 'failed' });
    }

    await (admin as any).from('live_replays').update({
      status: 'processing',
      webhook_received_at: new Date().toISOString(),
      last_webhook_event: state,
      last_cf_status: state,
      last_cf_response: video || event,
    }).eq('id', replay.id);

    return json({ ok: true, status: 'processing' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stream-webhook error:', error);
    return json({ error: message }, 500);
  }
});
````

## supabase/functions/auto-finalize-recordings/index.ts

``ts
/**
 * auto-finalize-recordings Edge Function
 * Runs via pg_cron every 5 minutes.
 * 1. Auto-close sessions stuck as 'live' for > 4 hours (with no heartbeat in last 2 min)
 * 2. Reset recordings stuck in 'assembling' > 10 min
 * 3. Finalize stuck recordings by creating manifest.json (fast, no timeout)
 * 4. Optionally concat small recordings (< 50 chunks) into single file
 * 5. Cleanup old live_messages
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// â”€â”€â”€ R2 / S3 signing utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getR2Config() {
  return {
    accountId: Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!,
    accessKeyId: Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID')!,
    secretAccessKey: Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY')!,
    bucketName: Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')!,
    publicUrl: Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL')!,
    region: 'auto',
    service: 's3',
    get host() { return `${this.accountId}.r2.cloudflarestorage.com`; },
  };
}

async function signedRequest(
  method: string,
  canonicalUri: string,
  headers: Record<string, string>,
  body: Uint8Array | string | null,
  queryString = '',
): Promise<Response> {
  const r2 = getR2Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const bodyBytes = body instanceof Uint8Array ? body : (body ? new TextEncoder().encode(body) : new Uint8Array(0));
  const bodyHash = toHex(await crypto.subtle.digest('SHA-256', bodyBytes));

  const allHeaders: Record<string, string> = {
    ...headers,
    'host': r2.host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': amzDate,
  };

  const sortedHeaderKeys = Object.keys(allHeaders).sort();
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${allHeaders[k]}`).join('\n') + '\n';

  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, bodyHash].join('\n');
  const canonicalRequestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));

  const credentialScope = `${dateStamp}/${r2.region}/${r2.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n');
  const signingKey = await getSignatureKey(r2.secretAccessKey, dateStamp, r2.region, r2.service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const fetchHeaders: Record<string, string> = { ...allHeaders, Authorization: authorization };
  const url = `https://${r2.host}${canonicalUri}${queryString ? '?' + queryString : ''}`;

  return fetch(url, {
    method,
    headers: fetchHeaders,
    body: body ? bodyBytes : undefined,
  });
}

// â”€â”€â”€ (Removed) R2 Multipart concat utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Pipeline má»›i: live-replay-stream-ingest stream-pipe chunks R2 â†’ Cloudflare
// Stream qua TUS, KHÃ”NG cáº§n file replay.webm trung gian.

async function fetchChunkData(url: string, retries = 3): Promise<Uint8Array> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
      return new Uint8Array(await resp.arrayBuffer());
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('Unreachable');
}

// â”€â”€â”€ Upload manifest.json to R2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function uploadManifestToR2(objectKey: string, manifestJson: string): Promise<void> {
  const r2 = getR2Config();
  const uri = `/${r2.bucketName}/${objectKey}`;
  const resp = await signedRequest('PUT', uri, { 'content-type': 'application/json' }, manifestJson);
  if (!resp.ok) throw new Error(`Upload manifest failed: ${resp.status}`);
  await resp.text();
}

// â”€â”€â”€ Create manifest for a recording â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function createManifestForRecording(
  supabaseAdmin: ReturnType<typeof createClient>,
  rec: any,
  chunks: any[],
  session: any,
): Promise<{ manifest_url: string }> {
  const r2 = getR2Config();
  const mimeType = rec.mime_type || 'video/webm';
  const totalDurationMs = chunks.reduce((sum: number, c: any) => sum + (c.duration_ms || 2000), 0);
  const totalBytes = chunks.reduce((sum: number, c: any) => sum + (c.bytes || 0), 0);

  const manifest = {
    version: 2,
    recording_id: rec.id,
    live_session_id: rec.live_session_id,
    mime_type: mimeType,
    codec: rec.codec || null,
    total_chunks: chunks.length,
    total_duration_ms: totalDurationMs,
    total_bytes: totalBytes,
    created_at: new Date().toISOString(),
    auto_finalized: true,
    chunks: chunks.map((c: any) => ({
      seq: c.seq,
      url: `${r2.publicUrl}/${c.object_key}`,
      object_key: c.object_key,
      bytes: c.bytes || 0,
      duration_ms: c.duration_ms || 2000,
    })),
  };

  const manifestKey = `recordings/${rec.id}/manifest.json`;
  await uploadManifestToR2(manifestKey, JSON.stringify(manifest));
  const manifestUrl = `${r2.publicUrl}/${manifestKey}`;

  // Update recording
  await supabaseAdmin.from('chunked_recordings').update({
    status: 'done',
    total_chunks: chunks.length,
    output_object_key: manifestKey,
    output_url: manifestUrl,
    ended_at: new Date().toISOString(),
  }).eq('id', rec.id);

  // Update live session
  await supabaseAdmin.from('live_sessions')
    .update({ recording_status: 'processing' })
    .eq('id', rec.live_session_id);

  // Update post
  if (session?.post_id) {
    await supabaseAdmin.from('posts').update({
      video_url: manifestUrl,
      metadata: {
        live_title: session.title,
        live_status: 'ended',
        live_session_id: rec.live_session_id,
        playback_url: manifestUrl,
        playback_type: 'chunked',
        chunked_recording_id: rec.id,
        ended_at: session.ended_at || new Date().toISOString(),
        auto_finalized: true,
      },
    }).eq('id', session.post_id);
  }

  console.log(`[auto-finalize] âœ“ manifest for ${rec.id} (${chunks.length} chunks)`);
  return { manifest_url: manifestUrl };
}

// â”€â”€â”€ Enqueue live_replays for TUS ingest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Sau khi manifest sáºµn sÃ ng, táº¡o row live_replays tráº¡ng thÃ¡i 'queued' Ä‘á»ƒ
// cron live-replay-stream-ingest pipe chunks lÃªn Cloudflare Stream qua TUS.

async function enqueueReplay(
  supabaseAdmin: ReturnType<typeof createClient>,
  rec: any,
  chunks: any[],
  manifestKey: string,
): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('live_replays')
      .upsert({
        user_id: rec.user_id,
        live_session_id: rec.live_session_id,
        chunked_recording_id: rec.id,
        source_webm_key: manifestKey,
        status: 'queued',
        total_chunks_for_ingest: chunks.length,
        tus_offset: 0,
        next_chunk_seq: 0,
        ingest_attempts: 0,
      }, { onConflict: 'chunked_recording_id', ignoreDuplicates: true });
    if (error && !String(error.message).includes('duplicate')) {
      console.warn(`[auto-finalize] enqueueReplay ${rec.id}:`, error.message);
    } else {
      console.log(`[auto-finalize] queued replay ingest for rec=${rec.id} chunks=${chunks.length}`);
    }
  } catch (e: any) {
    console.warn(`[auto-finalize] enqueueReplay throw ${rec.id}:`, e?.message);
  }
}

// â”€â”€â”€ Main handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: accept service_role key, cron secret, or anon key
  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const isCronAuth = cronSecret && req.headers.get('X-Cron-Secret') === cronSecret;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const isAnonCron = authHeader === `Bearer ${anonKey}`;

  if (!isServiceRole && !isCronAuth && !isAnonCron) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results: Array<{ recording_id?: string; session_id?: string; action: string; error?: string }> = [];
    const nowIso = new Date().toISOString();

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 1: Auto-close sessions stuck as 'live' for > 4 hours
    //         Only close if no heartbeat (updated_at) in last 2 minutes
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: stuckLiveSessions } = await supabaseAdmin
      .from('live_sessions')
      .select('id, post_id')
      .eq('status', 'live')
      .lt('started_at', fourHoursAgo)
      .lt('updated_at', twoMinAgo)
      .limit(20);

    if (stuckLiveSessions && stuckLiveSessions.length > 0) {
      for (const session of stuckLiveSessions) {
        await supabaseAdmin.from('live_sessions')
          .update({ status: 'ended', ended_at: nowIso, updated_at: nowIso })
          .eq('id', session.id);

        if (session.post_id) {
          await supabaseAdmin.from('posts')
            .update({
              metadata: {
                live_status: 'ended',
                ended_at: nowIso,
                auto_closed: true,
              },
            })
            .eq('id', session.post_id);
        }

        results.push({ session_id: session.id, action: 'auto_closed_stuck_live' });
        console.log(`[auto-finalize] Auto-closed stuck live session ${session.id}`);
      }
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 2: Reset recordings stuck in 'assembling' for > 10 minutes
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckAssembling } = await supabaseAdmin
      .from('chunked_recordings')
      .select('id')
      .eq('status', 'assembling')
      .lt('created_at', tenMinAgo)
      .limit(10);

    if (stuckAssembling && stuckAssembling.length > 0) {
      for (const rec of stuckAssembling) {
        await supabaseAdmin.from('chunked_recordings')
          .update({ status: 'recording', error_message: 'Reset from stuck assembling state' })
          .eq('id', rec.id);
        results.push({ recording_id: rec.id, action: 'reset_stuck_assembling' });
        console.log(`[auto-finalize] Reset stuck assembling recording ${rec.id}`);
      }
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 3: Finalize stuck recordings (manifest first, then try concat)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const { data: stuckRecordings, error: queryErr } = await supabaseAdmin
      .from('chunked_recordings')
      .select(`
        id, user_id, live_session_id, mime_type, codec, width, height,
        live_sessions!chunked_recordings_live_session_id_fkey(id, status, ended_at, post_id, title)
      `)
      .eq('status', 'recording')
      .not('live_session_id', 'is', null)
      .limit(10);

    if (queryErr) {
      console.error('auto-finalize query error:', queryErr);
    }

    for (const rec of stuckRecordings || []) {
      const session = (rec as any).live_sessions;
      if (!session || session.status !== 'ended') continue;
      // Wait at least 2 minutes after session ended
      if (Date.now() - new Date(session.ended_at).getTime() < 2 * 60 * 1000) continue;

      try {
        const { data: chunks, error: chunkErr } = await supabaseAdmin
          .from('chunked_recording_chunks')
          .select('*')
          .eq('recording_id', rec.id)
          .eq('status', 'uploaded')
          .order('seq', { ascending: true });

        if (chunkErr || !chunks || chunks.length === 0) {
          await supabaseAdmin.from('chunked_recordings')
            .update({ status: 'failed', error_message: 'Auto-finalize: no uploaded chunks', ended_at: nowIso })
            .eq('id', rec.id);
          results.push({ recording_id: rec.id, action: 'marked_failed', error: 'No chunks' });
          continue;
        }

        // Step 3a: Create manifest (fast, always succeeds)
        const { manifest_url } = await createManifestForRecording(supabaseAdmin, rec, chunks, session);
        results.push({ recording_id: rec.id, action: 'manifest_created' });

        // Step 3b: Enqueue cho TUS ingest lÃªn Cloudflare Stream
        const manifestKey = manifest_url.split('/').slice(-3).join('/');
        await enqueueReplay(supabaseAdmin, rec, chunks, manifestKey);
        results.push({ recording_id: rec.id, action: 'replay_enqueued' });
      } catch (err: any) {
        console.error(`[auto-finalize] Error processing ${rec.id}:`, err);
        await supabaseAdmin.from('chunked_recordings')
          .update({ status: 'failed', error_message: `Auto-finalize error: ${err.message}` })
          .eq('id', rec.id);
        results.push({ recording_id: rec.id, action: 'error', error: err.message });
      }
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 3.5: Backfill enqueue cho recordings Ä‘Ã£ 'done' (manifest only)
    //           nhÆ°ng chÆ°a cÃ³ row live_replays.
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const sevenDaysAgoStep35 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: doneManifestOnly } = await supabaseAdmin
      .from('chunked_recordings')
      .select(`
        id, user_id, live_session_id, mime_type, codec, output_object_key,
        live_sessions!chunked_recordings_live_session_id_fkey(id, status, ended_at, post_id, title)
      `)
      .eq('status', 'done')
      .like('output_object_key', '%manifest.json')
      .gte('ended_at', sevenDaysAgoStep35)
      .limit(20);

    for (const rec of doneManifestOnly || []) {
      const session = (rec as any).live_sessions;
      if (!session || session.status !== 'ended') continue;
      const { data: existing } = await supabaseAdmin
        .from('live_replays')
        .select('id')
        .eq('chunked_recording_id', rec.id)
        .maybeSingle();
      if (existing) continue;

      const { data: chunks } = await supabaseAdmin
        .from('chunked_recording_chunks')
        .select('seq, object_key, bytes')
        .eq('recording_id', rec.id)
        .eq('status', 'uploaded')
        .order('seq', { ascending: true });
      if (!chunks || chunks.length === 0) continue;

      await enqueueReplay(supabaseAdmin, rec, chunks, (rec as any).output_object_key);
      results.push({ recording_id: rec.id, action: 'late_enqueued' });
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 4: Keep-alive ping to live-token
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      await fetch(`${supabaseUrl}/functions/v1/live-token`, {
        method: 'OPTIONS',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch { /* non-critical */ }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 5: Cleanup old live_messages (> 7 days)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    let messagesDeleted = 0;
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: oldSessions } = await supabaseAdmin
        .from('live_sessions')
        .select('id')
        .eq('status', 'ended')
        .lt('ended_at', sevenDaysAgo)
        .limit(50);

      if (oldSessions && oldSessions.length > 0) {
        const sessionIds = oldSessions.map((s: any) => s.id);
        const { count } = await supabaseAdmin
          .from('live_messages')
          .delete({ count: 'exact' })
          .in('session_id', sessionIds);
        messagesDeleted = count || 0;
        if (messagesDeleted > 0) {
          console.log(`[auto-finalize] Cleaned ${messagesDeleted} old live_messages`);
        }
      }
    } catch (cleanErr: any) {
      console.warn('[auto-finalize] Message cleanup error:', cleanErr.message);
    }

    return new Response(JSON.stringify({
      processed: results.length,
      results,
      stuck_sessions_closed: stuckLiveSessions?.length || 0,
      stuck_assembling_reset: stuckAssembling?.length || 0,
      messages_cleaned: messagesDeleted,
      timestamp: nowIso,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('auto-finalize-recordings error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
````

## supabase/migrations/20260505010000_live_replay_debug_state.sql

``sql
ALTER TABLE public.live_replays
  ADD COLUMN IF NOT EXISTS webhook_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_event text,
  ADD COLUMN IF NOT EXISTS last_cf_status text,
  ADD COLUMN IF NOT EXISTS last_cf_response jsonb,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_live_replays_webhook_received
  ON public.live_replays(webhook_received_at DESC)
  WHERE webhook_received_at IS NOT NULL;
````

## supabase/migrations/20260504010000_cloudflare_stream_live_replays.sql

``sql
-- Cloudflare Stream production replay pipeline for livestream VODs.

DO $$
BEGIN
  CREATE TYPE public.live_replay_status AS ENUM (
    'uploading',
    'queued',
    'processing',
    'ready',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.live_replays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  live_session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  chunked_recording_id UUID REFERENCES public.chunked_recordings(id) ON DELETE SET NULL,
  source_webm_key TEXT,
  stream_uid TEXT UNIQUE,
  playback_hls TEXT,
  playback_dash TEXT,
  playback_mp4 TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  filesize_bytes BIGINT,
  status public.live_replay_status NOT NULL DEFAULT 'uploading',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_live_replays_user_created
  ON public.live_replays(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_replays_live_session
  ON public.live_replays(live_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_replays_chunked_recording
  ON public.live_replays(chunked_recording_id);
CREATE INDEX IF NOT EXISTS idx_live_replays_status
  ON public.live_replays(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_live_replays_stream_uid
  ON public.live_replays(stream_uid)
  WHERE stream_uid IS NOT NULL;

DROP TRIGGER IF EXISTS update_live_replays_updated_at ON public.live_replays;
CREATE TRIGGER update_live_replays_updated_at
BEFORE UPDATE ON public.live_replays
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.live_replays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own live replays" ON public.live_replays;
CREATE POLICY "Users can view own live replays"
  ON public.live_replays FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can view ready live replays" ON public.live_replays;
CREATE POLICY "Public can view ready live replays"
  ON public.live_replays FOR SELECT
  TO anon, authenticated
  USING (status = 'ready');

DROP POLICY IF EXISTS "Users can update own uploading live replays" ON public.live_replays;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.live_replays;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
````

## supabase/functions/admin-replay-debug/index.ts

``ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';

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

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

function accountId(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
}

async function requireAdmin(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, admin, user };
}

async function invokeFunction(name: string): Promise<Record<string, unknown>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (cronSecret) headers['X-Cron-Secret'] = cronSecret;
  const resp = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  const data = await resp.json().catch(() => null);
  return { httpStatus: resp.status, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const guard = await requireAdmin(req.headers.get('Authorization'));
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin;

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'list';
  const replayId = body.replay_id || body.replayId;

  try {
    if (action === 'list') {
      const { data, error } = await (admin as any)
        .from('live_replays')
        .select(`
          id, live_session_id, chunked_recording_id, user_id, stream_uid, status,
          tus_offset, next_chunk_seq, total_chunks_for_ingest, ingest_attempts,
          last_ingest_at, webhook_received_at, playback_hls, thumbnail_url,
          duration_seconds, error_message, last_error_at, last_webhook_event,
          last_cf_status, last_cf_response, created_at, updated_at
        `)
        .order('created_at', { ascending: false })
        .limit(Number(body.limit || 50));
      if (error) throw error;
      return json({ ok: true, replays: data || [] });
    }

    if (action === 'retry_upload') {
      if (!replayId) return json({ error: 'Missing replay_id' }, 400);
      const { error } = await (admin as any).from('live_replays').update({
        status: 'queued',
        error_message: null,
        last_error_at: null,
        last_cf_status: 'manual_retry_upload',
        last_cf_response: { by: guard.user.id, at: new Date().toISOString() },
      }).eq('id', replayId);
      if (error) throw error;
      const invoked = await invokeFunction('live-replay-stream-ingest');
      return json({ ok: true, invoked });
    }

    if (action === 'retry_webhook_sync' || action === 'force_status_refresh') {
      const invoked = await invokeFunction('live-replay-poll-status');
      return json({ ok: true, invoked });
    }

    if (action === 'test_cloudflare_api') {
      const id = accountId();
      const token = streamToken();
      if (!id || !token) return json({ ok: false, error: 'Missing Cloudflare Stream config' }, 500);
      const listResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream?per_page=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listResp.json().catch(() => null);
      const webhookResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream/webhook`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const webhookData = await webhookResp.json().catch(() => null);
      return json({
        ok: !!listData?.success,
        stream: { httpStatus: listResp.status, success: listData?.success, errors: listData?.errors || [] },
        webhook: { httpStatus: webhookResp.status, success: webhookData?.success, result: webhookData?.result || null, errors: webhookData?.errors || [] },
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('admin-replay-debug error:', error);
    return json({ error: message }, 500);
  }
});
````

## src/pages/AdminReplayDebug.tsx

``tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Satellite, Shield, TestTube2 } from "lucide-react";
import { FacebookNavbar } from "@/components/layout/FacebookNavbar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminRole } from "@/hooks/useAdminRole";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type ReplayDebugRow = {
  id: string;
  live_session_id: string;
  chunked_recording_id: string | null;
  stream_uid: string | null;
  status: string;
  tus_offset: number;
  next_chunk_seq: number;
  total_chunks_for_ingest: number | null;
  ingest_attempts: number;
  last_ingest_at: string | null;
  webhook_received_at: string | null;
  playback_hls: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  last_error_at: string | null;
  last_webhook_event: string | null;
  last_cf_status: string | null;
  last_cf_response: unknown;
  created_at: string;
  updated_at: string;
};

const statusClass: Record<string, string> = {
  ready: "bg-emerald-500 text-white",
  processing: "bg-blue-500 text-white",
  uploading: "bg-amber-500 text-white",
  queued: "bg-slate-500 text-white",
  failed: "bg-destructive text-destructive-foreground",
};

async function callDebug(action: string, replayId?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Admin session required");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-replay-debug`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, replay_id: replayId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function shortId(id: string | null | undefined) {
  return id ? `${id.slice(0, 8)}...${id.slice(-4)}` : "-";
}

function fmtDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function AdminReplayDebug() {
  const navigate = useNavigate();
  const { isAdmin, isLoading } = useAdminRole();
  const [rows, setRows] = useState<ReplayDebugRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [cfResult, setCfResult] = useState<unknown>(null);

  useEffect(() => {
    if (!isLoading && !isAdmin) {
      toast.error("Báº¡n khÃ´ng cÃ³ quyá»n truy cáº­p trang nÃ y");
      navigate("/");
    }
  }, [isAdmin, isLoading, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callDebug("list");
      setRows(data.replays || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "KhÃ´ng táº£i Ä‘Æ°á»£c replay debug");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const stats = useMemo(() => ({
    total: rows.length,
    ready: rows.filter((r) => r.status === "ready").length,
    active: rows.filter((r) => ["queued", "uploading", "processing"].includes(r.status)).length,
    failed: rows.filter((r) => r.status === "failed").length,
  }), [rows]);

  const runAction = async (action: string, replayId?: string) => {
    setBusyAction(`${action}:${replayId || "global"}`);
    try {
      const data = await callDebug(action, replayId);
      if (action === "test_cloudflare_api") setCfResult(data);
      toast.success("ÄÃ£ cháº¡y thao tÃ¡c debug");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Thao tÃ¡c tháº¥t báº¡i");
    } finally {
      setBusyAction(null);
    }
  };

  if (isLoading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <div className="mx-auto max-w-7xl px-4 py-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-primary rounded-lg text-primary-foreground">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Replay Debug</h1>
                <p className="text-sm text-muted-foreground">Cloudflare Stream ingest, webhook, and HLS readiness</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                Refresh
              </Button>
              <Button variant="outline" onClick={() => runAction("force_status_refresh")} disabled={!!busyAction}>
                <Satellite className="mr-2 h-4 w-4" />
                Force status refresh
              </Button>
              <Button onClick={() => runAction("test_cloudflare_api")} disabled={!!busyAction}>
                <TestTube2 className="mr-2 h-4 w-4" />
                Test Cloudflare API
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(stats).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <div className="text-xs uppercase text-muted-foreground">{label}</div>
                  <div className="text-2xl font-semibold">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {cfResult !== null && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cloudflare API Result</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(cfResult, null, 2)}</pre>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Replays</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Replay</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Stream UID</TableHead>
                    <TableHead>TUS</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>Playback</TableHead>
                    <TableHead>Last Error</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="min-w-48">
                        <div className="font-mono text-xs">{shortId(row.id)}</div>
                        <div className="text-xs text-muted-foreground">{fmtDate(row.created_at)}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusClass[row.status] || ""}>{row.status}</Badge>
                        <div className="mt-1 text-xs text-muted-foreground">{row.last_cf_status || "-"}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{shortId(row.stream_uid)}</TableCell>
                      <TableCell className="text-xs">
                        <div>offset: {Number(row.tus_offset || 0).toLocaleString()}</div>
                        <div>next seq: {row.next_chunk_seq} / {row.total_chunks_for_ingest ?? "-"}</div>
                        <div>attempts: {row.ingest_attempts}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{row.last_webhook_event || "-"}</div>
                        <div className="text-muted-foreground">{fmtDate(row.webhook_received_at)}</div>
                      </TableCell>
                      <TableCell className="max-w-64 text-xs">
                        <div className="truncate" title={row.playback_hls || ""}>HLS: {row.playback_hls || "-"}</div>
                        <div className="truncate" title={row.thumbnail_url || ""}>Thumb: {row.thumbnail_url || "-"}</div>
                      </TableCell>
                      <TableCell className="max-w-64 text-xs">
                        <div className="line-clamp-3">{row.error_message || "-"}</div>
                        <div className="text-muted-foreground">{fmtDate(row.last_error_at)}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => runAction("retry_upload", row.id)}
                            disabled={!!busyAction}
                          >
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                            Upload
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => runAction("retry_webhook_sync", row.id)}
                            disabled={!!busyAction}
                          >
                            Sync
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                        No replay records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
````

## src/App.tsx

``tsx
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ensureAutoplay, registerAudioElement } from '@/lib/globalAudio';
import ScrollToTop from "./components/ScrollToTop";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { LawOfLightGuard } from "@/components/auth/LawOfLightGuard";
import { ConditionalWeb3Provider } from "@/components/providers/ConditionalWeb3Provider";
import { DonationReceivedNotification } from "@/components/donations/DonationReceivedNotification";
import { RewardAdjustmentNotification } from "@/components/notifications/RewardAdjustmentNotification";
import { EpochClaimCelebration } from "@/components/notifications/EpochClaimCelebration";
import { CallProvider } from "@/contexts/CallContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { UpdateNotification } from "@/components/UpdateNotification";
import { InstallBanner } from "@/components/install/InstallBanner";
import { usePendingDonationRecovery } from "@/hooks/usePendingDonationRecovery";
import { useNewMemberWelcome } from "@/hooks/useNewMemberWelcome";

// Lazy load ALL pages for code splitting (Phase 4 â€” A1)
const Feed = lazy(() => import("./pages/Feed"));
const Wallet = lazy(() => import("./pages/Wallet"));
const Auth = lazy(() => import("./pages/Auth"));
const Friends = lazy(() => import("./pages/Friends"));
const Profile = lazy(() => import("./pages/Profile"));
const Post = lazy(() => import("./pages/Post"));
const About = lazy(() => import("./pages/About"));
const Leaderboard = lazy(() => import("./pages/Leaderboard"));
const AdminMigration = lazy(() => import("./pages/AdminMigration"));
const Admin = lazy(() => import("./pages/Admin"));
const AdminReplayDebug = lazy(() => import("./pages/AdminReplayDebug"));
const FounderDashboard = lazy(() => import("./pages/FounderDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));
const LawOfLight = lazy(() => import("./pages/LawOfLight"));
const Notifications = lazy(() => import("./pages/Notifications"));
const DocsRouter = lazy(() => import("./pages/DocsRouter"));
const ConnectedApps = lazy(() => import("./pages/ConnectedApps"));
const SetPassword = lazy(() => import("./pages/SetPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Chat = lazy(() => import("./pages/Chat"));
const Install = lazy(() => import("./pages/Install"));
const SecuritySettings = lazy(() => import("./pages/SecuritySettings"));
const Settings = lazy(() => import("./pages/Settings"));
const Benefactors = lazy(() => import("./pages/Benefactors"));
const Donations = lazy(() => import("./pages/Donations"));
const Users = lazy(() => import("./pages/Users"));
const Reels = lazy(() => import("./pages/Reels"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const IdentityDashboard = lazy(() => import("./pages/identity/IdentityDashboard"));
const IdentityOnboarding = lazy(() => import("./pages/identity/IdentityOnboarding"));
const ConnectorPage = lazy(() => import("./pages/connector/ConnectorPage"));
const ConnectorGivenPage = lazy(() => import("./pages/connector/ConnectorGivenPage"));

const LiveDiscoveryPage = lazy(() => import("./pages/LiveDiscoveryPage"));
const LiveHostPage = lazy(() => import("./modules/live/pages/LiveHostPage").then(m => ({ default: m.default })));
const LiveAudiencePage = lazy(() => import("./modules/live/pages/LiveAudiencePage").then(m => ({ default: m.default })));
const PreLivePage = lazy(() => import("./modules/live/pages/PreLivePage"));

const CHUNK_RELOAD_KEY = 'fun_profile_chunk_reload_at';
const CHUNK_RELOAD_COOLDOWN_MS = 15000;

function getChunkErrorMessage(reason: unknown) {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === 'string') return reason;
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    const message = (reason as { message?: unknown }).message;
    return typeof message === 'string' ? message : String(message ?? '');
  }
  return '';
}

function isDynamicImportError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('failed to fetch dynamically imported module') ||
    normalized.includes('importing a module script failed') ||
    normalized.includes('failed to load module script') ||
    normalized.includes('error loading dynamically imported module')
  );
}

function showChunkReloadToast() {
  import('sonner').then(({ toast }) => {
    toast.error('CÃ³ lá»—i táº£i tÃ i nguyÃªn', {
      description: 'Báº¥m Ä‘á»ƒ táº£i láº¡i trang khi báº¡n sáºµn sÃ ng.',
      duration: Infinity,
      action: {
        label: 'Táº£i láº¡i',
        onClick: () => window.location.reload(),
      },
    });
  }).catch(() => {});
}

function ChunkLoadRecovery() {
  useEffect(() => {
    const recover = (reason: unknown) => {
      const message = getChunkErrorMessage(reason);
      if (!isDynamicImportError(message)) return;

      const lastRecoveryAt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? '0');
      if (lastRecoveryAt && Date.now() - lastRecoveryAt < CHUNK_RELOAD_COOLDOWN_MS) {
        return;
      }

      sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
      showChunkReloadToast();
    };

    const handleError = (event: ErrorEvent) => recover(event.error ?? event.message);
    const handleRejection = (event: PromiseRejectionEvent) => recover(event.reason);

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}

function AuthSessionKeeper() {
  return null;
}

function PendingDonationRecovery() {
  usePendingDonationRecovery();
  return null;
}

function NewMemberWelcome() {
  useNewMemberWelcome();
  return null;
}

const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="flex flex-col items-center gap-4 animate-fade-in">
      <div className="w-10 h-10 md:w-12 md:h-12 border-3 md:border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Äang táº£i...</p>
    </div>
  </div>
);

/**
 * Phase 4 â€” A7: Defer audio loading.
 * Chá»‰ mount tháº» <audio> sau khi user tÆ°Æ¡ng tÃ¡c láº§n Ä‘áº§u (click/touch/keydown).
 * TrÆ°á»›c Ä‘Ã³: khÃ´ng táº£i file MP3 â†’ tiáº¿t kiá»‡m bÄƒng thÃ´ng + tÄƒng tá»‘c FCP.
 */
function GlobalAudioBootstrap() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed) return;
    const arm = () => {
      setArmed(true);
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('touchstart', arm);
    };
    window.addEventListener('pointerdown', arm, { once: true, passive: true });
    window.addEventListener('keydown', arm, { once: true });
    window.addEventListener('touchstart', arm, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
      window.removeEventListener('touchstart', arm);
    };
  }, [armed]);

  useEffect(() => {
    if (!armed) return;
    registerAudioElement(audioRef.current);
    ensureAutoplay();
  }, [armed]);

  if (!armed) return null;

  return (
    <audio
      ref={audioRef}
      src="/sounds/light-economy-anthem.mp3"
      autoPlay
      loop
      preload="metadata"
      playsInline
      className="hidden"
      aria-hidden="true"
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <GlobalAudioBootstrap />
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <ChunkLoadRecovery />
            <AuthSessionKeeper />
            <BrowserRouter>
              <ConditionalWeb3Provider>
                <ScrollToTop />
                <PendingDonationRecovery />
                <NewMemberWelcome />
                <CallProvider>
                  <Suspense fallback={<PageLoader />}>
                    <LawOfLightGuard>
                      <Routes>
                        <Route path="/begin" element={<Navigate to="/law-of-light" replace />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/set-password" element={<SetPassword />} />
                        <Route path="/reset-password" element={<ResetPassword />} />
                        <Route path="/verify-email" element={<VerifyEmail />} />
                        <Route path="/auth/callback" element={<AuthCallback />} />
                        <Route path="/law-of-light" element={<LawOfLight />} />
                        <Route path="/" element={<Feed />} />
                        <Route path="/friends" element={<Friends />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/profile/:userId" element={<Profile />} />
                        <Route path="/profile/connected-apps" element={<ConnectedApps />} />
                        <Route path="/@:username" element={<Profile />} />
                        <Route path="/wallet/*" element={<Wallet />} />
                        <Route path="/post/:postId" element={<Post />} />
                        <Route path="/:username/post/:slug" element={<Post />} />
                        <Route path="/about" element={<About />} />
                        <Route path="/leaderboard" element={<Leaderboard />} />
                        <Route path="/admin/migration" element={<AdminMigration />} />
                        <Route path="/admin/replay-debug" element={<AdminReplayDebug />} />
                        <Route path="/admin" element={<Admin />} />
                        <Route path="/founder" element={<FounderDashboard />} />
                        <Route path="/notifications" element={<Notifications />} />
                        <Route path="/chat" element={<Chat />} />
                        <Route path="/chat/:conversationId" element={<Chat />} />
                        <Route path="/identity" element={<IdentityDashboard />} />
                        <Route path="/identity/onboarding" element={<IdentityOnboarding />} />
                        <Route path="/connector" element={<ConnectorPage />} />
                        <Route path="/connector/given" element={<ConnectorGivenPage />} />
                        <Route path="/docs/*" element={<DocsRouter />} />
                        <Route path="/install" element={<Install />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/settings/:tab" element={<Settings />} />
                        <Route path="/benefactors" element={<Benefactors />} />
                        <Route path="/donations" element={<Donations />} />
                        <Route path="/users" element={<Users />} />
                        <Route path="/reels" element={<Reels />} />
                        <Route path="/reels/:reelId" element={<Reels />} />
                        <Route path="/:username/video/:slug" element={<Reels />} />
                        <Route path="/mint" element={<Navigate to="/wallet/fun_money" replace />} />
                        <Route path="/live" element={<LiveDiscoveryPage />} />
                        <Route path="/live/setup" element={<PreLivePage />} />
                        <Route path="/live/new" element={<LiveHostPage />} />
                        <Route path="/live/stream" element={<Navigate to="/live/new" replace />} />
                        <Route path="/live/:liveSessionId" element={<LiveAudiencePage />} />
                        <Route path="/live/:liveSessionId/host" element={<LiveHostPage />} />
                        <Route path="/:username/live/:slug" element={<LiveAudiencePage />} />
                        <Route path="/:username" element={<Profile />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </LawOfLightGuard>
                    <DonationReceivedNotification />
                    <RewardAdjustmentNotification />
                    <EpochClaimCelebration />
                    <UpdateNotification />
                    <InstallBanner />
                  </Suspense>
                </CallProvider>
              </ConditionalWeb3Provider>
            </BrowserRouter>
          </TooltipProvider>
        </QueryClientProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
````

## src/hooks/live/useLiveRecording.ts

``ts
import { useRef, useState, useCallback, useEffect } from 'react';
import type { ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';
import { createChunkedRecorder, type ChunkedRecorderController } from '@/modules/live/recording/chunkedRecorder';
import { createChunkUploadQueue, type ChunkUploadQueueController } from '@/modules/live/recording/chunkUploadQueue';
import {
  finalizeLiveChunks,
  ingestLiveReplayFromR2,
  uploadLiveChunk,
  waitForLiveReplayReady,
  type LiveReplayRow,
} from '@/modules/live/liveService';
import { initRecoverySession, saveChunkBlob, saveChunkKey, clearRecovery } from '@/modules/live/recording/crashRecovery';
import { STREAM_REPLAY_MIME_TYPE } from '@/modules/live/recording/finalizeWebm';

export type RecordingPhase = 'idle' | 'recording' | 'stopping' | 'uploading' | 'queued' | 'processing' | 'done' | 'error';

export interface FinalizeReplayResult {
  manifestUrl?: string;
  totalChunks: number;
  replayId?: string;
  streamUid?: string | null;
  playbackHls?: string | null;
  thumbnailUrl?: string | null;
  status: 'queued' | 'processing' | 'ready' | 'failed';
}

export interface FinalizeReplayOptions {
  waitForReady?: boolean;
}

interface UseLiveRecordingOptions {
  videoTrack: ICameraVideoTrack | null;
  audioTrack: IMicrophoneAudioTrack | null;
  sessionId?: string;
  recordingId?: string;
  autoStart?: boolean;
}

export function useLiveRecording({ videoTrack, audioTrack, sessionId, recordingId, autoStart = true }: UseLiveRecordingOptions) {
  const recorderRef = useRef<ChunkedRecorderController | null>(null);
  const queueRef = useRef<ChunkUploadQueueController | null>(null);
  const chunkKeysRef = useRef<string[]>([]);
  const rawChunksRef = useRef<Blob[]>([]);
  const finalizedBlobRef = useRef<Blob | null>(null);
  const mimeTypeRef = useRef<string>(STREAM_REPLAY_MIME_TYPE);
  const replayRef = useRef<LiveReplayRow | null>(null);
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [chunkCount, setChunkCount] = useState(0);
  const [uploadStats, setUploadStats] = useState({ total: 0, uploaded: 0, failed: 0 });
  const [streamUploadProgress, setStreamUploadProgress] = useState(0);
  const [replay, setReplay] = useState<LiveReplayRow | null>(null);
  const startedRef = useRef(false);

  const start = useCallback(() => {
    if (!videoTrack || !audioTrack || !sessionId || !recordingId || recorderRef.current) return;

    try {
      const videoMediaTrack = videoTrack.getMediaStreamTrack();
      const audioMediaTrack = audioTrack.getMediaStreamTrack();
      if (!videoMediaTrack || !audioMediaTrack) return;

      const stream = new MediaStream([videoMediaTrack, audioMediaTrack]);

      // Init IndexedDB backup
      initRecoverySession(sessionId, STREAM_REPLAY_MIME_TYPE).catch(() => {});

      // Create upload queue â€” now uses presigned URL via Edge Function
      const currentRecordingId = recordingId;
      const queue = createChunkUploadQueue({
        sessionId,
        maxRetries: 3,
        uploadFn: async (chunk) => {
          const key = await uploadLiveChunk(chunk.blob, currentRecordingId, chunk.index, chunk.mimeType);
          chunkKeysRef.current.push(key);
          saveChunkKey(sessionId, key).catch(() => {});
          return key;
        },
        onProgress: (uploaded, total) => {
          setUploadStats({ total, uploaded, failed: 0 });
        },
        onError: (err, chunk) => {
          console.error(`[useLiveRecording] chunk #${chunk.index} upload failed:`, err);
          setUploadStats(prev => ({ ...prev, failed: prev.failed + 1 }));
        },
      });
      queueRef.current = queue;

      const recorder = createChunkedRecorder({
        stream,
        chunkDurationMs: 2000,
        onChunk: (chunk) => {
          setChunkCount((c) => c + 1);
          mimeTypeRef.current = chunk.mimeType;
          rawChunksRef.current.push(chunk.blob);
          saveChunkBlob(sessionId, chunk.blob).catch(() => {});
          queue.enqueue(chunk);
        },
        onError: (err) => {
          console.error('[useLiveRecording] recorder error:', err);
        },
        mimeType: STREAM_REPLAY_MIME_TYPE,
      });

      recorder.start();
      recorderRef.current = recorder;
      setPhase('recording');
    } catch (err) {
      console.error('[useLiveRecording] failed to start:', err);
      setPhase('error');
    }
  }, [videoTrack, audioTrack, sessionId, recordingId]);

  const stop = useCallback(async (): Promise<{ blob: Blob; mimeType: string } | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    setPhase('stopping');
    try {
      const blob = await recorder.stop();
      const mimeType = recorder.getMimeType();
      recorderRef.current = null;
      setPhase('idle');
      return { blob, mimeType };
    } catch (err) {
      console.error('[useLiveRecording] stop error:', err);
      setPhase('error');
      return null;
    }
  }, []);

  const finalize = useCallback(async (options: FinalizeReplayOptions = {}): Promise<FinalizeReplayResult | null> => {
    const queue = queueRef.current;
    if (!queue || !recordingId || !sessionId) return null;

    setPhase('uploading');
    try {
      if (recorderRef.current?.getState() === 'recording') {
        await stop();
      }
      await queue.flush();

      // Step 1: R2 manifest (backup playback path) â€” best effort
      let manifest: { manifestUrl: string; totalChunks: number } = { manifestUrl: '', totalChunks: 0 };
      try {
        manifest = await finalizeLiveChunks(recordingId, sessionId);
      } catch (e) {
        console.warn('[useLiveRecording] R2 finalize failed (non-fatal):', e);
      }

      // Step 2: Server-side ingest â€” Cloudflare Stream tá»± kÃ©o file tá»« R2.
      // KHÃ”NG cÃ²n upload láº¡i file WebM tá»« trÃ¬nh duyá»‡t â†’ nhanh nhÆ° Facebook.
      console.log('[useLiveRecording] Triggering server-side ingest from R2...');
      setStreamUploadProgress(100);
      const ingest = await ingestLiveReplayFromR2(sessionId, recordingId);
      console.log('[useLiveRecording] Stream ingest accepted:', ingest);
      setPhase(ingest.status === 'queued' ? 'queued' : 'processing');

      if (options.waitForReady) {
        const readyReplay = await waitForLiveReplayReady(ingest.replay_id);
        replayRef.current = readyReplay;
        setReplay(readyReplay);
        await clearRecovery(sessionId).catch(() => {});
        setPhase('done');
        return {
          manifestUrl: manifest.manifestUrl,
          totalChunks: manifest.totalChunks,
          replayId: readyReplay.id,
          streamUid: readyReplay.stream_uid || ingest.stream_uid,
          playbackHls: readyReplay.playback_hls,
          thumbnailUrl: readyReplay.thumbnail_url,
          status: 'ready',
        };
      }

      // Background watcher â€” UI Ä‘Ã£ trá»Ÿ vá» feed, khÃ´ng chá»
      const channel = supabase
        .channel(`live-replay-watch-${ingest.replay_id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_replays',
          filter: `id=eq.${ingest.replay_id}`,
        }, (payload: { new: LiveReplayRow }) => {
          replayRef.current = payload.new;
          setReplay(payload.new);
          if (payload.new.status === 'ready') {
            setPhase('done');
            clearRecovery(sessionId).catch(() => {});
            supabase.removeChannel(channel);
          } else if (payload.new.status === 'failed') {
            setPhase('error');
            supabase.removeChannel(channel);
          }
        })
        .subscribe();

      return {
        manifestUrl: manifest.manifestUrl,
        totalChunks: manifest.totalChunks,
        replayId: ingest.replay_id,
        streamUid: ingest.stream_uid,
        status: ingest.status === 'queued' ? 'queued' : 'processing',
      };
    } catch (err) {
      console.error('[useLiveRecording] finalize error:', err);
      setPhase('error');
      return null;
    }
  }, [recordingId, sessionId, stop]);

  // Auto-start when tracks are ready
  useEffect(() => {
    if (autoStart && videoTrack && audioTrack && sessionId && recordingId && !startedRef.current && phase === 'idle') {
      startedRef.current = true;
      const timer = setTimeout(() => start(), 1000);
      return () => clearTimeout(timer);
    }
  }, [autoStart, videoTrack, audioTrack, sessionId, recordingId, phase, start]);

  // beforeunload warning while recording
  useEffect(() => {
    if (phase !== 'recording') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  // Cleanup on unmount â€” stop recorder + flush queue (best-effort)
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.getState() === 'recording') {
        recorderRef.current.stop().catch(() => {});
      }
      // Flush remaining chunks to R2 (non-blocking, auto-finalize will handle manifest)
      if (queueRef.current) {
        queueRef.current.flush().catch(() => {});
      }
    };
  }, []);

  return {
    phase,
    setPhase,
    chunkCount,
    uploadStats,
    streamUploadProgress,
    replay,
    start,
    stop,
    finalize,
  };
}
````

## src/hooks/live/useLiveReplayStatus.ts

``ts
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveReplayOverride {
  playback_hls?: string;
  thumbnail_url?: string;
  stream_uid?: string;
  playback_type?: 'cloudflare_stream';
}

/**
 * Subscribe + hydrate `live_replays` Ä‘á»ƒ frontend tá»± nÃ¢ng cáº¥p
 * tá»« chunked manifest sang HLS HD ngay khi Cloudflare Stream encode xong.
 *
 * - Chá»‰ cháº¡y khi enabled (post.post_type === 'live' vÃ  chÆ°a cÃ³ HLS sáºµn).
 * - One-shot SELECT Ä‘á»ƒ hydrate ngay náº¿u replay Ä‘Ã£ ready tá»« trÆ°á»›c.
 * - Realtime channel tá»± cleanup khi nháº­n status='ready'.
 */
export function useLiveReplayStatus(
  liveSessionId: string | undefined | null,
  enabled: boolean,
): LiveReplayOverride | null {
  const [override, setOverride] = useState<LiveReplayOverride | null>(null);

  useEffect(() => {
    if (!enabled || !liveSessionId) return;

    let cancelled = false;

    // Hydrate one-shot
    (async () => {
      const { data } = await (supabase.from('live_replays' as any) as any)
        .select('status, playback_hls, thumbnail_url, stream_uid')
        .eq('live_session_id', liveSessionId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.status === 'ready' && data.playback_hls) {
        setOverride({
          playback_hls: data.playback_hls,
          thumbnail_url: data.thumbnail_url ?? undefined,
          stream_uid: data.stream_uid ?? undefined,
          playback_type: 'cloudflare_stream',
        });
      }
    })();

    // Realtime
    const channel = supabase
      .channel(`live-replay-status-${liveSessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'live_replays',
          filter: `live_session_id=eq.${liveSessionId}`,
        },
        (payload: { new: any }) => {
          const row = payload.new;
          if (row?.status === 'ready' && row?.playback_hls) {
            setOverride({
              playback_hls: row.playback_hls,
              thumbnail_url: row.thumbnail_url ?? undefined,
              stream_uid: row.stream_uid ?? undefined,
              playback_type: 'cloudflare_stream',
            });
            supabase.removeChannel(channel);
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [liveSessionId, enabled]);

  return override;
}
````

## src/modules/live/liveService.ts

``ts
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/utils/r2Upload';
import { toJson, mergeJson } from '@/utils/supabaseJsonHelpers';
import logger from '@/lib/logger';
import type { CreateLiveSessionInput, LiveSession, LivePrivacy, LiveStatus } from './types';
import type { Database } from '@/integrations/supabase/types';

type LiveSessionRow = Database['public']['Tables']['live_sessions']['Row'];
type LiveSessionInsert = Database['public']['Tables']['live_sessions']['Insert'];

export type LiveReplayStatus = 'uploading' | 'queued' | 'processing' | 'ready' | 'failed';

export interface LiveReplayRow {
  id: string;
  user_id: string;
  live_session_id: string;
  chunked_recording_id: string | null;
  source_webm_key: string | null;
  stream_uid: string | null;
  playback_hls: string | null;
  playback_dash: string | null;
  playback_mp4: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  filesize_bytes: number | null;
  status: LiveReplayStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveReplayUploadSession {
  uploadURL: string;
  stream_uid: string | null;
  replay_id: string;
}

const LIVE_POST_DEFAULT_CONTENT = 'Äang LIVE trÃªn FUN Profile';

const buildChannelName = (userId: string) => `live_${userId}_${Date.now()}`;

const uuidToNumericUid = (uuid: string) => {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash) || 10001;
};

interface UploadLiveRecordingResult {
  key: string;
  url: string;
}

export type RecordingStatus =
  | 'idle'
  | 'acquiring'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'compressing'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'stopped';

export interface FinalizeLiveSessionOptions {
  playbackUrl?: string | null;
  recordingStatus?: RecordingStatus;
}

type LivePostMetadata = {
  live_title?: string | null;
  live_status?: 'live' | 'ended';
  channel_name?: string | null;
  agora_channel?: string | null;
  live_session_id?: string | null;
  viewer_count?: number;
  ended_at?: string | null;
  playback_url?: string | null;
  [key: string]: unknown;
};

async function mergeLivePostMetadata(postId: string, patch: Partial<LivePostMetadata>): Promise<void> {
  const { data: existingPost } = await supabase
    .from('posts')
    .select('metadata')
    .eq('id', postId)
    .maybeSingle();

  const merged = mergeJson<LivePostMetadata>(existingPost?.metadata ?? null, patch);

  await supabase
    .from('posts')
    .update({ metadata: merged })
    .eq('id', postId);
}

/** Typed row from live_sessions query with joined profile */
interface LiveSessionQueryRow extends Omit<LiveSessionRow, 'last_worker_response' | 'recording_files'> {
  host_profile?: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

function normalizeLiveSession(row: LiveSessionQueryRow): LiveSession {
  return {
    id: row.id,
    host_user_id: row.host_user_id || row.owner_id,
    agora_channel: row.agora_channel || row.channel_name,
    channel_name: row.channel_name,
    agora_uid_host: row.agora_uid_host ?? null,
    recording_uid: row.recording_uid ?? null,
    recording_status: (row.recording_status as LiveSession['recording_status']) ?? null,
    title: row.title ?? null,
    privacy: row.privacy as LivePrivacy,
    status: row.status as LiveStatus,
    viewer_count: row.viewer_count ?? 0,
    started_at: row.started_at,
    ended_at: row.ended_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    post_id: row.post_id ?? null,
    host_profile: row.host_profile
      ? {
          username: row.host_profile.username ?? null,
          full_name: row.host_profile.full_name ?? null,
          avatar_url: row.host_profile.avatar_url ?? null,
        }
      : null,
  };
}

export async function uploadLiveThumbnail(
  thumbnailBlob: Blob,
  liveSessionId: string
): Promise<string | null> {
  try {
    const path = `live/${liveSessionId}/thumbnail.jpg`;
    const { error } = await supabase.storage
      .from('live-thumbnails')
      .upload(path, thumbnailBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (error) {
      logger.warn('[liveService] uploadLiveThumbnail error:', error);
      return null;
    }
    const { data } = supabase.storage.from('live-thumbnails').getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    logger.warn('[liveService] uploadLiveThumbnail exception:', err);
    return null;
  }
}

export async function attachLiveReplayToPost(
  sessionId: string,
  playbackUrl: string,
  durationSeconds?: number,
  thumbnailUrl?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('attach_live_replay_to_post' as any, {
    _session_id: sessionId,
    _playback_url: playbackUrl,
    _duration_seconds: durationSeconds,
    _thumbnail_url: thumbnailUrl,
  });
  if (error) throw error;
}

export async function createLiveSession(input: CreateLiveSessionInput): Promise<LiveSession> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error('Báº¡n cáº§n Ä‘Äƒng nháº­p Ä‘á»ƒ báº¯t Ä‘áº§u live');
  }

  const userId = session.user.id;
  const hostUid = uuidToNumericUid(userId);
  const title = input.title?.trim() || '';
  const channelName = buildChannelName(userId);
  const visibility = input.privacy === 'friends' ? 'friends' : 'public';

  // â”€â”€ Single Active Host Rule (Facebook-style) â”€â”€
  const { data: oldSessions } = await supabase
    .from('live_sessions')
    .select('id, post_id')
    .eq('host_user_id', userId)
    .eq('status', 'live');

  if (oldSessions && oldSessions.length > 0) {
    const nowIso = new Date().toISOString();
    await supabase
      .from('live_sessions')
      .update({ status: 'ended', ended_at: nowIso, updated_at: nowIso })
      .eq('host_user_id', userId)
      .eq('status', 'live');

    for (const old of oldSessions) {
      if (old.post_id) {
        await mergeLivePostMetadata(old.post_id, { live_status: 'ended', ended_at: nowIso });
      }
    }
  }

  let postId: string | null = null;

  const liveMetadata: LivePostMetadata = {
    live_title: title,
    live_status: 'live',
    channel_name: channelName,
    agora_channel: channelName,
    viewer_count: 0,
  };

  try {
    const { data: post, error: postError } = await supabase
      .from('posts')
      .insert({
        user_id: userId,
        content: title || LIVE_POST_DEFAULT_CONTENT,
        visibility,
        post_type: 'live',
        metadata: toJson(liveMetadata),
      })
      .select('id')
      .single();

    if (postError) throw postError;
    postId = post.id;

    const { data, error } = await supabase
      .from('live_sessions')
      .insert({
        host_user_id: userId,
        owner_id: userId,
        channel_name: channelName,
        agora_channel: channelName,
        agora_uid_host: hostUid,
        title,
        privacy: input.privacy,
        status: 'live',
        recording_status: 'idle',
        post_id: postId,
      } satisfies Partial<LiveSessionInsert>)
      .select(
        `
        id, host_user_id, agora_channel, channel_name, title, privacy, status, viewer_count,
        started_at, ended_at, created_at, updated_at, post_id,
        host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
      `
      )
      .single();

    if (error) throw error;

    const fullMetadata: LivePostMetadata = {
      ...liveMetadata,
      live_session_id: data.id,
    };

    await supabase
      .from('posts')
      .update({ metadata: toJson(fullMetadata) })
      .eq('id', postId);

    notifyFriendsLiveStarted(data.id, postId!).catch((err) =>
      logger.warn('[liveService] notify-live-started failed:', err)
    );

    return normalizeLiveSession(data as unknown as LiveSessionQueryRow);
  } catch (error) {
    if (postId) {
      await supabase.from('posts').delete().eq('id', postId);
    }
    throw error;
  }
}

export async function getLiveSession(sessionId: string): Promise<LiveSession | null> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      `
      id, host_user_id, agora_channel, channel_name, recording_uid, title, privacy, status, viewer_count,
      started_at, ended_at, created_at, updated_at, post_id,
      host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
    `
    )
    .eq('id', sessionId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return normalizeLiveSession(data as unknown as LiveSessionQueryRow);
}

export async function listActiveLiveSessions(): Promise<LiveSession[]> {
  const { data, error } = await supabase
    .from('live_sessions')
    .select(
      `
      id, host_user_id, agora_channel, channel_name, title, privacy, status, viewer_count,
      started_at, ended_at, created_at, updated_at, post_id,
      host_profile:profiles!live_sessions_host_user_id_fkey(username, full_name, avatar_url)
    `
    )
    .eq('status', 'live')
    .order('started_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => normalizeLiveSession(row as unknown as LiveSessionQueryRow));
}

export async function endLiveSession(sessionId: string): Promise<void> {
  await finalizeLiveSession(sessionId, { recordingStatus: 'failed' });
}

export async function finalizeLiveSession(
  sessionId: string,
  options: FinalizeLiveSessionOptions = {}
): Promise<void> {
  const { playbackUrl = null, recordingStatus = playbackUrl ? 'ready' : 'failed' } = options;
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('live_sessions')
    .update({
      status: 'ended',
      ended_at: nowIso,
      recording_status: recordingStatus,
      updated_at: nowIso,
    })
    .eq('id', sessionId)
    .select('id, post_id, title, agora_channel, channel_name, ended_at')
    .single();

  if (error) throw error;

  if (data?.post_id) {
    await mergeLivePostMetadata(data.post_id, {
      live_status: 'ended',
      ended_at: data.ended_at,
      playback_url: playbackUrl,
    });

    if (playbackUrl) {
      await supabase.from('posts')
        .update({ video_url: playbackUrl })
        .eq('id', data.post_id);
    }
  }
}

export async function updateLiveViewerCount(sessionId: string, viewerCount: number): Promise<void> {
  const nextCount = Math.max(0, viewerCount);
  const { data } = await supabase
    .from('live_sessions')
    .update({ viewer_count: nextCount })
    .eq('id', sessionId)
    .select('id, post_id, title, agora_channel, channel_name')
    .maybeSingle();

  if (data?.post_id) {
    const viewerMetadata: LivePostMetadata = {
      live_title: data.title,
      channel_name: data.agora_channel || data.channel_name,
      agora_channel: data.agora_channel || data.channel_name,
      live_status: 'live',
      viewer_count: nextCount,
      live_session_id: data.id,
    };

    await supabase
      .from('posts')
      .update({ metadata: toJson(viewerMetadata) })
      .eq('id', data.post_id);
  }
}

export async function incrementLiveViewerCount(sessionId: string): Promise<void> {
  await supabase.rpc('increment_live_viewer_count' as any, { session_id: sessionId });
}

export async function decrementLiveViewerCount(sessionId: string): Promise<void> {
  await supabase.rpc('decrement_live_viewer_count' as any, { session_id: sessionId });
}

export async function uploadLiveRecording(
  blob: Blob,
  liveSessionId: string,
  mimeType: string,
  onProgress?: (percent: number) => void
): Promise<UploadLiveRecordingResult> {
  const baseMimeType = mimeType.split(';')[0].trim();
  const extension = baseMimeType.includes('webm') ? 'webm' : 'mp4';
  const customPath = `live/${liveSessionId}/recording-${Date.now()}.${extension}`;

  const file = new File([blob], `recording.${extension}`, { type: baseMimeType });

  const result = await uploadToR2(file, 'videos', customPath, undefined, onProgress);

  return { key: result.key, url: result.url };
}

export async function saveLiveReplay(liveSessionId: string, playbackUrl?: string | null): Promise<void> {
  await finalizeLiveSession(liveSessionId, {
    playbackUrl: playbackUrl || null,
    recordingStatus: playbackUrl ? 'ready' : 'failed',
  });
}

// â”€â”€â”€ Chunked Recording: Upload via Edge Function (Presigned URL) â”€â”€â”€â”€â”€

/**
 * Upload a single chunk via presigned URL from r2-signed-chunk-url Edge Function.
 */
export async function uploadLiveChunk(
  blob: Blob,
  recordingId: string,
  chunkIndex: number,
  mimeType: string
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // 1. Get presigned URL from Edge Function
  const presignRes = await fetch(`${supabaseUrl}/functions/v1/r2-signed-chunk-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      recording_id: recordingId,
      seq: chunkIndex,
      contentType: mimeType || 'video/webm',
      fileSize: blob.size,
    }),
  });

  if (!presignRes.ok) {
    const errBody = await presignRes.text().catch(() => 'no body');
    throw new Error(`Presign chunk #${chunkIndex} failed: ${presignRes.status} â€” ${errBody}`);
  }

  const { uploadUrl, objectKey } = await presignRes.json() as { uploadUrl: string; objectKey: string };

  // 2. Upload blob directly to R2 via presigned URL
  const uploadRes = await fetch(uploadUrl, { method: 'PUT', body: blob });
  if (!uploadRes.ok) {
    throw new Error(`Chunk #${chunkIndex} R2 upload failed: ${uploadRes.status}`);
  }

  // 3. Record chunk in DB
  await supabase
    .from('chunked_recording_chunks')
    .insert({
      recording_id: recordingId,
      seq: chunkIndex,
      object_key: objectKey,
      bytes: blob.size,
      status: 'uploaded',
      uploaded_at: new Date().toISOString(),
    });

  // 4. Update last_seq_uploaded
  await supabase
    .from('chunked_recordings')
    .update({ last_seq_uploaded: chunkIndex })
    .eq('id', recordingId);

  logger.debug(`[uploadLiveChunk] #${chunkIndex} âœ“ key=${objectKey}`);
  return objectKey;
}

/**
 * Finalize a chunked recording via recording-finalize Edge Function.
 */
export async function finalizeLiveChunks(
  recordingId: string,
  liveSessionId?: string
): Promise<{ manifestUrl: string; totalChunks: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/recording-finalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ recording_id: recordingId, live_session_id: liveSessionId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Finalize failed' })) as { error?: string };
    throw new Error(err.error || `Finalize failed: ${res.status}`);
  }

  const data = await res.json() as { success: boolean; manifest_url?: string; replay_url?: string; total_chunks: number };
  const url = data.manifest_url || data.replay_url || '';
  return { manifestUrl: url, totalChunks: data.total_chunks };
}

export async function createLiveReplayUpload(
  liveSessionId: string,
  chunkedRecordingId: string,
  expectedSize: number
): Promise<LiveReplayUploadSession> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/live-replay-create-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      live_session_id: liveSessionId,
      chunked_recording_id: chunkedRecordingId,
      expected_size: expectedSize,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Create upload failed' })) as { error?: string };
    throw new Error(err.error || `Create Stream upload failed: ${res.status}`);
  }

  return res.json() as Promise<LiveReplayUploadSession>;
}

export async function uploadReplayToCloudflareStream(
  uploadURL: string,
  blob: Blob,
  filename = 'live-replay.webm',
  onProgress?: (percent: number) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', new File([blob], filename, { type: blob.type || 'video/webm' }));

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Cloudflare Stream upload failed: ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Cloudflare Stream upload network error'));
    xhr.open('POST', uploadURL);
    xhr.send(formData);
  });
}

/**
 * YÃªu cáº§u Cloudflare Stream KÃ‰O file replay tá»« R2 (server-side ingest).
 * KhÃ´ng cáº§n upload láº¡i file WebM tá»« trÃ¬nh duyá»‡t â†’ "End Live" trá»Ÿ vá» tá»©c thÃ¬.
 */
export async function ingestLiveReplayFromR2(
  liveSessionId: string,
  chunkedRecordingId: string,
): Promise<{ replay_id: string; stream_uid: string | null; status: 'processing' | 'ready' | 'queued'; reused?: boolean }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/live-replay-ingest-from-r2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      live_session_id: liveSessionId,
      chunked_recording_id: chunkedRecordingId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Ingest failed' })) as { error?: string };
    throw new Error(err.error || `Ingest from R2 failed: ${res.status}`);
  }

  return res.json() as Promise<{ replay_id: string; stream_uid: string | null; status: 'processing' | 'ready' | 'queued'; reused?: boolean }>;
}

export async function markLiveReplayQueued(replayId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/live-replay-mark-uploaded`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ replay_id: replayId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to mark replay queued' })) as { error?: string };
    throw new Error(err.error || `Failed to mark replay queued: ${res.status}`);
  }
}

export async function waitForLiveReplayReady(
  replayId: string,
  timeoutMs = 20 * 60 * 1000
): Promise<LiveReplayRow> {
  const { data: initial, error: initialErr } = await (supabase.from('live_replays' as any) as any)
    .select('*')
    .eq('id', replayId)
    .maybeSingle();
  if (initialErr) throw initialErr;
  if (initial?.status === 'ready') return initial as LiveReplayRow;
  if (initial?.status === 'failed') throw new Error(initial.error_message || 'Replay processing failed');

  return new Promise<LiveReplayRow>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      supabase.removeChannel(channel);
      reject(new Error('Replay processing timeout'));
    }, timeoutMs);

    const channel = supabase
      .channel(`live-replay-${replayId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'live_replays',
        filter: `id=eq.${replayId}`,
      }, (payload: { new: LiveReplayRow }) => {
        if (payload.new.status === 'ready') {
          window.clearTimeout(timer);
          supabase.removeChannel(channel);
          resolve(payload.new);
        } else if (payload.new.status === 'failed') {
          window.clearTimeout(timer);
          supabase.removeChannel(channel);
          reject(new Error(payload.new.error_message || 'Replay processing failed'));
        }
      })
      .subscribe();
  });
}

/**
 * Create a chunked_recordings row in DB to track the recording session.
 */
export async function createChunkedRecording(
  userId: string,
  liveSessionId: string,
  channelName?: string,
  mimeType: string = 'video/webm;codecs=vp8,opus'
): Promise<string> {
  const { data, error } = await supabase
    .from('chunked_recordings')
    .insert({
      user_id: userId,
      live_session_id: liveSessionId,
      channel_name: channelName,
      mime_type: mimeType,
      status: 'recording',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

// â”€â”€â”€ Notifications â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function notifyFriendsLiveStarted(sessionId: string, postId: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/notify-live-started`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({ session_id: sessionId, post_id: postId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `HTTP ${response.status}`);
  }
}
````

## src/components/feed/FeedVideoPlayer.tsx

``tsx
import { memo, useEffect, useId, useCallback, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { cn } from '@/lib/utils';
import { FacebookVideoPlayer } from '@/components/ui/FacebookVideoPlayer';
import { VideoErrorBoundary } from '@/components/ui/VideoErrorBoundary';
import { videoPlaybackCoordinator } from './videoPlaybackCoordinator';
import { Radio, Download, Play } from 'lucide-react';
import { downloadChunkedVideo } from '@/utils/chunkedVideoDownload';

const ChunkedVideoPlayer = lazy(() =>
  import('@/modules/live/components/ChunkedVideoPlayer').then(mod => ({ default: mod.ChunkedVideoPlayer }))
);
const ReplayPlayer = lazy(() =>
  import('@/components/ui/ReplayPlayer').then(mod => ({ default: mod.ReplayPlayer }))
);

/* R2 URL normalizer */
const R2_DEV_PATTERN = /https:\/\/pub-[a-f0-9]+\.r2\.dev/g;
const R2_CUSTOM_DOMAIN = 'https://media.fun.rich';
function normalizeR2Url(url: string): string {
  return url.replace(R2_DEV_PATTERN, R2_CUSTOM_DOMAIN);
}

function isChunkedManifestUrl(url: string): boolean {
  return url.endsWith('manifest.json') || /\/recordings\/[^/]+\/manifest\.json/.test(url);
}

function isCloudflareStreamHls(url: string): boolean {
  return /(?:cloudflarestream\.com|videodelivery\.net)\/[^/]+\/manifest\/video\.m3u8/.test(url);
}

function isAppleMobileSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const appleMobile = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return appleMobile && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

export interface FeedVideoPlayerProps {
  src: string;
  poster?: string;
  isLiveReplay?: boolean;
  itemId?: string;
  feedId?: string;
  className?: string;
  compact?: boolean;
  onError?: () => void;
}

export const FeedVideoPlayer = memo(({
  src,
  poster,
  isLiveReplay = false,
  itemId,
  feedId,
  className,
  compact = false,
  onError,
}: FeedVideoPlayerProps) => {
  const autoId = useId();
  const coordId = itemId || feedId || autoId;
  const normalizedSrc = useMemo(() => normalizeR2Url(src), [src]);
  const isChunked = isChunkedManifestUrl(normalizedSrc);
  const isCloudflareReplay = isCloudflareStreamHls(normalizedSrc);
  const blockChunkedOnIos = isChunked && isAppleMobileSafari();

  if (import.meta.env.DEV) {
    console.debug(
      `[FeedVideoPlayer] route=${isCloudflareReplay ? 'cloudflare-hls' : isChunked ? 'chunked' : 'generic'} src=${normalizedSrc}`,
    );
  }

  // Lazy mount: only create video element when near viewport
  const containerRef = useRef<HTMLDivElement>(null);
  const [isNearViewport, setIsNearViewport] = useState(false);
  // Debounced version to prevent rapid mount/unmount during fast scroll
  const [debouncedNear, setDebouncedNear] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setIsNearViewport(entry.isIntersecting);
      },
      { rootMargin: '200px' } // reduced from 400px
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // 300ms debounce for viewport detection to avoid jank on fast scroll
  useEffect(() => {
    if (isNearViewport) {
      // Mount immediately when entering viewport
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setDebouncedNear(true);
    } else {
      // Delay unmount by 300ms
      debounceRef.current = setTimeout(() => setDebouncedNear(false), 300);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isNearViewport]);

  // Register with coordinator (only when mounted)
  useEffect(() => {
    if (!debouncedNear) return;
    const el = containerRef.current?.querySelector('video') as HTMLVideoElement | null;
    const pauseFn = () => { el?.pause(); };
    videoPlaybackCoordinator.register(coordId, pauseFn);
    return () => videoPlaybackCoordinator.unregister(coordId);
  }, [coordId, src, debouncedNear]);

  const handlePlayStart = useCallback(() => {
    videoPlaybackCoordinator.requestPlay(coordId);
  }, [coordId]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full aspect-square overflow-hidden rounded-xl bg-black',
        className
      )}
      data-feed-video-id={coordId}
    >
      {/* Layer 1: Blurred backdrop â€” poster img or gradient (NEVER a <video>) */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {poster ? (
          <img
            src={poster}
            alt=""
            className="w-full h-full object-cover blur-2xl opacity-35 scale-110"
            aria-hidden="true"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-900 to-black" aria-hidden="true" />
        )}
      </div>

      {/* Layer 2: Foreground â€” lazy mounted video or static placeholder */}
      <div className="relative z-10 w-full h-full">
        {debouncedNear ? (
          // Near viewport: mount real player
          isCloudflareReplay ? (
            <VideoErrorBoundary>
              <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse" />}>
                <ReplayPlayer
                  src={normalizedSrc}
                  poster={poster}
                  className="w-full h-full"
                  controls
                />
              </Suspense>
            </VideoErrorBoundary>
          ) : blockChunkedOnIos ? (
            <div className="flex h-full w-full items-center justify-center bg-black p-4 text-center text-sm text-white/80">
              Replay Ä‘ang Ä‘Æ°á»£c xá»­ lÃ½ HLS cho Safari.
            </div>
          ) : isChunked ? (
            <VideoErrorBoundary>
              <Suspense fallback={<div className="w-full h-full bg-muted animate-pulse" />}>
                <ChunkedVideoPlayer
                  manifestUrl={normalizedSrc}
                  className="w-full h-full"
                  autoPlay={false}
                  controls
                />
              </Suspense>
            </VideoErrorBoundary>
          ) : (
            <FacebookVideoPlayer
              src={normalizedSrc}
              poster={poster}
              className="w-full h-full"
              compact={compact}
              mutedByDefault
              autoPlayInView
              objectFit="contain"
              onPlayStart={handlePlayStart}
              onError={onError}
            />
          )
        ) : (
          // Off-screen placeholder: poster + play icon (zero video elements)
          <div className="w-full h-full flex items-center justify-center">
            {poster && (
              <img
                src={poster}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
                loading="lazy"
              />
            )}
            <div className="relative z-10 w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
              <Play className="w-7 h-7 text-white fill-white" />
            </div>
          </div>
        )}
      </div>

      {/* LIVE Replay badge + download */}
      {isLiveReplay && (
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-30">
          <div className="flex items-center gap-1.5 bg-destructive/90 text-destructive-foreground px-2.5 py-1 rounded-full text-xs font-bold shadow-lg backdrop-blur-sm">
            <Radio className="w-3.5 h-3.5" />
            LIVE Replay
          </div>
          {isChunked ? (
            <button
              onClick={(e) => { e.stopPropagation(); downloadChunkedVideo(src); }}
              className="pointer-events-auto w-9 h-9 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
              title="Táº£i xuá»‘ng"
            >
              <Download className="w-4 h-4" />
            </button>
          ) : (
            <a
              href={src}
              download
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto w-9 h-9 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
              title="Táº£i xuá»‘ng"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
});

FeedVideoPlayer.displayName = 'FeedVideoPlayer';
````

## src/components/feed/MediaGrid.tsx

``tsx
import { useState, memo, useCallback, useRef, lazy, Suspense } from 'react';
import { ImageViewer } from './ImageViewer';
import { LazyImage } from '@/components/ui/LazyImage';
import { FeedVideoPlayer } from './FeedVideoPlayer';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ChevronLeft, ChevronRight, X, Play, Download, Loader2 } from 'lucide-react';
import { SocialVideoPlayer } from '@/components/ui/SocialVideoPlayer';
import { downloadChunkedVideo } from '@/utils/chunkedVideoDownload';

// Lazy load ChunkedVideoPlayer for gallery
const ChunkedVideoPlayer = lazy(() => import('@/modules/live/components/ChunkedVideoPlayer').then(mod => ({ default: mod.ChunkedVideoPlayer })));
const ReplayPlayer = lazy(() => import('@/components/ui/ReplayPlayer').then(mod => ({ default: mod.ReplayPlayer })));

/** Detect if a URL points to a chunked recording manifest */
function isChunkedManifestUrl(url: string): boolean {
  return url.endsWith('manifest.json') || /\/recordings\/[^/]+\/manifest\.json/.test(url);
}

function isCloudflareStreamHls(url: string): boolean {
  return /(?:cloudflarestream\.com|videodelivery\.net)\/[^/]+\/manifest\/video\.m3u8/.test(url);
}

function isAppleMobileSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const appleMobile = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return appleMobile && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

interface MediaItem {
  url: string;
  type: 'image' | 'video';
  poster?: string;
  isLiveReplay?: boolean;
}

interface MediaGridProps {
  media: MediaItem[];
  feedId?: string;
}

/**
 * Optimized MediaGrid component with lazy loading
 * - Supports up to 80 media items
 * - Gallery viewer for browsing all media
 * - Automatically filters out broken media
 */
export const MediaGrid = memo(({ media: initialMedia, feedId }: MediaGridProps) => {
  const [showViewer, setShowViewer] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [brokenUrls, setBrokenUrls] = useState<Set<string>>(new Set());

  // Filter out broken media
  const media = initialMedia.filter(item => !brokenUrls.has(item.url));

  const handleMediaError = useCallback((url: string) => {
    setBrokenUrls(prev => new Set(prev).add(url));
  }, []);

  if (media.length === 0) return null;

  const remainingCount = media.length - 4;

  const handleClick = (index: number) => {
    setSelectedIndex(index);
    setShowViewer(true);
  };

  const handlePrev = () => {
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : media.length - 1));
  };

  const handleNext = () => {
    setSelectedIndex((prev) => (prev < media.length - 1 ? prev + 1 : 0));
  };

  // Single media
  if (media.length === 1) {
    const item = media[0];
    return (
      <>
        {item.type === 'video' ? (
            <FeedVideoPlayer
              src={item.url}
              poster={item.poster}
              
              isLiveReplay={item.isLiveReplay}
              feedId={feedId}
              onError={() => handleMediaError(item.url)}
            />
        ) : (
          <div 
            className="cursor-pointer"
            onClick={() => handleClick(0)}
          >
            <LazyImage
              src={item.url}
              alt="Post media"
              className="w-full max-h-[600px] bg-black"
              hideOnError
              onLoadError={() => handleMediaError(item.url)}
              transformPreset="post"
            />
          </div>
        )}
        <MediaGalleryViewer
          media={media}
          isOpen={showViewer}
          onClose={() => setShowViewer(false)}
          currentIndex={selectedIndex}
          onPrev={handlePrev}
          onNext={handleNext}
          setIndex={setSelectedIndex}
        />
      </>
    );
  }

  // Two media
  if (media.length === 2) {
    return (
      <>
        <div className="grid grid-cols-2 gap-1">
          {media.map((item, index) => (
            <div key={item.url} className="aspect-square overflow-hidden">
              {item.type === 'video' ? (
                <div onClick={() => handleClick(index)} className="cursor-pointer h-full">
                <FeedVideoPlayer
                    src={item.url}
                    poster={item.poster}
                    isLiveReplay={item.isLiveReplay}
                    feedId={feedId}
                    compact
                    onError={() => handleMediaError(item.url)}
                  />
                </div>
              ) : (
                <div onClick={() => handleClick(index)} className="cursor-pointer h-full">
                  <LazyImage
                    src={item.url}
                    alt={`Media ${index + 1}`}
                    className="w-full h-full hover:opacity-95 transition-opacity"
                    hideOnError
                    onLoadError={() => handleMediaError(item.url)}
                    transformPreset="post-grid"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <MediaGalleryViewer
          media={media}
          isOpen={showViewer}
          onClose={() => setShowViewer(false)}
          currentIndex={selectedIndex}
          onPrev={handlePrev}
          onNext={handleNext}
          setIndex={setSelectedIndex}
        />
      </>
    );
  }

  // Three media - Image 1 on top left, Image 2 on top right, Image 3 on bottom left
  if (media.length === 3) {
    return (
      <>
        <div className="grid grid-cols-2 grid-rows-2 gap-1">
          {/* Image 1 - Top left */}
          <div className="aspect-square overflow-hidden">
            {media[0].type === 'video' ? (
              <div onClick={() => handleClick(0)} className="cursor-pointer h-full">
                <FeedVideoPlayer
                  src={media[0].url}
                  poster={media[0].poster}
                  isLiveReplay={media[0].isLiveReplay}
                  feedId={feedId}
                  compact
                  onError={() => handleMediaError(media[0].url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(0)} className="cursor-pointer h-full">
                <LazyImage
                  src={media[0].url}
                  alt="Media 1"
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={() => handleMediaError(media[0].url)}
                  transformPreset="post-grid"
                />
              </div>
            )}
          </div>
          {/* Image 2 - Top right, spans 2 rows */}
          <div className="row-span-2 aspect-auto overflow-hidden">
            {media[1].type === 'video' ? (
              <div onClick={() => handleClick(1)} className="cursor-pointer h-full">
                <FeedVideoPlayer
                  src={media[1].url}
                  poster={media[1].poster}
                  isLiveReplay={media[1].isLiveReplay}
                  feedId={feedId}
                  compact
                  onError={() => handleMediaError(media[1].url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(1)} className="cursor-pointer h-full">
                <LazyImage
                  src={media[1].url}
                  alt="Media 2"
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={() => handleMediaError(media[1].url)}
                  transformPreset="post-grid"
                />
              </div>
            )}
          </div>
          {/* Image 3 - Bottom left */}
          <div className="aspect-square overflow-hidden">
            {media[2].type === 'video' ? (
              <div onClick={() => handleClick(2)} className="cursor-pointer h-full">
                <FeedVideoPlayer
                  src={media[2].url}
                  poster={media[2].poster}
                  isLiveReplay={media[2].isLiveReplay}
                  feedId={feedId}
                  compact
                  onError={() => handleMediaError(media[2].url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(2)} className="cursor-pointer h-full">
                <LazyImage
                  src={media[2].url}
                  alt="Media 3"
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={() => handleMediaError(media[2].url)}
                  transformPreset="post-grid"
                />
              </div>
            )}
          </div>
        </div>
        <MediaGalleryViewer
          media={media}
          isOpen={showViewer}
          onClose={() => setShowViewer(false)}
          currentIndex={selectedIndex}
          onPrev={handlePrev}
          onNext={handleNext}
          setIndex={setSelectedIndex}
        />
      </>
    );
  }

  // Four or more media
  return (
    <>
      <div className="grid grid-cols-2 gap-1">
        {media.slice(0, 4).map((item, index) => (
          <div 
            key={item.url} 
            className="aspect-square overflow-hidden relative"
          >
            {item.type === 'video' ? (
              <div onClick={() => handleClick(index)} className="cursor-pointer h-full">
                <FeedVideoPlayer
                  src={item.url}
                  poster={item.poster}
                  isLiveReplay={item.isLiveReplay}
                  feedId={feedId}
                  compact
                  onError={() => handleMediaError(item.url)}
                />
              </div>
            ) : (
              <div onClick={() => handleClick(index)} className="cursor-pointer h-full">
                <LazyImage
                  src={item.url}
                  alt={`Media ${index + 1}`}
                  className="w-full h-full hover:opacity-95"
                  hideOnError
                  onLoadError={() => handleMediaError(item.url)}
                  transformPreset="post-grid"
                />
              </div>
            )}
            {index === 3 && remainingCount > 0 && (
              <div 
                className="absolute inset-0 bg-black/60 flex items-center justify-center cursor-pointer"
                onClick={() => handleClick(3)}
              >
                <span className="text-white text-3xl font-bold">+{remainingCount}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <MediaGalleryViewer
        media={media}
        isOpen={showViewer}
        onClose={() => setShowViewer(false)}
        currentIndex={selectedIndex}
        onPrev={handlePrev}
        onNext={handleNext}
        setIndex={setSelectedIndex}
      />
    </>
  );
});

MediaGrid.displayName = 'MediaGrid';

// Gallery viewer component for browsing all media
interface MediaGalleryViewerProps {
  media: MediaItem[];
  isOpen: boolean;
  onClose: () => void;
  currentIndex: number;
  onPrev: () => void;
  onNext: () => void;
  setIndex?: (index: number) => void;
}

const MediaGalleryViewer = memo(({ media, isOpen, onClose, currentIndex, onPrev, onNext, setIndex }: MediaGalleryViewerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!isOpen || media.length === 0) return null;

  const currentMedia = media[currentIndex];

  const handleThumbnailClick = (index: number) => {
    if (setIndex) {
      setIndex(index);
    }
  };

  const skipVideo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + seconds));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none">
        <div className="relative w-full h-[90vh] flex items-center justify-center">
          {/* Close + Download buttons */}
          <div className="absolute top-4 right-4 z-50 flex items-center gap-2">
            {currentMedia.type === 'video' && (
              isChunkedManifestUrl(currentMedia.url) ? (
                <button
                  onClick={() => downloadChunkedVideo(currentMedia.url)}
                  className="w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
                  title="Táº£i xuá»‘ng"
                >
                  <Download className="w-5 h-5" />
                </button>
              ) : (
                <a
                  href={currentMedia.url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
                  title="Táº£i xuá»‘ng"
                >
                  <Download className="w-5 h-5" />
                </a>
              )
            )}
            <button
              onClick={onClose}
              className="w-10 h-10 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Counter */}
          <div className="absolute top-4 left-4 z-50 bg-black/50 px-3 py-1 rounded-full text-white text-sm">
            {currentIndex + 1} / {media.length}
          </div>

          {/* Previous button */}
          {media.length > 1 && (
            <button
              onClick={onPrev}
              className="absolute left-4 z-50 w-12 h-12 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}

          {/* Media content */}
          <div className="max-w-full max-h-full flex items-center justify-center p-4 relative">
            {currentMedia.type === 'video' ? (
              isCloudflareStreamHls(currentMedia.url) ? (
                <Suspense fallback={<div className="w-full h-[85vh] bg-muted animate-pulse" />}>
                  <ReplayPlayer
                    src={currentMedia.url}
                    poster={currentMedia.poster}
                    className="max-w-full max-h-[85vh]"
                    autoPlay
                    controls
                  />
                </Suspense>
              ) : isChunkedManifestUrl(currentMedia.url) && isAppleMobileSafari() ? (
                <div className="flex h-[85vh] max-h-[85vh] w-[80vw] items-center justify-center bg-black p-4 text-center text-sm text-white/80">
                  Replay Ä‘ang Ä‘Æ°á»£c xá»­ lÃ½ HLS cho Safari.
                </div>
              ) : isChunkedManifestUrl(currentMedia.url) ? (
                <Suspense fallback={<div className="w-full h-[85vh] bg-muted animate-pulse" />}>
                  <ChunkedVideoPlayer
                    manifestUrl={currentMedia.url}
                    className="max-w-full max-h-[85vh]"
                    autoPlay
                    controls
                  />
                </Suspense>
              ) : (
                <>
                  <SocialVideoPlayer
                    videoRef={videoRef as React.RefObject<HTMLVideoElement>}
                    showControls
                    className="max-w-full max-h-[85vh]"
                  >
                    <video
                      ref={videoRef}
                      key={currentMedia.url}
                      src={currentMedia.url}
                      autoPlay
                      playsInline
                      className="max-w-full max-h-[85vh] object-contain"
                    />
                  </SocialVideoPlayer>
                </>
              )
            ) : (
              <img
                key={currentMedia.url}
                src={currentMedia.url}
                alt={`Media ${currentIndex + 1}`}
                className="max-w-full max-h-[85vh] object-contain"
              />
            )}
          </div>

          {/* Next button */}
          {media.length > 1 && (
            <button
              onClick={onNext}
              className="absolute right-4 z-50 w-12 h-12 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          )}

          {/* Thumbnail strip for many images */}
          {media.length > 4 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 max-w-[80vw] overflow-x-auto p-2 bg-black/50 rounded-lg">
              {media.map((item, index) => (
                <button
                  key={index}
                  onClick={() => handleThumbnailClick(index)}
                  className={`w-12 h-12 flex-shrink-0 rounded overflow-hidden border-2 transition-all ${
                    index === currentIndex ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                {item.type === 'video' ? (
                    item.poster ? (
                      <img src={item.poster} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                        <Play className="w-4 h-4 text-white/70" />
                      </div>
                    )
                  ) : (
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
});

MediaGalleryViewer.displayName = 'MediaGalleryViewer';
````

## src/components/feed/PostMedia.tsx

``tsx
import { useMemo, useCallback, useRef, memo } from 'react';
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

  const mediaItems = useMemo(() => {
    const items: Array<{ url: string; type: 'image' | 'video'; poster?: string; isLiveReplay?: boolean }> = [];
    const hlsUrl = isLive ? metadata?.playback_hls : undefined;
    const poster = metadata?.thumbnail_url;

    if (post.media_urls && Array.isArray(post.media_urls) && post.media_urls.length > 0) {
      if (isLive) {
        return post.media_urls.map(m => ({
          ...m,
          // Æ¯u tiÃªn HLS Cloudflare khi Ä‘Ã£ ready
          url: m.type === 'video' && hlsUrl ? hlsUrl : m.url,
          isLiveReplay: m.type === 'video',
          poster: m.type === 'video' ? poster : undefined,
        }));
      }
      return post.media_urls;
    }

    if (post.image_url) {
      items.push({ url: post.image_url, type: 'image' as const });
    }
    const videoUrl = isLive && hlsUrl ? hlsUrl : post.video_url;
    if (videoUrl) {
      items.push({ url: videoUrl, type: 'video' as const, poster, isLiveReplay: isLive });
    }
    return items;
  }, [post.media_urls, post.image_url, post.video_url, metadata, isLive]);

  // Live embed for active streams
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
            <span>PhiÃªn live nÃ y khÃ´ng cÃ³ báº£n ghi</span>
          </div>
        ) : (
          <div className="flex items-center justify-center p-6 bg-muted/50 text-muted-foreground text-sm gap-2">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Äang xá»­ lÃ½ báº£n ghi livestream...</span>
          </div>
        )
      ) : null}
      <HeartAnimation show={showHeartAnimation} onComplete={onHeartComplete} />
    </div>
  );
});
````

## src/components/ui/StreamPlayer.tsx

``tsx
import { useEffect, useRef, useState, memo, useCallback } from 'react';
import Hls from 'hls.js';
import { cn } from '@/lib/utils';
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2 } from 'lucide-react';
import { checkVideoStatus, extractStreamUid } from '@/utils/streamUpload';
import { VideoProcessingState } from './VideoProcessingState';
import { VideoErrorState } from './VideoErrorState';
import logger from '@/lib/logger';

interface StreamPlayerProps {
  src: string; // HLS manifest URL, Stream UID, or iframe embed URL
  poster?: string;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
  onError?: (error: Error) => void;
  onReady?: () => void;
  /** Enable status polling for processing videos */
  enableStatusCheck?: boolean;
}

/**
 * Detect video URL type and extract UID if applicable
 */
function parseVideoSource(src: string): { type: 'iframe' | 'hls' | 'direct'; url: string; uid?: string } {
  // iframe.videodelivery.net/{uid}
  if (src.includes('iframe.videodelivery.net')) {
    const match = src.match(/iframe\.videodelivery\.net\/([a-f0-9]+)/i);
    return { type: 'iframe', url: src, uid: match?.[1] };
  }
  
  // cloudflarestream.com/{uid}/manifest/video.m3u8
  if (src.includes('cloudflarestream.com') && src.includes('.m3u8')) {
    return { type: 'hls', url: src };
  }
  
  // videodelivery.net/{uid}/manifest/video.m3u8
  if (src.includes('videodelivery.net') && src.includes('.m3u8')) {
    return { type: 'hls', url: src };
  }
  
  // Just a UID - convert to iframe URL
  if (/^[a-f0-9]{32}$/i.test(src)) {
    return { type: 'iframe', url: `https://iframe.videodelivery.net/${src}`, uid: src };
  }
  
  // R2 or other direct video URLs (including media.fun.rich)
  if (src.includes('.r2.dev') || src.includes('media.fun.rich') || src.includes('.mp4') || src.includes('.webm')) {
    return { type: 'direct', url: src };
  }
  
  // Default: treat as HLS
  return { type: 'hls', url: src };
}

/**
 * HLS Video Player for Cloudflare Stream
 * - Adaptive bitrate streaming
 * - Fallback to native HLS for Safari
 * - Iframe embed support for maximum compatibility
 * - Custom controls
 * - Auto-polling for processing videos
 */
export const StreamPlayer = memo(({
  src,
  poster,
  className,
  autoPlay = false,
  muted = true,
  loop = false,
  controls = true,
  onError,
  onReady,
  enableStatusCheck = true,
}: StreamPlayerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState<number | undefined>(undefined);
  const [isVideoReady, setIsVideoReady] = useState<boolean | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const { type, url, uid } = parseVideoSource(src);
  
  // Generate thumbnail URL from UID
  const thumbnailUrl = uid ? `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=1s` : poster;

  // Determine effective type after fallback
  const effectiveType = useIframeFallback ? 'iframe' : type;

  // Poll video status for processing videos
  const pollVideoStatus = useCallback(async () => {
    const videoUid = uid || extractStreamUid(src);
    if (!videoUid) {
      setIsVideoReady(true);
      return;
    }

    try {
      const status = await checkVideoStatus(videoUid);
      logger.debug('[StreamPlayer] Video status:', status);
      
      if (status.readyToStream) {
        setIsVideoReady(true);
        setIsProcessing(false);
        setHasError(false);
        setErrorCode(undefined);
        setErrorMessage(undefined);
        // Stop polling
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } else {
        setIsVideoReady(false);
        
        // Check for errors (permanent failures)
        if (status.status?.state === 'error') {
          setHasError(true);
          setIsProcessing(false);
          setErrorCode(status.status.errorReasonCode);
          setErrorMessage(status.status.errorReasonText);
          onError?.(new Error(status.status.errorReasonText || 'Video processing failed'));
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        } else {
          // Still processing
          setIsProcessing(true);
          // Parse progress from pctComplete
          if (status.status?.pctComplete) {
            const pct = parseFloat(status.status.pctComplete);
            if (!isNaN(pct)) {
              setProcessingProgress(pct);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[StreamPlayer] Failed to check video status:', err);
      // Don't set error state, just assume ready and let player handle it
      setIsVideoReady(true);
    }
  }, [src, uid, onError]);

  // Start polling when component mounts
  useEffect(() => {
    if (!enableStatusCheck) {
      setIsVideoReady(true);
      return;
    }

    // Check status immediately on mount
    pollVideoStatus();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [enableStatusCheck, pollVideoStatus]);

  // Start/stop polling based on processing state
  useEffect(() => {
    if (isProcessing && !pollingRef.current) {
      logger.debug('[StreamPlayer] Starting status polling...');
      pollingRef.current = setInterval(pollVideoStatus, 5000);
    }
    
    return () => {
      if (pollingRef.current && !isProcessing) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isProcessing, pollVideoStatus]);

  // HLS playback setup - only runs for HLS type
  useEffect(() => {
    // Skip if not HLS type or video not ready
    if (effectiveType !== 'hls' || isVideoReady === false || isProcessing) return;
    
    const video = videoRef.current;
    if (!video || !src) return;

    setIsLoading(true);
    setHasError(false);

    // Check if HLS.js is supported
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1, // Auto quality selection
      });

      hlsRef.current = hls;

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        onReady?.();
        if (autoPlay) {
          video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        }
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.error('[StreamPlayer] Fatal error:', data);
          
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            logger.debug('[StreamPlayer] Falling back to iframe embed');
            setUseIframeFallback(true);
          }
        }
      });

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = url;
      
      const handleMetadata = () => {
        setIsLoading(false);
        onReady?.();
        if (autoPlay) {
          video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        }
      };

      const handleError = () => {
        setUseIframeFallback(true);
      };

      video.addEventListener('loadedmetadata', handleMetadata);
      video.addEventListener('error', handleError);

      return () => {
        video.removeEventListener('loadedmetadata', handleMetadata);
        video.removeEventListener('error', handleError);
      };
    } else {
      // No HLS support - use iframe
      setUseIframeFallback(true);
    }
  }, [src, url, autoPlay, onError, onReady, effectiveType, isVideoReady, isProcessing]);

  // Video play/pause event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  // Control functions
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      video.requestFullscreen?.();
    }
  }, []);

  // --- RENDER SECTION ---
  
  // Show processing UI when video is still being encoded
  if (isProcessing && isVideoReady === false && !hasError) {
    return (
      <VideoProcessingState
        thumbnailUrl={thumbnailUrl}
        progress={processingProgress}
        className={className}
      />
    );
  }

  // Show error UI when video has a permanent error
  if (hasError && errorCode) {
    return (
      <VideoErrorState
        errorCode={errorCode}
        errorMessage={errorMessage}
        thumbnailUrl={thumbnailUrl}
        className={className}
      />
    );
  }

  // For iframe embeds
  if (effectiveType === 'iframe') {
    const iframeUrl = type === 'iframe' ? url : `https://iframe.videodelivery.net/${uid || src}`;
    
    // If video has permanent error, show error state
    if (hasError && errorCode) {
      return (
        <VideoErrorState
          errorCode={errorCode}
          errorMessage={errorMessage}
          thumbnailUrl={thumbnailUrl}
          className={className}
        />
      );
    }
    
    return (
      <div className={cn('relative bg-black aspect-video', className)}>
        <iframe
          src={`${iframeUrl}?${autoPlay ? 'autoplay=true&' : ''}${muted ? 'muted=true&' : ''}${loop ? 'loop=true&' : ''}controls=${controls ? 'true' : 'false'}&preload=auto&poster=${encodeURIComponent(thumbnailUrl || '')}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          onLoad={() => {
            setIsLoading(false);
            setIsProcessing(false);
            onReady?.();
          }}
          onError={() => {
            // Video might be processing, trigger status check
            pollVideoStatus();
          }}
        />
        {isLoading && !isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>
    );
  }

  // For direct videos (R2, mp4, etc.)
  if (effectiveType === 'direct') {
    return (
      <div className={cn('relative bg-black', className)}>
        <video
          src={url}
          poster={poster}
          autoPlay={autoPlay}
          muted={muted}
          loop={loop}
          controls={controls}
          playsInline
          className="w-full h-full object-contain"
          onLoadedData={() => {
            setIsLoading(false);
            onReady?.();
          }}
          onError={() => {
            setHasError(true);
            onError?.(new Error('Video playback error'));
          }}
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>
    );
  }

  // HLS playback - show error state for permanent errors
  if (hasError && errorCode) {
    return (
      <VideoErrorState
        errorCode={errorCode}
        errorMessage={errorMessage}
        thumbnailUrl={thumbnailUrl}
        className={className}
      />
    );
  }

  // HLS playback - show processing state for encoding
  if (hasError && !errorCode) {
    return (
      <VideoProcessingState
        thumbnailUrl={thumbnailUrl}
        progress={processingProgress}
        className={className}
      />
    );
  }

  // HLS video player with custom controls
  return (
    <div 
      className={cn('relative bg-black group', className)}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        muted={muted}
        loop={loop}
        playsInline
        className="w-full h-full object-contain"
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {/* Custom controls */}
      {controls && !isLoading && (
        <div 
          className={cn(
            'absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent transition-opacity',
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
          )}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </button>

            <button
              onClick={toggleMute}
              className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
            >
              {isMuted ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>

            <div className="flex-1" />

            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 flex items-center justify-center text-white hover:text-primary transition-colors"
            >
              <Maximize className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Big play button */}
      {!isPlaying && !isLoading && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
            <Play className="w-8 h-8 text-black ml-1" />
          </div>
        </button>
      )}
    </div>
  );
});

StreamPlayer.displayName = 'StreamPlayer';

export default StreamPlayer;
````

## supabase/functions/live-replay-create-upload/index.ts

``ts
import { createClient } from 'npm:@supabase/supabase-js@2';

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

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = streamToken();
    if (!accountId || !token) return json({ error: 'Missing Cloudflare Stream configuration' }, 500);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { live_session_id, chunked_recording_id, expected_size } = await req.json();
    if (!live_session_id || !chunked_recording_id || typeof expected_size !== 'number' || expected_size <= 0) {
      return json({ error: 'Missing live_session_id, chunked_recording_id, or expected_size' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_banned')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.is_banned) return json({ error: 'Account is banned' }, 403);

    const { data: liveSession, error: sessionErr } = await supabaseAdmin
      .from('live_sessions')
      .select('id, host_user_id, owner_id, post_id, title')
      .eq('id', live_session_id)
      .maybeSingle();
    if (sessionErr || !liveSession) return json({ error: 'Live session not found' }, 404);
    if (liveSession.host_user_id !== user.id && liveSession.owner_id !== user.id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const { data: recording, error: recErr } = await supabaseAdmin
      .from('chunked_recordings')
      .select('id, user_id, live_session_id, output_object_key')
      .eq('id', chunked_recording_id)
      .maybeSingle();
    if (recErr || !recording) return json({ error: 'Recording not found' }, 404);
    if (recording.user_id !== user.id || recording.live_session_id !== live_session_id) {
      return json({ error: 'Forbidden' }, 403);
    }

    const cfResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upload-Creator': user.id.slice(0, 64),
      },
      body: JSON.stringify({
        maxDurationSeconds: 36000,
        requireSignedURLs: false,
        allowedOrigins: ['*'],
        meta: {
          source: 'fun-profile-live-replay',
          userId: user.id,
          liveSessionId: live_session_id,
          chunkedRecordingId: chunked_recording_id,
          title: liveSession.title || 'FUN Profile live replay',
        },
      }),
    });

    if (!cfResp.ok) {
      const detail = await cfResp.text().catch(() => '');
      return json({ error: `Cloudflare direct upload failed: ${cfResp.status}`, detail: detail.slice(0, 500) }, 502);
    }

    const cfData = await cfResp.json();
    const uploadURL = cfData?.result?.uploadURL;
    const streamUid = cfData?.result?.uid;
    if (!uploadURL || !streamUid) return json({ error: 'Invalid Cloudflare direct upload response' }, 502);

    const { data: replay, error: insertErr } = await supabaseAdmin
      .from('live_replays')
      .insert({
        user_id: user.id,
        live_session_id,
        chunked_recording_id,
        source_webm_key: recording.output_object_key || null,
        stream_uid: streamUid,
        filesize_bytes: expected_size,
        status: 'uploading',
      })
      .select('id')
      .single();
    if (insertErr || !replay) return json({ error: insertErr?.message || 'Failed to create replay row' }, 500);

    await supabaseAdmin
      .from('live_sessions')
      .update({ recording_status: 'processing', recording_error: null })
      .eq('id', live_session_id);

    return json({ uploadURL, stream_uid: streamUid, replay_id: replay.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('live-replay-create-upload error:', error);
    return json({ error: message }, 500);
  }
});
````

## supabase/functions/live-replay-mark-uploaded/index.ts

``ts
import { createClient } from 'npm:@supabase/supabase-js@2';

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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const { replay_id } = await req.json();
    if (!replay_id) return json({ error: 'Missing replay_id' }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: replay, error: replayErr } = await supabaseAdmin
      .from('live_replays')
      .select('id, user_id, status, live_session_id')
      .eq('id', replay_id)
      .maybeSingle();
    if (replayErr || !replay) return json({ error: 'Replay not found' }, 404);
    if (replay.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

    await supabaseAdmin
      .from('live_replays')
      .update({ status: 'queued', error_message: null })
      .eq('id', replay_id);

    await supabaseAdmin
      .from('live_sessions')
      .update({ recording_status: 'processing', recording_error: null })
      .eq('id', replay.live_session_id);

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('live-replay-mark-uploaded error:', error);
    return json({ error: message }, 500);
  }
});
````

## supabase/functions/stream-webhook-register/index.ts

``ts
/**
 * stream-webhook-register (admin-only)
 *
 * ÄÄƒng kÃ½ notification URL cho Cloudflare Stream vÃ  tráº£ vá» secret HMAC.
 * Secret nÃ y CHá»ˆ hiá»ƒn thá»‹ 1 láº§n â€” admin pháº£i copy vÃ  cáº­p nháº­t vÃ o
 * `CLOUDFLARE_STREAM_WEBHOOK_SECRET` trong Lovable Cloud.
 *
 * Methods:
 *   POST  -> PUT subscription (set notificationUrl), tráº£ vá» { secret, notificationUrl }
 *   GET   -> Tráº£ vá» subscription hiá»‡n táº¡i (khÃ´ng kÃ¨m secret)
 *   DELETE-> XoÃ¡ subscription
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_TOKEN');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Admin check
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return json({ error: 'Forbidden â€” admin only' }, 403);

    const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = streamToken();
    if (!accountId || !token) return json({ error: 'Missing Cloudflare Stream configuration' }, 500);

    const subUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/webhook`;

    if (req.method === 'GET') {
      const r = await fetch(subUrl, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json().catch(() => null);
      return json({ status: r.status, data });
    }

    if (req.method === 'DELETE') {
      const r = await fetch(subUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json().catch(() => null);
      return json({ status: r.status, data });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const notificationUrl = body.notificationUrl || `${supabaseUrl}/functions/v1/stream-webhook`;

      const r = await fetch(subUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationUrl }),
      });
      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.success) {
        return json({ error: 'Cloudflare PUT failed', status: r.status, detail: data }, 502);
      }

      const secret = data?.result?.secret;
      const savedUrl = data?.result?.notificationUrl;
      return json({
        ok: true,
        notificationUrl: savedUrl,
        secret,
        instruction: 'Copy "secret" vÃ  cáº­p nháº­t vÃ o CLOUDFLARE_STREAM_WEBHOOK_SECRET trong Lovable Cloud secrets. Secret nÃ y chá»‰ hiá»ƒn thá»‹ 1 láº§n!',
      });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stream-webhook-register error:', error);
    return json({ error: message }, 500);
  }
});
````

## supabase/functions/stream-video/index.ts

``ts
import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Stream-side credentials. Prefer dedicated CLOUDFLARE_STREAM_ACCOUNT_ID (account #2).
// Fallback to legacy CLOUDFLARE_ACCOUNT_ID (account #1) for backward compatibility.
const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_STREAM_API_TOKEN = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');

// UTF-8 safe Base64 encoder (btoa only supports Latin1 characters)
function base64EncodeUtf8(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  const chunkSize = 0x8000; // Process in chunks to avoid stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Truncate error text for logging (avoid huge responses)
function truncateErrorText(text: string, maxLen = 500): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...[truncated]' : text;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    // Validate environment
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_STREAM_API_TOKEN) {
      console.error('[stream-video] Missing environment variables');
      return new Response(
        JSON.stringify({ error: 'Missing Cloudflare Stream configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[stream-video] Action:', action);

    // Log request fingerprint for debugging
    const origin = req.headers.get('Origin') || req.headers.get('Referer') || 'unknown';
    console.log('[stream-video] Request origin:', origin);

    // Authenticate user for all actions except health check
    const authHeader = req.headers.get('Authorization');
    
    // Health check can work without auth (but will return limited info)
    if (action === 'health') {
      if (!authHeader) {
        console.log('[stream-video] Health check (no auth)');
        return new Response(
          JSON.stringify({ 
            ok: true, 
            ts: new Date().toISOString(),
            authenticated: false,
            cloudflareConfigured: !!(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_STREAM_API_TOKEN),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // With auth - return user info too
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      
      console.log('[stream-video] Health check (authenticated):', user?.id || 'auth failed');
      
      return new Response(
        JSON.stringify({ 
          ok: true, 
          ts: new Date().toISOString(),
          authenticated: !authError && !!user,
          userId: user?.id,
          cloudflareConfigured: !!(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_STREAM_API_TOKEN),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All other actions require auth
    if (!authHeader) {
      console.error('[stream-video] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Validate user via getUser()
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.error('[stream-video] Auth error:', authError?.message || 'No user');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message || 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log('[stream-video] User:', userId);

    switch (action) {
      // ============================================
      // GET TUS UPLOAD URL - Direct Creator Upload
      // ============================================
      case 'get-tus-upload-url': {
        const { fileSize, fileName, fileType, fileId } = body;
        
        if (!fileSize || fileSize <= 0) {
          return new Response(
            JSON.stringify({ error: 'Invalid file size', details: `fileSize: ${fileSize}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Sanitize filename and log request fingerprint
        const safeName = (fileName || `video_${Date.now()}`).trim().slice(0, 200);
        
        console.log('[stream-video] Creating Direct Creator Upload URL:', {
          fileSize,
          fileName: safeName,
          fileType,
          fileId: fileId || 'not-provided',
          userId,
          origin,
          timestamp: new Date().toISOString(),
        });

        // Build upload metadata with user ID and file ID for tracking
        // Use base64EncodeUtf8 for UTF-8 safe encoding (supports Vietnamese/Unicode filenames)
        const metadata = [
          `maxDurationSeconds ${base64EncodeUtf8('7200')}`,
          `requiresignedurls ${base64EncodeUtf8('false')}`,
          `name ${base64EncodeUtf8(safeName)}`,
        ].join(',');

        // Call Cloudflare Stream API with direct_user=true
        // This returns a Direct Upload URL that the client can use directly
        console.log('[stream-video] Calling Cloudflare API...');
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
              'Tus-Resumable': '1.0.0',
              'Upload-Length': fileSize.toString(),
              'Upload-Metadata': metadata,
            },
          }
        );

        console.log('[stream-video] Cloudflare response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[stream-video] Cloudflare error:', truncateErrorText(errorText));
          return new Response(
            JSON.stringify({ 
              error: `Cloudflare API error: ${response.status}`, 
              details: truncateErrorText(errorText, 300),
              cloudflareStatus: response.status,
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the direct upload URL from Location header
        const uploadUrl = response.headers.get('Location');
        const streamMediaId = response.headers.get('stream-media-id');

        // Validate we got both required values
        if (!uploadUrl) {
          console.error('[stream-video] Missing Location header from Cloudflare');
          return new Response(
            JSON.stringify({ error: 'Cloudflare did not return upload URL (missing Location header)' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!streamMediaId) {
          console.error('[stream-video] Missing stream-media-id header from Cloudflare');
          return new Response(
            JSON.stringify({ error: 'Cloudflare did not return video UID (missing stream-media-id header)' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[stream-video] Got Direct Upload URL:', {
          uploadUrl: uploadUrl.substring(0, 80),
          uid: streamMediaId,
          fileId: fileId || 'not-provided',
        });

        return new Response(JSON.stringify({
          uploadUrl,
          uid: streamMediaId,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // DIRECT UPLOAD URL (for smaller files < 200MB)
      // ============================================
      case 'direct-upload': {
        const maxDurationSeconds = body.maxDurationSeconds || 7200;

        console.log('[stream-video] Creating direct upload URL');

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/direct_upload`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              maxDurationSeconds,
              requireSignedURLs: false,
              allowedOrigins: ['*'],
              meta: {
                userId,
                uploadedAt: new Date().toISOString(),
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[stream-video] Direct upload error:', truncateErrorText(errorText));
          return new Response(
            JSON.stringify({ 
              error: `Failed to create direct upload: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        
        if (!data.result?.uploadURL || !data.result?.uid) {
          console.error('[stream-video] Invalid direct upload response:', data);
          return new Response(
            JSON.stringify({ error: 'Invalid response from Cloudflare direct upload' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log('[stream-video] Direct upload created:', data.result.uid);
        
        return new Response(JSON.stringify({
          uploadUrl: data.result.uploadURL,
          uid: data.result.uid,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // CHECK VIDEO STATUS
      // ============================================
      case 'check-status': {
        const { uid } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({ 
              error: `Failed to check status: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: response.status === 404 ? 404 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        const video = data.result;

        return new Response(JSON.stringify({
          uid: video.uid,
          status: video.status,
          readyToStream: video.readyToStream,
          duration: video.duration,
          thumbnail: video.thumbnail,
          playback: video.playback,
          preview: video.preview,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // GET PLAYBACK URL
      // ============================================
      case 'get-playback-url': {
        const { uid } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({ 
              error: `Failed to get playback URL: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: response.status === 404 ? 404 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        const video = data.result;

        return new Response(JSON.stringify({
          uid: video.uid,
          playback: {
            hls: video.playback?.hls,
            dash: video.playback?.dash,
          },
          thumbnail: video.thumbnail,
          preview: video.preview,
          duration: video.duration,
          readyToStream: video.readyToStream,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // DELETE VIDEO
      // ============================================
      case 'delete': {
        const { uid } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
            },
          }
        );

        if (!response.ok && response.status !== 404) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({ 
              error: `Failed to delete video: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[stream-video] Video deleted:', uid);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // UPDATE VIDEO SETTINGS
      // ============================================
      case 'update-video-settings': {
        const { uid, requireSignedURLs = false, allowedOrigins = ['*'] } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[stream-video] Updating settings for:', uid);

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requireSignedURLs,
              allowedOrigins,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[stream-video] Update settings error:', truncateErrorText(errorText));
          return new Response(
            JSON.stringify({ 
              error: `Failed to update settings: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();

        return new Response(JSON.stringify({
          success: true,
          uid,
          requireSignedURLs: data.result?.requireSignedURLs,
          allowedOrigins: data.result?.allowedOrigins,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[stream-video] Unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, type: 'unhandled' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
````

## supabase/functions/cleanup-orphan-videos/index.ts

``ts
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Stream-side: prefer CLOUDFLARE_STREAM_ACCOUNT_ID (account #2), fallback to legacy CLOUDFLARE_ACCOUNT_ID
const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_STREAM_API_TOKEN = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface StreamVideo {
  uid: string;
  created: string;
  modified: string;
  meta?: {
    name?: string;
  };
  status?: {
    state: string;
  };
}

interface CleanupResult {
  totalVideosOnStream: number;
  totalVideosInDb: number;
  orphanVideosFound: number;
  orphanVideosDeleted: number;
  errors: string[];
  deletedUids: string[];
  dryRun: boolean;
}

// Extract Stream UID from various URL formats
function extractStreamUid(url: string): string | null {
  if (!url) return null;
  
  // Format: https://customer-xxx.cloudflarestream.com/uid/...
  const customerMatch = url.match(/cloudflarestream\.com\/([a-f0-9]{32})/i);
  if (customerMatch) return customerMatch[1];
  
  // Format: https://iframe.videodelivery.net/uid
  const iframeMatch = url.match(/videodelivery\.net\/([a-f0-9]{32})/i);
  if (iframeMatch) return iframeMatch[1];
  
  // Format: https://watch.videodelivery.net/uid
  const watchMatch = url.match(/watch\.videodelivery\.net\/([a-f0-9]{32})/i);
  if (watchMatch) return watchMatch[1];
  
  return null;
}

// List all videos from Cloudflare Stream
async function listAllStreamVideos(): Promise<StreamVideo[]> {
  const allVideos: StreamVideo[] = [];
  let cursor: string | undefined;
  
  do {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream`);
    url.searchParams.set('per_page', '100');
    if (cursor) {
      url.searchParams.set('after', cursor);
    }
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list videos: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    
    if (data.result && Array.isArray(data.result)) {
      allVideos.push(...data.result);
      
      // Get cursor for next page
      if (data.result.length === 100 && data.result_info?.cursor) {
        cursor = data.result_info.cursor;
      } else {
        cursor = undefined;
      }
    } else {
      cursor = undefined;
    }
  } while (cursor);
  
  return allVideos;
}

// Get all video UIDs referenced in the database
async function getDbVideoUids(supabase: any): Promise<Set<string>> {
  const uids = new Set<string>();
  
  // Get video_url from posts
  const { data: postsWithVideo } = await supabase
    .from('posts')
    .select('video_url')
    .not('video_url', 'is', null);
  
  if (postsWithVideo) {
    for (const post of postsWithVideo as { video_url: string }[]) {
      const uid = extractStreamUid(post.video_url);
      if (uid) uids.add(uid);
    }
  }
  
  // Get videos from media_urls in posts
  const { data: postsWithMedia } = await supabase
    .from('posts')
    .select('media_urls')
    .not('media_urls', 'is', null);
  
  if (postsWithMedia) {
    for (const post of postsWithMedia as { media_urls: any[] }[]) {
      if (Array.isArray(post.media_urls)) {
        for (const media of post.media_urls) {
          if (typeof media === 'object' && media !== null) {
            const mediaObj = media as { type?: string; url?: string };
            if (mediaObj.type === 'video' && mediaObj.url) {
              const uid = extractStreamUid(mediaObj.url);
              if (uid) uids.add(uid);
            }
          }
        }
      }
    }
  }
  
  // Get video_url from comments
  const { data: commentsWithVideo } = await supabase
    .from('comments')
    .select('video_url')
    .not('video_url', 'is', null);
  
  if (commentsWithVideo) {
    for (const comment of commentsWithVideo as { video_url: string }[]) {
      const uid = extractStreamUid(comment.video_url);
      if (uid) uids.add(uid);
    }
  }
  
  // Get cover_url from profiles (in case videos are used as covers)
  const { data: profilesWithCover } = await supabase
    .from('profiles')
    .select('cover_url')
    .not('cover_url', 'is', null);
  
  if (profilesWithCover) {
    for (const profile of profilesWithCover as { cover_url: string }[]) {
      const uid = extractStreamUid(profile.cover_url);
      if (uid) uids.add(uid);
    }
  }
  
  return uids;
}

// Delete a video from Cloudflare Stream
async function deleteStreamVideo(uid: string): Promise<boolean> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
      },
    }
  );
  
  return response.ok || response.status === 404;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Check environment variables
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_STREAM_API_TOKEN) {
      throw new Error('Missing Cloudflare Stream credentials');
    }
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase credentials');
    }
    
    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }
    
    // Authenticate with user's token
    const userSupabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }
    
    const userId = user.id;
    
    // Check if user is admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .single();
    
    if (!roles) {
      throw new Error('Only admins can run cleanup');
    }
    
    // Parse request body
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run for safety
    const maxDelete = body.maxDelete || 50; // Limit deletions per run
    
    console.log(`[cleanup-orphan-videos] Starting cleanup (dryRun: ${dryRun}, maxDelete: ${maxDelete})`);
    
    // Get all videos from Cloudflare Stream
    console.log('[cleanup-orphan-videos] Fetching videos from Cloudflare Stream...');
    const streamVideos = await listAllStreamVideos();
    console.log(`[cleanup-orphan-videos] Found ${streamVideos.length} videos on Stream`);
    
    // Get all video UIDs from database
    console.log('[cleanup-orphan-videos] Fetching video references from database...');
    const dbVideoUids = await getDbVideoUids(supabase);
    console.log(`[cleanup-orphan-videos] Found ${dbVideoUids.size} video references in database`);
    
    // Find orphan videos
    const orphanVideos = streamVideos.filter(video => !dbVideoUids.has(video.uid));
    console.log(`[cleanup-orphan-videos] Found ${orphanVideos.length} orphan videos`);
    
    const result: CleanupResult = {
      totalVideosOnStream: streamVideos.length,
      totalVideosInDb: dbVideoUids.size,
      orphanVideosFound: orphanVideos.length,
      orphanVideosDeleted: 0,
      errors: [],
      deletedUids: [],
      dryRun,
    };
    
    // Delete orphan videos (with limit)
    const videosToDelete = orphanVideos.slice(0, maxDelete);
    
    for (const video of videosToDelete) {
      if (dryRun) {
        console.log(`[cleanup-orphan-videos] [DRY RUN] Would delete: ${video.uid} (created: ${video.created})`);
        result.deletedUids.push(video.uid);
        result.orphanVideosDeleted++;
      } else {
        try {
          console.log(`[cleanup-orphan-videos] Deleting: ${video.uid}`);
          const success = await deleteStreamVideo(video.uid);
          if (success) {
            result.deletedUids.push(video.uid);
            result.orphanVideosDeleted++;
          } else {
            result.errors.push(`Failed to delete ${video.uid}`);
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          result.errors.push(`Error deleting ${video.uid}: ${errorMsg}`);
        }
      }
    }
    
    if (orphanVideos.length > maxDelete) {
      console.log(`[cleanup-orphan-videos] Limited to ${maxDelete} deletions. ${orphanVideos.length - maxDelete} orphans remaining.`);
    }
    
    console.log(`[cleanup-orphan-videos] Cleanup complete. Deleted: ${result.orphanVideosDeleted}, Errors: ${result.errors.length}`);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[cleanup-orphan-videos] Error:', errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
````

## supabase/functions/cleanup-stream-videos/index.ts

```text
MISSING IN CURRENT REPOSITORY: this path was requested in the packaging plan but does not exist locally.
```

## supabase/functions/migrate-stream-to-r2/index.ts

``ts
/**
 * Migrate Stream to R2 Edge Function
 * 
 * Admin-only function to migrate videos from Cloudflare Stream to R2.
 * Processes in batches to avoid timeout.
 * 
 * Usage: POST with { batchSize?: number, dryRun?: boolean, deleteFromStream?: boolean }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};



Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - admin only
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    // Check admin role via user_roles table
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { batchSize = 1, dryRun = false, deleteFromStream = false } = await req.json().catch(() => ({}));

    // Scan limit: dry run scans all, migration uses batch
    const scanLimit = dryRun ? 1000 : batchSize;

    // Find posts with Stream video URLs
    const { data: posts, error: queryError } = await supabaseAdmin
      .from('posts')
      .select('id, video_url, media_urls')
      .or('video_url.ilike.%videodelivery.net%,video_url.ilike.%cloudflarestream.com%')
      .limit(scanLimit);

    if (queryError) throw queryError;

    // Also find posts with Stream URLs in media_urls
    const { data: mediaPosts, error: mediaError } = await supabaseAdmin
      .from('posts')
      .select('id, video_url, media_urls')
      .not('media_urls', 'is', null)
      .limit(1000);

    if (mediaError) throw mediaError;

    // Filter media_urls posts that contain Stream URLs, deduplicate against video_url posts
    const postIds = new Set((posts || []).map(p => p.id));
    const mediaPostsWithStream = (mediaPosts || []).filter(p => {
      if (!p.media_urls || !Array.isArray(p.media_urls)) return false;
      if (postIds.has(p.id)) return false;
      return (p.media_urls as any[]).some((m: any) => 
        m.type === 'video' && (m.url?.includes('videodelivery.net') || m.url?.includes('cloudflarestream.com'))
      );
    });

    // Also check comments with Stream video URLs
    const commentLimit = dryRun ? 1000 : batchSize;
    const { data: comments, error: commentsError } = await supabaseAdmin
      .from('comments')
      .select('id, video_url')
      .or('video_url.ilike.%videodelivery.net%,video_url.ilike.%cloudflarestream.com%')
      .limit(commentLimit);

    if (commentsError) throw commentsError;

    const totalPosts = (posts?.length || 0);
    const totalMediaPosts = mediaPostsWithStream.length;
    const totalComments = (comments?.length || 0);

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        totalVideos: totalPosts + totalMediaPosts + totalComments,
        postsWithStreamVideoUrl: totalPosts,
        postsWithStreamMediaUrls: totalMediaPosts,
        commentsWithStreamVideo: totalComments,
        samplePosts: posts?.slice(0, 5).map(p => ({ id: p.id, video_url: p.video_url?.substring(0, 80) })),
        sampleMediaPosts: mediaPostsWithStream.slice(0, 5).map(p => ({ id: p.id })),
        sampleComments: comments?.slice(0, 5).map(c => ({ id: c.id, video_url: c.video_url?.substring(0, 80) })),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // R2 credentials (account #1)
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!;
    // Stream credentials (account #2 if separated, else same as R2 account)
    const streamAccountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? accountId;
    const cfApiToken = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN')!;
    const accessKeyId = Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID')!;
    const secretAccessKey = Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY')!;
    const bucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')!;
    const publicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL')!;

    const results: any[] = [];

    // Process posts with video_url
    for (const post of (posts || []).slice(0, batchSize)) {
      try {
        const uid = extractStreamUid(post.video_url);
        if (!uid) {
          results.push({ postId: post.id, status: 'skip', reason: 'no uid' });
          continue;
        }

        // Get download URL from Stream API
        const downloadUrl = await getStreamDownloadUrl(streamAccountId, cfApiToken, uid);
        if (!downloadUrl) {
          results.push({ postId: post.id, uid, status: 'error', reason: 'no download url' });
          continue;
        }

        // Download from Stream
        const videoResponse = await fetch(downloadUrl);
        if (!videoResponse.ok) {
          results.push({ postId: post.id, uid, status: 'error', reason: `download failed: ${videoResponse.status}` });
          continue;
        }

        const videoBlob = await videoResponse.blob();
        const key = `videos/migrated-${uid}.mp4`;

        // Upload to R2 using S3 API
        const r2Url = await uploadToR2Direct(accountId, accessKeyId, secretAccessKey, bucketName, key, videoBlob);
        const newUrl = `${publicUrl}/${key}`;

        // Update post in DB
        const { error: updateError } = await supabaseAdmin
          .from('posts')
          .update({ video_url: newUrl })
          .eq('id', post.id);

        if (updateError) {
          results.push({ postId: post.id, uid, status: 'error', reason: `db update: ${updateError.message}` });
          continue;
        }

        // Optionally delete from Stream
        if (deleteFromStream) {
          await deleteFromStreamApi(streamAccountId, cfApiToken, uid).catch(err => 
            console.warn('Stream delete error:', err)
          );
        }

        results.push({ postId: post.id, uid, status: 'migrated', newUrl, size: videoBlob.size });
      } catch (err) {
        results.push({ postId: post.id, status: 'error', reason: String(err) });
      }
    }

    return new Response(JSON.stringify({
      processed: results.length,
      results,
      remaining: {
        postsWithStreamVideoUrl: Math.max(0, totalPosts - batchSize),
        postsWithStreamMediaUrls: totalMediaPosts,
        commentsWithStreamVideo: totalComments,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Migration error:', error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function extractStreamUid(url: string | null): string | null {
  if (!url) return null;
  const patterns = [
    /videodelivery\.net\/([a-f0-9]{32})/i,
    /cloudflarestream\.com\/([a-f0-9]{32})/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function getStreamDownloadUrl(accountId: string, apiToken: string, uid: string): Promise<string | null> {
  // Enable downloads
  const enableResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiToken}` },
  });
  const enableData = await enableResp.json();
  console.log(`[migrate] UID ${uid}: enable downloads response:`, JSON.stringify(enableData?.success ?? enableData?.errors));

  // Polling: kiá»ƒm tra má»—i 3s, tá»‘i Ä‘a 5 láº§n (15s)
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(r => setTimeout(r, 3000));

    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    });

    const data = await resp.json();
    const url = data?.result?.default?.url;
    const percent = data?.result?.default?.percentComplete;

    console.log(`[migrate] UID ${uid}: ${percent ?? 0}% (attempt ${attempt + 1}/5), url=${url ? 'yes' : 'no'}`);
    if (url && percent === 100.0) return url;
  }

  return null; // Timeout sau 15s
}

async function uploadToR2Direct(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucket: string,
  key: string,
  blob: Blob,
): Promise<string> {
  // Use simple PUT to R2 via S3-compatible API with AWS Sig V4
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const method = 'PUT';
  const canonicalUri = `/${bucket}/${key}`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalHeaders = `content-type:video/mp4\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const canonicalQueryString = '';

  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Authorization': authorization,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed: ${response.status} ${await response.text()}`);
  }

  return `https://${host}${canonicalUri}`;
}

async function deleteFromStreamApi(accountId: string, apiToken: string, uid: string): Promise<void> {
  await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiToken}` },
  });
}

// Crypto helpers
async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return await hmacSha256(kService, 'aws4_request');
}

async function sha256Hex(message: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(key: ArrayBuffer, message: string): Promise<string> {
  const sig = await hmacSha256(key, message);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
````

## src/utils/streamUpload.ts

``ts
import * as tus from 'tus-js-client';
import { supabase } from '@/integrations/supabase/client';
import { FILE_LIMITS } from './imageCompression';
import logger from '@/lib/logger';

export interface StreamUploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
  percentage: number;
  uploadSpeed?: number;
  eta?: number;
  processingState?: string;
  processingProgress?: number;
}

export interface StreamUploadResult {
  uid: string;
  playbackUrl?: string;
  thumbnailUrl?: string;
}

export interface StreamVideoStatus {
  uid: string;
  status: {
    state: string;
    pctComplete?: string;
    errorReasonCode?: string;
    errorReasonText?: string;
  };
  readyToStream: boolean;
  duration?: number;
  thumbnail?: string;
  playback?: {
    hls?: string;
    dash?: string;
  };
  preview?: string;
}

// 150MB chunk size - tá»‘i Æ°u cho video lá»›n, giáº£m overhead HTTP
const CHUNK_SIZE = 150 * 1024 * 1024;

// Sá»‘ káº¿t ná»‘i song song tá»‘i Ä‘a
const PARALLEL_UPLOADS = 6;

/**
 * Call backend stream-video function
 */
async function callStreamVideo<T extends Record<string, any>, R = any>(
  action: string,
  payload?: T
): Promise<R> {
  const { data, error } = await supabase.functions.invoke('stream-video', {
    body: { action, ...(payload || {}) },
  });

  if (error) {
    logger.error('[streamUpload] stream-video invoke error:', error);
    throw new Error(error.message || 'Failed to call stream-video');
  }

  return data as R;
}

/**
 * Get a direct upload URL from Cloudflare Stream (for files < 200MB)
 */
async function getDirectUploadUrl(): Promise<{ uploadUrl: string; uid: string }> {
  logger.debug('[streamUpload] Getting direct upload URL...');
  const result = await callStreamVideo<{ maxDurationSeconds: number }, { uploadUrl: string; uid: string }>(
    'direct-upload',
    { maxDurationSeconds: 7200 }
  );

  if (!result?.uploadUrl || !result?.uid) {
    throw new Error('Invalid direct upload response');
  }

  logger.debug('[streamUpload] Got direct upload URL, uid:', result.uid);
  return result;
}

/**
 * Get TUS upload URL for resumable uploads using Direct Creator Upload
 */
async function getTusUploadUrl(
  fileSize: number,
  fileName: string,
  fileType: string
): Promise<{ uploadUrl: string; uid: string }> {
  logger.debug('[streamUpload] Getting TUS upload URL for file size:', formatBytes(fileSize));

  const result = await callStreamVideo<
    { fileSize: number; fileName: string; fileType: string },
    { uploadUrl: string; uid: string }
  >('get-tus-upload-url', {
    fileSize,
    fileName,
    fileType,
  });

  if (!result?.uploadUrl || !result?.uid) {
    throw new Error('Invalid TUS upload response');
  }

  logger.debug('[streamUpload] Got TUS upload URL, uid:', result.uid);
  return { uploadUrl: result.uploadUrl, uid: result.uid };
}

/**
 * Upload a video to Cloudflare Stream
 */
export async function uploadToStream(
  file: File,
  onProgress?: (progress: StreamUploadProgress) => void,
  onError?: (error: Error) => void
): Promise<StreamUploadResult> {
  const fileSize = file.size;
  const useTus = fileSize > (FILE_LIMITS.TUS_THRESHOLD || 100 * 1024 * 1024);
  
  logger.debug('[streamUpload] Starting upload:', {
    fileName: file.name,
    fileSize: formatBytes(fileSize),
    useTus,
  });

  if (useTus) {
    return uploadToStreamTus(file, onProgress, onError);
  }

  return uploadDirect(file, onProgress, onError);
}

/**
 * Direct upload using XHR (for files < 200MB)
 */
async function uploadDirect(
  file: File,
  onProgress?: (progress: StreamUploadProgress) => void,
  onError?: (error: Error) => void
): Promise<StreamUploadResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const { uploadUrl, uid } = await getDirectUploadUrl();

      logger.debug('[streamUpload] Starting direct upload, uid:', uid);

      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      let lastLoaded = 0;
      let lastTime = Date.now();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const now = Date.now();
          const timeDelta = (now - lastTime) / 1000;
          const bytesDelta = event.loaded - lastLoaded;
          const speed = timeDelta > 0 ? bytesDelta / timeDelta : 0;
          const remaining = event.total - event.loaded;
          const eta = speed > 0 ? remaining / speed : 0;
          
          lastLoaded = event.loaded;
          lastTime = now;
          
          onProgress({
            bytesUploaded: event.loaded,
            bytesTotal: event.total,
            percentage: Math.round((event.loaded / event.total) * 100),
            uploadSpeed: speed,
            eta: Math.round(eta),
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          logger.debug('[streamUpload] Direct upload complete, uid:', uid);
          
          // Update video settings
          supabase.functions.invoke('stream-video', {
            body: { 
              action: 'update-video-settings',
              uid,
              requireSignedURLs: false,
              allowedOrigins: ['*'],
            }
          }).catch((err) => {
            logger.warn('[streamUpload] Failed to update video settings:', err);
          });
          
          resolve({
            uid,
            playbackUrl: `https://iframe.videodelivery.net/${uid}`,
            thumbnailUrl: `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=1s`,
          });
        } else {
          const error = new Error(`Upload failed: ${xhr.status}`);
          onError?.(error);
          reject(error);
        }
      });

      xhr.addEventListener('error', () => {
        const error = new Error('Upload failed - network error');
        onError?.(error);
        reject(error);
      });

      xhr.open('POST', uploadUrl);
      xhr.send(formData);

    } catch (error) {
      logger.error('[streamUpload] Direct upload error:', error);
      onError?.(error as Error);
      reject(error);
    }
  });
}

/**
 * Upload using TUS protocol with Direct Creator Upload
 * The client uploads DIRECTLY to Cloudflare - no proxy needed
 */
export async function uploadToStreamTus(
  file: File,
  onProgress?: (progress: StreamUploadProgress) => void,
  onError?: (error: Error) => void
): Promise<StreamUploadResult> {
  return new Promise(async (resolve, reject) => {
    try {
      // Step 1: Get Direct Upload URL from our backend
      const { uploadUrl, uid } = await getTusUploadUrl(file.size, file.name, file.type);

      logger.debug('[streamUpload] Starting TUS upload:', { 
        uploadUrl: uploadUrl.substring(0, 80), 
        uid, 
        size: formatBytes(file.size) 
      });

      let lastLoaded = 0;
      let lastTime = Date.now();

      // Step 2: Upload directly to Cloudflare using tus-js-client
      const upload = new tus.Upload(file, {
        uploadUrl,
        chunkSize: CHUNK_SIZE,
        retryDelays: [0, 500, 1000, 2000, 4000],
        removeFingerprintOnSuccess: true,
        headers: {},
        metadata: {
          filename: file.name,
          filetype: file.type,
          maxDuration: '36000',
        },
        onError: (error) => {
          logger.error('[streamUpload] TUS upload error:', error);
          onError?.(error);
          reject(error);
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const now = Date.now();
          const timeDelta = (now - lastTime) / 1000;
          const bytesDelta = bytesUploaded - lastLoaded;
          const speed = timeDelta > 0 ? bytesDelta / timeDelta : 0;
          const remaining = bytesTotal - bytesUploaded;
          const eta = speed > 0 ? remaining / speed : 0;
          
          lastLoaded = bytesUploaded;
          lastTime = now;
          
          logger.debug('[streamUpload] TUS progress:', Math.round((bytesUploaded / bytesTotal) * 100) + '%');
          
          onProgress?.({
            bytesUploaded,
            bytesTotal,
            percentage: Math.round((bytesUploaded / bytesTotal) * 100),
            uploadSpeed: speed,
            eta: Math.round(eta),
          });
        },
        onSuccess: () => {
          logger.debug('[streamUpload] TUS upload complete, uid:', uid);
          
          // Update video settings
          supabase.functions.invoke('stream-video', {
            body: { 
              action: 'update-video-settings',
              uid,
              requireSignedURLs: false,
              allowedOrigins: ['*'],
            }
          }).catch((err) => {
            logger.warn('[streamUpload] Failed to update video settings:', err);
          });
          
          resolve({
            uid,
            playbackUrl: `https://iframe.videodelivery.net/${uid}`,
            thumbnailUrl: `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=1s`,
          });
        },
      });

      // Start upload
      logger.debug('[streamUpload] Starting TUS upload to Cloudflare...');
      upload.start();

    } catch (error) {
      logger.error('[streamUpload] TUS setup error:', error);
      onError?.(error as Error);
      reject(error);
    }
  });
}

/**
 * Check video processing status
 */
export async function checkVideoStatus(uid: string): Promise<StreamVideoStatus> {
  return callStreamVideo<{ uid: string }, StreamVideoStatus>('check-status', { uid });
}

/**
 * Get playback URL for a video
 */
export async function getPlaybackUrl(uid: string): Promise<{
  hls?: string;
  dash?: string;
  thumbnail?: string;
}> {
  const result = await callStreamVideo<{ uid: string }, {
    playback?: { hls?: string; dash?: string };
    thumbnail?: string;
  }>('get-playback-url', { uid });

  return {
    hls: result.playback?.hls,
    dash: result.playback?.dash,
    thumbnail: result.thumbnail,
  };
}

/**
 * Wait for video to be ready for streaming
 */
export async function waitForVideoReady(
  uid: string,
  maxAttempts = 120,
  intervalMs = 3000
): Promise<StreamVideoStatus> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await checkVideoStatus(uid);
    
    if (status.readyToStream) {
      return status;
    }
    
    if (status.status?.state === 'error') {
      throw new Error(status.status.errorReasonText || 'Video processing failed');
    }
    
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  
  throw new Error('Video processing timeout');
}

/**
 * Check if URL is a Cloudflare Stream URL
 */
export function isStreamUrl(url: string): boolean {
  return url.includes('videodelivery.net') || url.includes('cloudflarestream.com');
}

/**
 * Extract video UID from Cloudflare Stream URL
 */
export function extractStreamUid(url: string): string | null {
  const patterns = [
    /videodelivery\.net\/([a-f0-9]{32})/i,
    /cloudflarestream\.com\/([a-f0-9]{32})/i,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format duration in seconds to human readable string
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
````

## src/utils/streamHelpers.ts

``ts
/**
 * Cloudflare Stream Video Helpers
 * Centralized utilities for video deletion and management
 */

import { supabase } from '@/integrations/supabase/client';
import { extractStreamUid, isStreamUrl } from './streamUpload';
import { deleteFromR2 } from './r2Upload';
import logger from '@/lib/logger';

/**
 * Check if URL is a Supabase Storage URL
 */
export function isSupabaseStorageUrl(url: string): boolean {
  return url.includes('supabase.co/storage/v1') || url.includes('supabase.in/storage/v1');
}

/**
 * Extract bucket and path from a Supabase Storage public URL
 * e.g. "https://xxx.supabase.co/storage/v1/object/public/live-recordings/some/path.webm"
 * â†’ { bucket: "live-recordings", path: "some/path.webm" }
 */
export function extractStoragePath(url: string): { bucket: string; path: string } | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (match) {
      return { bucket: match[1], path: match[2] };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteStorageFile(url: string): Promise<boolean> {
  const info = extractStoragePath(url);
  if (!info) return false;
  try {
    const { error } = await supabase.storage.from(info.bucket).remove([info.path]);
    if (error) {
      logger.error('[streamHelpers] Storage delete error:', error);
      return false;
    }
    logger.debug('[streamHelpers] Storage file deleted:', info.bucket, info.path);
    return true;
  } catch (err) {
    logger.error('[streamHelpers] Storage delete failed:', err);
    return false;
  }
}

/**
 * Check if URL is an R2 media URL
 */
export function isR2Url(url: string): boolean {
  return url.includes('media.fun.rich') || (url.includes('.r2.dev') && !url.includes('videodelivery.net'));
}

/**
 * Extract R2 key from URL (e.g. "videos/1234-abc.mp4" from "https://media.fun.rich/videos/1234-abc.mp4")
 */
export function extractR2Key(url: string): string | null {
  try {
    const u = new URL(url);
    // Remove leading slash
    return u.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

/**
 * Delete a video by URL â€” auto-detects R2 vs Stream
 */
export async function deleteVideoByUrl(videoUrl: string): Promise<boolean> {
  // Supabase Storage (live recordings)
  if (isSupabaseStorageUrl(videoUrl)) {
    return deleteStorageFile(videoUrl);
  }
  // R2
  if (isR2Url(videoUrl)) {
    const key = extractR2Key(videoUrl);
    if (!key) return false;
    try {
      await deleteFromR2(key);
      logger.debug('[streamHelpers] R2 video deleted:', key);
      return true;
    } catch (err) {
      logger.error('[streamHelpers] R2 delete error:', err);
      return false;
    }
  }
  // Fallback to Stream deletion
  return deleteStreamVideoByUrl(videoUrl);
}

/**
 * Delete a video from Cloudflare Stream by URL
 * Extracts UID and calls the stream-video edge function
 * 
 * @param videoUrl - Cloudflare Stream video URL
 * @returns true if deletion was successful, false otherwise
 */
export async function deleteStreamVideoByUrl(videoUrl: string): Promise<boolean> {
  const uid = extractStreamUid(videoUrl);
  if (!uid) {
    logger.warn('[streamHelpers] Could not extract UID from URL:', videoUrl);
    return false;
  }
  
  return deleteStreamVideoByUid(uid);
}

/**
 * Delete a video from Cloudflare Stream by UID
 * 
 * @param uid - Cloudflare Stream video UID
 * @returns true if deletion was successful, false otherwise
 */
export async function deleteStreamVideoByUid(uid: string): Promise<boolean> {
  try {
    logger.debug('[streamHelpers] Deleting Stream video:', uid);
    const { data, error } = await supabase.functions.invoke('stream-video', {
      body: { action: 'delete', uid },
    });
    
    if (error) {
      logger.error('[streamHelpers] Stream video delete error:', error);
      return false;
    }
    
    logger.debug('[streamHelpers] Stream video deleted successfully:', uid, data);
    return true;
  } catch (error) {
    logger.error('[streamHelpers] Failed to delete Stream video:', error);
    return false;
  }
}

/**
 * Delete multiple Stream videos in parallel
 * 
 * @param videoUrls - Array of Cloudflare Stream video URLs
 * @returns Object with success count and total count
 */
export async function deleteStreamVideos(videoUrls: string[]): Promise<{ 
  successCount: number; 
  totalCount: number 
}> {
  if (videoUrls.length === 0) {
    return { successCount: 0, totalCount: 0 };
  }
  
  logger.debug('[streamHelpers] Deleting', videoUrls.length, 'videos');
  const results = await Promise.all(videoUrls.map(deleteStreamVideoByUrl));
  const successCount = results.filter(Boolean).length;
  logger.debug('[streamHelpers] Deleted', successCount, 'of', videoUrls.length, 'videos');
  
  return { successCount, totalCount: videoUrls.length };
}

/**
 * Extract all Stream video URLs from a post's media
 * 
 * @param post - Post object with video_url and media_urls
 * @returns Array of Stream video URLs
 */
export function extractPostStreamVideos(post: {
  video_url?: string | null;
  media_urls?: Array<{ url: string; type: 'image' | 'video' }> | null;
}): string[] {
  const videoUrls: string[] = [];
  
  // Check legacy video_url
  if (post.video_url && isStreamUrl(post.video_url)) {
    videoUrls.push(post.video_url);
  }
  
  // Check media_urls array for videos
  if (post.media_urls && Array.isArray(post.media_urls)) {
    post.media_urls.forEach((media) => {
      if (media.type === 'video' && isStreamUrl(media.url)) {
        videoUrls.push(media.url);
      }
    });
  }
  
  return videoUrls;
}

// Re-export commonly used functions for convenience
export { extractStreamUid, isStreamUrl } from './streamUpload';
````

