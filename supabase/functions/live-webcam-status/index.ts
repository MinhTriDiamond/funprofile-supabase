/* eslint-disable @typescript-eslint/no-explicit-any */
import { corsHeaders, createAdminClient, HttpError, json, normalizeError, requireUser } from '../_shared/httpAuth.ts';

type NormalizedStatus = 'live' | 'stopping' | 'processing' | 'ready' | 'failed';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function pickReplayUrl(session: any, replay: any): string | null {
  return session?.r2_video_url
    || session?.archive_url
    || (session?.playback_provider === 'r2' ? session?.playback_url : null)
    || replay?.r2_video_url
    || replay?.archive_mp4_url
    || replay?.playback_mp4
    || null;
}

function normalizeStatus(session: any, replayUrl?: string | null): NormalizedStatus {
  if (!session) return 'failed';
  if (replayUrl) return 'ready';
  if (session.status === 'failed' || session.recording_status === 'failed') return 'failed';
  const archiveReady = Boolean(session.r2_video_url || session.archive_url)
    || Boolean(session.playback_url && session.playback_provider === 'r2')
    || ['r2_ready', 'replay_posted', 'archived', 'ready'].includes(session.status);
  if (archiveReady) return 'ready';
  if (session.status === 'ending' || session.recording_status === 'stopping') return 'stopping';
  if (session.status === 'reconnecting') return 'live';
  if (session.status === 'live' || session.status === 'recording' || session.recording_status === 'recording') return 'live';
  return 'processing';
}

async function syncReadyReplay(admin: any, session: any, replay: any, replayUrl: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const replayPostId = replay?.replay_post_id || session.replay_post_id || session.post_id || session.live_post_id || null;

  await admin
    .from('live_sessions')
    .update({
      recording_status: 'ready',
      archive_status: session.archive_status === 'r2_ready' ? session.archive_status : 'r2_ready',
      r2_video_url: session.r2_video_url || replayUrl,
      playback_url: session.playback_provider === 'r2' ? (session.playback_url || replayUrl) : replayUrl,
      playback_provider: 'r2',
      replay_post_id: replayPostId,
      updated_at: nowIso,
    })
    .eq('id', session.id);

  if (replay?.id) {
    await admin
      .from('live_replays')
      .update({
        status: 'ready',
        replay_status: 'ready_mp4',
        playback_mp4: replay.playback_mp4 || replayUrl,
        r2_video_url: replay.r2_video_url || replayUrl,
        archive_mp4_url: replay.archive_mp4_url || replayUrl,
        archive_status: 'r2_ready',
        replay_post_id: replayPostId,
        error_message: null,
        updated_at: nowIso,
      })
      .eq('id', replay.id);
  }

  if (!replayPostId) return;

  const { data: post } = await admin
    .from('posts')
    .select('metadata')
    .eq('id', replayPostId)
    .maybeSingle();

  const existingMetadata = isRecord(post?.metadata) ? post.metadata : {};
  const nextMetadata = {
    ...existingMetadata,
    live_session_id: session.id,
    live_status: 'ended',
    ended_at: session.ended_at || existingMetadata.ended_at || null,
    replay_status: 'ready_mp4',
    replay_ready: true,
    archive_status: 'r2_ready',
    archive_mp4_url: replayUrl,
    r2_video_url: replayUrl,
    playback_url: replayUrl,
    playback_mp4: replayUrl,
    playback_provider: 'r2',
    playback_type: 'mp4',
    thumbnail_url: replay?.thumbnail_url || session.thumbnail_url || existingMetadata.thumbnail_url || null,
    processing_message: null,
  };

  await admin
    .from('posts')
    .update({
      post_type: 'live_replay',
      video_url: replayUrl,
      replay_status: 'ready_mp4',
      metadata: nextMetadata,
      updated_at: nowIso,
    })
    .eq('id', replayPostId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const admin = createAdminClient() as any;
  try {
    // Auth optional: guests có thể poll trạng thái replay của session public.
    let userId: string | null = null;
    try {
      const user = await requireUser(req);
      userId = user.id;
    } catch (_e) {
      userId = null;
    }
    let sessionId: string | null = null;
    if (req.method === 'GET') {
      const url = new URL(req.url);
      sessionId = url.searchParams.get('live_session_id') || url.searchParams.get('sessionId');
    } else {
      const body = await req.json().catch(() => ({}));
      sessionId = body.live_session_id || body.sessionId || null;
    }
    if (!sessionId) throw new HttpError(400, 'MISSING_SESSION_ID', 'Missing live_session_id');

    const { data: session, error } = await admin
      .from('live_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    if (error) throw error;
    if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Live session not found');

    const ownerId = session.host_user_id || session.owner_id || session.user_id;
    const isOwner = userId !== null && ownerId === userId;
    if (session.privacy === 'private' && !isOwner) throw new HttpError(403, 'FORBIDDEN', 'Cannot view this replay status.');


    const { data: replay } = await admin
      .from('live_replays')
      .select('id, live_session_id, replay_post_id, status, replay_status, playback_mp4, r2_video_url, archive_mp4_url, playback_hls, temp_hls_url, archive_status, thumbnail_url, error_message')
      .eq('live_session_id', sessionId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const replayUrl = pickReplayUrl(session, replay);
    const status = normalizeStatus(session, replayUrl);

    if (status === 'ready' && replayUrl) {
      // Fire-and-forget: tránh 522 Cloudflare timeout khi Postgres chậm.
      const syncPromise = syncReadyReplay(admin, session, replay, replayUrl).catch((syncError) => {
        console.warn('[live-webcam-status] syncReadyReplay failed', syncError);
      });
      // @ts-ignore - EdgeRuntime chỉ có trên Supabase Edge Functions
      const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
      if (typeof waitUntil === 'function') {
        waitUntil(syncPromise);
      }
    }

    return json({
      ok: true,
      sessionId,
      status,
      raw_status: session.status,
      recording_status: session.recording_status,
      replay_status: replay?.replay_status || replay?.status || null,
      archive_status: session.archive_status || replay?.archive_status || null,
      replay_url: replayUrl,
      thumbnail_url: replay?.thumbnail_url || session.thumbnail_url || null,
      duration: session.duration_seconds || null,
      error_message: replay?.error_message || session.error_message || session.recording_error || session.archive_error || null,
    });
  } catch (error) {
    const normalized = normalizeError(error);
    const status = error instanceof HttpError ? error.status : 500;
    return json({ error: normalized.message, code: normalized.code || 'LIVE_WEBCAM_STATUS_FAILED' }, status);
  }
});
