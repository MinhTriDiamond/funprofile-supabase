/* eslint-disable @typescript-eslint/no-explicit-any */
// R2 diagnostic — PUT/HEAD/DELETE a tiny probe object using the SAME credentials
// Agora Cloud Recording receives. Helps prove whether R2 access is the root cause
// of `uploadingStatus: "backuped"`.
//
// Usage (admin-only):
//   POST /functions/v1/r2-diagnostic   (Authorization: Bearer <admin user JWT>)
//   optional body: { "bucket": "override-bucket-name" }

import { corsHeaders, createAdminClient, HttpError, json, normalizeError, requireUser } from '../_shared/httpAuth.ts';

const enc = new TextEncoder();

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
}

async function signingKey(secret: string, dateStamp: string, region: string, service: string) {
  const kDate = await hmac(enc.encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  return await hmac(kService, 'aws4_request');
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface SignedFetchInput {
  method: 'PUT' | 'HEAD' | 'DELETE' | 'GET';
  endpoint: string; // host only, no scheme
  bucket: string;
  key: string;
  accessKeyId: string;
  secretAccessKey: string;
  body?: Uint8Array;
  region?: string;
}

async function signedFetch(input: SignedFetchInput): Promise<{ status: number; statusText: string; bodyPreview: string; headers: Record<string, string> }> {
  const region = input.region || 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const host = input.endpoint;
  const canonicalUri = `/${encodeURIComponent(input.bucket)}/${input.key.split('/').map(encodeURIComponent).join('/')}`;
  const canonicalQuery = '';
  const body = input.body ?? new Uint8Array();
  const payloadHash = await sha256Hex(body);

  const headers: Record<string, string> = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (input.method === 'PUT' && body.length) headers['content-type'] = 'text/plain';

  const sortedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
  const signedHeaders = sortedHeaderNames.join(';');

  const canonicalRequest = [
    input.method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const key = await signingKey(input.secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmac(key, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}${canonicalUri}`, {
    method: input.method,
    headers: { ...headers, Authorization: authorization },
    body: input.method === 'PUT' ? body : undefined,
  });
  const text = await res.text();
  const respHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { respHeaders[k] = v; });
  return { status: res.status, statusText: res.statusText, bodyPreview: text.slice(0, 800), headers: respHeaders };
}

async function isAdmin(admin: any, userId: string): Promise<boolean> {
  const { data } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();
  return !!data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const admin = createAdminClient() as any;
    const user = await requireUser(req);
    if (!(await isAdmin(admin, user.id))) {
      throw new HttpError(403, 'FORBIDDEN', 'Chỉ admin mới chạy được r2-diagnostic.');
    }

    const body = await req.json().catch(() => ({}));
    const bucketOverride = typeof body.bucket === 'string' ? body.bucket.trim() : '';

    let endpoint = (Deno.env.get('AGORA_RECORDING_STORAGE_ENDPOINT') || '').trim();
    endpoint = endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const bucket = bucketOverride || Deno.env.get('R2_TEMP_BUCKET') || '';
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID') || Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID') || '';
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY') || Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY') || '';

    const meta = {
      endpoint,
      bucket,
      accessKeyIdPreview: accessKeyId ? `${accessKeyId.slice(0, 4)}...${accessKeyId.slice(-4)}` : '(missing)',
      accessKeyIdLength: accessKeyId.length,
      hasSecret: !!secretAccessKey,
    };

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      return json({ ok: false, meta, error: 'MISSING_R2_CONFIG' }, 200);
    }

    const key = `_diagnostic/probe-${Date.now()}-${crypto.randomUUID().slice(0, 8)}.txt`;
    const payload = enc.encode(`r2-diagnostic probe ${new Date().toISOString()}`);

    const put = await signedFetch({ method: 'PUT', endpoint, bucket, key, accessKeyId, secretAccessKey, body: payload });
    let head: any = null;
    let del: any = null;
    if (put.status >= 200 && put.status < 300) {
      head = await signedFetch({ method: 'HEAD', endpoint, bucket, key, accessKeyId, secretAccessKey });
      del = await signedFetch({ method: 'DELETE', endpoint, bucket, key, accessKeyId, secretAccessKey });
    }

    const diagnosis = (() => {
      if (put.status === 200 || put.status === 204) return 'R2_OK_AGORA_ISSUE';
      if (put.status === 403) return 'R2_FORBIDDEN_CHECK_TOKEN_PERMISSIONS';
      if (put.status === 404) return 'R2_BUCKET_NOT_FOUND_CHECK_BUCKET_NAME';
      if (put.status === 401) return 'R2_BAD_CREDENTIALS';
      return `R2_UNEXPECTED_${put.status}`;
    })();

    return json({ ok: put.status >= 200 && put.status < 300, meta, key, diagnosis, put, head, delete: del }, 200);
  } catch (error) {
    const normalized = normalizeError(error);
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: normalized.message, code: normalized.code || 'R2_DIAGNOSTIC_FAILED' }, status);
  }
});
