/**
 * Multipart Upload Edge Function
 * 
 * Handles S3-compatible multipart upload to Cloudflare R2
 * Actions: initiate, get-part-urls, complete, abort
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  isElevatedMediaAccount,
  validateUploadMedia,
} from '../_shared/mediaLimits.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMAC-SHA256 helper
async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return await hmacSha256(kService, 'aws4_request');
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getR2Config() {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!;
  const accessKeyId = Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID')!;
  const secretAccessKey = Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY')!;
  const bucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')!;
  const publicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL')!;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('Missing R2 configuration');
  }
  const host = `${accountId}.r2.cloudflarestorage.com`;
  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl, host };
}

async function signRequest(
  method: string,
  canonicalUri: string,
  headers: Record<string, string>,
  queryParams: URLSearchParams | null,
  payloadHash: string,
  config: ReturnType<typeof getR2Config>
): Promise<string> {
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  // Add required headers
  headers['x-amz-date'] = amzDate;
  headers['x-amz-content-sha256'] = payloadHash;
  headers['host'] = config.host;

  const sortedHeaderKeys = Object.keys(headers).sort();
  const signedHeaders = sortedHeaderKeys.join(';');
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k}:${headers[k]}`).join('\n') + '\n';
  const canonicalQueryString = queryParams ? (queryParams.sort(), queryParams.toString()) : '';

  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));
  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

  const signingKey = await getSignatureKey(config.secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  return `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

async function generatePresignedUrl(
  method: string,
  canonicalUri: string,
  config: ReturnType<typeof getR2Config>,
  expiresIn: number = 900,
  extraQuery?: Record<string, string>
): Promise<string> {
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${config.accessKeyId}/${credentialScope}`;

  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': algorithm,
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': expiresIn.toString(),
    'X-Amz-SignedHeaders': 'host',
    ...extraQuery,
  });
  queryParams.sort();

  const canonicalHeaders = `host:${config.host}\n`;
  const canonicalRequest = [method, canonicalUri, queryParams.toString(), canonicalHeaders, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const canonicalRequestHash = toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalRequest)));
  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

  const signingKey = await getSignatureKey(config.secretAccessKey, dateStamp, region, service);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  queryParams.append('X-Amz-Signature', signature);
  return `https://${config.host}${canonicalUri}?${queryParams.toString()}`;
}

// ============ ACTION HANDLERS ============

async function handleInitiate(key: string, contentType: string, config: ReturnType<typeof getR2Config>): Promise<Response> {
  const canonicalUri = `/${config.bucketName}/${key}`;
  const payloadHash = toHex(await crypto.subtle.digest('SHA-256', new Uint8Array(0) as BufferSource));
  
  const headers: Record<string, string> = {
    'content-type': contentType,
  };

  const authorization = await signRequest('POST', canonicalUri, headers, new URLSearchParams({ uploads: '' }), payloadHash, config);

  const url = `https://${config.host}${canonicalUri}?uploads=`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': authorization,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Initiate multipart upload failed:', errorText);
    throw new Error(`Failed to initiate multipart upload: ${response.status}`);
  }

  const xmlText = await response.text();
  // Parse UploadId from XML response
  const uploadIdMatch = xmlText.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!uploadIdMatch) {
    throw new Error('Failed to parse UploadId from response');
  }

  const uploadId = uploadIdMatch[1];
  console.log(`Initiated multipart upload for ${key}, uploadId: ${uploadId}`);

  return new Response(
    JSON.stringify({ uploadId, key }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleGetPartUrls(
  key: string,
  uploadId: string,
  partNumbers: number[],
  config: ReturnType<typeof getR2Config>
): Promise<Response> {
  const canonicalUri = `/${config.bucketName}/${key}`;
  
  const urls: Record<number, string> = {};
  
  // Generate presigned URLs for each part in parallel
  await Promise.all(
    partNumbers.map(async (partNumber) => {
      const url = await generatePresignedUrl('PUT', canonicalUri, config, 900, {
        'partNumber': partNumber.toString(),
        'uploadId': uploadId,
      });
      urls[partNumber] = url;
    })
  );

  console.log(`Generated ${partNumbers.length} presigned URLs for ${key}`);

  return new Response(
    JSON.stringify({ urls }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleComplete(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
  config: ReturnType<typeof getR2Config>
): Promise<Response> {
  const canonicalUri = `/${config.bucketName}/${key}`;

  // Build CompleteMultipartUpload XML
  const xmlParts = parts
    .sort((a, b) => a.partNumber - b.partNumber)
    .map(p => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag}</ETag></Part>`)
    .join('');
  const xmlBody = `<CompleteMultipartUpload>${xmlParts}</CompleteMultipartUpload>`;
  const bodyBytes = new TextEncoder().encode(xmlBody);

  const payloadHash = toHex(await crypto.subtle.digest('SHA-256', bodyBytes as BufferSource));
  
  const headers: Record<string, string> = {
    'content-type': 'application/xml',
  };

  const queryParams = new URLSearchParams({ uploadId });
  const authorization = await signRequest('POST', canonicalUri, headers, queryParams, payloadHash, config);

  const url = `https://${config.host}${canonicalUri}?${queryParams.toString()}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': authorization,
    },
    body: bodyBytes as unknown as BodyInit,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Complete multipart upload failed:', errorText);
    throw new Error(`Failed to complete multipart upload: ${response.status}`);
  }

  const publicUrl = `${config.publicUrl}/${key}`;
  console.log(`Completed multipart upload for ${key}`);

  return new Response(
    JSON.stringify({ url: publicUrl, key }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleAbort(key: string, uploadId: string, config: ReturnType<typeof getR2Config>): Promise<Response> {
  const canonicalUri = `/${config.bucketName}/${key}`;
  const payloadHash = toHex(await crypto.subtle.digest('SHA-256', new Uint8Array(0) as BufferSource));
  
  const headers: Record<string, string> = {};
  const queryParams = new URLSearchParams({ uploadId });
  const authorization = await signRequest('DELETE', canonicalUri, headers, queryParams, payloadHash, config);

  const url = `https://${config.host}${canonicalUri}?${queryParams.toString()}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      ...headers,
      'Authorization': authorization,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Abort multipart upload failed:', errorText);
    // Don't throw - best effort cleanup
  }

  console.log(`Aborted multipart upload for ${key}`);
  return new Response(JSON.stringify({ success: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** Lấy danh sách part đã upload thực tế từ R2 (lấy ETag chuẩn cho complete + resume) */
