import { getStreamPlaybackUrls, listStreamLiveInputVideos, selectRtmpReplayVideoForSession } from './cloudflareStreamService.ts';
import { createOrUpdateInstantReplayPost } from './replayFeedService.ts';

export async function recoverMissingRtmpReplays(admin: any): Promise<number> {
  let recovered = 0;
  let attempts = 0;
  const deadline = Date.now() + 15_000;
  // Keyset pages are stable while other cron workers update session timestamps.
  // Skip already-sourced rows without consuming the recovery quota.
  for (const retrying of [false, true]) {
    let cursor: { id: string; retryAt: string | null } | null = null;
    while (attempts < 5 && Date.now() < deadline) {
      let query = admin
        .from('live_sessions')
        .select('id, owner_id, host_user_id, user_id, cloudflare_live_input_id, cloudflare_video_uid, post_id, live_post_id, title, started_at, go_live_clicked_at, created_at, ended_at, updated_at, archive_next_retry_at')
        .eq('mode', 'rtmp_obs')
        .in('status', ['ended', 'replay_temp_ready', 'processing', 'processing_stream', 'stream_ready', 'exporting_mp4', 'archiving_r2', 'uploading_r2', 'verifying_r2', 'failed'])
        .not('cloudflare_live_input_id', 'is', null)
        .limit(30);
      const published = 'or(post_id.not.is.null,live_post_id.not.is.null)';
      if (retrying) {
        query = query.not('archive_next_retry_at', 'is', null)
          .lte('archive_next_retry_at', new Date().toISOString())
          .order('archive_next_retry_at', { ascending: true }).order('id', { ascending: true });
        query = cursor
          ? query.or(`and(${published},or(archive_next_retry_at.gt.${cursor.retryAt},and(archive_next_retry_at.eq.${cursor.retryAt},id.gt.${cursor.id})))`)
          : query.or(`and(${published})`);
      } else {
        query = query.is('archive_next_retry_at', null).order('id', { ascending: true })
          .or('post_id.not.is.null,live_post_id.not.is.null');
        if (cursor) query = query.gt('id', cursor.id);
      }
      const { data: sessions, error: sessionsError } = await query;
      if (sessionsError) throw sessionsError;
      if (!sessions?.length) break;

      const { data: existingRows, error: existingError } = await admin.from('live_replays')
        .select('id, live_session_id, stream_uid, cloudflare_video_uid, r2_video_url, r2_object_key, stream_deleted_at, archive_status, archive_lease_until, archive_next_retry_at')
        .in('live_session_id', sessions.map((session: any) => session.id));
      if (existingError) throw existingError;
      const existingBySession = new Map((existingRows || []).map((row: any) => [row.live_session_id, row]));
      for (const session of sessions) {
        if (attempts >= 5 || Date.now() >= deadline) break;
        const existing: any = existingBySession.get(session.id);
        if (session.archive_next_retry_at && Date.parse(session.archive_next_retry_at) > Date.now()) continue;

        // Existing placeholder replays must get a source too. Never reset media or
        // a replay that is terminal/being worked on by another archive worker.
        if (existing?.id && (
          existing.stream_uid || existing.cloudflare_video_uid || existing.r2_video_url
          || existing.r2_object_key || existing.stream_deleted_at
          || (existing.archive_next_retry_at && Date.parse(existing.archive_next_retry_at) > Date.now())
          || ![null, 'pending', 'failed'].includes(existing.archive_status ?? null)
          || (existing.archive_lease_until && Date.parse(existing.archive_lease_until) > Date.now())
        )) continue;

        attempts += 1;
        try {
          // Retry once when Cloudflare has not materialized the recording yet.
          let videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
          if (videos.length === 0) {
            await new Promise((r) => setTimeout(r, 1500));
            videos = await listStreamLiveInputVideos(session.cloudflare_live_input_id).catch(() => []);
          }
          const selection = selectRtmpReplayVideoForSession(videos as any, session, session.cloudflare_video_uid || null, {
            skewSeconds: 60,
            afterEndMinutes: 10,
          });
          const video = selection.video as any;
          if (!video?.uid) {
            console.warn('[RTMP_RECOVER_REPLAY_NO_STRICT_VIDEO]', {
              live_session_id: session.id,
              live_input_id: session.cloudflare_live_input_id,
              preferredUid: session.cloudflare_video_uid || null,
              reason: selection.reason,
              candidates: selection.candidates,
              rejected: selection.rejected.slice(0, 5),
            });
            await deferSessionRecovery(admin, session);
            continue;
          }

          const uid = String(video.uid);
          const urls = getStreamPlaybackUrls(uid);

          const sourcePatch = {
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
            archive_next_retry_at: null,
            cloudflare_vod_enabled: true,
            last_cf_response: video,
          };
          let result;
          if (existing?.id) {
            let update = admin.from('live_replays').update(sourcePatch)
              .eq('id', existing.id)
              .is('stream_uid', null).is('cloudflare_video_uid', null)
              .is('r2_video_url', null).is('r2_object_key', null)
              .is('stream_deleted_at', null)
              .or(`archive_lease_until.is.null,archive_lease_until.lte.${new Date().toISOString()}`);
            update = existing.archive_status == null
              ? update.is('archive_status', null)
              : update.eq('archive_status', existing.archive_status);
            result = await update.select('*').maybeSingle();
          } else {
            // Ignore a concurrent insertion rather than overwrite its chosen source.
            result = await admin.from('live_replays')
              .upsert({
                ...sourcePatch,
                live_session_id: session.id,
                user_id: session.owner_id || session.host_user_id || session.user_id,
                chunked_recording_id: session.id,
              }, { onConflict: 'chunked_recording_id', ignoreDuplicates: true })
              .select('*').maybeSingle();
          }
          if (result.error) throw result.error;
          const replay = result.data;
          if (replay) {
            const { error: sessionError } = await admin.from('live_sessions').update({
              cloudflare_video_uid: uid,
              status: 'replay_temp_ready',
              recording_status: video?.readyToStream ? 'ready' : 'processing',
              recording_ready_at: video?.readyToStream ? new Date().toISOString() : null,
              archive_status: 'pending',
              archive_error: null,
              archive_next_retry_at: null,
            }).eq('id', session.id).in('status', ['ended', 'failed', 'processing']);
            if (sessionError) throw sessionError;

            const postId = await createOrUpdateInstantReplayPost(admin as any, replay, urls.hls);
            if (postId && replay?.id) {
              const { error: postError } = await admin.from('live_replays').update({
                replay_post_id: postId,
                auto_posted_at: replay.auto_posted_at || new Date().toISOString(),
                posted_at: replay.posted_at || new Date().toISOString(),
              }).eq('id', replay.id);
              if (postError) throw postError;
            }
            recovered += 1;
          }
        } catch (error) {
          await deferSessionRecovery(admin, session).catch(() => undefined);
          // A bad replay (e.g. conflicting UID) must not block other archives.
          console.warn('[RTMP_RECOVER_REPLAY_FAILED]', {
            live_session_id: session.id,
            replay_id: existing?.id || null,
            error_code: (error as { code?: string })?.code || 'recovery_failed',
          });
        }
      }
      const lastSession = sessions[sessions.length - 1];
      cursor = { id: lastSession.id, retryAt: lastSession.archive_next_retry_at };
      if (sessions.length < 30) break;
    }
  }
  return recovered;
}

async function deferSessionRecovery(admin: any, session: any): Promise<void> {
  let query = admin.from('live_sessions').update({
    archive_next_retry_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  }).eq('id', session.id)
    .in('status', ['ended', 'replay_temp_ready', 'processing', 'processing_stream', 'stream_ready', 'exporting_mp4', 'archiving_r2', 'uploading_r2', 'verifying_r2', 'failed']);
  query = session.archive_next_retry_at == null
    ? query.is('archive_next_retry_at', null)
    : query.eq('archive_next_retry_at', session.archive_next_retry_at);
  const { error } = await query;
  if (error) throw error;
}
