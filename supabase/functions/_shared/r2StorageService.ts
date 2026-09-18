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

// ====== List + delete prefix (cleanup webm nguồn + chunks) ======
async function signedR2ListRequest(prefix: string, continuationToken?: string): Promise<Response> {
  const r2 = getR2Config();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const queryParams: Record<string, string> = {
    'list-type': '2',
    'max-keys': '1000',
    prefix,
  };
  if (continuationToken) queryParams['continuation-token'] = continuationToken;
  const sortedQueryKeys = Object.keys(queryParams).sort();
  const canonicalQuery = sortedQueryKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
    .join('&');
  const canonicalUri = `/${r2.bucketName}`;

  const allHeaders: Record<string, string> = {
    host: r2.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sorted = Object.keys(allHeaders).sort();
  const signedHeaders = sorted.join(';');
  const canonicalHeaders = sorted.map((k) => `${k}:${allHeaders[k]}`).join('\n') + '\n';
  const canonicalRequest = ['GET', canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const requestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, requestHash].join('\n');
  const signature = toHex(await hmacSha256(await getSignatureKey(r2.secretAccessKey, dateStamp), stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${r2.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return fetch(`https://${r2.host}${canonicalUri}?${canonicalQuery}`, {
    method: 'GET',
    headers: { ...allHeaders, Authorization: authorization },
  });
}

export async function listR2Prefix(prefix: string, maxKeys = 5000): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const resp = await signedR2ListRequest(prefix, token);
    if (!resp.ok) throw new Error(`R2 list failed: ${resp.status}`);
    const xml = await resp.text();
    const keyMatches = xml.match(/<Key>([^<]+)<\/Key>/g) || [];
    for (const m of keyMatches) {
      const k = m.replace(/<\/?Key>/g, '');
      if (k) keys.push(k);
      if (keys.length >= maxKeys) break;
    }
    const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/);
    token = truncated && tokenMatch ? tokenMatch[1] : undefined;
  } while (token && keys.length < maxKeys);
  return keys;
}

export interface R2PlayableCheck {
  ok: boolean;
  status: number;
  contentLength: number | null;
  error?: string;
}

export async function verifyR2PlayableUrl(url: string, rangeBytes = 1): Promise<R2PlayableCheck> {
  if (!url) return { ok: false, status: 0, contentLength: null, error: 'empty url' };
  try {
    // Try a small Range GET first — works on R2 public URLs and proves the bytes are readable.
    const r = await fetch(url, {
      method: 'GET',
      headers: { Range: `bytes=0-${Math.max(0, rangeBytes - 1)}` },
    });
    const lenHeader = r.headers.get('content-range') || r.headers.get('content-length');
    const contentLength = lenHeader
      ? Number((lenHeader.match(/\/(\d+)$/)?.[1]) || lenHeader) || null
      : null;
    if (r.status === 200 || r.status === 206) {
      try { await r.arrayBuffer(); } catch { /* ignore body drain */ }
      return { ok: true, status: r.status, contentLength };
    }
    try { await r.arrayBuffer(); } catch { /* ignore */ }
    return { ok: false, status: r.status, contentLength, error: `unexpected status ${r.status}` };
  } catch (err) {
    return { ok: false, status: 0, contentLength: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteR2Prefix(prefix: string): Promise<{ deleted: number; failed: number; keys: string[] }> {
  if (!prefix || prefix === '/' || prefix.length < 4) {
    throw new Error(`Refuse to delete suspicious prefix: "${prefix}"`);
  }
  const keys = await listR2Prefix(prefix);
  let deleted = 0;
  let failed = 0;
  for (const key of keys) {
    try {
      await deleteR2Object(key);
      deleted++;
    } catch (err) {
      console.error('[R2] deletePrefix failed key', key, err);
      failed++;
    }
  }
  return { deleted, failed, keys };
}
