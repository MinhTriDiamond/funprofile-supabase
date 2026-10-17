import { createClient } from 'npm:@supabase/supabase-js@2';
import { isChatMediaKeyOwnedByUser } from '../_shared/mediaLimits.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: No authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Initialize Supabase client with user's auth token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('Authentication failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid authentication' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const { key } = await req.json();

    // Validate input - prevent path traversal attacks
    if (!key || typeof key !== 'string') {
      console.error('Invalid key parameter');
      return new Response(
        JSON.stringify({ error: 'Bad Request: Invalid key parameter' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Sanitize key - prevent path traversal
    if (key.includes('..') || key.startsWith('/') || key.includes('//')) {
      console.error('Invalid key format - potential path traversal:', key);
      return new Response(
        JSON.stringify({ error: 'Bad Request: Invalid key format' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Check if user is admin (admins can delete any file)
    const { data: isAdmin } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    // Verify ownership based on file type
    const keyParts = key.split('/');
    const bucket = keyParts[0];
    
    if (!isAdmin) {
      let hasPermission = false;

      if (bucket === 'avatars') {
        // For avatars/covers, check if the file belongs to user's profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('avatar_url, cover_url')
          .eq('id', user.id)
          .single();

        if (profile) {
          hasPermission = 
            (profile.avatar_url && profile.avatar_url.includes(key)) ||
            (profile.cover_url && profile.cover_url.includes(key));
        }
      } else if (bucket === 'posts') {
        // For posts, check if the file is in a post owned by the user
        const { data: posts } = await supabase
          .from('posts')
          .select('id, image_url, video_url, media_urls')
          .eq('user_id', user.id);

        if (posts) {
          hasPermission = posts.some(post => 
            (post.image_url && post.image_url.includes(key)) ||
            (post.video_url && post.video_url.includes(key)) ||
            (post.media_urls && JSON.stringify(post.media_urls).includes(key))
          );
        }
      } else if (bucket === 'videos') {
        // For videos, check if the file is in a post owned by the user
        const { data: posts } = await supabase
          .from('posts')
          .select('id, video_url')
          .eq('user_id', user.id);

        if (posts) {
          hasPermission = posts.some(post => 
            post.video_url && post.video_url.includes(key)
          );
        }
      } else if (bucket === 'comment-media') {
        // For comment media, check if the file is in a comment owned by the user
        const { data: comments } = await supabase
          .from('comments')
          .select('id, image_url, video_url')
          .eq('user_id', user.id);

        if (comments) {
          hasPermission = comments.some(comment =>
            (comment.image_url && comment.image_url.includes(key)) ||
            (comment.video_url && comment.video_url.includes(key))
          );
        }
      } else if (bucket === 'chat-media') {
        hasPermission = isChatMediaKeyOwnedByUser(key, user.id);
      }

      if (!hasPermission) {
        console.error('Authenticated user attempted to delete an unowned R2 object');
        return new Response(
          JSON.stringify({ error: 'Forbidden: You do not have permission to delete this file' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }
    }

    const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const CLOUDFLARE_ACCESS_KEY_ID = Deno.env.get('CLOUDFLARE_ACCESS_KEY_ID');
    const CLOUDFLARE_SECRET_ACCESS_KEY = Deno.env.get('CLOUDFLARE_SECRET_ACCESS_KEY');
    const CLOUDFLARE_R2_BUCKET_NAME = Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME');

    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_ACCESS_KEY_ID || !CLOUDFLARE_SECRET_ACCESS_KEY || !CLOUDFLARE_R2_BUCKET_NAME) {
      throw new Error('Missing Cloudflare R2 configuration');
    }

    // Delete from R2
    const endpoint = `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com/${CLOUDFLARE_R2_BUCKET_NAME}/${key}`;
    
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_ACCESS_KEY_ID}:${CLOUDFLARE_SECRET_ACCESS_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`R2 delete failed: ${response.statusText}`);
    }

    console.log('Authenticated R2 object deletion completed');

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in delete-from-r2 function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
