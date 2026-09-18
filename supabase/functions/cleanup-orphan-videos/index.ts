import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Stream-side: prefer CLOUDFLARE_STREAM_ACCOUNT_ID (account #2), fallback to legacy CLOUDFLARE_ACCOUNT_ID
const CLOUDFLARE_ACCOUNT_ID = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_STREAM_API_TOKEN = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

interface StreamVideo {
  uid: string;
  created: string;
  modified: string;
  meta?: {
    name?: string;
  };
  status?: {
    state: string;
  };
}

interface CleanupResult {
  totalVideosOnStream: number;
  totalVideosInDb: number;
  orphanVideosFound: number;
  orphanVideosDeleted: number;
  errors: string[];
  deletedUids: string[];
  dryRun: boolean;
  allowOrphanDelete?: boolean;
  minAgeHours?: number;
}

// Extract Stream UID from various URL formats
function extractStreamUid(url: string): string | null {
  if (!url) return null;
  
  // Format: https://customer-xxx.cloudflarestream.com/uid/... (UID can be 32 hex or UUID-like)
  const customerMatch = url.match(/cloudflarestream\.com\/([a-f0-9-]{32,36})/i);
  if (customerMatch) return customerMatch[1];
  
  // Format: https://iframe.videodelivery.net/uid
  const iframeMatch = url.match(/videodelivery\.net\/([a-f0-9-]{32,36})/i);
  if (iframeMatch) return iframeMatch[1];
  
  // Format: https://watch.videodelivery.net/uid
  const watchMatch = url.match(/watch\.videodelivery\.net\/([a-f0-9-]{32,36})/i);
  if (watchMatch) return watchMatch[1];
  
  return null;
}

// List all videos from Cloudflare Stream
async function listAllStreamVideos(): Promise<StreamVideo[]> {
  const allVideos: StreamVideo[] = [];
  let cursor: string | undefined;
  
  do {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream`);
    url.searchParams.set('per_page', '100');
    if (cursor) {
      url.searchParams.set('after', cursor);
    }
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to list videos: ${response.status} ${await response.text()}`);
    }
    
    const data = await response.json();
    
    if (data.result && Array.isArray(data.result)) {
      allVideos.push(...data.result);
      
      // Get cursor for next page
      if (data.result.length === 100 && data.result_info?.cursor) {
        cursor = data.result_info.cursor;
      } else {
        cursor = undefined;
      }
    } else {
      cursor = undefined;
    }
  } while (cursor);
  
  return allVideos;
}

// Get all video UIDs referenced in the database
async function getDbVideoUids(supabase: any): Promise<Set<string>> {
  const uids = new Set<string>();

  const addUid = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      const uid = extractStreamUid(value) || (/^[a-f0-9-]{32,36}$/i.test(value) ? value : null);
      if (uid) uids.add(uid);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) addUid(item);
      return;
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value as Record<string, unknown>)) addUid(item);
    }
  };
  
  // Get video_url from posts
  const { data: postsWithVideo } = await supabase
    .from('posts')
    .select('video_url')
    .not('video_url', 'is', null);
  
  if (postsWithVideo) {
    for (const post of postsWithVideo as { video_url: string }[]) {
      const uid = extractStreamUid(post.video_url);
      if (uid) uids.add(uid);
    }
  }
  
  // Get videos from media_urls in posts
  const { data: postsWithMedia } = await supabase
    .from('posts')
    .select('media_urls')
    .not('media_urls', 'is', null);
  
  if (postsWithMedia) {
    for (const post of postsWithMedia as { media_urls: any[] }[]) {
      if (Array.isArray(post.media_urls)) {
        for (const media of post.media_urls) {
          if (typeof media === 'object' && media !== null) {
            const mediaObj = media as { type?: string; url?: string };
            if (mediaObj.type === 'video' && mediaObj.url) {
              const uid = extractStreamUid(mediaObj.url);
              if (uid) uids.add(uid);
            }
          } else if (typeof media === 'string') {
            addUid(media);
          }
        }
      }
    }
  }
  
  // Get video_url from comments
  const { data: commentsWithVideo } = await supabase
    .from('comments')
    .select('video_url')
    .not('video_url', 'is', null);
  
  if (commentsWithVideo) {
    for (const comment of commentsWithVideo as { video_url: string }[]) {
      const uid = extractStreamUid(comment.video_url);
      if (uid) uids.add(uid);
    }
  }
  
  // Get cover_url from profiles (in case videos are used as covers)
  const { data: profilesWithCover } = await supabase
    .from('profiles')
    .select('cover_url')
    .not('cover_url', 'is', null);
  
  if (profilesWithCover) {
    for (const profile of profilesWithCover as { cover_url: string }[]) {
      const uid = extractStreamUid(profile.cover_url);
      if (uid) uids.add(uid);
    }
  }

  // Protect Cloudflare Stream UIDs used by livestream/replay pipeline.
  const { data: liveSessions } = await supabase
    .from('live_sessions')
    .select('cloudflare_video_uid, hls_url, playback_url')
    .or('cloudflare_video_uid.not.is.null,hls_url.not.is.null,playback_url.not.is.null');
  for (const row of liveSessions || []) {
    addUid(row.cloudflare_video_uid);
    addUid(row.hls_url);
    addUid(row.playback_url);
  }

  const { data: liveReplays } = await supabase
    .from('live_replays')
    .select('stream_uid, cloudflare_video_uid, playback_hls, playback_dash, playback_mp4, cloudflare_playback_url, last_cf_response')
    .or('stream_uid.not.is.null,cloudflare_video_uid.not.is.null,playback_hls.not.is.null,cloudflare_playback_url.not.is.null');
  for (const row of liveReplays || []) {
    addUid(row.stream_uid);
    addUid(row.cloudflare_video_uid);
    addUid(row.playback_hls);
    addUid(row.playback_dash);
    addUid(row.playback_mp4);
    addUid(row.cloudflare_playback_url);
    addUid(row.last_cf_response);
  }

  return uids;
}

