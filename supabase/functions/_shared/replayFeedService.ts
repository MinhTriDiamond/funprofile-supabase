/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const OPTIMIZING_MESSAGE = 'Đang tối ưu video replay trong nền. Bạn vẫn có thể xem lại ngay.';

function formatEta(seconds: number | null): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return `~${Math.max(1, Math.round(seconds))} giây`;
  const mins = Math.round(seconds / 60);
  return `~${mins} phút`;
}

function progressMessage(percent: number | null, etaSeconds: number | null, phase?: string | null): string {
  // Phase-specific friendly messages khi chưa có % (mp4 đang được Cloudflare encode)
  if (!percent || !Number.isFinite(percent) || percent <= 0) {
    if (phase === 'mp4_export' || phase === 'mp4_wait') {
      return 'Cloudflare đang xử lý video gốc (~30–60s). Bạn vẫn có thể xem lại ngay.';
    }
    if (phase === 'multipart_init') {
      return 'Đang chuẩn bị lưu video sang R2…';
    }
    return OPTIMIZING_MESSAGE;
  }
  if (percent >= 99 && (phase === 'verifying' || phase === 'posting')) {
    return 'Đang hoàn tất lưu video sang R2. Bạn vẫn có thể xem lại ngay.';
  }
  const eta = formatEta(etaSeconds);
  const base = `Đang lưu video sang R2 ${Math.min(99, Math.max(1, Math.round(percent)))}%`;
  return eta ? `${base} • còn ${eta}. Bạn vẫn có thể xem lại ngay.` : `${base}. Bạn vẫn có thể xem lại ngay.`;
}

function ownerIdOfLiveSession(liveSession: Record<string, any> | null | undefined): string | null {
  return liveSession?.owner_id || liveSession?.host_user_id || liveSession?.user_id || null;
}

function verifyReplayPostOwnership(
  replay: Record<string, any>,
  liveSession: Record<string, any> | null | undefined,
  post: Record<string, any> | null | undefined,
  postId: string | null,
): boolean {
  const ownerId = ownerIdOfLiveSession(liveSession);
  const replayUserId = replay.user_id || null;
  const postUserId = post?.user_id || null;
  const liveSessionId = liveSession?.id || null;
  const ok = !!ownerId
    && (!post || !('user_id' in post) || !postUserId || postUserId === ownerId)
    && (!replayUserId || replayUserId === ownerId)
    && (!replay.live_session_id || replay.live_session_id === liveSessionId);
  if (ownerId && post && ('user_id' in post) && !postUserId) {
    console.warn('[REPLAY_POST_USER_ID_MISSING]', { post_id: postId, replay_id: replay.id || null, live_session_id: liveSessionId });
  }
  if (!ok) {
    console.error('[REPLAY_POST_OWNER_MISMATCH]', {
      post_id: postId,
      post_user_id: postUserId,
      replay_id: replay.id || null,
      replay_user_id: replayUserId,
      replay_live_session_id: replay.live_session_id || null,
      live_session_id: liveSessionId,
      live_session_owner_id: ownerId,
    });
  }
  return ok;
}

