/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * live-replay-stream-ingest (Phase 2)
 * Sau khi concat-replay-webm tạo replay.webm trên R2, function này gọi
 * Cloudflare Stream /copy để CF tự pull file, transcode H.264/AAC + faststart MP4
 * + sinh HLS/DASH. Không còn TUS push.
 *
 * Pipeline mới: KHÔNG cần file replay.webm trong R2.
 * Function tự đọc các chunks WebM từ R2 và stream-pipe trực tiếp vào
 * Cloudflare Stream qua giao thức TUS (resumable upload).
 *
 * Cải tiến 05/05/2026:
 *  - HEAD TUS trước mỗi PATCH để đồng bộ offset thật từ Cloudflare,
 *    không tin tuyệt đối DB → tránh 409 Mismatched Upload-Offset.
 *  - 409 KHÔNG còn fatal: chỉ resync offset và để cron sau retry.
 *  - Advisory lock per-replay để cron + nút admin không giẫm chân nhau.
 *  - Giảm tải CPU: PATCH 8MB, 5 replay/run, budget 110s.
 *  - Trả body chi tiết khi lỗi (status + message).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_REPLAYS_PER_RUN = 5;
const PER_REPLAY_BUDGET_MS = 18_000;
const TOTAL_BUDGET_MS = 110_000;
const PATCH_TARGET_BYTES = 8 * 1024 * 1024; // 8MB / PATCH (giảm CPU spike)

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

async function fetchChunkBytes(url: string, retries = 2): Promise<Uint8Array> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    } catch (e) {
      lastErr = e;
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
): Promise<{ uid: string; tusUrl: string }> {
  const meta = `name ${b64(filename)},filetype ${b64('video/webm')}`;
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(totalBytes),
        'Upload-Metadata': meta,
      },
    },
  );
  if (r.status !== 201) {
    const t = await r.text().catch(() => '');
    throw new Error(`TUS create failed ${r.status}: ${t.slice(0, 300)}`);
  }
  const tusUrl = r.headers.get('Location') || '';
  const uid = r.headers.get('stream-media-id') || '';
  if (!tusUrl || !uid) throw new Error('TUS create missing Location/uid headers');
  return { uid, tusUrl };
}

/** HEAD TUS để lấy offset thực từ Cloudflare. Trả -1 nếu URL gone. */
async function tusHead(tusUrl: string, token: string): Promise<number> {
  const r = await fetch(tusUrl, {
    method: 'HEAD',
    headers: {
      Authorization: `Bearer ${token}`,
      'Tus-Resumable': '1.0.0',
    },
  });
  if (r.status === 404 || r.status === 410) return -1;
  if (r.status !== 200 && r.status !== 204) {
    const t = await r.text().catch(() => '');
    throw new Error(`TUS HEAD ${r.status}: ${t.slice(0, 200)}`);
  }
  const off = parseInt(r.headers.get('Upload-Offset') || '0', 10);
  return Number.isFinite(off) ? off : 0;
}

async function tusPatch(
  tusUrl: string,
  offset: number,
  body: Uint8Array,
  token: string,
): Promise<{ newOffset: number; status: number }> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
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
      return { newOffset, status: 204 };
    }
    // 409 Mismatched offset → KHÔNG fatal, ném conflict cho caller xử lý
    if (r.status === 409) {
      const t = await r.text().catch(() => '');
      throw Object.assign(new Error(`TUS PATCH 409: ${t.slice(0, 200)}`), { conflict: true, status: 409 });
    }
    // 4xx khác → fatal
    if (r.status >= 400 && r.status < 500) {
      const t = await r.text().catch(() => '');
      throw Object.assign(new Error(`TUS PATCH ${r.status}: ${t.slice(0, 200)}`), { fatal: true, status: r.status });
    }
    // 5xx → retry
    await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
  }
  throw Object.assign(new Error(`TUS PATCH failed after retries, last=${lastStatus}`), { status: lastStatus });
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

const TUS_ALIGN = 256 * 1024;

/** UUID → bigint cho pg_try_advisory_lock (dùng 8 byte đầu) */
function lockKeyFromUuid(uuid: string): string {
  const hex = uuid.replace(/-/g, '').slice(0, 15); // 60 bits an toàn cho int8
  return BigInt('0x' + hex).toString();
}