// Delete a video from Cloudflare Stream
async function deleteStreamVideo(uid: string): Promise<boolean> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream/${uid}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${CLOUDFLARE_STREAM_API_TOKEN}`,
      },
    }
  );
  
  return response.ok || response.status === 404;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Check environment variables
    if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_STREAM_API_TOKEN) {
      throw new Error('Missing Cloudflare Stream credentials');
    }
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase credentials');
    }
    
    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Verify admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }
    
    // Authenticate with user's token
    const userSupabase = createClient(SUPABASE_URL, (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await userSupabase.auth.getUser();
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }
    
    const userId = user.id;
    
    // Check if user is admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .single();
    
    if (!roles) {
      throw new Error('Only admins can run cleanup');
    }
    
    // Parse request body
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // Default to dry run for safety
    const allowOrphanDelete = body.delete_orphan_unknown === true;
    const maxDelete = body.maxDelete || 50; // Limit deletions per run
    const minAgeHours = Math.max(24, Number(body.min_age_hours) || 168);
    const minCreatedAt = Date.now() - minAgeHours * 60 * 60 * 1000;
    
    console.log(`[cleanup-orphan-videos] Starting cleanup (dryRun: ${dryRun}, maxDelete: ${maxDelete})`);
    
    // Get all videos from Cloudflare Stream
    console.log('[cleanup-orphan-videos] Fetching videos from Cloudflare Stream...');
    const streamVideos = await listAllStreamVideos();
    console.log(`[cleanup-orphan-videos] Found ${streamVideos.length} videos on Stream`);
    
    // Get all video UIDs from database
    console.log('[cleanup-orphan-videos] Fetching video references from database...');
    const dbVideoUids = await getDbVideoUids(supabase);
    console.log(`[cleanup-orphan-videos] Found ${dbVideoUids.size} video references in database`);
    
    // Find orphan videos
    const orphanVideos = streamVideos.filter(video => {
      if (dbVideoUids.has(video.uid)) return false;
      const createdMs = Date.parse(video.created || '') || 0;
      const state = String((video.status as any)?.state || '').toLowerCase();
      if (createdMs > minCreatedAt) return false;
      if (state && state !== 'ready' && state !== 'error') return false;
      return true;
    });
    console.log(`[cleanup-orphan-videos] Found ${orphanVideos.length} orphan videos`);
    
    const result: CleanupResult = {
      totalVideosOnStream: streamVideos.length,
      totalVideosInDb: dbVideoUids.size,
      orphanVideosFound: orphanVideos.length,
      orphanVideosDeleted: 0,
      errors: [],
      deletedUids: [],
      dryRun,
      allowOrphanDelete,
      minAgeHours,
    };
    
    // Delete orphan videos (with limit)
    const videosToDelete = orphanVideos.slice(0, maxDelete);
    
    for (const video of videosToDelete) {
      if (dryRun || !allowOrphanDelete) {
        console.log(`[cleanup-orphan-videos] [DRY RUN] Would delete: ${video.uid} (created: ${video.created})`);
        result.deletedUids.push(video.uid);
        if (dryRun) result.orphanVideosDeleted++;
      } else {
        try {
          console.log(`[cleanup-orphan-videos] Deleting: ${video.uid}`);
          const success = await deleteStreamVideo(video.uid);
          if (success) {
            result.deletedUids.push(video.uid);
            result.orphanVideosDeleted++;
          } else {
            result.errors.push(`Failed to delete ${video.uid}`);
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          result.errors.push(`Error deleting ${video.uid}: ${errorMsg}`);
        }
      }
    }
    
    if (orphanVideos.length > maxDelete) {
      console.log(`[cleanup-orphan-videos] Limited to ${maxDelete} deletions. ${orphanVideos.length - maxDelete} orphans remaining.`);
    }
    
    console.log(`[cleanup-orphan-videos] Cleanup complete. Deleted: ${result.orphanVideosDeleted}, Errors: ${result.errors.length}`);
    
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[cleanup-orphan-videos] Error:', errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