export async function updateReplayPostArchiveProgress(
  admin: SupabaseClient,
  replay: Record<string, any>,
  progress: {
    phase?: string | null;
    bytesDone?: number | null;
    totalBytes?: number | null;
    partsDone?: number | null;
    totalParts?: number | null;
  },
): Promise<void> {
  const totalBytes = Number(progress.totalBytes || 0);
  const bytesDone = Number(progress.bytesDone || 0);
  const percent = totalBytes > 0 ? Math.round((bytesDone / totalBytes) * 100) : null;
  let postId = replay.replay_post_id || null;
  if (!postId && replay.live_session_id) {
    const { data: liveSession } = await admin
      .from('live_sessions')
      .select('post_id, live_post_id')
      .eq('id', replay.live_session_id)
      .maybeSingle();
    postId = liveSession?.post_id || (liveSession as any)?.live_post_id || null;
  }
  if (!postId) return;

  const { data: post } = await admin
    .from('posts')
    .select('metadata')
    .eq('id', postId)
    .maybeSingle();
  const prevMetadata = (post?.metadata && typeof post.metadata === 'object') ? post.metadata as Record<string, any> : {};

  // ETA: dùng rolling speed = bytes / elapsed kể từ archive_started_at (mốc đầu tiên có % > 0).
  const nowMs = Date.now();
  const startedAtIso = typeof prevMetadata.archive_started_at === 'string'
    ? prevMetadata.archive_started_at
    : (percent && percent > 0 ? new Date(nowMs).toISOString() : null);
  let etaSeconds: number | null = null;
  if (startedAtIso && totalBytes > 0 && bytesDone > 0) {
    const elapsedMs = nowMs - Date.parse(startedAtIso);
    if (elapsedMs > 5_000) {
      const bytesPerMs = bytesDone / elapsedMs;
      if (bytesPerMs > 0) {
        const remainingMs = (totalBytes - bytesDone) / bytesPerMs;
        etaSeconds = Math.max(0, Math.round(remainingMs / 1000));
      }
    }
  }

  const message = progressMessage(percent, etaSeconds, progress.phase);
  const metadata = {
    ...prevMetadata,
    archive_status: progress.phase === 'verifying' ? 'verifying_r2'
      : (progress.phase === 'mp4_export' || progress.phase === 'mp4_wait') ? 'exporting_mp4'
      : (progress.phase === 'multipart_init' || progress.phase === 'multipart_upload') ? 'uploading_r2'
      : ((prevMetadata.archive_status as string | undefined) || 'uploading_r2'),
    archive_phase: progress.phase || null,
    archive_progress_percent: percent,
    archive_eta_seconds: etaSeconds,
    archive_started_at: startedAtIso,
    multipart_bytes_done: bytesDone || null,
    mp4_total_bytes: totalBytes || null,
    multipart_parts_done: progress.partsDone || null,
    multipart_total_parts: progress.totalParts || null,
    processing_message: message,
  };
  const { error } = await admin.from('posts').update({
    processing_message: message,
    metadata,
    updated_at: new Date().toISOString(),
  }).eq('id', postId);
  if (error) console.warn('[REPLAY_POST_PROGRESS_UPDATE_FAILED]', { postId, error: error.message });
}

export async function createOrUpdateInstantReplayPost(
  admin: SupabaseClient,
  replay: Record<string, any>,
  cloudflareUrl: string,
): Promise<string | null> {
  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('id, post_id, live_post_id, title, description, ended_at, privacy, host_user_id, owner_id, user_id, mode')
    .eq('id', replay.live_session_id)
    .maybeSingle();
  const postId = liveSession?.post_id || (liveSession as any)?.live_post_id || null;
  if (!liveSession || !postId || !cloudflareUrl) return null;

  const { data: post } = await admin
    .from('posts')
    .select('metadata, content, user_id')
    .eq('id', postId)
    .maybeSingle();

  if (!verifyReplayPostOwnership(replay, liveSession as any, post as any, postId)) return null;

  const now = new Date().toISOString();
  const metadata = {
    ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
    live_title: liveSession.title,
    live_description: (liveSession as any).description || '',
    live_status: 'ended',
    live_mode: (liveSession as any).mode || 'rtmp_obs',
    live_session_id: replay.live_session_id,
    replay_id: replay.id,
    replay_badge: 'REPLAY',
    badge: 'REPLAY',
    post_type: 'live_replay',
    playback_url: null,
    playback_hls: null,
    playback_type: 'r2_pending',
    playback_provider: 'r2',
    storage_provider: 'r2',
    archive_status: replay.archive_status || 'pending',
    archive_phase: replay.archive_phase || null,
    archive_progress_percent: replay.mp4_total_bytes
      ? Math.round((Number(replay.multipart_bytes_done || 0) / Number(replay.mp4_total_bytes || 1)) * 100)
      : null,
    multipart_bytes_done: replay.multipart_bytes_done || null,
    mp4_total_bytes: replay.mp4_total_bytes || null,
    multipart_total_parts: replay.multipart_total_parts || null,
    replay_status: 'processing',
    replay_ready: false,
    replay_source: 'r2_pending',
    processing_message: progressMessage(replay.mp4_total_bytes
      ? (Number(replay.multipart_bytes_done || 0) / Number(replay.mp4_total_bytes || 1)) * 100
      : null, null),
    cloudflare_playback_url: null,
    stream_uid: replay.stream_uid || replay.cloudflare_video_uid,
    cloudflare_video_uid: replay.stream_uid || replay.cloudflare_video_uid,
    thumbnail_url: replay.thumbnail_url,
    ended_at: liveSession.ended_at || now,
    posted_at: replay.posted_at || replay.auto_posted_at || now,
  };

  const { error: updErr } = await admin.from('posts').update({
    video_url: null,
    image_url: null,
    post_type: 'live_replay',
    replay_status: 'processing',
    playback_provider: 'r2',
    thumbnail_url: replay.thumbnail_url || null,
    replay_ready: false,
    processing_message: metadata.processing_message,
    metadata,
    updated_at: now,
  }).eq('id', postId);
  if (updErr) console.error('[REPLAY_POST_UPDATE_FAILED] instant', { postId, error: updErr.message });

  return postId as string;
}

