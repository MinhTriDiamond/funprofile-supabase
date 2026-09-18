/* eslint-disable @typescript-eslint/no-explicit-any */
const encoder = new TextEncoder();

export interface R2ObjectInfo {
  key: string;
  size: number;
  lastModified?: string | null;
}

function requireEnv(name: string, fallbacks: string[] = []): string {
  for (const key of [name, ...fallbacks]) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  throw new Error(`Missing required env ${name}`);
}

function defaultEndpointRoot(): string {
  const accountId = requireEnv('R2_ACCOUNT_ID', ['CLOUDFLARE_ACCOUNT_ID']);
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

function tempEndpointRoot(): string {
  // Prefer explicit override, else derive from Agora's recording endpoint
  // (Agora uploads to the temp bucket, so its endpoint matches the temp account).
  const explicit = Deno.env.get('R2_TEMP_ENDPOINT')?.trim();
  if (explicit) return explicit.startsWith('http') ? explicit : `https://${explicit}`;
  const agora = Deno.env.get('AGORA_RECORDING_STORAGE_ENDPOINT')?.trim();
  if (agora) return agora.startsWith('http') ? agora : `https://${agora}`;
  return defaultEndpointRoot();
}

function isTempBucket(bucket: string): boolean {
  const tempName = Deno.env.get('R2_TEMP_BUCKET') || 'r2livetemp';
  return bucket === tempName;
}

function resolveCreds(bucket: string): { accessKey: string; secretKey: string; endpoint: string } {
  if (isTempBucket(bucket) && Deno.env.get('R2_TEMP_ACCESS_KEY_ID') && Deno.env.get('R2_TEMP_SECRET_ACCESS_KEY')) {
    return {
      accessKey: (Deno.env.get('R2_TEMP_ACCESS_KEY_ID') || '').trim(),
      secretKey: (Deno.env.get('R2_TEMP_SECRET_ACCESS_KEY') || '').trim(),
      endpoint: tempEndpointRoot(),
    };
  }
  return {
    accessKey: requireEnv('R2_ACCESS_KEY_ID', ['CLOUDFLARE_ACCESS_KEY_ID']).trim(),
    secretKey: requireEnv('R2_SECRET_ACCESS_KEY', ['CLOUDFLARE_SECRET_ACCESS_KEY']).trim(),
    endpoint: defaultEndpointRoot(),
  };
}

function awsRegion(): string {
  return Deno.env.get('R2_REGION') || 'auto';
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256(data: string | Uint8Array): Promise<string> {
  const payload = typeof data === 'string' ? encoder.encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', payload));
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

async function signingKey(secret: string, date: string, region: string): Promise<ArrayBuffer> {
  const kDate = await hmac(encoder.encode(`AWS4${secret}`), date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 's3');
  return await hmac(kService, 'aws4_request');
}

function encodePath(key: string): string {
  return key.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function normalizeHeaders(headers: Record<string, string>): { canonical: string; signed: string } {
  const entries = Object.entries(headers)
    .map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    canonical: entries.map(([k, v]) => `${k}:${v}\n`).join(''),
    signed: entries.map(([k]) => k).join(';'),
  };
}

async function signedRequest(
  bucket: string,
  method: string,
  key: string,
  opts: { query?: string; headers?: Record<string, string>; body?: Uint8Array | string | null } = {},
): Promise<Response> {
  const creds = resolveCreds(bucket);
  const accessKey = creds.accessKey;
  const secretKey = creds.secretKey;
  const region = awsRegion();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const endpoint = creds.endpoint;
  const path = key ? `/${bucket}/${encodePath(key)}` : `/${bucket}`;
  const url = new URL(`${endpoint}${path}`);
  if (opts.query) url.search = opts.query;

  const payloadHash = method === 'GET' || method === 'HEAD' || method === 'DELETE' || opts.headers?.['x-amz-copy-source']
    ? 'UNSIGNED-PAYLOAD'
    : await sha256(typeof opts.body === 'string' ? opts.body : (opts.body || new Uint8Array()));
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(opts.headers || {}),
  };
  const { canonical, signed } = normalizeHeaders(headers);
  // AWS SigV4 requires query params sorted alphabetically by key,
  // with both keys and values URI-encoded (spaces as %20, not '+').
  const canonicalQuery = (() => {
    if (!url.search) return '';
    const params: Array<[string, string]> = [];
    for (const [k, v] of url.searchParams.entries()) params.push([k, v]);
    params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return params.map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  })();
  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQuery,
    canonical,
    signed,
    payloadHash,
  ].join('\n');
  const credentialScope = `${date}/${region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');
  const signature = hex(await hmac(await signingKey(secretKey, date, region), stringToSign));
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signed}, Signature=${signature}`;

  return await fetch(url.toString(), {
    method,
    headers,
    body: typeof opts.body === 'string' ? opts.body : (opts.body || undefined),
  });
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function headR2ObjectInBucket(bucket: string, key: string): Promise<{ size: number; contentType?: string | null } | null> {
  const res = await signedRequest(bucket, 'HEAD', key);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 HEAD failed ${res.status}: ${await res.text().catch(() => '')}`);
  return {
    size: Number(res.headers.get('content-length') || 0),
    contentType: res.headers.get('content-type'),
  };
}

export async function listR2Objects(bucket: string, prefix: string, maxKeys = 1000): Promise<R2ObjectInfo[]> {
  const query = new URLSearchParams({ 'list-type': '2', prefix, 'max-keys': String(maxKeys) }).toString();
  const res = await signedRequest(bucket, 'GET', '', { query });
  const text = await res.text();
  if (!res.ok) throw new Error(`R2 LIST failed ${res.status}: ${text}`);
  const contents = [...text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];
  return contents.map((match) => {
    const block = match[1] || '';
    const key = decodeXml((block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] || '').trim());
    const size = Number(block.match(/<Size>([\s\S]*?)<\/Size>/)?.[1] || 0);
    const lastModified = block.match(/<LastModified>([\s\S]*?)<\/LastModified>/)?.[1] || null;
    return { key, size, lastModified };
  }).filter((item) => item.key);
}

export async function copyR2Object(input: {
  sourceBucket: string;
  sourceKey: string;
  targetBucket: string;
  targetKey: string;
}): Promise<void> {
  const sourceCreds = resolveCreds(input.sourceBucket);
  const targetCreds = resolveCreds(input.targetBucket);
  const sameAccount = sourceCreds.endpoint === targetCreds.endpoint && sourceCreds.accessKey === targetCreds.accessKey;

  if (sameAccount) {
    const source = `/${input.sourceBucket}/${encodePath(input.sourceKey)}`;
    const res = await signedRequest(input.targetBucket, 'PUT', input.targetKey, {
      headers: {
        'x-amz-copy-source': source,
        'x-amz-metadata-directive': 'COPY',
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`R2 COPY failed ${res.status}: ${text}`);
    return;
  }

  // Cross-account: stream GET from source then PUT to target.
  const getRes = await signedRequest(input.sourceBucket, 'GET', input.sourceKey);
  if (!getRes.ok) {
    throw new Error(`R2 cross-account GET failed ${getRes.status}: ${await getRes.text().catch(() => '')}`);
  }
  const contentType = getRes.headers.get('content-type') || 'application/octet-stream';
  const body = new Uint8Array(await getRes.arrayBuffer());
  await putR2ObjectInBucket({
    bucket: input.targetBucket,
    key: input.targetKey,
    body,
    contentType,
  });
}

export async function putR2ObjectInBucket(input: {
  bucket: string;
  key: string;
  body: Uint8Array;
  contentType?: string | null;
}): Promise<void> {
  const res = await signedRequest(input.bucket, 'PUT', input.key, {
    headers: {
      'content-type': input.contentType || 'application/octet-stream',
    },
    body: input.body,
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`R2 PUT failed ${res.status}: ${text}`);
}

export async function deleteR2ObjectInBucket(bucket: string, key: string): Promise<void> {
  const res = await signedRequest(bucket, 'DELETE', key);
  if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE failed ${res.status}: ${await res.text().catch(() => '')}`);
}

export function publicArchiveUrl(key: string): string | null {
  const base = Deno.env.get('R2_PUBLIC_BASE_URL') || Deno.env.get('R2_PUBLIC_DOMAIN') || Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
}

export function publicTempUrl(key: string): string | null {
  const base = Deno.env.get('R2_TEMP_PUBLIC_BASE_URL') || Deno.env.get('R2_TEMP_PUBLIC_DOMAIN');
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`;
}
