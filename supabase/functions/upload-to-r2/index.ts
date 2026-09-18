import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  isElevatedMediaAccount,
  isPostUploadKey,
  validateUploadMedia,
} from '../_shared/mediaLimits.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Allowed content types for uploads
const ALLOWED_CONTENT_TYPES = [
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp',
  'image/tiff', 'image/svg+xml', 'image/heic', 'image/heif', 'image/avif',
  'image/x-icon', 'image/vnd.microsoft.icon',
  // Videos
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'video/x-ms-wmv', 'video/x-flv', 'video/mpeg', 'video/3gpp',
  'video/ogg', 'video/x-matroska', 'video/x-m4v',
];

// Max file size: 100MB for images, 2GB for videos
const MAX_IMAGE_SIZE = 100 * 1024 * 1024;
const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ✅ AUTHENTICATION CHECK
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT to verify authentication
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
      console.error('Unauthorized access attempt:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Authenticated user: ${user.id}`);

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

    let key: string;
    let contentType: string;
    let bytes: Uint8Array;

    const reqContentType = req.headers.get('content-type') || '';

    if (reqContentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const uploadedFile = formData.get('file') as File | null;
      key = formData.get('key') as string;
      contentType = formData.get('contentType') as string || 'image/jpeg';

      if (!uploadedFile || !key) {
        return new Response(
          JSON.stringify({ error: 'Missing file or key in form data' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const arrayBuffer = await uploadedFile.arrayBuffer();
      bytes = new Uint8Array(arrayBuffer);
    } else {
      const body = await req.json();
      key = body.key;
      contentType = body.contentType;

      const binaryString = atob(body.file);
      bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
    }

    // ✅ VALIDATE CONTENT TYPE
    const elevatedMediaAccount = await isElevatedMediaAccount(supabaseAdmin as any, user.id).catch(() => false);
    const mediaValidation = validateUploadMedia({
      key,
      contentType,
      fileSize: bytes.length,
      isElevatedMediaAccount: elevatedMediaAccount,
    });
    if (mediaValidation) {
      return new Response(
        JSON.stringify({ error: mediaValidation.message, code: mediaValidation.code }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isPostUploadKey(key) && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      console.error(`Invalid content type: ${contentType}`);
      return new Response(
        JSON.stringify({ error: 'File type not allowed. Only images and videos are permitted.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ VALIDATE KEY FORMAT (prevent path traversal)
    if (key.includes('..') || key.startsWith('/')) {
      console.error(`Invalid key format: ${key}`);
      return new Response(
        JSON.stringify({ error: 'Invalid file path' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const CLOUDFLARE_ACCESS_KEY_ID = Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID');
    const CLOUDFLARE_SECRET_ACCESS_KEY = Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY');
    const CLOUDFLARE_R2_BUCKET_NAME = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME');
    const CLOUDFLARE_R2_PUBLIC_URL = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_ACCESS_KEY_ID || !CLOUDFLARE_SECRET_ACCESS_KEY || !CLOUDFLARE_R2_BUCKET_NAME || !CLOUDFLARE_R2_PUBLIC_URL) {
      throw new Error('Missing Cloudflare R2 configuration');
    }

    // ✅ VALIDATE FILE SIZE
    const isVideo = contentType.startsWith('video/');
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (!isPostUploadKey(key) && bytes.length > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      console.error(`File too large: ${bytes.length} bytes (max: ${maxSize})`);
      return new Response(
        JSON.stringify({ error: `File too large. Maximum size is ${maxSizeMB}MB for ${isVideo ? 'videos' : 'images'}.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // AWS Signature V4 for R2
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const region = 'auto';
    const service = 's3';
    const host = `${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    
    // Calculate payload hash (SHA256 of the file content)
    const payloadHashBuffer = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    const payloadHash = Array.from(new Uint8Array(payloadHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Canonical request components
    const method = 'PUT';
    const canonicalUri = `/${CLOUDFLARE_R2_BUCKET_NAME}/${key}`;
    const canonicalQueryString = '';
    
    // Headers must be in alphabetical order
    const canonicalHeaders = [
      `content-type:${contentType}`,
      `host:${host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`
    ].join('\n') + '\n';
    
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash
    ].join('\n');
    
    // String to sign
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    
    const canonicalRequestHashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(canonicalRequest)
    );
    const canonicalRequestHash = Array.from(new Uint8Array(canonicalRequestHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const stringToSign = [
      algorithm,
      amzDate,
      credentialScope,
      canonicalRequestHash
    ].join('\n');
    
    // Calculate signature
    const signingKey = await getSignatureKey(
      CLOUDFLARE_SECRET_ACCESS_KEY,
      dateStamp,
      region,
      service
    );
    
    const signatureBuffer = await hmacSha256(signingKey, stringToSign);
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Authorization header
    const authorizationHeader = `${algorithm} Credential=${CLOUDFLARE_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    // Make the request
    const endpoint = `https://${host}/${CLOUDFLARE_R2_BUCKET_NAME}/${key}`;
    
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
        'Host': host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Authorization': authorizationHeader,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
      body: bytes as unknown as BodyInit,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`R2 upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const url = `${CLOUDFLARE_R2_PUBLIC_URL}/${key}`;

    console.log(`Successfully uploaded to R2: ${key} by user ${user.id}`);

    return new Response(
      JSON.stringify({ url, key }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in upload-to-r2 function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const kDate = await hmacSha256(encoder.encode('AWS4' + key).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  return kSigning;
}
