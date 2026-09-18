import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptimizationResult {
  bucket: string;
  path: string;
  originalSize: number;
  optimizedSize: number;
  saved: number;
  status: 'success' | 'error' | 'skipped';
  message?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create user client to verify the JWT and get user
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')) ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Check if user has admin role
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      console.log(`User ${user.id} attempted to access optimize-storage without admin role`);
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    console.log(`Admin user ${user.id} authorized for optimize-storage`);

    const { bucket, limit = 50, dryRun = false } = await req.json();
    
    const bucketsToProcess = bucket ? [bucket] : ['posts', 'avatars', 'comment-media'];
    const results: OptimizationResult[] = [];
    let totalSaved = 0;

    console.log(`Starting optimization - Dry Run: ${dryRun}, Buckets: ${bucketsToProcess.join(', ')}, Limit: ${limit}`);

    for (const bucketName of bucketsToProcess) {
      console.log(`Processing bucket: ${bucketName}`);
      
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from(bucketName)
        .list('', {
          limit: limit,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (listError) {
        console.error(`Error listing files in ${bucketName}:`, listError);
        continue;
      }

      console.log(`Found ${files?.length || 0} files in ${bucketName}`);

      for (const file of files || []) {
        // Skip directories
        if (!file.name || file.name.endsWith('/')) continue;

        // Only process images (videos require ffmpeg, not available in edge functions)
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
        if (!isImage) {
          results.push({
            bucket: bucketName,
            path: file.name,
            originalSize: file.metadata?.size || 0,
            optimizedSize: 0,
            saved: 0,
            status: 'skipped',
            message: 'Not an image (videos require external processing)'
          });
          continue;
        }

        try {
          // Download the original file
          const { data: fileData, error: downloadError } = await supabaseAdmin.storage
            .from(bucketName)
            .download(file.name);

          if (downloadError) throw downloadError;

          const originalSize = fileData.size;
          console.log(`Processing ${file.name} (${(originalSize / 1024).toFixed(2)} KB)`);

          // Compress image
          const optimizedBlob = await compressImage(fileData);
          const optimizedSize = optimizedBlob.size;
          const saved = originalSize - optimizedSize;
          const savingsPercent = ((saved / originalSize) * 100).toFixed(1);

          console.log(`Compressed ${file.name}: ${(originalSize / 1024).toFixed(2)} KB → ${(optimizedSize / 1024).toFixed(2)} KB (saved ${savingsPercent}%)`);

          // Only upload if not dry run and we actually saved space
          if (!dryRun && saved > 0) {
            const { error: uploadError } = await supabaseAdmin.storage
              .from(bucketName)
              .update(file.name, optimizedBlob, {
                contentType: 'image/jpeg',
                upsert: true
              });

            if (uploadError) throw uploadError;
          }

          totalSaved += saved;
          results.push({
            bucket: bucketName,
            path: file.name,
            originalSize,
            optimizedSize,
            saved,
            status: 'success',
            message: saved > 0 ? `Saved ${savingsPercent}%` : 'Already optimized'
          });

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Error processing ${file.name}:`, errorMessage);
          results.push({
            bucket: bucketName,
            path: file.name,
            originalSize: file.metadata?.size || 0,
            optimizedSize: 0,
            saved: 0,
            status: 'error',
            message: errorMessage
          });
        }
      }
    }

    const summary = {
      dryRun,
      bucketsProcessed: bucketsToProcess,
      totalFiles: results.length,
      successful: results.filter(r => r.status === 'success').length,
      errors: results.filter(r => r.status === 'error').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      totalSavedBytes: totalSaved,
      totalSavedMB: (totalSaved / 1024 / 1024).toFixed(2),
      results
    };

    console.log(`Optimization complete - Saved ${summary.totalSavedMB} MB`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in optimize-storage function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

/**
 * Compress image using Lovable AI's image generation API
 */
async function compressImage(blob: Blob): Promise<Blob> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  // Convert blob to base64
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const base64 = btoa(String.fromCharCode(...bytes));
  const dataUrl = `data:${blob.type};base64,${base64}`;

  // Use Lovable AI to process and compress the image
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Optimize this image by resizing it to maximum 1920x1920 pixels while maintaining aspect ratio and compress it for web use with high quality.'
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl
              }
            }
          ]
        }
      ],
      modalities: ['image']
    })
  });

  if (!response.ok) {
    throw new Error(`Image optimization failed: ${response.statusText}`);
  }

  const data = await response.json();
  const optimizedImageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

  if (!optimizedImageUrl) {
    throw new Error('No optimized image returned from API');
  }

  // Convert base64 back to blob
  const base64Data = optimizedImageUrl.split(',')[1];
  const binaryData = atob(base64Data);
  const bytes2 = new Uint8Array(binaryData.length);
  for (let i = 0; i < binaryData.length; i++) {
    bytes2[i] = binaryData.charCodeAt(i);
  }

  return new Blob([bytes2], { type: 'image/jpeg' });
}