async function handleListParts(
  key: string, uploadId: string, config: ReturnType<typeof getR2Config>
): Promise<Response> {
  const canonicalUri = `/${config.bucketName}/${key}`;
  const payloadHash = toHex(await crypto.subtle.digest('SHA-256', new Uint8Array(0) as BufferSource));
  const queryParams = new URLSearchParams({ uploadId, 'max-parts': '10000' });
  const authorization = await signRequest('GET', canonicalUri, {}, queryParams, payloadHash, config);
  const url = `https://${config.host}${canonicalUri}?${queryParams.toString()}`;
  const response = await fetch(url, { method: 'GET', headers: { 'Authorization': authorization } });
  if (!response.ok) {
    const errorText = await response.text();
    console.error('ListParts failed:', errorText);
    throw new Error(`Failed to list parts: ${response.status}`);
  }
  const xmlText = await response.text();
  const parts: { partNumber: number; etag: string; size: number }[] = [];
  const partRegex = /<Part>[\s\S]*?<PartNumber>(\d+)<\/PartNumber>[\s\S]*?<ETag>([^<]+)<\/ETag>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Part>/g;
  let m: RegExpExecArray | null;
  while ((m = partRegex.exec(xmlText)) !== null) {
    parts.push({ partNumber: parseInt(m[1], 10), etag: m[2], size: parseInt(m[3], 10) });
  }
  return new Response(JSON.stringify({ parts }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function handleHeadObject(key: string, config: ReturnType<typeof getR2Config>): Promise<Response> {
  const canonicalUri = `/${config.bucketName}/${key}`;
  const payloadHash = toHex(await crypto.subtle.digest('SHA-256', new Uint8Array(0) as BufferSource));
  const authorization = await signRequest('HEAD', canonicalUri, {}, null, payloadHash, config);
  const url = `https://${config.host}${canonicalUri}`;
  const response = await fetch(url, { method: 'HEAD', headers: { 'Authorization': authorization } });
  if (!response.ok) {
    return new Response(JSON.stringify({ exists: false, status: response.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  const size = parseInt(response.headers.get('content-length') || '0', 10);
  const etag = response.headers.get('etag');
  return new Response(JSON.stringify({ exists: true, size, etag }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// ============ MAIN HANDLER ============

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')) ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check banned status
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );
    const { data: banCheck } = await supabaseAdmin
      .from('profiles').select('is_banned').eq('id', user.id).single();
    if (banCheck?.is_banned) {
      return new Response(
        JSON.stringify({ error: 'Tài khoản đã bị cấm vĩnh viễn.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { action } = body;
    const config = getR2Config();

    switch (action) {
      case 'initiate': {
        const { key, contentType, fileSize, durationSeconds } = body;
        if (!key || !contentType) {
          return new Response(JSON.stringify({ error: 'Missing key or contentType' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        // Validate key
        if (key.includes('..') || key.startsWith('/')) {
          return new Response(JSON.stringify({ error: 'Invalid file path' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const elevatedMediaAccount = await isElevatedMediaAccount(supabaseAdmin as any, user.id).catch(() => false);
        const mediaValidation = validateUploadMedia({
          key,
          contentType,
          fileSize,
          durationSeconds,
          isElevatedMediaAccount: elevatedMediaAccount,
        });
        if (mediaValidation) {
          return new Response(
            JSON.stringify({ error: mediaValidation.message, code: mediaValidation.code }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        return await handleInitiate(key, contentType, config);
      }

      case 'get-part-urls': {
        const { key, uploadId, partNumbers } = body;
        if (!key || !uploadId || !partNumbers?.length) {
          return new Response(JSON.stringify({ error: 'Missing key, uploadId, or partNumbers' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return await handleGetPartUrls(key, uploadId, partNumbers, config);
      }

      case 'complete': {
        const { key, uploadId, parts } = body;
        if (!key || !uploadId || !parts?.length) {
          return new Response(JSON.stringify({ error: 'Missing key, uploadId, or parts' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return await handleComplete(key, uploadId, parts, config);
      }

      case 'abort': {
        const { key, uploadId } = body;
        if (!key || !uploadId) {
          return new Response(JSON.stringify({ error: 'Missing key or uploadId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return await handleAbort(key, uploadId, config);
      }

      case 'list-parts': {
        const { key, uploadId } = body;
        if (!key || !uploadId) {
          return new Response(JSON.stringify({ error: 'Missing key or uploadId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return await handleListParts(key, uploadId, config);
      }

      case 'head-object': {
        const { key } = body;
        if (!key) {
          return new Response(JSON.stringify({ error: 'Missing key' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        return await handleHeadObject(key, config);
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Multipart upload error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
