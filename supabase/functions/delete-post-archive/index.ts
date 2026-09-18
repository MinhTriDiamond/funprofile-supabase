/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { deleteStreamVideo } from '../_shared/cloudflareStreamService.ts';
import { deleteR2Object } from '../_shared/r2StorageService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
    { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

  const { post_id } = await req.json().catch(() => ({}));
  if (!post_id) return json({ error: 'Missing post_id' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: post } = await admin
    .from('posts')
    .select('id, user_id, metadata')
    .eq('id', post_id)
    .maybeSingle();
  if (!post) return json({ error: 'Post not found' }, 404);
  if (post.user_id !== user.id) return json({ error: 'Forbidden' }, 403);

  const metadata = (post.metadata && typeof post.metadata === 'object') ? post.metadata as any : {};
  const replayId = metadata.replay_id;
  const liveSessionId = metadata.live_session_id;

  let replay: any = null;
  if (replayId) {
    const { data } = await (admin as any).from('live_replays').select('*').eq('id', replayId).maybeSingle();
    replay = data;
  } else if (liveSessionId) {
    const { data } = await (admin as any)
      .from('live_replays')
      .select('*')
      .eq('live_session_id', liveSessionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    replay = data;
  }

  const cleanup: Record<string, unknown>[] = [];
  if (replay?.r2_object_key) {
    try {
      await deleteR2Object(replay.r2_object_key);
      cleanup.push({ provider: 'r2', deleted: true, key: replay.r2_object_key });
    } catch (error) {
      cleanup.push({ provider: 'r2', deleted: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const uid = replay?.stream_uid || replay?.cloudflare_video_uid || metadata.stream_uid || metadata.cloudflare_video_uid;
  if (uid && !replay?.stream_deleted_at) {
    try {
      await deleteStreamVideo(uid);
      cleanup.push({ provider: 'cloudflare_stream', deleted: true, uid });
    } catch (error) {
      cleanup.push({ provider: 'cloudflare_stream', deleted: false, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const now = new Date().toISOString();
  await admin.from('posts').update({
    deleted_at: now,
    video_url: null,
    image_url: null,
    media_urls: [],
    metadata: { ...metadata, deleted_at: now, cleanup },
  }).eq('id', post_id);

  if (replay?.id) {
    await (admin as any).from('live_replays').update({
      deleted_at: now,
      stream_deleted_at: uid ? (replay.stream_deleted_at || now) : replay.stream_deleted_at,
      archive_status: replay.archive_status === 'archived' ? 'deleted' : replay.archive_status,
    }).eq('id', replay.id);
    await (admin as any).from('creator_library').update({ deleted_at: now }).eq('live_replay_id', replay.id);
  }

  return json({ ok: true, post_id, replay_id: replay?.id || null, cleanup });
});
