/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getStreamPlaybackUrls, getStreamVideo, listStreamLiveInputVideos, selectRtmpReplayVideoForSession, validateRtmpReplayVideoForSession } from '../_shared/cloudflareStreamService.ts';
import { createOrUpdateInstantReplayPost } from '../_shared/replayFeedService.ts';
import { abortMultipartUpload } from '../_shared/r2MultipartService.ts';
import { headR2Object } from '../_shared/r2StorageService.ts';
import { listR2Objects } from '../_shared/r2MultiBucketService.ts';

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

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
}

function accountId(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
}

async function requireAdmin(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
    { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: 'Unauthorized' };

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) return { ok: false as const, status: 403, error: 'Forbidden' };
  return { ok: true as const, admin, user };
}

async function invokeFunction(name: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
  const cronSecret = Deno.env.get('CRON_SECRET') || Deno.env.get('CRON_SHARED_SECRET');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
  if (cronSecret) headers['X-Cron-Secret'] = cronSecret;
  const resp = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => null);
  return { httpStatus: resp.status, data };
}

function parsePostId(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const uuid = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  if (uuid) return uuid[0];
  return null;
}

function archiveProgress(replay: any) {
  const totalBytes = Number(replay?.mp4_total_bytes || 0);
  const bytesDone = Number(replay?.multipart_bytes_done || 0);
  const totalParts = Number(replay?.multipart_total_parts || 0);
  const partsDone = Array.isArray(replay?.multipart_parts_done) ? replay.multipart_parts_done.length : 0;
  const percent = totalBytes > 0 ? Math.max(0, Math.min(100, Math.round((bytesDone / totalBytes) * 100))) : null;
  return {
    percent,
    bytes_done: bytesDone || null,
    total_bytes: totalBytes || null,
    parts_done: partsDone || null,
    total_parts: totalParts || null,
    part_size: replay?.multipart_part_size || null,
  };
}

function archiveEligibility(replay: any, session: any) {
  const now = Date.now();
  const leaseUntil = replay?.archive_lease_until ? Date.parse(String(replay.archive_lease_until)) : 0;
  const nextRetryAt = replay?.archive_next_retry_at ? Date.parse(String(replay.archive_next_retry_at)) : 0;
  const activePhase = [
    'mp4_export',
    'mp4_wait',
    'multipart_init',
    'multipart_upload',
    'verifying',
    'posting',
    'deleting_stream',
  ].includes(String(replay?.archive_phase || ''));

  if (!replay) return { eligible: false, reason: 'replay_not_found' };
  if (!replay.cloudflare_vod_enabled) return { eligible: false, reason: 'cloudflare_vod_disabled' };
  if (!replay.stream_uid && !replay.cloudflare_video_uid) return { eligible: false, reason: 'missing_stream_uid' };
  if (replay.r2_video_url && replay.replay_post_id) return { eligible: false, reason: 'already_r2_posted' };
  if (session?.status === 'live' && !session?.ended_at) return { eligible: false, reason: 'live_session_active' };
  if (leaseUntil && leaseUntil > now) return { eligible: false, reason: 'archive_lease_held', lease_until: replay.archive_lease_until };
  if (nextRetryAt && nextRetryAt > now && !activePhase) return { eligible: false, reason: 'waiting_next_retry', next_retry_at: replay.archive_next_retry_at };
  if (activePhase) return { eligible: true, reason: `active_phase_${replay.archive_phase}` };
  if (!replay.archive_status || ['pending', 'failed', 'archiving', 'processing_stream', 'stream_ready', 'exporting_mp4', 'uploading_r2', 'verifying_r2', 'archived'].includes(String(replay.archive_status))) {
    return { eligible: true, reason: `archive_status_${replay.archive_status || 'null'}` };
  }
  return { eligible: false, reason: `terminal_or_unsupported_status_${replay.archive_status}` };
}

async function r2ObjectDiagnostic(replay: any) {
  const key = replay?.r2_object_key;
  if (!key) return { r2_object_exists: false, r2_object_size: 0, completion_rescue_available: false, parts_done_db: 0, parts_total_db: 0 };
  const head = await headR2Object(key).catch(() => ({ exists: false, size: 0 }));
  const expectedBytes = Number(replay?.mp4_total_bytes || 0);
  const partsDoneDb = Array.isArray(replay?.multipart_parts_done) ? replay.multipart_parts_done.length : 0;
  const partsTotalDb = Number(replay?.multipart_total_parts || 0);
  const completeParts = partsTotalDb > 0 && partsDoneDb >= partsTotalDb;
  const partsMissing = partsTotalDb > 0 && partsDoneDb < partsTotalDb;
  let stuckReason: string | null = null;
  if (head.exists && !replay?.r2_video_url) {
    stuckReason = partsMissing
      ? 'parts_missing_in_db_but_r2_object_exists'
      : 'r2_object_exists_but_post_not_finalized';
  } else if (completeParts && !replay?.r2_video_url) {
    stuckReason = 'all_parts_uploaded_waiting_complete_or_verify';
  }
  return {
    r2_object_exists: head.exists,
    r2_object_size: head.size,
    completion_rescue_available: Boolean(head.exists && head.size > 0 && (!expectedBytes || head.size >= expectedBytes)),
    parts_done_db: partsDoneDb,
    parts_total_db: partsTotalDb,
    stuck_at_99_reason: stuckReason,
  };
}

function getTempBucketForSession(session: any): string | null {
  return session?.temp_bucket || Deno.env.get('R2_TEMP_BUCKET') || Deno.env.get('CLOUDFLARE_R2_BUCKET_NAME') || null;
}

function getAgoraTempPrefix(session: any): string | null {
  const ownerId = session?.host_user_id || session?.owner_id || session?.user_id || null;
  if (session?.temp_object_key) return String(session.temp_object_key).replace(/\/+$/, '');
  if (!ownerId || !session?.id) return null;
  return `agora-temp/${ownerId}/${session.id}`;
}