export async function createOrUpdateTempHlsReplayPost(
  admin: SupabaseClient,
  replay: Record<string, any>,
  hlsUrl: string,
): Promise<string | null> {
  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('id, post_id, live_post_id, title, description, ended_at, privacy, host_user_id, owner_id, user_id, mode, recording_layout, recording_width, recording_height, recording_aspect_ratio, source_device_type')
    .eq('id', replay.live_session_id)
    .maybeSingle();
  if (!liveSession) return null;
  const ownerId = ownerIdOfLiveSession(liveSession as any);
  let postId: string | null = liveSession?.post_id || (liveSession as any)?.live_post_id || replay.replay_post_id || null;

  const { data: existingPost } = postId
    ? await admin
        .from('posts')
        .select('metadata, content, user_id')
        .eq('id', postId)
        .maybeSingle()
    : { data: null as any };

  if (!existingPost && ownerId) {
    const insertNow = new Date().toISOString();
    const insertMetadata = {
      live_title: (liveSession as any)?.title || null,
      live_description: (liveSession as any)?.description || '',
      live_status: 'ended',
      live_mode: (liveSession as any)?.mode || 'agora_webcam',
      live_session_id: replay.live_session_id,
      replay_id: replay.id,
      replay_badge: 'REPLAY',
      badge: 'REPLAY',
      post_type: 'live_replay',
      playback_url: hlsUrl,
      playback_hls: hlsUrl,
      temp_hls_url: hlsUrl,
      playback_type: 'hls',
      playback_provider: 'r2_temp',
      storage_provider: 'r2_temp',
      archive_status: replay.archive_status || 'pending',
      replay_status: 'ready_hls',
      replay_ready: true,
      processing_message: 'Replay dang duoc toi uu trong nen. Ban van co the xem lai ngay.',
      temp_bucket: replay.temp_bucket,
      temp_prefix: replay.temp_prefix,
      temp_hls_key: replay.temp_hls_key,
      thumbnail_url: replay.thumbnail_url,
      recording_layout: (liveSession as any)?.recording_layout || null,
      recording_width: (liveSession as any)?.recording_width || null,
      recording_height: (liveSession as any)?.recording_height || null,
      recording_aspect_ratio: (liveSession as any)?.recording_aspect_ratio || null,
      source_device_type: (liveSession as any)?.source_device_type || null,
      hls_ready_at: replay.hls_ready_at || insertNow,
      ended_at: (liveSession as any)?.ended_at || insertNow,
      posted_at: replay.posted_at || replay.auto_posted_at || insertNow,
      recovered_post: postId ? { reason: 'live_post_missing', original_post_id: postId } : { reason: 'no_live_post' },
    };
    const { data: inserted, error: insertErr } = await admin
      .from('posts')
      .insert({
        user_id: ownerId,
        content: (liveSession as any)?.title || 'Replay livestream',
        post_type: 'live_replay',
        video_url: hlsUrl,
        thumbnail_url: replay.thumbnail_url || null,
        replay_status: 'ready_hls',
        playback_provider: 'r2_temp',
        replay_ready: true,
        processing_message: insertMetadata.processing_message,
        metadata: insertMetadata,
        privacy: (liveSession as any)?.privacy || 'public',
      })
      .select('id')
      .maybeSingle();
    if (insertErr) {
      console.error('[REPLAY_POST_INSERT_FAILED] temp_hls', { liveSessionId: replay.live_session_id, error: insertErr.message });
      return null;
    }
    postId = inserted?.id || null;
    if (!postId) return null;
    await admin.from('live_sessions').update({ post_id: postId, live_post_id: postId, replay_post_id: postId, updated_at: insertNow }).eq('id', replay.live_session_id).then(undefined, () => undefined);
    return postId;
  }

  if (!liveSession || !postId) return null;
  if (!verifyReplayPostOwnership(replay, liveSession as any, existingPost as any, postId)) return null;

  const now = new Date().toISOString();
  const metadata = {
    ...((existingPost?.metadata && typeof existingPost.metadata === 'object') ? existingPost.metadata : {}),
    live_title: (liveSession as any)?.title || null,
    live_description: (liveSession as any)?.description || '',
    live_status: 'ended',
    live_mode: (liveSession as any)?.mode || 'agora_webcam',
    live_session_id: replay.live_session_id,
    replay_id: replay.id,
    replay_badge: 'REPLAY',
    badge: 'REPLAY',
    post_type: 'live_replay',
    playback_url: hlsUrl,
    playback_hls: hlsUrl,
    temp_hls_url: hlsUrl,
    playback_type: 'hls',
    playback_provider: 'r2_temp',
    storage_provider: 'r2_temp',
    archive_status: replay.archive_status || 'pending',
    replay_status: 'ready_hls',
    replay_ready: true,
    processing_message: 'Replay dang duoc toi uu trong nen. Ban van co the xem lai ngay.',
    temp_bucket: replay.temp_bucket,
    temp_prefix: replay.temp_prefix,
    temp_hls_key: replay.temp_hls_key,
    thumbnail_url: replay.thumbnail_url,
    recording_layout: (liveSession as any)?.recording_layout || null,
    recording_width: (liveSession as any)?.recording_width || null,
    recording_height: (liveSession as any)?.recording_height || null,
    recording_aspect_ratio: (liveSession as any)?.recording_aspect_ratio || null,
    source_device_type: (liveSession as any)?.source_device_type || null,
    hls_ready_at: replay.hls_ready_at || now,
    ended_at: (liveSession as any)?.ended_at || now,
    posted_at: replay.posted_at || replay.auto_posted_at || now,
  };

  const { error: updErr } = await admin.from('posts').update({
    video_url: hlsUrl,
    image_url: null,
    post_type: 'live_replay',
    replay_status: 'ready_hls',
    playback_provider: 'r2_temp',
    thumbnail_url: replay.thumbnail_url || null,
    replay_ready: true,
    processing_message: metadata.processing_message,
    metadata,
    updated_at: now,
  }).eq('id', postId);
  if (updErr) {
    console.error('[REPLAY_POST_UPDATE_FAILED] temp_hls', { postId, error: updErr.message });
    return null;
  }

  return postId;
}

