/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, HttpError, json, normalizeError, requireUser } from '../_shared/httpAuth.ts';
import { putR2ObjectInBucket } from '../_shared/r2MultiBucketService.ts';

const ALLOWED_MIME_TYPES = new Set([
  'video/webm',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/mp4',
]);

const MAX_CHUNK_BYTES = 50 * 1024 * 1024;

function getTempBucket(): string {
  return Deno.env.get('R2_TEMP_BUCKET') || Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || '';
}

function extensionForMime(mimeType: string): string {
  return mimeType.includes('mp4') ? 'mp4' : 'webm';
}

function safeIndex(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100000) {
    throw new HttpError(400, 'INVALID_CHUNK_INDEX', 'chunk_index khong hop le');
  }
  return parsed;
}

async function loadOwnedSession(admin: any, liveSessionId: string, userId: string) {
  const { data, error } = await admin
    .from('live_sessions')
    .select('id, host_user_id, user_id, owner_id, post_id, live_post_id, status')
    .eq('id', liveSessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, 'LIVE_SESSION_NOT_FOUND', 'Khong tim thay phien live');
  if (![data.host_user_id, data.user_id, data.owner_id].includes(userId)) {
    throw new HttpError(403, 'FORBIDDEN', 'Chi host moi duoc upload recording fallback');
  }
  return data;
}

async function updateChunkStats(admin: any, liveSessionId: string): Promise<{ count: number; totalBytes: number }> {
  const { data, error } = await admin
    .from('live_recording_chunks')
    .select('size_bytes')
    .eq('live_session_id', liveSessionId)
    .eq('provider', 'browser')
    .eq('status', 'uploaded');
  if (error) throw error;
  const chunks = data || [];
  const totalBytes = chunks.reduce((sum: number, row: any) => sum + Number(row.size_bytes || 0), 0);
  await admin.from('live_sessions').update({
    browser_recording_chunk_count: chunks.length,
    browser_recording_total_bytes: totalBytes,
    updated_at: new Date().toISOString(),
  }).eq('id', liveSessionId);
  return { count: chunks.length, totalBytes };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient() as any;

  try {
    const user = await requireUser(req);
    const reqContentType = req.headers.get('content-type') || '';

    if (reqContentType.includes('application/json')) {
      const body = await req.json().catch(() => ({}));
      if (body.action !== 'start' && body.action !== 'finalize' && body.action !== 'fail') {
        throw new HttpError(400, 'INVALID_ACTION', 'Action khong hop le');
      }
      const liveSessionId = String(body.live_session_id || '');
      if (!liveSessionId) throw new HttpError(400, 'LIVE_SESSION_ID_REQUIRED', 'Thieu live_session_id');
      await loadOwnedSession(admin, liveSessionId, user.id);
      const stats = await updateChunkStats(admin, liveSessionId);
      const status = body.action === 'start'
        ? 'recording'
        : body.action === 'finalize' && stats.count > 0
          ? 'uploaded'
          : 'failed';
      await admin.from('live_sessions').update({
        recording_provider: 'browser',
        browser_recording_status: status,
        browser_recording_warning: typeof body.warning === 'string'
          ? body.warning.slice(0, 1000)
          : body.action === 'finalize' && stats.count === 0
            ? 'Browser fallback ended without uploaded chunks'
            : null,
        updated_at: new Date().toISOString(),
      }).eq('id', liveSessionId);
      return json({ success: true });
    }

    const form = await req.formData();
    const file = form.get('file');
    const liveSessionId = String(form.get('live_session_id') || '');
    const postId = String(form.get('post_id') || '') || null;
    const mimeType = String(form.get('mime_type') || (file instanceof File ? file.type : '') || 'video/webm');
    const durationMsRaw = form.get('duration_ms');
    const durationMs = durationMsRaw == null || durationMsRaw === '' ? null : Math.max(0, Number(durationMsRaw));
    const chunkIndex = safeIndex(form.get('chunk_index'));

    if (!liveSessionId) throw new HttpError(400, 'LIVE_SESSION_ID_REQUIRED', 'Thieu live_session_id');
    if (!(file instanceof File)) throw new HttpError(400, 'FILE_REQUIRED', 'Thieu file chunk');
    if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new HttpError(400, 'INVALID_MIME_TYPE', 'Dinh dang recording fallback khong duoc ho tro');
    if (file.size <= 0) throw new HttpError(400, 'EMPTY_CHUNK', 'Chunk rong');
    if (file.size > MAX_CHUNK_BYTES) throw new HttpError(413, 'CHUNK_TOO_LARGE', 'Chunk recording qua lon');

    const session = await loadOwnedSession(admin, liveSessionId, user.id);
    const bucket = getTempBucket();
    if (!bucket) throw new HttpError(500, 'R2_TEMP_BUCKET_MISSING', 'Thieu R2_TEMP_BUCKET');

    const { data: lastChunk, error: lastChunkError } = await admin
      .from('live_recording_chunks')
      .select('chunk_index')
      .eq('live_session_id', liveSessionId)
      .eq('provider', 'browser')
      .order('chunk_index', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastChunkError) throw lastChunkError;
    const nextExpectedIndex = Number(lastChunk?.chunk_index ?? -1) + 1;
    if (chunkIndex > nextExpectedIndex) {
      throw new HttpError(
        409,
        'CHUNK_OUT_OF_ORDER',
        `Chunk index ${chunkIndex} is ahead of expected ${nextExpectedIndex}`,
      );
    }

    const padded = String(chunkIndex).padStart(6, '0');
    const key = `temp/browser-recordings/${liveSessionId}/chunk-${padded}.${extensionForMime(mimeType)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    await putR2ObjectInBucket({ bucket, key, body: bytes, contentType: mimeType });

    const { error: upsertError } = await admin.from('live_recording_chunks').upsert({
      live_session_id: liveSessionId,
      post_id: postId || session.post_id || session.live_post_id || null,
      provider: 'browser',
      chunk_index: chunkIndex,
      r2_bucket: bucket,
      r2_key: key,
      mime_type: mimeType,
      size_bytes: file.size,
      duration_ms: Number.isFinite(durationMs) ? durationMs : null,
      uploaded_at: new Date().toISOString(),
      status: 'uploaded',
      error_message: null,
    }, { onConflict: 'live_session_id,provider,chunk_index' });
    if (upsertError) throw upsertError;

    await updateChunkStats(admin, liveSessionId);
    await admin.from('live_sessions').update({
      recording_provider: 'browser',
      browser_recording_status: 'uploading',
      updated_at: new Date().toISOString(),
    }).eq('id', liveSessionId);

    return json({
      success: true,
      r2_key: key,
      r2_bucket: bucket,
      size_bytes: file.size,
      chunk_index: chunkIndex,
    });
  } catch (error) {
    const normalized = normalizeError(error);
    console.error('[live-browser-recording-upload] failed', normalized);
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: normalized.message, code: normalized.code || 'BROWSER_RECORDING_UPLOAD_FAILED' }, status);
  }
});
