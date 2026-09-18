-- P1: Trigger idempotent finalize replay r2_ready → replay_posted khi đã có post + r2_video_url
CREATE OR REPLACE FUNCTION public.finalize_replay_r2_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF NEW.archive_status = 'r2_ready'
     AND NEW.replay_post_id IS NOT NULL
     AND NEW.r2_video_url IS NOT NULL
     AND length(NEW.r2_video_url) > 0
  THEN
    NEW.archive_status := 'replay_posted';
    NEW.posted_at := COALESCE(NEW.posted_at, v_now);
    NEW.auto_posted_at := COALESCE(NEW.auto_posted_at, v_now);
    NEW.archive_completed_at := COALESCE(NEW.archive_completed_at, v_now);
    NEW.updated_at := v_now;

    -- Mirror sang live_sessions (không throw nếu row không tồn tại)
    BEGIN
      UPDATE public.live_sessions
         SET archive_status = 'replay_posted',
             status = CASE WHEN status IN ('r2_ready','archived') THEN 'replay_posted' ELSE status END,
             replay_ready_at = COALESCE(replay_ready_at, v_now),
             posted_at = COALESCE(posted_at, v_now),
             archived_at = COALESCE(archived_at, v_now),
             r2_archived_at = COALESCE(r2_archived_at, v_now),
             r2_video_url = COALESCE(r2_video_url, NEW.r2_video_url),
             playback_url = COALESCE(playback_url, NEW.r2_video_url),
             storage_provider = COALESCE(storage_provider, 'r2'),
             playback_provider = COALESCE(playback_provider, 'r2'),
             replay_post_id = COALESCE(replay_post_id, NEW.replay_post_id),
             updated_at = v_now
       WHERE id = NEW.live_session_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[finalize_replay_r2_ready] mirror session failed: %', SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_finalize_replay_r2_ready ON public.live_replays;
CREATE TRIGGER trg_finalize_replay_r2_ready
BEFORE INSERT OR UPDATE OF archive_status, replay_post_id, r2_video_url
ON public.live_replays
FOR EACH ROW
EXECUTE FUNCTION public.finalize_replay_r2_ready();

-- Backfill 1 lần cho các dòng đang kẹt r2_ready đã đủ điều kiện
-- (trigger BEFORE UPDATE sẽ tự flip sang replay_posted khi UPDATE chạm cột đích)
UPDATE public.live_replays
   SET archive_status = archive_status,
       updated_at = now()
 WHERE archive_status = 'r2_ready'
   AND replay_post_id IS NOT NULL
   AND r2_video_url IS NOT NULL
   AND length(r2_video_url) > 0;
