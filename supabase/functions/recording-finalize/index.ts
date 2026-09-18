/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * recording-finalize Edge Function
 * Creates a manifest.json listing all chunks for playback.
 * Fast (~2s) — no concat, no timeout risk.
 * Concat to single file is handled async by auto-finalize-recordings cron.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── R2 signing utilities (kept for manifest upload) ─────────────────────────

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

// ─── Upload manifest.json to R2 ─────────────────────────────────────────────

async function uploadManifestToR2(objectKey: string, manifestJson: string): Promise<void> {
  const r2 = getR2Config();
  const uri = `/${r2.bucketName}/${objectKey}`;
  const resp = await signedRequest('PUT', uri, { 'content-type': 'application/json' }, manifestJson);
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Upload manifest failed: ${resp.status} ${errText}`);
  }
  await resp.text(); // consume body
}

// ─── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const userId = user.id;

    // Check banned status
    const supabaseAdminBan = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );
    const { data: banCheck } = await supabaseAdminBan
      .from('profiles').select('is_banned').eq('id', userId).single();
    if (banCheck?.is_banned) {
      return new Response(JSON.stringify({ error: 'Tài khoản đã bị cấm vĩnh viễn.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { recording_id, live_session_id } = await req.json();
    if (!recording_id) {
      return new Response(JSON.stringify({ error: 'Missing recording_id' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify ownership
    const { data: recording, error: recErr } = await supabaseAdmin
      .from('chunked_recordings')
      .select('*')
      .eq('id', recording_id)
      .maybeSingle();

    if (recErr || !recording) {
      return new Response(JSON.stringify({ error: 'Recording not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (recording.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get all uploaded chunks
    const { data: chunks, error: chunkErr } = await supabaseAdmin
      .from('chunked_recording_chunks')
      .select('*')
      .eq('recording_id', recording_id)
      .eq('status', 'uploaded')
      .order('seq', { ascending: true });

    if (chunkErr || !chunks || chunks.length === 0) {
      await supabaseAdmin.from('chunked_recordings')
        .update({ status: 'failed', error_message: 'No uploaded chunks found' })
        .eq('id', recording_id);
      return new Response(JSON.stringify({ error: 'No chunks found' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const r2 = getR2Config();
    const mimeType = recording.mime_type || 'video/webm';
    const totalDurationMs = chunks.reduce((sum: number, c: any) => sum + (c.duration_ms || 2000), 0);
    const totalBytes = chunks.reduce((sum: number, c: any) => sum + (c.bytes || 0), 0);

    // ── Build manifest.json ──────────────────────────────────────────────────
    const manifest = {
      version: 2,
      recording_id,
      live_session_id: live_session_id || recording.live_session_id,
      mime_type: mimeType,
      codec: recording.codec || null,
      total_chunks: chunks.length,
      total_duration_ms: totalDurationMs,
      total_bytes: totalBytes,
      created_at: new Date().toISOString(),
      chunks: chunks.map((c: any) => ({
        seq: c.seq,
        url: `${r2.publicUrl}/${c.object_key}`,
        object_key: c.object_key,
        bytes: c.bytes || 0,
        duration_ms: c.duration_ms || 2000,
      })),
    };

    const manifestKey = `recordings/${recording_id}/manifest.json`;
    const manifestJson = JSON.stringify(manifest);
    await uploadManifestToR2(manifestKey, manifestJson);

    const manifestUrl = `${r2.publicUrl}/${manifestKey}`;

    // ── Update recording as done ─────────────────────────────────────────────
    await supabaseAdmin.from('chunked_recordings').update({
      status: 'done',
      total_chunks: chunks.length,
      output_object_key: manifestKey,
      output_url: manifestUrl,
      ended_at: new Date().toISOString(),
    }).eq('id', recording_id);

    // ── Update live session + post ───────────────────────────────────────────
    const sessionId = live_session_id || recording.live_session_id;
    if (sessionId) {
      await supabaseAdmin.from('live_sessions')
        .update({ recording_status: 'processing' })
        .eq('id', sessionId);

      const { data: liveSession } = await supabaseAdmin
        .from('live_sessions')
        .select('post_id, title, ended_at')
        .eq('id', sessionId)
        .maybeSingle();

      if (liveSession?.post_id) {
        await supabaseAdmin.from('posts').update({
          metadata: {
            live_title: liveSession.title,
            live_status: 'ended',
            live_session_id: sessionId,
            playback_url: null,
            playback_type: 'chunked',
            playback_provider: 'chunked',
            fallback_playback_url: manifestUrl,
            allow_chunked_fallback: true,
            chunked_recording_id: recording_id,
            replay_status: 'processing',
            replay_ready: false,
            ended_at: liveSession.ended_at || new Date().toISOString(),
          },
          replay_status: 'processing',
        }).eq('id', liveSession.post_id);
      }
    }

    // ── Enqueue replay với trạng thái awaiting_chunks (v2 pipeline) ─────────
    // KHÔNG chốt total_chunks_for_ingest ở đây vì chunk có thể vẫn đang flush
    // lên R2. live-replay-readiness-check sẽ FREEZE snapshot khi chunks ổn định.
    try {
      await supabaseAdmin.from('live_replays').upsert({
        user_id: recording.user_id,
        live_session_id: sessionId,
        chunked_recording_id: recording_id,
        cloudflare_vod_enabled: true,
        source_webm_key: manifestKey,
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
      console.log('[recording-finalize] enqueued replay awaiting_chunks', { recording_id, chunks_at_finalize: chunks.length });
    } catch (enqErr: any) {
      console.warn('[recording-finalize] enqueue replay failed:', enqErr?.message);
    }

    console.log(`[recording-finalize] ✓ manifest created for ${recording_id} (${chunks.length} chunks)`);

    return new Response(JSON.stringify({
      success: true,
      manifest_url: manifestUrl,
      total_chunks: chunks.length,
      total_bytes: totalBytes,
      total_duration_ms: totalDurationMs,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('recording-finalize error:', error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
