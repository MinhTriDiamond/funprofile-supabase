/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * R2 multipart upload helpers (S3-compatible).
 * Dùng cho server-side archive: stream từng part từ Cloudflare Stream MP4 → R2.
 * Resumable: lưu uploadId + parts_done trong DB; mỗi cron tick chỉ upload 1 part.
 *
 * Tự ký SigV4 ngay trong file này (KHÔNG depend `aws4fetch` / SDK) để giữ edge function nhẹ.
 */

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
  host: string;
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

/**
 * SigV4 cho request có query string + body (UNSIGNED-PAYLOAD ok với R2).
 */
async function signedR2Request(opts: {
  method: string;
  key: string; // object key trong bucket; rỗng = bucket-level (vd: list multipart)
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: BodyInit;
}): Promise<Response> {
  const r2 = getR2Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalUri = opts.key
    ? `/${r2.bucketName}/${opts.key.split('/').map(encodeURIComponent).join('/')}`
    : `/${r2.bucketName}`;

  const queryParams = opts.query || {};
  const sortedQueryKeys = Object.keys(queryParams).sort();
  const canonicalQuery = sortedQueryKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');

  const allHeaders: Record<string, string> = {
    ...Object.fromEntries(Object.entries(opts.headers || {}).map(([k, v]) => [k.toLowerCase(), v])),
    host: r2.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sorted = Object.keys(allHeaders).sort();
  const signedHeaders = sorted.join(';');
  const canonicalHeaders = sorted.map((k) => `${k}:${allHeaders[k]}`).join('\n') + '\n';

  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const requestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, requestHash].join('\n');
  const signature = toHex(await hmacSha256(await getSignatureKey(r2.secretAccessKey, dateStamp), stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${r2.host}${canonicalUri}${canonicalQuery ? `?${canonicalQuery}` : ''}`;
  return fetch(url, {
    method: opts.method,
    headers: { ...allHeaders, Authorization: authorization },
    body: opts.body,
  });
}

export interface MultipartInitResult {
  uploadId: string;
  key: string;
  bucket: string;
}

/**
 * CreateMultipartUpload: trả về uploadId để dùng cho mỗi part.
 */
export async function createMultipartUpload(key: string, contentType = 'video/mp4'): Promise<MultipartInitResult> {
  const r2 = getR2Config();
  const resp = await signedR2Request({
    method: 'POST',
    key,
    query: { uploads: '' },
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`R2 createMultipartUpload failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  const xml = await resp.text();
  const m = xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!m) throw new Error(`R2 createMultipartUpload: no UploadId in response. Body=${xml.slice(0, 200)}`);
  return { uploadId: m[1], key, bucket: r2.bucketName };
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
  size: number;
}

/**
 * UploadPart: PUT 1 part vào uploadId. Trả ETag để Complete sau.
 * Body có thể là Uint8Array hoặc ReadableStream — content-length BẮT BUỘC để R2 chấp nhận.
 */
export async function uploadPart(opts: {
  key: string;
  uploadId: string;
  partNumber: number;
  body: Uint8Array | ReadableStream<Uint8Array>;
  contentLength: number;
}): Promise<UploadedPart> {
  if (opts.partNumber < 1 || opts.partNumber > 10000) {
    throw new Error(`Invalid partNumber ${opts.partNumber} (must be 1..10000)`);
  }
  const resp = await signedR2Request({
    method: 'PUT',
    key: opts.key,
    query: { partNumber: String(opts.partNumber), uploadId: opts.uploadId },
    headers: { 'content-length': String(opts.contentLength) },
    body: opts.body as BodyInit,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`R2 uploadPart ${opts.partNumber} failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  // Drain body to free socket
  try { await resp.arrayBuffer(); } catch { /* ignore */ }
  const etag = (resp.headers.get('etag') || '').replace(/"/g, '');
  if (!etag) throw new Error(`R2 uploadPart ${opts.partNumber}: missing ETag header`);
  return { partNumber: opts.partNumber, etag, size: opts.contentLength };
}

/**
 * CompleteMultipartUpload: gửi danh sách parts theo thứ tự. R2 sẽ ghép thành object cuối.
 */
export async function completeMultipartUpload(opts: {
  key: string;
  uploadId: string;
  parts: UploadedPart[];
}): Promise<{ url: string; key: string; bucket: string }> {
  const r2 = getR2Config();
  const sorted = [...opts.parts].sort((a, b) => a.partNumber - b.partNumber);
  const xmlBody =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<CompleteMultipartUpload xmlns="http://s3.amazonaws.com/doc/2006-03-01/">` +
    sorted.map((p) =>
      `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`
    ).join('') +
    `</CompleteMultipartUpload>`;
  const resp = await signedR2Request({
    method: 'POST',
    key: opts.key,
    query: { uploadId: opts.uploadId },
    headers: { 'content-type': 'application/xml' },
    body: xmlBody,
  });
  const text = await resp.text().catch(() => '');
  if (!resp.ok) {
    throw new Error(`R2 completeMultipartUpload failed: ${resp.status} ${text.slice(0, 300)}`);
  }
  // R2 trả 200 nhưng có thể chứa <Error>...</Error> — check
  if (/<Error>/i.test(text)) {
    throw new Error(`R2 completeMultipartUpload returned error body: ${text.slice(0, 300)}`);
  }
  return { url: `${r2.publicUrl}/${opts.key}`, key: opts.key, bucket: r2.bucketName };
}

/**
 * AbortMultipartUpload: xoá uploadId + tất cả parts đã upload (giải phóng quota).
 */
export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  const resp = await signedR2Request({
    method: 'DELETE',
    key,
    query: { uploadId },
  });
  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text().catch(() => '');
    console.warn('[R2_ABORT_MULTIPART_FAILED]', { key, uploadId, status: resp.status, body: text.slice(0, 200) });
  }
}

/**
 * Stream-fetch 1 chunk từ Cloudflare MP4 URL bằng Range header.
 * Trả stream để archive video dài không phải giữ nguyên part lớn trong memory.
 */
export async function fetchRangeStreamFromUrl(
  url: string,
  startByte: number,
  endByteInclusive: number,
): Promise<ReadableStream<Uint8Array>> {
  const resp = await fetch(url, {
    headers: { Range: `bytes=${startByte}-${endByteInclusive}` },
  });
  if (resp.status !== 206 || !resp.body) {
    const err = new Error(`Range stream fetch failed: ${resp.status}`) as Error & { httpStatus?: number; notFound?: boolean };
    err.httpStatus = resp.status;
    err.notFound = resp.status === 404;
    throw err;
  }
  return resp.body;
}

/**
 * Stream-fetch 1 chunk từ Cloudflare MP4 URL bằng Range header.
 * Trả Uint8Array cho các lối cũ/cần kiểm tra byte length.
 */
export async function fetchRangeFromUrl(url: string, startByte: number, endByteInclusive: number): Promise<Uint8Array> {
  const resp = await fetch(url, {
    headers: { Range: `bytes=${startByte}-${endByteInclusive}` },
  });
  if (resp.status !== 206 && resp.status !== 200) {
    const err = new Error(`Range fetch failed: ${resp.status}`) as Error & { httpStatus?: number; notFound?: boolean };
    err.httpStatus = resp.status;
    err.notFound = resp.status === 404;
    throw err;
  }
  const buf = await resp.arrayBuffer();
  return new Uint8Array(buf);
}

/**
 * HEAD url để lấy content-length (Cloudflare MP4) — KHÔNG cần SigV4 (URL public).
 */
export async function headContentLength(url: string): Promise<number> {
  // Một số CDN/origin trả 405 với HEAD → fallback Range 0-0 lấy content-range total
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (head && head.ok) {
    const len = Number(head.headers.get('content-length') || 0);
    if (Number.isFinite(len) && len > 0) return len;
  }
  const r = await fetch(url, { headers: { Range: 'bytes=0-0' } });
  if (r.status === 206) {
    const cr = r.headers.get('content-range') || '';
    const m = cr.match(/\/(\d+)$/);
    try { await r.arrayBuffer(); } catch { /* drain */ }
    if (m) return Number(m[1]);
  }
  try { await r.arrayBuffer(); } catch { /* drain */ }
  throw new Error(`headContentLength: cannot determine content-length (status=${r.status})`);
}
