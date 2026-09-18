import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CleanupResult {
  bucket: string;
  totalFiles: number;
  deleted: number;
  errors: Array<{ file: string; error: string }>;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT and admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabaseAnonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;

    // Verify user with anon key
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check admin role using service key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check banned status
    const { data: banCheck } = await supabaseAdmin
      .from('profiles').select('is_banned').eq('id', user.id).single();
    if (banCheck?.is_banned) {
      return new Response(JSON.stringify({ error: 'Tài khoản đã bị cấm vĩnh viễn.' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: hasRole } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!hasRole) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Admin ${user.id} running cleanup-supabase-storage`);

    // Parse request body for options
    let dryRun = true;
    let bucketName: string | null = null;
    let batchSize = 50; // Smaller batch for reliability
    
    try {
      const body = await req.json();
      dryRun = body.dryRun !== false;
      bucketName = body.bucket || null; // Optional: clean specific bucket only
      batchSize = body.batchSize || 50;
    } catch {
      // If no body, default to dry run
    }

    console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}, Bucket: ${bucketName || 'ALL'}, BatchSize: ${batchSize}`);

    const buckets = bucketName ? [bucketName] : ['posts', 'videos', 'avatars', 'comment-media'];
    const results: CleanupResult[] = [];
    let totalFilesDeleted = 0;

    for (const bucket of buckets) {
      const bucketResult: CleanupResult = {
        bucket,
        totalFiles: 0,
        deleted: 0,
        errors: [],
      };

      try {
        // Get all files recursively
        const allFiles: string[] = [];
        
        const listRecursive = async (path: string) => {
          const { data: items, error } = await supabaseAdmin
            .storage
            .from(bucket)
            .list(path, { limit: 1000 });

          if (error) {
            console.error(`Error listing ${bucket}/${path}:`, error);
            return;
          }

          for (const item of items || []) {
            const fullPath = path ? `${path}/${item.name}` : item.name;
            
            if (item.id) {
              allFiles.push(fullPath);
            } else {
              await listRecursive(fullPath);
            }
          }
        };

        await listRecursive('');
        bucketResult.totalFiles = allFiles.length;

        console.log(`Bucket ${bucket}: ${allFiles.length} files found`);

        if (allFiles.length === 0) {
          results.push(bucketResult);
          continue;
        }

        if (dryRun) {
          bucketResult.deleted = allFiles.length;
          console.log(`[DRY RUN] Would delete ${allFiles.length} files from ${bucket}`);
        } else {
          // Delete in small batches
          for (let i = 0; i < allFiles.length; i += batchSize) {
            const batch = allFiles.slice(i, i + batchSize);
            
            console.log(`Deleting batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allFiles.length / batchSize)} from ${bucket} (${batch.length} files)`);
            
            const { error: deleteError } = await supabaseAdmin
              .storage
              .from(bucket)
              .remove(batch);

            if (deleteError) {
              console.error(`Error deleting batch from ${bucket}:`, deleteError);
              bucketResult.errors.push({ 
                file: `batch ${Math.floor(i / batchSize) + 1}`, 
                error: deleteError.message 
              });
            } else {
              bucketResult.deleted += batch.length;
              console.log(`Deleted ${bucketResult.deleted}/${allFiles.length} from ${bucket}`);
            }

            // Small delay between batches to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        totalFilesDeleted += bucketResult.deleted;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error processing bucket ${bucket}:`, error);
        bucketResult.errors.push({ file: bucket, error: errorMessage });
      }

      results.push(bucketResult);
    }

    console.log(`Cleanup complete. Total files ${dryRun ? 'would be' : ''} deleted: ${totalFilesDeleted}`);

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      message: dryRun 
        ? `Preview: ${totalFilesDeleted} files would be deleted` 
        : `Deleted ${totalFilesDeleted} files`,
      totalFiles: results.reduce((sum, r) => sum + r.totalFiles, 0),
      totalDeleted: totalFilesDeleted,
      buckets: results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in cleanup:', error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});