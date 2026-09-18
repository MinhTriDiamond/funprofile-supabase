import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MigrationResult {
  bucket: string;
  path: string;
  originalUrl: string;
  newUrl: string;
  status: 'success' | 'error';
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
      console.log(`User ${user.id} attempted to access migrate-to-r2 without admin role`);
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    console.log(`Admin user ${user.id} authorized for migrate-to-r2`);

    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const CLOUDFLARE_ACCESS_KEY_ID = Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID');
    const CLOUDFLARE_SECRET_ACCESS_KEY = Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY');
    const CLOUDFLARE_R2_BUCKET_NAME = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME');
    const CLOUDFLARE_R2_PUBLIC_URL = Deno.env.get('CLOUDFLARE_R2_PUBLIC_URL');

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_ACCESS_KEY_ID || !CLOUDFLARE_SECRET_ACCESS_KEY || !CLOUDFLARE_R2_BUCKET_NAME || !CLOUDFLARE_R2_PUBLIC_URL) {
      throw new Error('Missing Cloudflare R2 configuration');
    }

    const { bucket, limit = 5, dryRun = false, updateDatabase = true } = await req.json();
    
    const results: MigrationResult[] = [];

    console.log(`Starting migration - Dry Run: ${dryRun}, Limit: ${limit}`);

    // Get all active URLs from database
    const urlsToMigrate: { url: string; bucket: string; path: string }[] = [];

    // Get posts images and videos - skip already migrated or too large files
    const { data: posts } = await supabaseAdmin
      .from('posts')
      .select('image_url, video_url')
      .limit(10000); // Query 10000 records to find enough small files beyond large ones

    if (posts) {
      for (const post of posts) {
        if (urlsToMigrate.length >= limit) break;
        
        // Skip if already migrated to R2
        if (post.image_url && 
            post.image_url.includes('supabase.co/storage') && 
            !post.image_url.includes(CLOUDFLARE_R2_PUBLIC_URL)) {
          const match = post.image_url.match(/\/posts\/(.+)$/);
          if (match) {
            urlsToMigrate.push({ url: post.image_url, bucket: 'posts', path: match[1] });
          }
        }
        if (urlsToMigrate.length >= limit) break;
        
        if (post.video_url && 
            post.video_url.includes('supabase.co/storage') && 
            !post.video_url.includes(CLOUDFLARE_R2_PUBLIC_URL)) {
          const match = post.video_url.match(/\/videos\/(.+)$/);
          if (match) {
            urlsToMigrate.push({ url: post.video_url, bucket: 'videos', path: match[1] });
          }
        }
      }
    }

    // Get avatars and covers - skip already migrated
    if (urlsToMigrate.length < limit) {
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('avatar_url, cover_url')
        .limit(5000);

      if (profiles) {
        for (const profile of profiles) {
          if (urlsToMigrate.length >= limit) break;
          
          if (profile.avatar_url && 
              profile.avatar_url.includes('supabase.co/storage') && 
              !profile.avatar_url.includes(CLOUDFLARE_R2_PUBLIC_URL)) {
            const match = profile.avatar_url.match(/\/avatars\/(.+)$/);
            if (match) {
              urlsToMigrate.push({ url: profile.avatar_url, bucket: 'avatars', path: match[1] });
            }
          }
          if (urlsToMigrate.length >= limit) break;
          
          if (profile.cover_url && 
              profile.cover_url.includes('supabase.co/storage') && 
              !profile.cover_url.includes(CLOUDFLARE_R2_PUBLIC_URL)) {
            const match = profile.cover_url.match(/\/avatars\/(.+)$/);
            if (match) {
              urlsToMigrate.push({ url: profile.cover_url, bucket: 'avatars', path: match[1] });
            }
          }
        }
      }
    }

    // Get comment media - skip already migrated
    if (urlsToMigrate.length < limit) {
      const { data: comments } = await supabaseAdmin
        .from('comments')
        .select('image_url, video_url')
        .limit(5000);

      if (comments) {
        for (const comment of comments) {
          if (urlsToMigrate.length >= limit) break;
          
          if (comment.image_url && 
              comment.image_url.includes('supabase.co/storage') && 
              !comment.image_url.includes(CLOUDFLARE_R2_PUBLIC_URL)) {
            const match = comment.image_url.match(/\/comment-media\/(.+)$/);
            if (match) {
              urlsToMigrate.push({ url: comment.image_url, bucket: 'comment-media', path: match[1] });
            }
          }
          if (urlsToMigrate.length >= limit) break;
          
          if (comment.video_url && 
              comment.video_url.includes('supabase.co/storage') && 
              !comment.video_url.includes(CLOUDFLARE_R2_PUBLIC_URL)) {
            const match = comment.video_url.match(/\/comment-media\/(.+)$/);
            if (match) {
              urlsToMigrate.push({ url: comment.video_url, bucket: 'comment-media', path: match[1] });
            }
          }
        }
      }
    }

    console.log(`Found ${urlsToMigrate.length} files to migrate from database`);

    // Process each file
    for (const { url: originalUrl, bucket: bucketName, path: filePath } of urlsToMigrate) {
      try {
        // Download from Supabase
        const { data: fileData, error: downloadError } = await supabaseAdmin.storage
          .from(bucketName)
          .download(filePath);

        if (downloadError) {
          console.log(`Skipping ${filePath}: ${downloadError.message}`);
          continue;
        }
        
        // Skip files larger than 10MB to avoid memory issues
        if (fileData.size > 10 * 1024 * 1024) {
          console.log(`Skipping ${filePath}: File too large (${(fileData.size / 1024 / 1024).toFixed(2)}MB)`);
          continue;
        }
        
        if (!dryRun) {
          // Convert file to base64 using chunk-based approach
          const arrayBuffer = await fileData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          
          // Convert to base64 in chunks to avoid stack overflow
          let base64 = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            base64 += String.fromCharCode.apply(null, Array.from(chunk));
          }
          base64 = btoa(base64);
          
          // Get content type
          const contentType = fileData.type || 'application/octet-stream';
          
          // Upload to R2 via upload-to-r2 function
          const r2Key = `${bucketName}/${filePath}`;
          const { data: uploadData, error: uploadError } = await supabaseAdmin.functions.invoke('upload-to-r2', {
            body: {
              file: base64,
              key: r2Key,
              contentType: contentType,
            },
          });

          if (uploadError) {
            throw new Error(`R2 upload failed: ${uploadError.message}`);
          }

          const newUrl = uploadData.url;

          // Update database URLs
          if (updateDatabase) {
            await updateDatabaseUrls(supabaseAdmin, bucketName, filePath, originalUrl, newUrl);
          }

          console.log(`Migrated: ${bucketName}/${filePath}`);
          
          results.push({
            bucket: bucketName,
            path: filePath,
            originalUrl,
            newUrl,
            status: 'success'
          });
        } else {
          const newUrl = `${CLOUDFLARE_R2_PUBLIC_URL}/${bucketName}/${filePath}`;
          results.push({
            bucket: bucketName,
            path: filePath,
            originalUrl,
            newUrl,
            status: 'success',
            message: 'Dry run - not uploaded'
          });
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing ${filePath}:`, errorMessage);
        results.push({
          bucket: bucketName,
          path: filePath,
          originalUrl,
          newUrl: '',
          status: 'error',
          message: errorMessage
        });
      }
    }

    const summary = {
      dryRun,
      updateDatabase,
      totalFiles: results.length,
      successful: results.filter(r => r.status === 'success').length,
      errors: results.filter(r => r.status === 'error').length,
      results
    };

    console.log(`Migration complete - ${summary.successful} successful, ${summary.errors} errors`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in migrate-to-r2 function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


async function updateDatabaseUrls(
  supabase: any,
  bucket: string,
  filename: string,
  oldUrl: string,
  newUrl: string
): Promise<void> {
  try {
    // Update posts table
    if (bucket === 'posts') {
      await supabase
        .from('posts')
        .update({ image_url: newUrl })
        .eq('image_url', oldUrl);
    }
    
    if (bucket === 'videos') {
      await supabase
        .from('posts')
        .update({ video_url: newUrl })
        .eq('video_url', oldUrl);
    }

    // Update avatars and covers in profiles
    if (bucket === 'avatars') {
      await supabase
        .from('profiles')
        .update({ avatar_url: newUrl })
        .eq('avatar_url', oldUrl);
        
      await supabase
        .from('profiles')
        .update({ cover_url: newUrl })
        .eq('cover_url', oldUrl);
    }

    // Update comment media
    if (bucket === 'comment-media') {
      await supabase
        .from('comments')
        .update({ image_url: newUrl })
        .eq('image_url', oldUrl);
        
      await supabase
        .from('comments')
        .update({ video_url: newUrl })
        .eq('video_url', oldUrl);
    }

    console.log(`Updated database URLs for ${bucket}/${filename}`);
  } catch (error) {
    console.error(`Error updating database URLs:`, error);
    throw error;
  }
}
