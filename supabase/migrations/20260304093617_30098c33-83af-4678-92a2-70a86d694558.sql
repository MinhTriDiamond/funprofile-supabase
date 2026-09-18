
-- Create get_livestream_stats function for monitoring dashboard
CREATE OR REPLACE FUNCTION public.get_livestream_stats()
RETURNS TABLE(
  total_sessions BIGINT,
  active_sessions BIGINT,
  ended_sessions BIGINT,
  total_recordings BIGINT,
  recordings_done BIGINT,
  recordings_failed BIGINT,
  recordings_stuck BIGINT,
  success_rate NUMERIC,
  avg_duration_minutes NUMERIC,
  max_duration_minutes NUMERIC,
  total_chunks BIGINT,
  total_viewers BIGINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM live_sessions)::BIGINT AS total_sessions,
    (SELECT COUNT(*) FROM live_sessions WHERE status = 'live')::BIGINT AS active_sessions,
    (SELECT COUNT(*) FROM live_sessions WHERE status = 'ended')::BIGINT AS ended_sessions,
    (SELECT COUNT(*) FROM chunked_recordings)::BIGINT AS total_recordings,
    (SELECT COUNT(*) FROM chunked_recordings WHERE status = 'done')::BIGINT AS recordings_done,
    (SELECT COUNT(*) FROM chunked_recordings WHERE status = 'failed')::BIGINT AS recordings_failed,
    (SELECT COUNT(*) FROM chunked_recordings WHERE status = 'recording')::BIGINT AS recordings_stuck,
    CASE 
      WHEN (SELECT COUNT(*) FROM chunked_recordings) > 0 
      THEN ROUND((SELECT COUNT(*) FROM chunked_recordings WHERE status = 'done')::NUMERIC / 
           GREATEST((SELECT COUNT(*) FROM chunked_recordings), 1) * 100, 1)
      ELSE 0
    END AS success_rate,
    COALESCE((
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::NUMERIC, 1)
      FROM live_sessions WHERE ended_at IS NOT NULL
    ), 0) AS avg_duration_minutes,
    COALESCE((
      SELECT ROUND(MAX(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60)::NUMERIC, 1)
      FROM live_sessions WHERE ended_at IS NOT NULL
    ), 0) AS max_duration_minutes,
    (SELECT COUNT(*) FROM chunked_recording_chunks)::BIGINT AS total_chunks,
    (SELECT COALESCE(SUM(viewer_count), 0) FROM live_sessions)::BIGINT AS total_viewers;
END;
$$;
