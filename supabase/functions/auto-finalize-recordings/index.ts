/* eslint-disable @typescript-eslint/no-explicit-any, no-irregular-whitespace */
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
      metadata: {
        live_title: session.title,
        live_status: 'ended',
        live_session_id: rec.live_session_id,
        playback_url: null,
        playback_type: 'cloudflare_stream_pending',
        fallback_playback_url: manifestUrl,
        allow_chunked_fallback: false,
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
        cloudflare_vod_enabled: true,
        source_webm_key: manifestKey,
        // Đồng nhất pipeline với recording-finalize: bắt đầu ở awaiting_chunks
        // để live-replay-readiness-check FREEZE snapshot trước khi concat.
        status: 'awaiting_chunks',
        tus_offset: 0,
        next_chunk_seq: 0,
        ingest_attempts: 0,
        tus_reset_count: 0,
        chunks_stable_since: null,
        snapshot_total_bytes: null,
        snapshot_total_chunks: null,
        snapshot_frozen_at: null,
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
  const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const isServiceRole = authHeader === `Bearer ${serviceRoleKey}`;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const isCronAuth = cronSecret && req.headers.get('X-Cron-Secret') === cronSecret;
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));
  const isAnonCron = authHeader === `Bearer ${anonKey}`;

  if (!isServiceRole && !isCronAuth && !isAnonCron) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
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
    const vodBackfillEnabled = Deno.env.get('CLOUDFLARE_VOD_BACKFILL_ENABLED') === 'true';
    if (vodBackfillEnabled) {
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
    } else {
      results.push({ action: 'vod_backfill_skipped', reason: 'CLOUDFLARE_VOD_BACKFILL_ENABLED is not true' });
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