export async function createOrUpdateReplayPost(
  admin: SupabaseClient,
  replay: Record<string, any>,
  r2Url: string,
): Promise<string | null> {
  const { data: liveSession } = await admin
    .from('live_sessions')
    .select('id, post_id, live_post_id, title, ended_at, privacy, host_user_id, owner_id, user_id, mode, recording_layout, recording_width, recording_height, recording_aspect_ratio, source_device_type')
    .eq('id', replay.live_session_id)
    .maybeSingle();
  if (!liveSession) return null;
  const ownerId = ownerIdOfLiveSession(liveSession as any);
  let postId: string | null = liveSession?.post_id || (liveSession as any)?.live_post_id || null;

  const { data: existingPost } = postId
    ? await admin
        .from('posts')
        .select('metadata, content, user_id')
        .eq('id', postId)
        .maybeSingle()
    : { data: null as any };

  // Nếu live post bị xoá hoặc không tồn tại nhưng vẫn có ownerId → INSERT post replay mới
  // để tránh kẹt loop "replay_post_publish_failed" vô hạn.
  if (!existingPost && ownerId) {
    const insertNow = new Date().toISOString();
    const insertMetadata = {
      live_title: (liveSession as any)?.title || null,
      live_status: 'ended',
      live_mode: (liveSession as any)?.mode || 'agora_webcam',
      live_session_id: replay.live_session_id,
      replay_id: replay.id,
      replay_badge: 'REPLAY',
      badge: 'REPLAY',
      post_type: 'live_replay',
      playback_url: r2Url,
      playback_type: replay.playback_type || 'mp4',
      playback_provider: 'r2',
      provider: 'r2',
      storage_provider: 'r2',
      recording_status: 'ready',
      archive_status: 'r2_ready',
      replay_status: 'ready_mp4',
      replay_ready: true,
      processing_message: null,
      r2_video_url: r2Url,
      archive_mp4_url: replay.archive_mp4_url || r2Url,
      archive_mp4_key: replay.archive_mp4_key || replay.r2_object_key,
      r2_object_key: replay.r2_object_key,
      r2_bucket: replay.r2_bucket,
      thumbnail_url: replay.thumbnail_url,
      duration_seconds: replay.duration_seconds,
      archived_at: replay.archived_at || insertNow,
      posted_at: replay.posted_at || replay.auto_posted_at || insertNow,
      ended_at: (liveSession as any)?.ended_at || insertNow,
      recovered_post: postId ? { reason: 'live_post_missing', original_post_id: postId } : { reason: 'no_live_post' },
    };
    const { data: inserted, error: insertErr } = await admin
      .from('posts')
      .insert({
        user_id: ownerId,
        content: (liveSession as any)?.title || 'Replay livestream',
        post_type: 'live_replay',
        video_url: r2Url,
        thumbnail_url: replay.thumbnail_url || null,
        replay_status: replay.replay_status || 'ready_mp4',
        playback_provider: 'r2',
        replay_ready: true,
        processing_message: null,
        metadata: insertMetadata,
        privacy: (liveSession as any)?.privacy || 'public',
      })
      .select('id')
      .maybeSingle();
    if (insertErr) {
      console.error('[REPLAY_POST_INSERT_FAILED]', { liveSessionId: replay.live_session_id, error: insertErr.message });
      return null;
    }
    const newId = inserted?.id || null;
    if (!newId) return null;
    // Link post mới vào live_session để các flow khác (FE feed) tìm được.
    await admin.from('live_sessions').update({ post_id: newId, live_post_id: newId, updated_at: insertNow }).eq('id', replay.live_session_id).then(undefined, () => undefined);
    return newId as string;
  }

  if (!postId) return null;
  const post = existingPost;

  if (!verifyReplayPostOwnership(replay, liveSession as any, post as any, postId)) return null;

  const metadata = {
    ...((post?.metadata && typeof post.metadata === 'object') ? post.metadata : {}),
    live_title: liveSession.title,
    live_status: 'ended',
    live_mode: (liveSession as any).mode || 'agora_webcam',
    live_session_id: replay.live_session_id,
    replay_id: replay.id,
    replay_badge: 'REPLAY',
    badge: 'REPLAY',
    post_type: 'live_replay',
    playback_url: r2Url,
    playback_type: replay.playback_type || 'mp4',
    playback_provider: 'r2',
    provider: 'r2',
    storage_provider: 'r2',
    recording_status: 'ready',
    archive_status: 'r2_ready',
    replay_status: 'ready_mp4',
    replay_ready: true,
    processing_message: null,
    r2_video_url: r2Url,
    archive_mp4_url: replay.archive_mp4_url || r2Url,
    archive_mp4_key: replay.archive_mp4_key || replay.r2_object_key,
    r2_object_key: replay.r2_object_key,
    r2_bucket: replay.r2_bucket,
    stream_uid: replay.stream_uid || replay.cloudflare_video_uid,
    cloudflare_video_uid: replay.stream_uid || replay.cloudflare_video_uid,
    thumbnail_url: replay.thumbnail_url,
    duration_seconds: replay.duration_seconds,
    recording_layout: (liveSession as any).recording_layout || null,
    recording_width: (liveSession as any).recording_width || null,
    recording_height: (liveSession as any).recording_height || null,
    recording_aspect_ratio: (liveSession as any).recording_aspect_ratio || null,
    source_device_type: (liveSession as any).source_device_type || null,
    archived_at: replay.archived_at || new Date().toISOString(),
    posted_at: replay.posted_at || replay.auto_posted_at || new Date().toISOString(),
    ended_at: liveSession.ended_at || new Date().toISOString(),
  };

  const { error: r2UpdErr } = await admin.from('posts').update({
    video_url: r2Url,
    image_url: null,
    post_type: 'live_replay',
    replay_status: 'ready_mp4',
    playback_provider: 'r2',
    thumbnail_url: replay.thumbnail_url || null,
    replay_ready: true,
    processing_message: null,
    metadata,
  }).eq('id', postId);
  if (r2UpdErr) {
    // CRITICAL: trả về null để processor throw + giữ lại R2 temp cho lần retry sau.
    console.error('[REPLAY_POST_UPDATE_FAILED] r2', { postId, error: r2UpdErr.message });
    return null;
  }

  return postId as string;
}

export async function upsertCreatorLibrary(
  admin: SupabaseClient,
  replay: Record<string, any>,
  postId: string | null,
): Promise<void> {
  await (admin as any).from('creator_library').upsert({
    user_id: replay.user_id,
    post_id: postId,
    live_session_id: replay.live_session_id,
    live_replay_id: replay.id,
    title: replay.title || 'Live replay',
    media_type: 'video',
    storage_provider: 'r2',
    playback_provider: 'r2',
    r2_object_key: replay.r2_object_key,
    r2_bucket: replay.r2_bucket,
    r2_video_url: replay.r2_video_url,
    thumbnail_url: replay.thumbnail_url,
    duration_seconds: replay.duration_seconds,
    archived_at: replay.archived_at || new Date().toISOString(),
    posted_at: replay.posted_at || replay.auto_posted_at || new Date().toISOString(),
    deleted_at: null,
  }, { onConflict: 'live_replay_id' });
}
