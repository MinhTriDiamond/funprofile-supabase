/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * concat-replay-webm
 * Phase 2 — Server-side concat các chunk R2 thành 1 file replay.webm duy nhất
 * dùng R2 Multipart Upload + UploadPartCopy. KHÔNG tải dữ liệu về Edge Function,
 * R2 copy server-side, gần như zero RAM, zero băng thông Edge.
 *
 * Đầu vào: live_replays.status='normalizing' (đã có snapshot từ readiness-check).
 * Đầu ra: live_replays.status='queued' + source_webm_key='recordings/{id}/replay.webm'
 *         để live-replay-stream-ingest gọi Cloudflare /copy.
 *
 * S3 multipart constraint: mỗi part (trừ part cuối) phải >= 5MB. Code batch
 * các chunk nhỏ liên tiếp thành 1 part >= 5MB qua UploadPartCopy với byte range.
 * Tuy nhiên UploadPartCopy chỉ copy 1 source object/part. Để gộp nhiều chunk
 * vào 1 part phải tải về rồi UploadPart bằng PUT — cách này tốn RAM.
 *
 * Giải pháp thực dụng: 1 chunk = 1 part. Chunk recorder hiện tại ~256KB-2MB,
 * vi phạm min 5MB. Vì vậy với mỗi part:
 *   - Nếu chunk >= 5MB → UploadPartCopy server-side (zero RAM).
 *   - Nếu chunk < 5MB → batch nhiều chunk liên tiếp tới khi >= 5MB rồi
 *     UploadPart bằng dữ liệu fetch về Edge (bắt buộc, nhưng chỉ cho block đó).
 * Part cuối được phép < 5MB.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MIN_PART_SIZE = 5 * 1024 * 1024;       // S3/R2 hard min cho non-trailing parts
const MB = 1024 * 1024;
const MAX_PARTS = 9_500;                      // S3/R2 cho 10k, để dư an toàn
// R2 yêu cầu MỌI non-trailing part cùng size (khác S3 chuẩn).
// Vì vậy build plan với 1 FIXED size duy nhất, cắt chunk theo byte-range nếu cần.
const MAX_REPLAYS_PER_RUN = 3;
const PER_REPLAY_BUDGET_MS = 80_000;
const TOTAL_BUDGET_MS = 110_000;

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ─── R2 / SigV4 utilities ────────────────────────────────────────────────────

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(message));
}

async function getSigningKey(secret: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + secret).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getR2() {
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

function uriEncodeRfc3986(str: string): string {
  // SigV4-safe URI encoding for canonical query string
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

async function signedRequest(
  method: string,
  canonicalUri: string,
  extraHeaders: Record<string, string>,
  body: Uint8Array | string | null,
  query: Record<string, string> = {},
): Promise<Response> {
  const r2 = getR2();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const bodyBytes = body instanceof Uint8Array ? body : (body ? new TextEncoder().encode(body) : new Uint8Array(0));
  const bodyHash = toHex(await crypto.subtle.digest('SHA-256', bodyBytes));

  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(extraHeaders)) headers[k.toLowerCase()] = v;
  headers['host'] = r2.host;
  headers['x-amz-content-sha256'] = bodyHash;
  headers['x-amz-date'] = amzDate;

  const sortedKeys = Object.keys(headers).sort();
  const signedHeaders = sortedKeys.join(';');
  const canonicalHeaders = sortedKeys.map(k => `${k}:${headers[k]}`).join('\n') + '\n';

  const queryKeys = Object.keys(query).sort();
  const canonicalQuery = queryKeys
    .map(k => `${uriEncodeRfc3986(k)}=${uriEncodeRfc3986(query[k])}`)
    .join('&');

  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, bodyHash].join('\n');
  const canonicalRequestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));

  const credentialScope = `${dateStamp}/${r2.region}/${r2.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, canonicalRequestHash].join('\n');
  const signingKey = await getSigningKey(r2.secretAccessKey, dateStamp, r2.region, r2.service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const fetchHeaders: Record<string, string> = { ...headers, Authorization: authorization };
  delete fetchHeaders['host']; // browser sets

  const url = `https://${r2.host}${canonicalUri}${canonicalQuery ? '?' + canonicalQuery : ''}`;
  return fetch(url, { method, headers: fetchHeaders, body: body ? bodyBytes : undefined });
}