function isAgoraWebcamProcessorEligible(session: any, tempCount: number): boolean {
  const endedOrStopped = session?.status === 'ended'
    || Boolean(session?.ended_at)
    || ['stopped', 'ready'].includes(String(session?.recording_status || ''));
  const archiveEligible = !session?.archive_status || ['pending', 'failed'].includes(String(session.archive_status));
  return Boolean(
    session?.mode === 'agora_webcam'
      && session?.recording_sid
      && endedOrStopped
      && archiveEligible
      && !session?.replay_url
      && !session?.r2_video_url
      && tempCount > 0
      && Number(session?.archive_retry_count || 0) < 20,
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const guard = await requireAdmin(req.headers.get('Authorization'));
  if (!guard.ok) return json({ error: guard.error }, guard.status);
  const admin = guard.admin;

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'list';
  const replayId = body.replay_id || body.replayId;

  try {
    if (action === 'repair_stuck_live_replay_posts') {
      const apply = body.apply === true || body.mode === 'apply';
      const limit = Math.min(Math.max(Number(body.limit || 50), 1), 200);
      const postId = parsePostId(body.post_id || body.postId || body.post_url || body.postUrl);
      let postQuery = (admin as any)
        .from('posts')
        .select('id, user_id, post_type, video_url, replay_status, playback_provider, metadata, processing_message, created_at, updated_at')
        .in('post_type', ['live', 'live_replay'])
        .is('video_url', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (postId) postQuery = postQuery.eq('id', postId);

      const { data: posts, error: postsErr } = await postQuery;
      if (postsErr) throw postsErr;

      const results: any[] = [];
      for (const post of posts || []) {
        const metadata = post.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata) ? post.metadata : {};
        const liveStatus = metadata.live_status || (post as any).live_status;
        if (liveStatus !== 'ended') {
          results.push({ post_id: post.id, skipped: true, reason: 'not_ended_live' });
          continue;
        }

        let session: any = null;
        const liveSessionId = metadata.live_session_id || body.live_session_id || body.liveSessionId || null;
        if (liveSessionId) {
          const { data } = await (admin as any)
            .from('live_sessions')
            .select('id, post_id, live_post_id, replay_post_id, title, ended_at, r2_video_url, playback_url, storage_provider, playback_provider')
            .eq('id', liveSessionId)
            .maybeSingle();
          session = data;
        } else {
          const { data } = await (admin as any)
            .from('live_sessions')
            .select('id, post_id, live_post_id, replay_post_id, title, ended_at, r2_video_url, playback_url, storage_provider, playback_provider')
            .or(`post_id.eq.${post.id},live_post_id.eq.${post.id},replay_post_id.eq.${post.id}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          session = data;
        }

        let replay: any = null;
        const replayIdFromPost = metadata.replay_id || body.replay_id || body.replayId || null;
        let replayQuery = (admin as any).from('live_replays').select('*');
        if (replayIdFromPost) replayQuery = replayQuery.eq('id', replayIdFromPost);
        else if (session?.id) replayQuery = replayQuery.eq('live_session_id', session.id);
        else replayQuery = replayQuery.eq('replay_post_id', post.id);
        const { data: replayData } = await replayQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
        replay = replayData;

        let fallbackUrl = metadata.fallback_playback_url || null;
        if (!fallbackUrl && session?.id) {
          const { data: recording } = await (admin as any)
            .from('chunked_recordings')
            .select('id, output_url')
            .eq('live_session_id', session.id)
            .not('output_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          fallbackUrl = recording?.output_url || null;
        }

        const r2Url = replay?.r2_video_url || session?.r2_video_url || null;
        const now = new Date().toISOString();
        let patch: Record<string, unknown> | null = null;
        let type = 'none';

        if (r2Url) {
          const nextMetadata = {
            ...metadata,
            live_status: 'ended',
            live_session_id: session?.id || metadata.live_session_id || null,
            replay_id: replay?.id || metadata.replay_id || null,
            playback_url: r2Url,
            playback_type: 'r2',
            playback_provider: 'r2',
            storage_provider: 'r2',
            archive_status: replay?.archive_status || 'archived',
            replay_status: 'ready',
            replay_ready: true,
            processing_message: null,
            r2_video_url: r2Url,
            thumbnail_url: replay?.thumbnail_url || metadata.thumbnail_url || null,
            updated_at: now,
          };
          patch = {
            video_url: r2Url,
            post_type: 'live_replay',
            replay_status: 'ready',
            playback_provider: 'r2',
            replay_ready: true,
            processing_message: null,
            metadata: nextMetadata,
            updated_at: now,
          };
          type = 'promote_r2_ready';
        } else if (fallbackUrl && String(fallbackUrl).includes('manifest.json')) {
          const nextMetadata = {
            ...metadata,
            live_status: 'ended',
            live_session_id: session?.id || metadata.live_session_id || null,
            playback_url: metadata.playback_url || null,
            playback_type: 'chunked',
            playback_provider: 'chunked',
            fallback_playback_url: fallbackUrl,
            allow_chunked_fallback: true,
            replay_status: 'processing',
            replay_ready: false,
            processing_message: metadata.processing_message || null,
            updated_at: now,
          };
          patch = {
            replay_status: 'processing',
            playback_provider: 'chunked',
            replay_ready: false,
            metadata: nextMetadata,
            updated_at: now,
          };
          type = 'enable_chunked_fallback';
        }

        if (apply && patch) {
          const { error: updateErr } = await (admin as any).from('posts').update(patch).eq('id', post.id);
          if (updateErr) throw updateErr;
          if (r2Url && session?.id) {
            await (admin as any).from('live_sessions').update({
              r2_video_url: r2Url,
              playback_url: r2Url,
              storage_provider: 'r2',
              playback_provider: 'r2',
              replay_post_id: post.id,
              updated_at: now,
            }).eq('id', session.id);
          }
          if (r2Url && replay?.id) {
            await (admin as any).from('live_replays').update({
              replay_post_id: post.id,
              status: 'ready',
              replay_ready_at: replay.replay_ready_at || now,
              posted_at: replay.posted_at || now,
              auto_posted_at: replay.auto_posted_at || now,
              updated_at: now,
            }).eq('id', replay.id);
          }
        }

        results.push({
          post_id: post.id,
          live_session_id: session?.id || metadata.live_session_id || null,
          replay_id: replay?.id || null,
          type,
          applied: apply && !!patch,
          has_r2: !!r2Url,
          has_manifest: !!fallbackUrl,
        });
      }

      return json({ ok: true, apply, count: results.length, results });
    }

    if (action === 'diagnose_replay_archive') {
      const liveSessionId = body.live_session_id || body.liveSessionId;
      const streamUid = body.stream_uid || body.streamUid;
      const postId = parsePostId(body.post_id || body.postId || body.post_url || body.postUrl);
      const hasTargetSelector = !!(replayId || liveSessionId || streamUid || postId);
      let replay: any = null;

      let query = (admin as any)
        .from('live_replays')
        .select('*');
      if (replayId) query = query.eq('id', replayId);
      else if (liveSessionId) query = query.eq('live_session_id', liveSessionId);
      else if (streamUid) query = query.or(`stream_uid.eq.${streamUid},cloudflare_video_uid.eq.${streamUid}`);
      else if (postId) query = query.eq('replay_post_id', postId);
      else return json({ error: 'Missing replay_id, live_session_id, stream_uid, or post_id' }, 400);

      const { data: replayData, error: replayErr } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (replayErr) throw replayErr;
      replay = replayData;

      let session: any = null;
      if (!replay && postId) {
        const { data: sessionByPost, error: sessionByPostErr } = await (admin as any)
          .from('live_sessions')
          .select('*')
          .or(`post_id.eq.${postId},live_post_id.eq.${postId},replay_post_id.eq.${postId}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sessionByPostErr) throw sessionByPostErr;
        session = sessionByPost;
        if (session?.id) {
          const { data: replayBySession, error: replayBySessionErr } = await (admin as any)
            .from('live_replays')
            .select('*')
            .eq('live_session_id', session.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (replayBySessionErr) throw replayBySessionErr;
          replay = replayBySession;
        }
      }

      if (replay?.live_session_id) {
        const { data, error } = await (admin as any)
          .from('live_sessions')
          .select('*')
          .eq('id', replay.live_session_id)
          .maybeSingle();
        if (error) throw error;
        session = data;
      }

      let post: any = null;
      const resolvedPostId = postId || replay?.replay_post_id || session?.post_id || session?.live_post_id || null;
      if (resolvedPostId) {
        const { data, error } = await (admin as any)
          .from('posts')
          .select('id, post_type, video_url, playback_provider, replay_status, metadata, created_at, updated_at')
          .eq('id', resolvedPostId)
          .maybeSingle();
        if (error) throw error;
        post = data;
      }

      const uid = replay?.stream_uid || replay?.cloudflare_video_uid || session?.cloudflare_video_uid || null;
      const cloudflareVideo = uid ? await getStreamVideo(uid).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      })) : null;

      return json({
        ok: true,
        replay,
        session,
        post,
        cloudflare_video: cloudflareVideo,
        progress: archiveProgress(replay),
        r2_diagnostic: await r2ObjectDiagnostic(replay),
        eligibility: archiveEligibility(replay, session),
      });
    }

    if (action === 'diagnose_live_post_media') {
      const postId = parsePostId(body.post_id || body.postId || body.post_url || body.postUrl);
      if (!postId) return json({ error: 'Missing post_id/post_url' }, 400);

      const { data: post, error: postErr } = await (admin as any)
        .from('posts')
        .select('id, user_id, post_type, video_url, media_urls, playback_provider, replay_status, replay_ready, processing_message, metadata, created_at, updated_at')
        .eq('id', postId)
        .maybeSingle();
      if (postErr) throw postErr;

      const metadata = post?.metadata && typeof post.metadata === 'object' && !Array.isArray(post.metadata) ? post.metadata : {};
      const metadataSessionId = metadata.live_session_id || null;

      let session: any = null;
      if (metadataSessionId) {
        const { data, error } = await (admin as any)
          .from('live_sessions')
          .select('*')
          .eq('id', metadataSessionId)
          .maybeSingle();
        if (error) throw error;
        session = data;
      }
      if (!session) {
        const { data, error } = await (admin as any)
          .from('live_sessions')
          .select('*')
          .or(`post_id.eq.${postId},live_post_id.eq.${postId},replay_post_id.eq.${postId}`)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        session = data;
      }

      let replay: any = null;
      if (session?.id) {
        const { data, error } = await (admin as any)
          .from('live_replays')
          .select('*')
          .eq('live_session_id', session.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        replay = data;
      }
      if (!replay) {
        const { data, error } = await (admin as any)
          .from('live_replays')
          .select('*')
          .eq('replay_post_id', postId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        replay = data;
      }

      const resolvedVideoUrl =
        post?.video_url
        || metadata.archive_url
        || metadata.archive_mp4_url
        || metadata.r2_video_url
        || metadata.playback_mp4
        || replay?.playback_mp4
        || replay?.r2_video_url
        || replay?.archive_mp4_url
        || session?.archive_url
        || session?.r2_video_url
        || session?.replay_url
        || session?.playback_url
        || null;
      const isHls = typeof resolvedVideoUrl === 'string' && /\.m3u8(?:\?|$)/i.test(resolvedVideoUrl);
      const liveLike = post?.post_type === 'live' || post?.post_type === 'live_replay' || Boolean(metadata.live_session_id || metadata.live_status || session?.id);
      const failed = post?.replay_status === 'failed'
        || replay?.replay_status === 'failed'
        || session?.recording_status === 'failed'
        || session?.status === 'recording_failed';
      const processing = liveLike && !resolvedVideoUrl && !failed;
      const hasMp4Url = Boolean(resolvedVideoUrl && !isHls);
      const staleStatusWithUrl = hasMp4Url && (
        post?.replay_status === 'processing'
        || metadata.replay_status === 'processing'
        || replay?.replay_status === 'processing'
        || replay?.replay_status === 'archiving'
        || session?.recording_status === 'processing'
      );
      const renderDecision = resolvedVideoUrl && !isHls
        ? 'render_archive_video'
        : failed
          ? 'render_failed_placeholder'
          : processing
            ? 'render_processing_placeholder'
            : 'not_live_or_missing_link';
      const desktopReason = hasMp4Url
        ? (staleStatusWithUrl ? 'url_ready_status_stale' : 'render_video')
        : failed
          ? 'render_failed'
          : liveLike && !session
            ? 'missing_session'
            : liveLike && session && !replay
              ? 'missing_replay'
              : processing
                ? 'render_processing'
                : 'not_live_or_missing_link';

      return json({
        ok: true,
        post,
        session,
        replay,
        resolved_media: {
          live_like: liveLike,
          resolved_video_url: resolvedVideoUrl,
          is_hls: isHls,
          render_decision: renderDecision,
          desktop_reason: desktopReason,
          url_ready_status_stale: staleStatusWithUrl,
          missing_live_session_id: liveLike && !metadata.live_session_id,
          missing_session: liveLike && !session,
          missing_replay: liveLike && !!session && !replay,
          missing_archive_url: liveLike && !resolvedVideoUrl,
          recommendation: renderDecision === 'not_live_or_missing_link'
            ? 'Check post_type/metadata.live_session_id and live_sessions post_id/live_post_id/replay_post_id links.'
            : null,
        },
      });
    }

    if (action === 'diagnose_mislinked_live_video') {
      const postId = parsePostId(body.post_id || body.postId || body.post_url || body.postUrl);
      const streamUid = body.stream_uid || body.streamUid;
      const apply = body.apply === true || body.mode === 'apply';
      let post: any = null;
      let replay: any = null;
      let session: any = null;

      if (postId) {
        const { data, error } = await (admin as any)
          .from('posts')
          .select('id, user_id, post_type, video_url, playback_provider, replay_status, metadata, processing_message, created_at, updated_at')
          .eq('id', postId)
          .maybeSingle();
        if (error) throw error;
        post = data;
      }

      const metadata = post?.metadata && typeof post.metadata === 'object' ? post.metadata : {};
      const replayIdFromPost = body.replay_id || body.replayId || metadata.replay_id || null;
      const sessionIdFromPost = body.live_session_id || body.liveSessionId || metadata.live_session_id || null;
      const uidFromPost = streamUid || metadata.cloudflare_video_uid || metadata.stream_uid || null;

      let replayQuery = (admin as any).from('live_replays').select('*');
      if (replayIdFromPost) replayQuery = replayQuery.eq('id', replayIdFromPost);
      else if (postId) replayQuery = replayQuery.eq('replay_post_id', postId);
      else if (uidFromPost) replayQuery = replayQuery.or(`stream_uid.eq.${uidFromPost},cloudflare_video_uid.eq.${uidFromPost}`);
      else if (sessionIdFromPost) replayQuery = replayQuery.eq('live_session_id', sessionIdFromPost);
      else return json({ error: 'Missing post_id/post_url, replay_id, live_session_id, or stream_uid' }, 400);

      const { data: replayData, error: replayErr } = await replayQuery.order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (replayErr) throw replayErr;
      replay = replayData;

      const sessionId = replay?.live_session_id || sessionIdFromPost || null;
      if (sessionId) {
        const { data, error } = await (admin as any)
          .from('live_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle();
        if (error) throw error;
        session = data;
      }

      let uid = uidFromPost || replay?.stream_uid || replay?.cloudflare_video_uid || session?.cloudflare_video_uid || null;
      let cloudflareVideo = uid ? await getStreamVideo(uid).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      })) : null;
      let selection: any = null;
      if (session && (!cloudflareVideo || (cloudflareVideo as any).error) && session.cloudflare_live_input_id) {
        const videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
        selection = selectRtmpReplayVideoForSession(videos as any, session as any, uid, { skewSeconds: 60, afterEndMinutes: 10 });
        if (selection.video && selection.uid) {
          uid = selection.uid;
          cloudflareVideo = selection.video;
        }
      } else if (cloudflareVideo && !(cloudflareVideo as any).error && session) {
        selection = selectRtmpReplayVideoForSession([cloudflareVideo as any], session as any, uid, { skewSeconds: 60, afterEndMinutes: 10 });
      }
      const validation = cloudflareVideo && !(cloudflareVideo as any).error && session
        ? validateRtmpReplayVideoForSession(cloudflareVideo as any, session as any, { preferredUid: uid, skewSeconds: 60, afterEndMinutes: 10 })
        : { ok: false, uid: uid || null, reason: session ? 'cloudflare_video_not_found' : 'missing_live_session' };

      let repair: any = { applied: false };
      if (apply && post?.id && session && validation.ok && uid && !replay) {
        const urls = getStreamPlaybackUrls(uid);
        const { data: createdReplay, error: createReplayErr } = await (admin as any).from('live_replays').upsert({
          live_session_id: session.id,
          user_id: session.owner_id || session.host_user_id || session.user_id,
          chunked_recording_id: session.id,
          stream_uid: uid,
          cloudflare_video_uid: uid,
          playback_hls: urls.hls,
          playback_dash: urls.dash,
          playback_mp4: urls.mp4,
          cloudflare_playback_url: urls.hls,
          status: 'ready',
          processing_started_at: new Date().toISOString(),
          storage_provider: 'cloudflare_stream',
          playback_provider: 'cloudflare_temp',
          archive_status: 'pending',
          archive_error: null,
          cloudflare_vod_enabled: true,
          last_cf_response: cloudflareVideo,
        }, { onConflict: 'chunked_recording_id' }).select('*').single();
        if (createReplayErr) throw createReplayErr;
        replay = createdReplay;
        const replayPostId = await createOrUpdateInstantReplayPost(admin as any, createdReplay, urls.hls);
        if (replayPostId) {
          const postedAt = new Date().toISOString();
          await (admin as any).from('live_replays').update({
            replay_post_id: replayPostId,
            auto_posted_at: createdReplay.auto_posted_at || postedAt,
            posted_at: createdReplay.posted_at || postedAt,
          }).eq('id', createdReplay.id);
        }
        repair = { applied: true, type: 'created_missing_replay', replay_id: createdReplay.id, post_id: replayPostId };
      } else if (apply && post?.id && replay && validation.ok && uid && !post.video_url) {
        const urls = getStreamPlaybackUrls(uid);
        const replayPostId = await createOrUpdateInstantReplayPost(admin as any, {
          ...replay,
          stream_uid: uid,
          cloudflare_video_uid: uid,
          cloudflare_playback_url: urls.hls,
          playback_hls: urls.hls,
        }, urls.hls);
        repair = { applied: !!replayPostId, type: 'reposted_existing_replay', replay_id: replay.id, post_id: replayPostId };
      } else if (apply && post?.id && !validation.ok) {
        const repairedMetadata = {
          ...metadata,
          mislinked_video_repair_pending: true,
          mislinked_video_repair_reason: validation.reason,
          mislinked_video_repair_at: new Date().toISOString(),
          replay_ready: false,
          replay_status: 'processing',
          processing_message: 'Dang kiem tra lai video replay...',
          playback_url: null,
          playback_hls: null,
          cloudflare_playback_url: null,
          playback_provider: null,
          playback_type: null,
        };
        const { error: updateErr } = await (admin as any).from('posts').update({
          video_url: null,
          replay_ready: false,
          replay_status: 'processing',
          playback_provider: null,
          processing_message: 'Dang kiem tra lai video replay...',
          metadata: repairedMetadata,
          updated_at: new Date().toISOString(),
        }).eq('id', post.id);
        if (updateErr) throw updateErr;
        repair = { applied: true, post_id: post.id };
      }

      return json({
        ok: true,
        valid: validation.ok,
        reason: validation.reason,
        selection_reason: selection?.reason || null,
        post,
        replay,
        session,
        cloudflare_video: cloudflareVideo,
        repair,
      });
    }

    if (action === 'archive_dashboard_snapshot') {
      // V2: trả về snapshot realtime cho admin dashboard /admin/replay-debug
      const limit = Math.max(10, Math.min(Number(body.limit || 50), 200));
      const { data: rows, error: rowsErr } = await (admin as any)
        .from('live_replays')
        .select(`
          id, live_session_id, user_id, stream_uid, status,
          archive_status, archive_phase, archive_attempts, archive_error,
          archive_next_retry_at, archive_lease_until,
          r2_object_key, r2_video_url,
          multipart_upload_id, multipart_bytes_done, multipart_total_parts,
          multipart_parts_done, multipart_part_size, mp4_total_bytes,
          duration_seconds, replay_post_id, posted_at,
          created_at, updated_at
        `)
        .not('archive_phase', 'is', null)
        .neq('archive_phase', 'done')
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (rowsErr) throw rowsErr;

      const sessionIds = Array.from(new Set((rows || []).map((r: any) => r.live_session_id).filter(Boolean)));
      const userIds = Array.from(new Set((rows || []).map((r: any) => r.user_id).filter(Boolean)));
      const sessions = new Map<string, any>();
      const profiles = new Map<string, any>();
      if (sessionIds.length) {
        const { data: ss } = await (admin as any)
          .from('live_sessions')
          .select('id, mode, status, ended_at, title, host_user_id')
          .in('id', sessionIds);
        for (const s of ss || []) sessions.set(s.id, s);
      }
      if (userIds.length) {
        const { data: pp } = await (admin as any)
          .from('profiles')
          .select('id, username, full_name, avatar_url')
          .in('id', userIds);
        for (const p of pp || []) profiles.set(p.id, p);
      }

      const items = (rows || []).map((row: any) => {
        const progress = archiveProgress(row);
        const session = sessions.get(row.live_session_id) || null;
        const profile = profiles.get(row.user_id) || null;
        const eligibility = archiveEligibility(row, session);
        const leaseMs = row.archive_lease_until ? Math.max(0, Date.parse(row.archive_lease_until) - Date.now()) : 0;
        const staleMs = row.updated_at ? Date.now() - Date.parse(row.updated_at) : 0;
        let etaSeconds: number | null = null;
        if (progress.percent && progress.percent > 0 && progress.percent < 100 && row.updated_at && row.created_at) {
          const elapsedSec = Math.max(1, (Date.now() - Date.parse(row.created_at)) / 1000);
          const speedPctPerSec = progress.percent / elapsedSec;
          if (speedPctPerSec > 0) etaSeconds = Math.round((100 - progress.percent) / speedPctPerSec);
        }
        return {
          id: row.id,
          replay_post_id: row.replay_post_id,
          user: profile,
          session: session ? { id: session.id, mode: session.mode, status: session.status, title: session.title } : null,
          archive_phase: row.archive_phase,
          archive_status: row.archive_status,
          archive_attempts: row.archive_attempts,
          archive_error: row.archive_error,
          archive_next_retry_at: row.archive_next_retry_at,
          archive_lease_until: row.archive_lease_until,
          lease_remaining_seconds: Math.round(leaseMs / 1000),
          stale_seconds: Math.round(staleMs / 1000),
          duration_seconds: row.duration_seconds,
          mp4_total_bytes: row.mp4_total_bytes,
          progress,
          eta_seconds: etaSeconds,
          eligibility,
          updated_at: row.updated_at,
          created_at: row.created_at,
        };
      });

      // Tổng quan + unrecoverable count
      const { count: unrecoverableCount } = await (admin as any)
        .from('live_replays')
        .select('id', { count: 'exact', head: true })
        .eq('archive_status', 'unrecoverable');

      const summary = {
        total_in_progress: items.length,
        by_phase: items.reduce((acc: Record<string, number>, it) => {
          const key = String(it.archive_phase || 'unknown');
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
        unrecoverable_count: unrecoverableCount || 0,
        long_in_progress: items.filter((it: any) => Number(it.duration_seconds || 0) >= 3600).length,
      };

      return json({ ok: true, summary, items });
    }

    if (action === 'list') {
      const { data, error } = await (admin as any)
        .from('live_replays')
        .select(`
          id, live_session_id, chunked_recording_id, user_id, stream_uid, status,
          cloudflare_vod_enabled, storage_provider, playback_provider,
          archive_status, archive_phase, archive_attempts, archive_next_retry_at,
          archive_lease_until, archive_error,
          r2_object_key, r2_bucket, r2_video_url, r2_verified_at,
          replay_post_id, posted_at, auto_posted_at,
          cloudflare_mp4_download_url, mp4_export_started_at, mp4_ready_at,
          multipart_upload_id, multipart_bytes_done, multipart_total_parts, multipart_part_size,
          mp4_total_bytes,
          tus_offset, next_chunk_seq, total_chunks_for_ingest, ingest_attempts,
          last_ingest_at, webhook_received_at, playback_hls, thumbnail_url,
          duration_seconds, error_message, last_error_at, last_webhook_event,
          last_cf_status, last_cf_response, created_at, updated_at
        `)
        .order('created_at', { ascending: false })
        .limit(Number(body.limit || 50));
      if (error) throw error;
      return json({ ok: true, replays: data || [] });
    }

    if (action === 'list_live_recording_health') {
      const limit = Math.max(1, Math.min(Number(body.limit || 50), 200));
      const watchdogNow = Date.now();
      const heartbeatAge = (session: any) => {
        const ts = new Date(session.last_seen_at || session.last_host_heartbeat_at || session.updated_at || session.started_at || 0).getTime();
        return Number.isFinite(ts) ? Math.max(0, watchdogNow - ts) : null;
      };
      const watchdogDecision = (session: any) => {
        if (session.ended_at || ['ended', 'recording_processing', 'recording_failed'].includes(String(session.status || ''))) return 'ended_or_processing';
        const age = heartbeatAge(session);
        if (age === null) return 'missing_heartbeat';
        if (age >= 5 * 60_000) return 'would_auto_end';
        if (age >= 120_000) return 'would_reconnect';
        if (session.host_connection_status === 'reconnecting') return 'reconnecting';
        return 'fresh';
      };
      const { count: activeAgoraRecordingCount } = await (admin as any)
        .from('live_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('recording_provider', 'agora')
        .in('recording_status', ['starting', 'recording']);

      const { data, error } = await (admin as any)
        .from('live_sessions')
        .select(`
          id, post_id, live_post_id, mode, status, title, recording_provider, recording_status,
          recording_error_code, recording_error_message, browser_recording_status,
          browser_recording_chunk_count, browser_recording_total_bytes, archive_status,
          archive_error, archive_retry_count, archive_next_retry_at, temp_bucket, temp_object_key,
          archive_bucket, archive_object_key, archive_url, archive_path, temp_path,
          playback_url, replay_url, r2_video_url, recording_resource_id, resource_id,
          recording_sid, sid, recording_uid, recording_started_at, recording_stopped_at,
          recording_last_query_at, last_agora_query_response, last_worker_response,
          host_connection_status, last_host_heartbeat_at, last_seen_at,
          last_disconnected_at,
          replay_post_id, cleanup_attempts, last_cleanup_at,
          started_at, ended_at, updated_at
        `)
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      const sessions = await Promise.all((data || []).map(async (session: any) => {
        const hasReplayUrl = Boolean(session.r2_video_url || session.playback_url);
        const hasBrowserChunks = Number(session.browser_recording_chunk_count || 0) > 0;
        const tempBucket = getTempBucketForSession(session);
        const tempPrefix = getAgoraTempPrefix(session);
        let tempObjectCount = 0;
        let tempTotalBytes = 0;
        let tempScanError: string | null = null;
        if (session.mode === 'agora_webcam' && tempBucket && tempPrefix && !hasReplayUrl) {
          try {
            const tempObjects = (await listR2Objects(tempBucket, tempPrefix, 2000)).filter((item) => item.size > 0);
            tempObjectCount = tempObjects.length;
            tempTotalBytes = tempObjects.reduce((sum, item) => sum + Number(item.size || 0), 0);
          } catch (scanError) {
            tempScanError = scanError instanceof Error ? scanError.message : String(scanError);
          }
        }
        return {
          ...session,
          resource_id: session.recording_resource_id || session.resource_id || null,
          sid: session.recording_sid || session.sid || null,
          active_agora_recording_count: activeAgoraRecordingCount || 0,
          temp_bucket: tempBucket,
          temp_object_key: tempPrefix,
          temp_object_count: tempObjectCount,
          temp_total_bytes: tempTotalBytes,
          temp_scan_error: tempScanError,
          archive_key: session.archive_object_key || session.archive_path || null,
          archive_url: session.archive_url || session.r2_video_url || session.playback_url || null,
          archive_verified: Boolean(session.archive_url || session.r2_video_url),
          heartbeat_age_ms: heartbeatAge(session),
          watchdog_decision: watchdogDecision(session),
          processor_eligible: isAgoraWebcamProcessorEligible(session, tempObjectCount),
          replay_expected: session.recording_provider === 'agora'
            ? ['recording', 'stopping', 'stopped', 'processing', 'ready'].includes(String(session.recording_status || '')) || hasReplayUrl
            : hasBrowserChunks
              ? 'browser_chunks_only'
              : false,
        };
      }));

      const sessionIds = sessions.map((session: any) => session.id);
      const { data: events } = sessionIds.length
        ? await (admin as any)
            .from('live_session_events')
            .select('live_session_id, reason, source, payload, created_at')
            .in('live_session_id', sessionIds)
            .order('created_at', { ascending: false })
            .limit(Math.min(500, sessionIds.length * 20))
        : { data: [] as any[] };
      const timelineBySession = new Map<string, any[]>();
      for (const event of events || []) {
        const list = timelineBySession.get(event.live_session_id) || [];
        if (list.length < 20) {
          list.push({
            at: event.created_at,
            reason: event.reason,
            source: event.source,
            payload: event.payload,
          });
          timelineBySession.set(event.live_session_id, list);
        }
      }
      for (const session of sessions) {
        session.timeline = (timelineBySession.get(session.id) || []).reverse();
      }

      return json({
        ok: true,
        active_agora_recording_count: activeAgoraRecordingCount || 0,
        sessions,
      });
    }

    if (action === 'list_stuck_live_sessions') {
      const limit = Math.max(1, Math.min(Number(body.limit || 50), 200));
      const { data, error } = await (admin as any)
        .from('live_sessions')
        .select(`
          id, user_id, host_user_id, owner_id, post_id, live_post_id, replay_post_id,
          mode, status, host_connection_status, started_at, ended_at,
          last_seen_at, last_host_heartbeat_at, recording_status, archive_status,
          cleanup_attempts, last_cleanup_at, end_reason,
          recording_resource_id, resource_id, recording_sid, sid, recording_uid,
          archive_url, r2_video_url, playback_url, updated_at
        `)
        .eq('mode', 'agora_webcam')
        .in('status', ['live', 'reconnecting', 'ending'])
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;

      const now = Date.now();
      const sessions = (data || []).map((session: any) => {
        const ts = new Date(session.last_seen_at || session.last_host_heartbeat_at || session.updated_at || session.started_at || 0).getTime();
        const heartbeatAgeMs = Number.isFinite(ts) ? Math.max(0, now - ts) : null;
        const watchdogDecision = session.ended_at
          ? 'ended'
          : heartbeatAgeMs === null
            ? 'missing_heartbeat'
            : heartbeatAgeMs >= 5 * 60_000
              ? 'auto_end_due'
              : heartbeatAgeMs >= 120_000
                ? 'reconnecting_due'
                : 'fresh';
        return {
          ...session,
          resource_id: session.recording_resource_id || session.resource_id || null,
          sid: session.recording_sid || session.sid || null,
          heartbeat_age_ms: heartbeatAgeMs,
          watchdog_decision: watchdogDecision,
          archive_url: session.archive_url || session.r2_video_url || session.playback_url || null,
        };
      });

      return json({ ok: true, sessions });
    }

    if (action === 'repair_agora_webcam_temp_replays') {
      const dryRun = body.apply === true ? false : body.dry_run !== false;
      const limit = Math.max(1, Math.min(Number(body.limit || 50), 200));
      const days = Math.max(1, Math.min(Number(body.days || 7), 60));
      const liveSessionId = body.live_session_id || body.liveSessionId || body.session_id || body.sessionId;
      let query = (admin as any)
        .from('live_sessions')
        .select(`
          id, post_id, live_post_id, host_user_id, owner_id, user_id, mode, status, title,
          recording_status, recording_sid, sid, archive_status, archive_error, archive_retry_count,
          archive_next_retry_at, temp_bucket, temp_object_key, replay_url, playback_url, r2_video_url,
          started_at, ended_at, created_at, updated_at
        `)
        .eq('mode', 'agora_webcam')
        .not('recording_sid', 'is', null)
        .is('replay_url', null)
        .is('r2_video_url', null)
        .or('status.in.(ended,processing,processing_replay),recording_status.in.(stopped,ready,failed)')
        .gte('created_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (liveSessionId) query = query.eq('id', liveSessionId);

      const { data: sessions, error } = await query;
      if (error) throw error;

      const now = new Date().toISOString();
      const results: any[] = [];
      let repaired = 0;
      let missingTemp = 0;
      for (const session of sessions || []) {
        const tempBucket = getTempBucketForSession(session);
        const tempPrefix = getAgoraTempPrefix(session);
        let tempObjects: Array<{ key: string; size: number; lastModified?: string | null }> = [];
        let tempScanError: string | null = null;
        if (tempBucket && tempPrefix) {
          try {
            tempObjects = (await listR2Objects(tempBucket, tempPrefix, 5000)).filter((item) => item.size > 0);
          } catch (scanError) {
            tempScanError = scanError instanceof Error ? scanError.message : String(scanError);
          }
        }
        const tempObjectCount = tempObjects.length;
        const tempTotalBytes = tempObjects.reduce((sum, item) => sum + Number(item.size || 0), 0);
        const eligible = isAgoraWebcamProcessorEligible(session, tempObjectCount);
        const rowResult: Record<string, unknown> = {
          live_session_id: session.id,
          post_id: session.post_id || session.live_post_id || null,
          status: session.status,
          recording_status: session.recording_status,
          archive_status: session.archive_status,
          archive_retry_count: session.archive_retry_count || 0,
          temp_bucket: tempBucket,
          temp_object_key: tempPrefix,
          temp_object_count: tempObjectCount,
          temp_total_bytes: tempTotalBytes,
          temp_scan_error: tempScanError,
          processor_eligible: eligible,
          dry_run: dryRun,
        };

        if (tempScanError) {
          rowResult.result = 'scan_failed';
          results.push(rowResult);
          continue;
        }
        if (!tempObjectCount) {
          missingTemp += 1;
          rowResult.result = 'missing_temp_objects_manual_only';
          results.push(rowResult);
          continue;
        }
        if (dryRun) {
          rowResult.result = eligible ? 'would_queue_processor' : 'would_reset_and_queue_processor';
          results.push(rowResult);
          continue;
        }

        const { error: updateErr } = await (admin as any).from('live_sessions').update({
          status: session.status === 'live' ? 'ended' : session.status,
          recording_status: session.recording_status === 'failed' ? 'stopped' : (session.recording_status || 'stopped'),
          archive_status: 'pending',
          archive_retry_count: 0,
          archive_next_retry_at: now,
          archive_error: null,
          recording_error: null,
          error_message: null,
          updated_at: now,
        }).eq('id', session.id);
        if (updateErr) {
          rowResult.result = 'update_failed';
          rowResult.error = updateErr.message;
        } else {
          repaired += 1;
          rowResult.result = 'queued_processor';
        }
        results.push(rowResult);
      }

      const invoked = !dryRun && repaired > 0 && body.invoke_processor !== false
        ? await invokeFunction('live-webcam-recording-processor', { source: 'admin_repair_agora_webcam_temp_replays', limit: Math.min(25, repaired) }).catch((err) => ({
            error: err instanceof Error ? err.message : String(err),
          }))
        : null;

      return json({
        ok: true,
        dry_run: dryRun,
        scanned: sessions?.length || 0,
        repaired,
        missing_temp: missingTemp,
        invoked,
        results,
      });
    }

    if (action === 'repair_stuck_r2_archive') {
      const dryRun = body.dry_run !== false;
      const limit = Math.max(1, Math.min(Number(body.limit || 50), 200));
      const { data: rows, error } = await (admin as any)
        .from('live_replays')
        .select(`
          id, live_session_id, user_id, stream_uid, status,
          archive_status, archive_phase, archive_attempts, archive_error,
          archive_next_retry_at, archive_lease_until,
          r2_video_url, r2_object_key, updated_at, created_at
        `)
        .eq('cloudflare_vod_enabled', true)
        .eq('status', 'ready')
        .not('stream_uid', 'is', null)
        .is('r2_video_url', null)
        .or('archive_status.is.null,archive_status.in.(pending,failed,archiving,processing_stream,stream_ready,exporting_mp4,uploading_r2,verifying_r2),archive_phase.in.(mp4_export,mp4_wait,multipart_init,multipart_upload,verifying,posting,deleting_stream)')
        .order('updated_at', { ascending: true })
        .limit(limit);
      if (error) throw error;

      const sessionIds = Array.from(new Set((rows || []).map((row: any) => row.live_session_id).filter(Boolean)));
      const modeBySession = new Map<string, any>();
      if (sessionIds.length) {
        const { data: sessions, error: sessionErr } = await (admin as any)
          .from('live_sessions')
          .select('id, mode, status, ended_at')
          .in('id', sessionIds);
        if (sessionErr) throw sessionErr;
        for (const session of sessions || []) modeBySession.set(session.id, session);
      }

      const candidates = (rows || []).filter((row: any) => modeBySession.get(row.live_session_id)?.mode === 'rtmp_obs');
      if (dryRun) {
        return json({
          ok: true,
          dry_run: true,
          count: candidates.length,
          candidates: candidates.map((row: any) => ({
            ...row,
            session: modeBySession.get(row.live_session_id) || null,
            eligibility: archiveEligibility(row, modeBySession.get(row.live_session_id) || null),
          })),
        });
      }

      const repaired: any[] = [];
      const now = new Date().toISOString();
      for (const replay of candidates) {
        const { data: updated, error: updateErr } = await (admin as any)
          .from('live_replays')
          .update({
            archive_status: replay.archive_status || 'pending',
            archive_attempts: 0,
            archive_error: null,
            error_message: null,
            last_error_at: null,
            archive_lease_until: null,
            archive_next_retry_at: now,
            last_cf_status: 'admin_repair_stuck_r2_archive',
            last_cf_response: {
              by: guard.user.id,
              at: now,
              previous_archive_status: replay.archive_status,
              previous_archive_phase: replay.archive_phase,
              previous_archive_attempts: replay.archive_attempts,
            },
            updated_at: now,
          })
          .eq('id', replay.id)
          .select('id, archive_status, archive_phase, archive_attempts, archive_next_retry_at')
          .maybeSingle();
        const session = modeBySession.get(replay.live_session_id);
        if (session?.status === 'live' && session?.ended_at) {
          await (admin as any).from('live_sessions').update({
            status: 'replay_temp_ready',
            archive_status: 'pending',
            archive_error: null,
            is_input_armed: false,
            updated_at: now,
          }).eq('id', replay.live_session_id);
        }
        if (updateErr) {
          repaired.push({ id: replay.id, ok: false, error: updateErr.message });
        } else {
          repaired.push({ id: replay.id, ok: true, replay: updated });
        }
      }

      const invoked = {
        mp4_poll: await invokeFunction('live-replay-mp4-poll-cron').catch((err) => ({
          error: err instanceof Error ? err.message : String(err),
        })),
        archive: await invokeFunction('live-replay-archive-cron').catch((err) => ({
          error: err instanceof Error ? err.message : String(err),
        })),
      };
      return json({
        ok: true,
        dry_run: false,
        scanned: rows?.length || 0,
        repaired: repaired.length,
        results: repaired,
        invoked,
      });
    }

    if (action === 'repair_long_rtmp_archive' || action === 'repair_99_percent_archive') {
      const dryRun = body.dry_run !== false;
      const limit = Math.max(1, Math.min(Number(body.limit || 25), 100));
      const liveSessionId = body.live_session_id || body.liveSessionId;
      const streamUid = body.stream_uid || body.streamUid;
      const postId = parsePostId(body.post_id || body.postId || body.post_url || body.postUrl);
      const hasTargetSelector = !!(replayId || liveSessionId || streamUid || postId);

      let targetReplayIds: string[] = [];
      if (replayId) {
        targetReplayIds = [String(replayId)];
      } else if (liveSessionId || streamUid || postId) {
        const diagBody = { action: 'diagnose_replay_archive', replay_id: replayId, live_session_id: liveSessionId, stream_uid: streamUid, post_id: postId };
        let query = (admin as any).from('live_replays').select('id, live_session_id, replay_post_id, stream_uid, cloudflare_video_uid');
        if (liveSessionId) query = query.eq('live_session_id', liveSessionId);
        else if (streamUid) query = query.or(`stream_uid.eq.${streamUid},cloudflare_video_uid.eq.${streamUid}`);
        else if (postId) query = query.eq('replay_post_id', postId);
        const { data: directRows } = await query.order('created_at', { ascending: false }).limit(1);
        targetReplayIds = (directRows || []).map((r: any) => r.id);
        if (!targetReplayIds.length && postId) {
          const { data: sessionByPost } = await (admin as any)
            .from('live_sessions')
            .select('id')
            .or(`post_id.eq.${postId},live_post_id.eq.${postId},replay_post_id.eq.${postId}`)
            .order('created_at', { ascending: false })
            .limit(1);
          const sessionId = sessionByPost?.[0]?.id;
          if (sessionId) {
            const { data: replayBySession } = await (admin as any)
              .from('live_replays')
              .select('id')
              .eq('live_session_id', sessionId)
              .order('created_at', { ascending: false })
              .limit(1);
            targetReplayIds = (replayBySession || []).map((r: any) => r.id);
          }
        }
        if (!targetReplayIds.length) console.warn('[REPAIR_LONG_RTMP_ARCHIVE] no target replay', diagBody);
      }
      if (hasTargetSelector && !targetReplayIds.length) {
        return json({ ok: true, dry_run: true, count: 0, candidates: [], reason: 'target_replay_not_found' });
      }

      let query = (admin as any)
        .from('live_replays')
        .select(`
          id, live_session_id, user_id, stream_uid, cloudflare_video_uid, status,
          archive_status, archive_phase, archive_attempts, archive_error,
          archive_next_retry_at, archive_lease_until,
          r2_video_url, r2_object_key, multipart_upload_id,
          multipart_part_size, multipart_total_parts, multipart_parts_done,
          multipart_bytes_done, mp4_total_bytes, duration_seconds,
          updated_at, created_at
        `)
        .eq('cloudflare_vod_enabled', true)
        .in('status', ['ready', 'processing'])
        .not('stream_uid', 'is', null)
        .is('r2_video_url', null);
      if (targetReplayIds.length) query = query.in('id', targetReplayIds);
      else {
        query = query
          .or('duration_seconds.gte.3600,mp4_total_bytes.gte.1073741824,archive_phase.in.(mp4_wait,multipart_init,multipart_upload,verifying,posting),archive_status.in.(failed,pending,uploading_r2,verifying_r2)')
          .order('updated_at', { ascending: true })
          .limit(limit);
      }

      const { data: rows, error } = await query;
      if (error) throw error;
      const sessionIds = Array.from(new Set((rows || []).map((row: any) => row.live_session_id).filter(Boolean)));
      const sessions = new Map<string, any>();
      if (sessionIds.length) {
        const { data: sessionRows, error: sessionErr } = await (admin as any)
          .from('live_sessions')
          .select('id, mode, status, ended_at')
          .in('id', sessionIds);
        if (sessionErr) throw sessionErr;
        for (const session of sessionRows || []) sessions.set(session.id, session);
      }

      const now = new Date().toISOString();
      let candidates = (rows || [])
        .filter((row: any) => sessions.get(row.live_session_id)?.mode === 'rtmp_obs')
        .map((row: any) => {
          const progress = archiveProgress(row);
          const staleMs = row.updated_at ? Date.now() - Date.parse(String(row.updated_at)) : null;
          const allPartsUploaded = Number(progress.total_parts || 0) > 0
            && Number(progress.parts_done || 0) >= Number(progress.total_parts || 0);
          const allBytesUploaded = Number(progress.total_bytes || 0) > 0
            && Number(progress.bytes_done || 0) >= Number(progress.total_bytes || 0);
          const shouldRestartMultipart = !!row.multipart_upload_id
            && Number(row.multipart_part_size || 0) > 32 * 1024 * 1024
            && !allPartsUploaded
            && !allBytesUploaded
            && (Number(staleMs || 0) >= 30 * 60 * 1000 || Number(row.archive_attempts || 0) >= 3);
          const shouldFix99 = Number(progress.percent || 0) >= 99
            && ['multipart_upload', 'verifying', 'posting'].includes(String(row.archive_phase || ''))
            && !row.r2_video_url;
          return {
            ...row,
            session: sessions.get(row.live_session_id) || null,
            progress,
            should_restart_multipart: shouldRestartMultipart,
            should_fix_99: shouldFix99,
            eligibility: archiveEligibility(row, sessions.get(row.live_session_id) || null),
          };
        });
      if (action === 'repair_99_percent_archive') {
        candidates = candidates.filter((row: any) => row.should_fix_99);
      }

      if (dryRun) {
        return json({ ok: true, dry_run: true, count: candidates.length, candidates });
      }

      const results: any[] = [];
      for (const replay of candidates) {
        const patch: Record<string, unknown> = {
          archive_attempts: 0,
          archive_error: null,
          error_message: null,
          last_error_at: null,
          archive_lease_until: null,
          archive_next_retry_at: now,
          last_cf_status: 'admin_repair_long_rtmp_archive',
          last_cf_response: {
            by: guard.user.id,
            at: now,
            previous_archive_status: replay.archive_status,
            previous_archive_phase: replay.archive_phase,
            previous_archive_attempts: replay.archive_attempts,
            previous_progress: replay.progress,
            restarted_multipart: replay.should_restart_multipart,
            fixed_99_percent: replay.should_fix_99,
          },
          updated_at: now,
        };
        if (!replay.archive_phase) patch.archive_phase = 'mp4_export';
        if (!replay.archive_status) patch.archive_status = 'pending';
        if (replay.should_fix_99) {
          patch.archive_phase = 'verifying';
          patch.archive_status = 'verifying_r2';
        }
        if (replay.should_restart_multipart) {
          try {
            await abortMultipartUpload(replay.r2_object_key, replay.multipart_upload_id);
          } catch (abortErr) {
            console.warn('[REPAIR_LONG_RTMP_ARCHIVE] abort multipart failed (ignored)', {
              replay_id: replay.id,
              err: abortErr instanceof Error ? abortErr.message : String(abortErr),
            });
          }
          patch.archive_phase = 'multipart_init';
          patch.archive_status = 'stream_ready';
          patch.multipart_upload_id = null;
          patch.multipart_parts_done = [];
          patch.multipart_bytes_done = 0;
          patch.multipart_total_parts = null;
          patch.multipart_part_size = null;
        }
        const { data: updated, error: updateErr } = await (admin as any)
          .from('live_replays')
          .update(patch)
          .eq('id', replay.id)
          .select('id, archive_status, archive_phase, archive_attempts, archive_next_retry_at, multipart_part_size')
          .maybeSingle();
        if (replay.session?.status === 'live' && replay.session?.ended_at) {
          await (admin as any).from('live_sessions').update({
            status: 'replay_temp_ready',
            archive_status: 'pending',
            archive_error: null,
            is_input_armed: false,
            updated_at: now,
          }).eq('id', replay.live_session_id);
        }
        results.push(updateErr ? { id: replay.id, ok: false, error: updateErr.message } : { id: replay.id, ok: true, replay: updated });
      }

      const firstReplayId = candidates[0]?.id;
      const invoked = {
        mp4_poll: firstReplayId ? await invokeFunction('live-replay-mp4-poll-cron', { replay_id: firstReplayId }).catch((err) => ({
          error: err instanceof Error ? err.message : String(err),
        })) : null,
        archive: firstReplayId ? await invokeFunction('live-replay-archive-cron', { replay_id: firstReplayId }).catch((err) => ({
          error: err instanceof Error ? err.message : String(err),
        })) : null,
      };
      return json({ ok: true, dry_run: false, repaired: results.length, results, invoked });
    }

    if (action === 'retry_upload') {
      if (!replayId) return json({ error: 'Missing replay_id' }, 400);
      const { data: replay, error: replayErr } = await (admin as any)
        .from('live_replays')
        .select('id, status, cloudflare_vod_enabled')
        .eq('id', replayId)
        .maybeSingle();
      if (replayErr) throw replayErr;
      if (!replay) return json({ error: 'Replay not found' }, 404);
      if (replay.status === 'skipped_legacy' && body.force !== true) {
        return json({
          error: 'Legacy replay is intentionally skipped. Pass force=true to opt it back into Cloudflare VOD.',
        }, 409);
      }
      const { error } = await (admin as any).from('live_replays').update({
        status: 'queued',
        cloudflare_vod_enabled: true,
        ingest_attempts: 0,
        last_ingest_at: null,
        error_message: null,
        last_error_at: null,
        last_cf_status: 'manual_retry_upload',
        last_cf_response: { by: guard.user.id, at: new Date().toISOString() },
      }).eq('id', replayId);
      if (error) throw error;
      const invoked = await invokeFunction('live-replay-stream-ingest');
      return json({ ok: true, invoked });
    }

    if (action === 'retry_webhook_sync' || action === 'force_status_refresh') {
      const invoked = await invokeFunction('live-replay-poll-status');
      return json({ ok: true, invoked });
    }

    if (action === 'test_cloudflare_api') {
      const id = accountId();
      const token = streamToken();
      if (!id || !token) return json({ ok: false, error: 'Missing Cloudflare Stream config' }, 500);
      const listResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream?per_page=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listResp.json().catch(() => null);
      const webhookResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/stream/webhook`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const webhookData = await webhookResp.json().catch(() => null);
      return json({
        ok: !!listData?.success,
        stream: { httpStatus: listResp.status, success: listData?.success, errors: listData?.errors || [] },
        webhook: { httpStatus: webhookResp.status, success: webhookData?.success, result: webhookData?.result || null, errors: webhookData?.errors || [] },
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('admin-replay-debug error:', error);
    return json({ error: message }, 500);
  }
});
