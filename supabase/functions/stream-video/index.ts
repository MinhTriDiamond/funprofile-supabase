import { createClient } from "npm:@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Stream-side credentials. Prefer dedicated CLOUDFLARE_STREAM_ACCOUNT_ID (account #2).
// Fallback to legacy CLOUDFLARE_ACCOUNT_ID (account #1) for backward compatibility.
const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_STREAM_API_TOKEN = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');

// UTF-8 safe Base64 encoder (btoa only supports Latin1 characters)
function base64EncodeUtf8(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = '';
  const chunkSize = 0x8000; // Process in chunks to avoid stack overflow
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

// Truncate error text for logging (avoid huge responses)
function truncateErrorText(text: string, maxLen = 500): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...[truncated]' : text;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders 
    });
  }

  try {
    // Validate environment
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_STREAM_API_TOKEN) {
      console.error('[stream-video] Missing environment variables');
      return new Response(
        JSON.stringify({ error: 'Missing Cloudflare Stream configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[stream-video] Action:', action);

    // Log request fingerprint for debugging
    const origin = req.headers.get('Origin') || req.headers.get('Referer') || 'unknown';
    console.log('[stream-video] Request origin:', origin);

    // Authenticate user for all actions except health check
    const authHeader = req.headers.get('Authorization');
    
    // Health check can work without auth (but will return limited info)
    if (action === 'health') {
      if (!authHeader) {
        console.log('[stream-video] Health check (no auth)');
        return new Response(
          JSON.stringify({ 
            ok: true, 
            ts: new Date().toISOString(),
            authenticated: false,
            cloudflareConfigured: !!(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_STREAM_API_TOKEN),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // With auth - return user info too
      const supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')) ?? '',
        { global: { headers: { Authorization: authHeader } } }
      );

      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      
      console.log('[stream-video] Health check (authenticated):', user?.id || 'auth failed');
      
      return new Response(
        JSON.stringify({ 
          ok: true, 
          ts: new Date().toISOString(),
          authenticated: !authError && !!user,
          userId: user?.id,
          cloudflareConfigured: !!(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_STREAM_API_TOKEN),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All other actions require auth
    if (!authHeader) {
      console.error('[stream-video] Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')) ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Validate user via getUser()
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    
    if (authError || !user) {
      console.error('[stream-video] Auth error:', authError?.message || 'No user');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', details: authError?.message || 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;
    console.log('[stream-video] User:', userId);

    switch (action) {
      // ============================================
      // GET TUS UPLOAD URL - Direct Creator Upload
      // ============================================
      case 'get-tus-upload-url': {
        const { fileSize, fileName, fileType, fileId } = body;
        
        if (!fileSize || fileSize <= 0) {
          return new Response(
            JSON.stringify({ error: 'Invalid file size', details: `fileSize: ${fileSize}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Sanitize filename and log request fingerprint
        const safeName = (fileName || `video_${Date.now()}`).trim().slice(0, 200);
        
        console.log('[stream-video] Creating Direct Creator Upload URL:', {
          fileSize,
          fileName: safeName,
          fileType,
          fileId: fileId || 'not-provided',
          userId,
          origin,
          timestamp: new Date().toISOString(),
        });

        // Build upload metadata with user ID and file ID for tracking
        // Use base64EncodeUtf8 for UTF-8 safe encoding (supports Vietnamese/Unicode filenames)
        const metadata = [
          `maxDurationSeconds ${base64EncodeUtf8('7200')}`,
          `requiresignedurls ${base64EncodeUtf8('false')}`,
          `name ${base64EncodeUtf8(safeName)}`,
        ].join(',');

        // Call Cloudflare Stream API with direct_user=true
        // This returns a Direct Upload URL that the client can use directly
        console.log('[stream-video] Calling Cloudflare API...');
        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream?direct_user=true`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
              'Tus-Resumable': '1.0.0',
              'Upload-Length': fileSize.toString(),
              'Upload-Metadata': metadata,
            },
          }
        );

        console.log('[stream-video] Cloudflare response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[stream-video] Cloudflare error:', truncateErrorText(errorText));
          return new Response(
            JSON.stringify({ 
              error: `Cloudflare API error: ${response.status}`, 
              details: truncateErrorText(errorText, 300),
              cloudflareStatus: response.status,
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Get the direct upload URL from Location header
        const uploadUrl = response.headers.get('Location');
        const streamMediaId = response.headers.get('stream-media-id');

        // Validate we got both required values
        if (!uploadUrl) {
          console.error('[stream-video] Missing Location header from Cloudflare');
          return new Response(
            JSON.stringify({ error: 'Cloudflare did not return upload URL (missing Location header)' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!streamMediaId) {
          console.error('[stream-video] Missing stream-media-id header from Cloudflare');
          return new Response(
            JSON.stringify({ error: 'Cloudflare did not return video UID (missing stream-media-id header)' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[stream-video] Got Direct Upload URL:', {
          uploadUrl: uploadUrl.substring(0, 80),
          uid: streamMediaId,
          fileId: fileId || 'not-provided',
        });

        return new Response(JSON.stringify({
          uploadUrl,
          uid: streamMediaId,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // DIRECT UPLOAD URL (for smaller files < 200MB)
      // ============================================
      case 'direct-upload': {
        const maxDurationSeconds = body.maxDurationSeconds || 7200;

        console.log('[stream-video] Creating direct upload URL');

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/direct_upload`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              maxDurationSeconds,
              requireSignedURLs: false,
              allowedOrigins: ['*'],
              meta: {
                userId,
                uploadedAt: new Date().toISOString(),
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[stream-video] Direct upload error:', truncateErrorText(errorText));
          return new Response(
            JSON.stringify({ 
              error: `Failed to create direct upload: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        
        if (!data.result?.uploadURL || !data.result?.uid) {
          console.error('[stream-video] Invalid direct upload response:', data);
          return new Response(
            JSON.stringify({ error: 'Invalid response from Cloudflare direct upload' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log('[stream-video] Direct upload created:', data.result.uid);
        
        return new Response(JSON.stringify({
          uploadUrl: data.result.uploadURL,
          uid: data.result.uid,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // CHECK VIDEO STATUS
      // ============================================
      case 'check-status': {
        const { uid } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({ 
              error: `Failed to check status: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: response.status === 404 ? 404 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        const video = data.result;

        return new Response(JSON.stringify({
          uid: video.uid,
          status: video.status,
          readyToStream: video.readyToStream,
          duration: video.duration,
          thumbnail: video.thumbnail,
          playback: video.playback,
          preview: video.preview,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // GET PLAYBACK URL
      // ============================================
      case 'get-playback-url': {
        const { uid } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
            },
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({ 
              error: `Failed to get playback URL: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: response.status === 404 ? 404 : 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();
        const video = data.result;

        return new Response(JSON.stringify({
          uid: video.uid,
          playback: {
            hls: video.playback?.hls,
            dash: video.playback?.dash,
          },
          thumbnail: video.thumbnail,
          preview: video.preview,
          duration: video.duration,
          readyToStream: video.readyToStream,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // DELETE VIDEO
      // ============================================
      case 'delete': {
        const { uid } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
            },
          }
        );

        if (!response.ok && response.status !== 404) {
          const errorText = await response.text();
          return new Response(
            JSON.stringify({ 
              error: `Failed to delete video: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[stream-video] Video deleted:', uid);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ============================================
      // UPDATE VIDEO SETTINGS
      // ============================================
      case 'update-video-settings': {
        const { uid, requireSignedURLs = false, allowedOrigins = ['*'] } = body;
        if (!uid) {
          return new Response(
            JSON.stringify({ error: 'Missing video UID' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('[stream-video] Updating settings for:', uid);

        const response = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requireSignedURLs,
              allowedOrigins,
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[stream-video] Update settings error:', truncateErrorText(errorText));
          return new Response(
            JSON.stringify({ 
              error: `Failed to update settings: ${response.status}`,
              details: truncateErrorText(errorText, 300),
            }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const data = await response.json();

        return new Response(JSON.stringify({
          success: true,
          uid,
          requireSignedURLs: data.result?.requireSignedURLs,
          allowedOrigins: data.result?.allowedOrigins,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[stream-video] Unhandled error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, type: 'unhandled' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