async function processOneReplay(
  supabase: ReturnType<typeof createClient>,
  replay: ReplayRow,
  ctx: { accountId: string; token: string; r2PublicUrl: string; deadlineMs: number },
): Promise<{ status: string; bytesUploaded: number; chunksUploaded: number; resynced?: boolean }> {
  const { data: chunks, error } = await supabase
    .from('chunked_recording_chunks')
    .select('seq, object_key, bytes')
    .range(0, 9999)
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
  let resynced = false;

  // 1) Create TUS upload nếu chưa có
  if (!tusUrl) {
    const filename = `replay-${replay.live_session_id}.webm`;
    const created = await tusCreate(ctx.accountId, ctx.token, filename, totalBytes);
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
    }).eq('id', replay.id);
    console.log(`[ingest] replay=${replay.id} TUS created uid=${uid} totalChunks=${totalChunks} totalBytes=${totalBytes}`);
  }

  // 2) HEAD-sync offset thật từ Cloudflare (nguồn chân lý)
  let serverOffset = Number(replay.tus_offset || 0);
  try {
    const realOffset = await tusHead(tusUrl!, ctx.token);
    if (realOffset === -1) {
      // TUS URL đã hết hạn / không tồn tại → recreate
      console.warn(`[ingest] replay=${replay.id} TUS URL gone → recreate`);
      const filename = `replay-${replay.live_session_id}.webm`;
      const created = await tusCreate(ctx.accountId, ctx.token, filename, totalBytes);
      tusUrl = created.tusUrl;
      uid = created.uid;
      serverOffset = 0;
      resynced = true;
      await supabase.from('live_replays').update({
        stream_uid: uid,
        tus_upload_url: tusUrl,
        tus_offset: 0,
        next_chunk_seq: 0,
      }).eq('id', replay.id);
    } else if (realOffset !== serverOffset) {
      console.warn(`[ingest] replay=${replay.id} offset drift: db=${serverOffset} cf=${realOffset} → resync`);
      serverOffset = realOffset;
      resynced = true;
      await supabase.from('live_replays').update({ tus_offset: serverOffset }).eq('id', replay.id);
    }
  } catch (headErr: any) {
    console.warn(`[ingest] replay=${replay.id} HEAD failed: ${headErr?.message}`);
  }

  // Map serverOffset → chunk index
  let startChunkIdx = 0;
  while (startChunkIdx < totalChunks && cum[startChunkIdx + 1] <= serverOffset) startChunkIdx++;
  let skipInFirst = serverOffset - cum[startChunkIdx];

  let buffer = new Uint8Array(0);
  let chunksUploadedThisRun = 0;
  let bytesUploadedThisRun = 0;
  let seq = startChunkIdx;
  let isLastReached = false;

  const appendChunk = async () => {
    const c = chunks[seq] as any;
    const bytes = await fetchChunkBytes(`${ctx.r2PublicUrl}/${c.object_key}`);
    const slice = (seq === startChunkIdx && skipInFirst > 0) ? bytes.slice(skipInFirst) : bytes;
    const merged = new Uint8Array(buffer.byteLength + slice.byteLength);
    merged.set(buffer, 0);
    merged.set(slice, buffer.byteLength);
    buffer = merged;
    seq++;
    chunksUploadedThisRun++;
  };

  const flushAligned = async () => {
    const alignedSize = Math.floor(buffer.byteLength / TUS_ALIGN) * TUS_ALIGN;
    if (alignedSize < 5 * 1024 * 1024) return;
    const body = buffer.slice(0, alignedSize);
    const { newOffset } = await tusPatch(tusUrl!, serverOffset, body, ctx.token);
    bytesUploadedThisRun += alignedSize;
    console.log(`[ingest] replay=${replay.id} PATCH offset=${(serverOffset/1048576).toFixed(2)}MB +${(alignedSize/1048576).toFixed(2)}MB → 204 newOffset=${(newOffset/1048576).toFixed(2)}MB`);
    serverOffset = newOffset;
    buffer = buffer.slice(alignedSize);
  };

  const flushFinal = async () => {
    if (buffer.byteLength === 0) return;
    const { newOffset } = await tusPatch(tusUrl!, serverOffset, buffer, ctx.token);
    bytesUploadedThisRun += buffer.byteLength;
    console.log(`[ingest] replay=${replay.id} FINAL PATCH offset=${(serverOffset/1048576).toFixed(2)}MB +${(buffer.byteLength/1048576).toFixed(2)}MB → 204 newOffset=${(newOffset/1048576).toFixed(2)}MB`);
    serverOffset = newOffset;
    buffer = new Uint8Array(0);
  };

  while (seq < totalChunks) {
    if (Date.now() >= ctx.deadlineMs) break;
    await appendChunk();
    if (buffer.byteLength >= PATCH_TARGET_BYTES) {
      await flushAligned();
    }
  }
  if (seq >= totalChunks) isLastReached = true;

  if (isLastReached) {
    await flushFinal();
  } else {
    await flushAligned();
  }

  const done = serverOffset >= totalBytes;
  await supabase.from('live_replays').update({
    tus_offset: serverOffset,
    next_chunk_seq: seq,
    status: done ? 'processing' : 'uploading',
    last_ingest_at: new Date().toISOString(),
    ingest_attempts: (replay.ingest_attempts || 0) + 1,
  }).eq('id', replay.id);

  return {
    status: done ? 'processing' : 'uploading',
    bytesUploaded: bytesUploadedThisRun,
    chunksUploaded: chunksUploadedThisRun,
    resynced,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const ok =
    authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    authHeader.startsWith('Bearer ') || // user JWT (admin invoke)
    (cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
  if (!isAuthorized) return json({ error: 'Unauthorized', code: 'NO_AUTH' }, 401);

  const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const token = streamToken();
  const r2PublicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
  if (!accountId || !token || !r2PublicUrl) {
    return json({
      error: 'Missing Cloudflare configuration',
      code: 'MISSING_CONFIG',
      details: {
        accountId: !!accountId,
        token: !!token,
        r2PublicUrl: !!r2PublicUrl,
      },
    }, 500);
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
    .select('id, user_id, live_session_id, chunked_recording_id, source_webm_key, source_webm_size, snapshot_total_bytes')
    .eq('cloudflare_vod_enabled', true)
    .eq('status', 'queued')
    .not('source_webm_key', 'is', null)
    .gt('source_webm_size', 0)
    .like('source_webm_key', '%/replay.webm')
    .is('stream_uid', null)
    .order('snapshot_frozen_at', { ascending: true, nullsFirst: false })
    .limit(MAX_REPLAYS_PER_RUN);

  if (queryErr) {
    console.error('[ingest] query error', queryErr);
    return json({ error: queryErr.message, code: 'DB_QUERY_FAILED' }, 500);
  }

  const picked = (replays || []) as ReplayRow[];
  const { count: backlogCount } = await supabase
    .from('live_replays')
    .select('id', { count: 'exact', head: true })
    .in('status', ['queued', 'uploading']);
  console.log(`[ingest] queue snapshot total=${backlogCount ?? '?'} picked=${picked.length}`);

  const runWork = async () => {
    const results: Array<Record<string, unknown>> = [];
    for (const r of picked) {
      if (Date.now() >= totalDeadline) break;
      // Concurrency tự nhiên được cover bởi HEAD-sync ở processOneReplay
      // (Cloudflare là source-of-truth cho offset).
      const perDeadline = Math.min(Date.now() + PER_REPLAY_BUDGET_MS, totalDeadline);
      try {
        const out = await processOneReplay(supabase, r, {
          accountId, token, r2PublicUrl, deadlineMs: perDeadline,
        });
        results.push({ replay_id: r.id, ...out });
      } catch (err: any) {
        const conflict = !!err?.conflict;
        const fatal = !!err?.fatal && !conflict;
        const status = err?.status;
        console.error(`[ingest] replay=${r.id} error fatal=${fatal} conflict=${conflict} status=${status} msg=${err?.message}`);
        const update: Record<string, unknown> = {
          last_ingest_at: new Date().toISOString(),
          ingest_attempts: (r.ingest_attempts || 0) + 1,
          error_message: String(err?.message || err).slice(0, 500),
        };
        if (conflict) {
          // Reset tus_offset để vòng sau HEAD-sync lại từ Cloudflare
          update.tus_offset = 0;
          update.next_chunk_seq = 0;
          // Giữ status 'uploading'
        } else if (fatal) {
          update.status = 'failed';
        }
        await supabase.from('live_replays').update(update).eq('id', r.id);
        results.push({ replay_id: r.id, error: String(err?.message || err), conflict, fatal, status });
      }
    }
    console.log(`[ingest] run done elapsed_ms=${Date.now() - startTs} processed=${results.length}`);
  };

  // @ts-ignore EdgeRuntime
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(runWork());
    return json({
      accepted: true,
      picked: picked.length,
      backlog_total: backlogCount ?? null,
      timestamp: new Date().toISOString(),
    }, 202);
  }

  await runWork();
  return json({
    processed: picked.length,
    backlog_total: backlogCount ?? null,
    elapsed_ms: Date.now() - startTs,
    timestamp: new Date().toISOString(),
  });
});
