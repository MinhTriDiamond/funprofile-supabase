DROP POLICY IF EXISTS "live_replays_public_read_playable_archive" ON public.live_replays;
CREATE POLICY "live_replays_public_read_playable_archive"
  ON public.live_replays
  FOR SELECT
  TO anon, authenticated
  USING (
    status::text IN ('ready', 'archived', 'posted')
    OR replay_status IN ('ready', 'ready_mp4')
    OR archive_status IN ('archived', 'replay_posted', 'stream_deleted', 'r2_ready')
    OR r2_video_url IS NOT NULL
    OR archive_mp4_url IS NOT NULL
    OR playback_mp4 IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_live_replays_replay_post_id_updated
  ON public.live_replays(replay_post_id, updated_at DESC)
  WHERE replay_post_id IS NOT NULL;