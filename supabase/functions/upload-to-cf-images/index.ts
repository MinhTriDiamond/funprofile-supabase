import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Upload images to Cloudflare Images
 * 
 * Supports:
 * - Direct upload via URL
 * - Base64 upload
 * - Form data upload
 * 
 * Returns imagedelivery.net URL for the uploaded image
 */
Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const cfAccountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const cfApiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
    
    if (!cfAccountId || !cfApiToken) {
      console.error('Missing Cloudflare credentials');
      return new Response(
        JSON.stringify({ error: 'Cloudflare Images not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated user:', user.id);

    // Check banned status
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
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

    const contentType = req.headers.get('content-type') || '';
    
    let uploadUrl: string;
    let imageId: string;
    let variants: Record<string, string>;
    
    // Parse request based on content type
    if (contentType.includes('multipart/form-data')) {
      // Handle direct file upload
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const metadata = formData.get('metadata') as string;
      
      if (!file) {
        return new Response(
          JSON.stringify({ error: 'No file provided' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Uploading file:', file.name, 'size:', file.size);

      // Upload to Cloudflare Images
      const cfFormData = new FormData();
      cfFormData.append('file', file);
      if (metadata) {
        cfFormData.append('metadata', metadata);
      }
      cfFormData.append('requireSignedURLs', 'false');

      const cfResponse = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v1`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cfApiToken}`,
          },
          body: cfFormData,
        }
      );

      const cfResult = await cfResponse.json();
      console.log('CF Images response:', JSON.stringify(cfResult));

      if (!cfResult.success) {
        console.error('CF Images upload failed:', cfResult.errors);
        return new Response(
          JSON.stringify({ error: 'Upload failed', details: cfResult.errors }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      imageId = cfResult.result.id;
      variants = cfResult.result.variants.reduce((acc: Record<string, string>, v: string) => {
        const name = v.split('/').pop() || 'public';
        acc[name] = v;
        return acc;
      }, {});
      uploadUrl = cfResult.result.variants[0]; // First variant as default

    } else if (contentType.includes('application/json')) {
      // Handle URL or base64 upload
      const body = await req.json();
      
      if (body.url) {
        // Upload from URL
        console.log('Uploading from URL:', body.url);
        
        const cfFormData = new FormData();
        cfFormData.append('url', body.url);
        if (body.metadata) {
          cfFormData.append('metadata', JSON.stringify(body.metadata));
        }
        cfFormData.append('requireSignedURLs', 'false');

        const cfResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v1`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cfApiToken}`,
            },
            body: cfFormData,
          }
        );

        const cfResult = await cfResponse.json();
        console.log('CF Images URL upload response:', JSON.stringify(cfResult));

        if (!cfResult.success) {
          console.error('CF Images upload failed:', cfResult.errors);
          return new Response(
            JSON.stringify({ error: 'Upload failed', details: cfResult.errors }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        imageId = cfResult.result.id;
        variants = cfResult.result.variants.reduce((acc: Record<string, string>, v: string) => {
          const name = v.split('/').pop() || 'public';
          acc[name] = v;
          return acc;
        }, {});
        uploadUrl = cfResult.result.variants[0];

      } else if (body.base64) {
        // Upload from base64
        console.log('Uploading from base64, length:', body.base64.length);
        
        // Convert base64 to blob
        const base64Data = body.base64.replace(/^data:image\/\w+;base64,/, '');
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: body.contentType || 'image/webp' });

        const cfFormData = new FormData();
        cfFormData.append('file', blob, body.filename || 'image.webp');
        if (body.metadata) {
          cfFormData.append('metadata', JSON.stringify(body.metadata));
        }
        cfFormData.append('requireSignedURLs', 'false');

        const cfResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/images/v1`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${cfApiToken}`,
            },
            body: cfFormData,
          }
        );

        const cfResult = await cfResponse.json();
        console.log('CF Images base64 upload response:', JSON.stringify(cfResult));

        if (!cfResult.success) {
          console.error('CF Images upload failed:', cfResult.errors);
          return new Response(
            JSON.stringify({ error: 'Upload failed', details: cfResult.errors }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        imageId = cfResult.result.id;
        variants = cfResult.result.variants.reduce((acc: Record<string, string>, v: string) => {
          const name = v.split('/').pop() || 'public';
          acc[name] = v;
          return acc;
        }, {});
        uploadUrl = cfResult.result.variants[0];

      } else {
        return new Response(
          JSON.stringify({ error: 'Missing url, base64, or file' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Unsupported content type' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Successfully uploaded to CF Images:', imageId);

    return new Response(
      JSON.stringify({
        success: true,
        imageId,
        url: uploadUrl,
        variants,
        // Provide transformation URL builder
        transformUrl: (options: string) => `https://imagedelivery.net/${cfAccountId}/${imageId}/${options}`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in upload-to-cf-images:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