// ─── R2 multipart helpers ────────────────────────────────────────────────────

// (parseEtag không còn dùng vì đã bỏ UploadPartCopy)

async function createMultipart(objectKey: string, contentType: string): Promise<string> {
  const r2 = getR2();
  const uri = `/${r2.bucketName}/${objectKey}`;
  const resp = await signedRequest('POST', uri, { 'content-type': contentType }, '', { uploads: '' });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`CreateMultipartUpload ${resp.status}: ${text.slice(0, 300)}`);
  const m = text.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!m) throw new Error(`CreateMultipartUpload missing UploadId: ${text.slice(0, 300)}`);
  return m[1];
}

// (uploadPartCopy đã loại bỏ — thuật toán mới luôn tải bytes về để đảm bảo
// mọi non-trailing part có size cố định, tương thích R2.)

async function uploadPart(
  objectKey: string, uploadId: string, partNumber: number, body: Uint8Array,
): Promise<string> {
  const r2 = getR2();
  const uri = `/${r2.bucketName}/${objectKey}`;
  const resp = await signedRequest('PUT', uri, {
    'content-length': String(body.byteLength),
  }, body, { partNumber: String(partNumber), uploadId });
  const text = await resp.text().catch(() => '');
  if (!resp.ok) throw new Error(`UploadPart ${partNumber} ${resp.status}: ${text.slice(0, 300)}`);
  // ETag is in response header
  const etag = resp.headers.get('etag') || resp.headers.get('ETag');
  if (!etag) throw new Error(`UploadPart ${partNumber} missing ETag header`);
  return etag.replace(/"/g, '');
}

async function completeMultipart(
  objectKey: string, uploadId: string, parts: Array<{ PartNumber: number; ETag: string }>,
): Promise<void> {
  const r2 = getR2();
  const uri = `/${r2.bucketName}/${objectKey}`;
  const xmlParts = parts
    .map(p => `<Part><PartNumber>${p.PartNumber}</PartNumber><ETag>"${p.ETag.replace(/"/g, '')}"</ETag></Part>`)
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><CompleteMultipartUpload>${xmlParts}</CompleteMultipartUpload>`;
  const resp = await signedRequest('POST', uri, { 'content-type': 'application/xml' }, xml, { uploadId });
  const text = await resp.text();
  if (!resp.ok || text.includes('<Error>')) {
    throw new Error(`CompleteMultipartUpload ${resp.status}: ${text.slice(0, 500)}`);
  }
}

async function abortMultipart(objectKey: string, uploadId: string): Promise<void> {
  const r2 = getR2();
  const uri = `/${r2.bucketName}/${objectKey}`;
  await signedRequest('DELETE', uri, {}, '', { uploadId }).catch(() => null);
}

async function headObject(objectKey: string): Promise<{ size: number } | null> {
  const r2 = getR2();
  const uri = `/${r2.bucketName}/${objectKey}`;
  const resp = await signedRequest('HEAD', uri, {}, '');
  if (resp.status === 404) return null;
  if (!resp.ok) return null;
  const len = parseInt(resp.headers.get('content-length') || '0', 10);
  return { size: len };
}

async function fetchChunkBytes(url: string, offset = 0, length?: number): Promise<Uint8Array> {
  const headers: Record<string, string> = {};
  if (length !== undefined && (offset > 0 || length >= 0)) {
    headers['Range'] = `bytes=${offset}-${offset + length - 1}`;
  }
  const r = await fetch(url, { headers });
  if (!r.ok && r.status !== 206) throw new Error(`fetch chunk ${r.status} ${url}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (length !== undefined && buf.byteLength !== length) {
    throw new Error(`fetch chunk length mismatch: got ${buf.byteLength} want ${length} ${url}`);
  }
  return buf;
}

// ─── Concat workflow (RESUMABLE) ─────────────────────────────────────────────

interface ReplayRow {
  id: string;
  chunked_recording_id: string;
  snapshot_total_bytes: number;
  snapshot_total_chunks: number;
  concat_upload_id: string | null;
  concat_plan: PlanItem[] | null;
  concat_completed_parts: Array<{ PartNumber: number; ETag: string }> | null;
  concat_next_part: number | null;
}

type PlanSlice = { key: string; offset: number; length: number };
type PlanItem = { kind: 'merge'; sources: PlanSlice[]; bytes: number };

class TimeoutPause extends Error {
  constructor(public partsDone: number, public total: number) {
    super(`paused at ${partsDone}/${total}`);
  }
}

/**
 * Chọn FIXED_PART_SIZE sao cho:
 *  - >= 5MB (R2 min cho non-trailing part)
 *  - tổng part <= MAX_PARTS
 *  - là bội của 1MB (gọn, dễ debug)
 */
function pickFixedPartSize(totalBytes: number): number {
  if (totalBytes <= MIN_PART_SIZE) return totalBytes; // 1 part = part cuối, free size
  let size = MIN_PART_SIZE;
  // Đảm bảo số part <= MAX_PARTS
  const minBySplit = Math.ceil(totalBytes / MAX_PARTS);
  if (minBySplit > size) {
    // Round up tới bội số 1MB
    size = Math.ceil(minBySplit / MB) * MB;
  }
  return size;
}

async function buildPlan(
  supabase: ReturnType<typeof createClient>,
  replay: ReplayRow,
): Promise<PlanItem[]> {
  // Lấy chunks theo snapshot — paginate vì PostgREST cap 1000.
  const PAGE = 1000;
  const chunks: Array<{ seq: number; object_key: string; bytes: number }> = [];
  for (let from = 0; from < replay.snapshot_total_chunks; from += PAGE) {
    const to = Math.min(from + PAGE - 1, replay.snapshot_total_chunks - 1);
    const { data: page, error } = await supabase
      .from('chunked_recording_chunks')
      .select('seq, object_key, bytes')
      .eq('recording_id', replay.chunked_recording_id)
      .eq('status', 'uploaded')
      .order('seq', { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!page || page.length === 0) break;
    for (const c of page) chunks.push(c as any);
  }
  if (chunks.length < replay.snapshot_total_chunks) {
    throw new Error(`chunks shrank: ${chunks.length} < snapshot ${replay.snapshot_total_chunks}`);
  }

  const totalBytes = replay.snapshot_total_bytes;
  const FIXED = pickFixedPartSize(totalBytes);

  // Walk chunks tuần tự; mỗi part lấy đúng FIXED bytes (trừ part cuối).
  const plan: PlanItem[] = [];
  let ci = 0;                  // chunk index
  let cOff = 0;                // offset trong chunk hiện tại
  while (ci < chunks.length) {
    const remainingTotal = totalBytes - plan.reduce((s, p) => s + p.bytes, 0);
    const isLast = remainingTotal <= FIXED;
    const want = isLast ? remainingTotal : FIXED;
    const slices: PlanSlice[] = [];
    let acc = 0;
    while (acc < want && ci < chunks.length) {
      const c = chunks[ci] as any;
      const cBytes = Number(c.bytes || 0);
      const avail = cBytes - cOff;
      const take = Math.min(avail, want - acc);
      slices.push({ key: c.object_key, offset: cOff, length: take });
      acc += take;
      cOff += take;
      if (cOff >= cBytes) { ci++; cOff = 0; }
    }
    if (acc !== want) {
      throw new Error(`plan mismatch: got ${acc} want ${want} (part ${plan.length + 1})`);
    }
    plan.push({ kind: 'merge', sources: slices, bytes: acc });
    if (isLast) break;
  }

  if (plan.length > MAX_PARTS) {
    throw new Error(`Plan has ${plan.length} parts > MAX_PARTS ${MAX_PARTS}`);
  }
  // Validate: mọi part không-cuối phải bằng FIXED và >= MIN_PART_SIZE
  for (let p = 0; p < plan.length - 1; p++) {
    if (plan[p].bytes !== FIXED) {
      throw new Error(`non-trailing part ${p + 1} size ${plan[p].bytes} ≠ FIXED ${FIXED}`);
    }
  }
  const totalBytesPlanned = plan.reduce((s, p) => s + p.bytes, 0);
  if (totalBytesPlanned !== totalBytes) {
    throw new Error(`Plan bytes ${totalBytesPlanned} ≠ snapshot ${totalBytes}`);
  }
  console.log('[CONCAT] plan-built', {
    replay_id: replay.id, fixed_part_size: FIXED, parts: plan.length,
    total_bytes: totalBytes, last_part_size: plan[plan.length - 1].bytes,
  });
  return plan;
}

async function processReplay(
  supabase: ReturnType<typeof createClient>,
  replay: ReplayRow,
  ctx: { r2PublicUrl: string; deadlineMs: number },
): Promise<{ status: string; message: string; bytes?: number; partsDone?: number; total?: number }> {
  const targetKey = `recordings/${replay.chunked_recording_id}/replay.webm`;

  // Idempotent: file đã tồn tại với đúng size → set queued.
  const head = await headObject(targetKey);
  if (head && head.size === replay.snapshot_total_bytes) {
    await supabase.from('live_replays').update({
      status: 'queued',
      source_webm_key: targetKey,
      source_webm_size: head.size,
      concat_completed_at: new Date().toISOString(),
      last_cf_status: 'concat_already_exists',
      last_cf_response: { size: head.size },
      concat_upload_id: null,
      concat_plan: null,
      concat_completed_parts: [],
      concat_next_part: 0,
    }).eq('id', replay.id);
    return { status: 'queued', message: 'replay.webm already on R2', bytes: head.size };
  }

  // ── Resume hoặc khởi tạo state ─────────────────────────────────────────────
  let plan: PlanItem[];
  let uploadId: string;
  let completedParts: Array<{ PartNumber: number; ETag: string }>;
  let nextPart: number;

  if (replay.concat_upload_id && Array.isArray(replay.concat_plan) && replay.concat_plan.length > 0) {
    plan = replay.concat_plan as PlanItem[];
    uploadId = replay.concat_upload_id;
    completedParts = (replay.concat_completed_parts as any) || [];
    nextPart = replay.concat_next_part ?? completedParts.length;
    console.log('[CONCAT] resume', {
      replay_id: replay.id, uploadId: uploadId.slice(0, 16) + '…',
      next_part: nextPart, total: plan.length,
    });
  } else {
    plan = await buildPlan(supabase, replay);
    uploadId = await createMultipart(targetKey, 'video/webm');
    completedParts = [];
    nextPart = 0;
    await supabase.from('live_replays').update({
      concat_started_at: new Date().toISOString(),
      concat_upload_id: uploadId,
      concat_plan: plan as any,
      concat_completed_parts: [],
      concat_next_part: 0,
      last_cf_status: 'concat_starting',
    }).eq('id', replay.id);
    console.log('[CONCAT] plan', {
      replay_id: replay.id,
      parts: plan.length,
      total_bytes: plan.reduce((s, p) => s + p.bytes, 0),
      snapshot_bytes: replay.snapshot_total_bytes,
    });
  }

  // ── Vòng lặp upload từ nextPart ────────────────────────────────────────────
  const PERSIST_EVERY = 5;
  let lastPersisted = nextPart;

  try {
    for (let p = nextPart; p < plan.length; p++) {
      if (Date.now() > ctx.deadlineMs) {
        // Persist progress trước khi pause
        if (completedParts.length > lastPersisted) {
          await supabase.from('live_replays').update({
            concat_completed_parts: completedParts as any,
            concat_next_part: completedParts.length,
            last_cf_status: `concat_paused_${completedParts.length}_of_${plan.length}`,
          }).eq('id', replay.id);
        }
        throw new TimeoutPause(completedParts.length, plan.length);
      }
      const item = plan[p];
      const partNumber = p + 1;

      const buffers: Uint8Array[] = [];
      for (const src of item.sources) {
        const data = await fetchChunkBytes(
          `${ctx.r2PublicUrl}/${src.key}`,
          src.offset,
          src.length,
        );
        buffers.push(data);
      }
      const total = buffers.reduce((s, b) => s + b.byteLength, 0);
      if (total !== item.bytes) {
        throw new Error(`part ${partNumber} merged size ${total} ≠ planned ${item.bytes}`);
      }
      const merged = new Uint8Array(total);
      let off = 0;
      for (const b of buffers) { merged.set(b, off); off += b.byteLength; }
      const etag = await uploadPart(targetKey, uploadId, partNumber, merged);
      completedParts.push({ PartNumber: partNumber, ETag: etag });

      // Persist mỗi PERSIST_EVERY part
      if (completedParts.length - lastPersisted >= PERSIST_EVERY) {
        await supabase.from('live_replays').update({
          concat_completed_parts: completedParts as any,
          concat_next_part: completedParts.length,
          last_cf_status: `concat_progress_${completedParts.length}_of_${plan.length}`,
        }).eq('id', replay.id);
        lastPersisted = completedParts.length;
        console.log('[CONCAT] progress', {
          replay_id: replay.id, parts_done: completedParts.length, total: plan.length,
        });
      }
    }

    // Guard: kiểm tra mọi non-trailing part cùng size trước khi gọi Complete
    // (R2 trả 'InvalidPart - All non-trailing parts must have the same length' nếu lệch)
    if (plan.length > 1) {
      const firstSize = plan[0].bytes;
      for (let p = 0; p < plan.length - 1; p++) {
        if (plan[p].bytes !== firstSize) {
          throw new Error(
            `R2 part size mismatch: part ${p + 1} = ${plan[p].bytes}, expected ${firstSize} (R2 requires uniform non-trailing parts)`,
          );
        }
      }
    }
    // Hoàn tất
    await completeMultipart(targetKey, uploadId, completedParts);
  } catch (err) {
    if (err instanceof TimeoutPause) {
      console.log('[CONCAT] paused (will resume next tick)', {
        replay_id: replay.id, parts_done: err.partsDone, total: err.total,
      });
      return {
        status: 'paused', message: `paused ${err.partsDone}/${err.total}`,
        partsDone: err.partsDone, total: err.total,
      };
    }
    // Lỗi thực sự → abort + reset state để tick sau làm mới hoàn toàn
    console.error('[CONCAT] hard error, aborting multipart', {
      replay_id: replay.id, uploadId: uploadId.slice(0, 16) + '…', err: String(err),
    });
    await abortMultipart(targetKey, uploadId);
    await supabase.from('live_replays').update({
      concat_upload_id: null,
      concat_plan: null,
      concat_completed_parts: [],
      concat_next_part: 0,
    }).eq('id', replay.id);
    throw err;
  }

  // Verify
  const verify = await headObject(targetKey);
  if (!verify || verify.size !== replay.snapshot_total_bytes) {
    throw new Error(`verify failed size=${verify?.size} expected=${replay.snapshot_total_bytes}`);
  }

  await supabase.from('live_replays').update({
    status: 'queued',
    source_webm_key: targetKey,
    source_webm_size: verify.size,
    concat_completed_at: new Date().toISOString(),
    last_cf_status: 'concat_done',
    last_cf_response: { size: verify.size, parts: plan.length },
    error_message: null,
    last_error_at: null,
    concat_upload_id: null,
    concat_plan: null,
    concat_completed_parts: [],
    concat_next_part: 0,
  }).eq('id', replay.id);

  console.log('[CONCAT] done', { replay_id: replay.id, parts: plan.length, bytes: verify.size });
  return { status: 'queued', message: 'concat done', bytes: verify.size };
}

// ─── HTTP handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') || '';
  const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'));
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const ok =
    authHeader === `Bearer ${serviceRoleKey}` ||
    authHeader === `Bearer ${anonKey}` ||
    (cronSecret && req.headers.get('X-Cron-Secret') === cronSecret);
  if (!ok) return json({ error: 'Unauthorized' }, 401);

  const r2PublicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
  if (!r2PublicUrl) return json({ error: 'Missing CLOUDFLARE_R2_PUBLIC_URL' }, 500);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Lấy 1 replay_id cụ thể nếu có
  let specificId: string | null = null;
  try {
    const body = await req.json();
    if (body?.replay_id) specificId = String(body.replay_id);
  } catch { /* body trống */ }

  // Bắt các replay đã FREEZE snapshot mà chưa concat: status='queued' AND
  // source_webm_key IS NULL  (readiness-check sets status=queued ngay; Phase 2
  // muốn concat trước /copy nên ta cũng bao gồm 'normalizing' nếu được set).
  const SELECT_COLS = 'id, chunked_recording_id, snapshot_total_bytes, snapshot_total_chunks, status, source_webm_key, concat_upload_id, concat_plan, concat_completed_parts, concat_next_part';

  // Lock advisory: chỉ pick 'normalizing' nếu concat_started_at < now()-90s.
  const STALE_LOCK_AT = new Date(Date.now() - 90_000).toISOString();

  // FIX 06/05/2026: tách 2 query thay vì chain 2 `.or()` (PostgREST chain
  // gây miss record). Query A = status='queued' AND source_webm_key NULL,
  // Query B = status='queued' AND source_webm_key LIKE manifest.json,
  // Query C = status='normalizing' stale. Merge & dedupe ở client.
  let replays: any[] = [];
  let error: any = null;

  if (specificId) {
    const { data, error: e } = await supabase
      .from('live_replays').select(SELECT_COLS).eq('id', specificId);
    replays = data || []; error = e;
  } else {
    const baseQ = () => supabase
      .from('live_replays')
      .select(SELECT_COLS)
      .eq('cloudflare_vod_enabled', true)
      .not('snapshot_total_bytes', 'is', null)
      .order('snapshot_frozen_at', { ascending: true, nullsFirst: false })
      .limit(MAX_REPLAYS_PER_RUN);

    const [qA, qB, qC] = await Promise.all([
      baseQ().eq('status', 'queued').is('source_webm_key', null),
      baseQ().eq('status', 'queued').like('source_webm_key', '%/manifest.json'),
      baseQ().eq('status', 'normalizing').lt('concat_started_at', STALE_LOCK_AT),
    ]);
    error = qA.error || qB.error || qC.error;
    const seen = new Set<string>();
    for (const row of [...(qA.data || []), ...(qB.data || []), ...(qC.data || [])]) {
      if (!seen.has((row as any).id)) { seen.add((row as any).id); replays.push(row); }
      if (replays.length >= MAX_REPLAYS_PER_RUN) break;
    }
  }

  if (error) {
    console.error('[CONCAT] query error', error);
    return json({ error: (error as any).message || String(error) }, 500);
  }
  console.log('[CONCAT] picked', { count: replays.length, ids: replays.map((r: any) => r.id) });

  const totalDeadline = Date.now() + TOTAL_BUDGET_MS;
  const results: any[] = [];
  for (const r of (replays || [])) {
    if (Date.now() >= totalDeadline) break;
    const replay = r as any as ReplayRow & { source_webm_key: string | null };
    console.log('[CONCAT] processing', { replay_id: replay.id, status: replay.status, key: replay.source_webm_key, bytes: replay.snapshot_total_bytes });
    if (replay.source_webm_key && replay.source_webm_key.endsWith('/replay.webm')) {
      results.push({ replay_id: replay.id, action: 'skip_already_concat' });
      continue;
    }
    if (!replay.snapshot_total_bytes || !replay.snapshot_total_chunks) {
      results.push({ replay_id: replay.id, action: 'skip_no_snapshot' });
      continue;
    }

    // Lock chuyển status sang 'normalizing' + bump concat_started_at làm advisory lock.
    // Lock: chỉ update nếu status hiện tại đúng như đã pick.
    // Tránh dùng `.or()` với and() embedded vì PostgREST nuốt rows không nhất quán.
    let lockQuery = supabase
      .from('live_replays')
      .update({
        status: 'normalizing',
        last_cf_status: 'concat_in_progress',
        concat_started_at: new Date().toISOString(),
      })
      .eq('id', replay.id);
    if (replay.status === 'normalizing') {
      lockQuery = lockQuery.eq('status', 'normalizing').lt('concat_started_at', STALE_LOCK_AT);
    } else {
      lockQuery = lockQuery.eq('status', 'queued');
    }
    const { data: locked, error: lockErr } = await lockQuery.select('id').maybeSingle();
    if (lockErr) console.error('[CONCAT] lock error', { replay_id: replay.id, err: lockErr.message });
    if (!locked) {
      console.log('[CONCAT] lock lost', { replay_id: replay.id, status: replay.status });
      results.push({ replay_id: replay.id, action: 'skip_lock_lost' });
      continue;
    }

    try {
      const out = await processReplay(supabase, replay, {
        r2PublicUrl,
        deadlineMs: Math.min(totalDeadline, Date.now() + PER_REPLAY_BUDGET_MS),
      });
      results.push({ replay_id: replay.id, ...out });
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[CONCAT] error', { replay_id: replay.id, err: msg });
      // processReplay đã abort+reset state khi hard error. Giữ status='normalizing'
      // để tick sau khởi tạo multipart mới.
      await supabase.from('live_replays').update({
        last_cf_status: 'concat_failed',
        last_cf_response: { error: msg.slice(0, 500) },
        error_message: `concat: ${msg.slice(0, 300)}`,
        last_error_at: new Date().toISOString(),
      }).eq('id', replay.id);
      results.push({ replay_id: replay.id, error: msg });
    }
  }

  return json({ processed: results.length, results, timestamp: new Date().toISOString() });
});
