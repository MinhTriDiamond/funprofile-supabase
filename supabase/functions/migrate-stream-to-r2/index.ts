/**
 * Migrate Stream to R2 Edge Function
 * 
 * Admin-only function to migrate videos from Cloudflare Stream to R2.
 * Processes in batches to avoid timeout.
 * 
 * Usage: POST with { batchSize?: number, dryRun?: boolean, deleteFromStream?: boolean }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};



Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - admin only
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) ?? '',
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    // Check admin role via user_roles table
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { batchSize = 1, dryRun = false, deleteFromStream = false } = await req.json().catch(() => ({}));

    // Scan limit: dry run scans all, migration uses batch
    const scanLimit = dryRun ? 1000 : batchSize;

    // Find posts with Stream video URLs
    const { data: posts, error: queryError } = await supabaseAdmin
      .from('posts')
      .select('id, video_url, media_urls')
      .or('video_url.ilike.%videodelivery.net%,video_url.ilike.%cloudflarestream.com%')
      .limit(scanLimit);

    if (queryError) throw queryError;

    // Also find posts with Stream URLs in media_urls
    const { data: mediaPosts, error: mediaError } = await supabaseAdmin
      .from('posts')
      .select('id, video_url, media_urls')
      .not('media_urls', 'is', null)
      .limit(1000);

    if (mediaError) throw mediaError;

    // Filter media_urls posts that contain Stream URLs, deduplicate against video_url posts
    const postIds = new Set((posts || []).map(p => p.id));
    const mediaPostsWithStream = (mediaPosts || []).filter(p => {
      if (!p.media_urls || !Array.isArray(p.media_urls)) return false;
      if (postIds.has(p.id)) return false;
      return (p.media_urls as any[]).some((m: any) => 
        m.type === 'video' && (m.url?.includes('videodelivery.net') || m.url?.includes('cloudflarestream.com'))
      );
    });

    // Also check comments with Stream video URLs
    const commentLimit = dryRun ? 1000 : batchSize;
    const { data: comments, error: commentsError } = await supabaseAdmin
      .from('comments')
      .select('id, video_url')
      .or('video_url.ilike.%videodelivery.net%,video_url.ilike.%cloudflarestream.com%')
      .limit(commentLimit);

    if (commentsError) throw commentsError;

    const totalPosts = (posts?.length || 0);
    const totalMediaPosts = mediaPostsWithStream.length;
    const totalComments = (comments?.length || 0);

    if (dryRun) {
      return new Response(JSON.stringify({
        dryRun: true,
        totalVideos: totalPosts + totalMediaPosts + totalComments,
        postsWithStreamVideoUrl: totalPosts,
        postsWithStreamMediaUrls: totalMediaPosts,
        commentsWithStreamVideo: totalComments,
        samplePosts: posts?.slice(0, 5).map(p => ({ id: p.id, video_url: p.video_url?.substring(0, 80) })),
        sampleMediaPosts: mediaPostsWithStream.slice(0, 5).map(p => ({ id: p.id })),
        sampleComments: comments?.slice(0, 5).map(c => ({ id: c.id, video_url: c.video_url?.substring(0, 80) })),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // R2 credentials (account #1)
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')!;
    // Stream credentials (account #2 if separated, else same as R2 account)
    const streamAccountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? accountId;
    const cfApiToken = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN')!;
    const accessKeyId = Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID')!;
    const secretAccessKey = Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY')!;
    const bucketName = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME')!;
    const publicUrl = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL')!;

    const results: any[] = [];

    // Process posts with video_url
    for (const post of (posts || []).slice(0, batchSize)) {
      try {
        const uid = extractStreamUid(post.video_url);
        if (!uid) {
          results.push({ postId: post.id, status: 'skip', reason: 'no uid' });
          continue;
        }

        // Get download URL from Stream API
        const downloadUrl = await getStreamDownloadUrl(streamAccountId, cfApiToken, uid);
        if (!downloadUrl) {
          results.push({ postId: post.id, uid, status: 'error', reason: 'no download url' });
          continue;
        }

        // Download from Stream
        const videoResponse = await fetch(downloadUrl);
        if (!videoResponse.ok) {
          results.push({ postId: post.id, uid, status: 'error', reason: `download failed: ${videoResponse.status}` });
          continue;
        }

        const videoBlob = await videoResponse.blob();
        const key = `videos/migrated-${uid}.mp4`;

        // Upload to R2 using S3 API
        const r2Url = await uploadToR2Direct(accountId, accessKeyId, secretAccessKey, bucketName, key, videoBlob);
        const newUrl = `${publicUrl}/${key}`;

        // Update post in DB
        const { error: updateError } = await supabaseAdmin
          .from('posts')
          .update({ video_url: newUrl })
          .eq('id', post.id);

        if (updateError) {
          results.push({ postId: post.id, uid, status: 'error', reason: `db update: ${updateError.message}` });
          continue;
        }

        // Optionally delete from Stream
        if (deleteFromStream) {
          await deleteFromStreamApi(streamAccountId, cfApiToken, uid).catch(err => 
            console.warn('Stream delete error:', err)
          );
        }

        results.push({ postId: post.id, uid, status: 'migrated', newUrl, size: videoBlob.size });
      } catch (err) {
        results.push({ postId: post.id, status: 'error', reason: String(err) });
      }
    }

    return new Response(JSON.stringify({
      processed: results.length,
      results,
      remaining: {
        postsWithStreamVideoUrl: Math.max(0, totalPosts - batchSize),
        postsWithStreamMediaUrls: totalMediaPosts,
        commentsWithStreamVideo: totalComments,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Migration error:', error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function extractStreamUid(url: string | null): string | null {
  if (!url) return null;
  const patterns = [
    /videodelivery\.net\/([a-f0-9]{32})/i,
    /cloudflarestream\.com\/([a-f0-9]{32})/i,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function getStreamDownloadUrl(accountId: string, apiToken: string, uid: string): Promise<string | null> {
  // Enable downloads
  const enableResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiToken}` },
  });
  const enableData = await enableResp.json();
  console.log(`[migrate] UID ${uid}: enable downloads response:`, JSON.stringify(enableData?.success ?? enableData?.errors));

  // Polling: kiá»ƒm tra má»—i 3s, tá»‘i Ä‘a 5 láº§n (15s)
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(r => setTimeout(r, 3000));

    const resp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`, {
      headers: { 'Authorization': `Bearer ${apiToken}` },
    });

    const data = await resp.json();
    const url = data?.result?.default?.url;
    const percent = data?.result?.default?.percentComplete;

    console.log(`[migrate] UID ${uid}: ${percent ?? 0}% (attempt ${attempt + 1}/5), url=${url ? 'yes' : 'no'}`);
    if (url && percent === 100.0) return url;
  }

  return null; // Timeout sau 15s
}

async function uploadToR2Direct(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
  bucket: string,
  key: string,
  blob: Blob,
): Promise<string> {
  // Use simple PUT to R2 via S3-compatible API with AWS Sig V4
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const method = 'PUT';
  const canonicalUri = `/${bucket}/${key}`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalHeaders = `content-type:video/mp4\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const canonicalQueryString = '';

  const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n');

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Authorization': authorization,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`R2 upload failed: ${response.status} ${await response.text()}`);
  }

  return `https://${host}${canonicalUri}`;
}

async function deleteFromStreamApi(accountId: string, apiToken: string, uid: string): Promise<void> {
  await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiToken}` },
  });
}

// Crypto helpers
async function hmacSha256(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + key).buffer, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return await hmacSha256(kService, 'aws4_request');
}

async function sha256Hex(message: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacHex(key: ArrayBuffer, message: string): Promise<string> {
  const sig = await hmacSha256(key, message);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}
