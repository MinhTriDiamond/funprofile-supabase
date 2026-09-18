
CREATE OR REPLACE FUNCTION public.get_replay_backlog_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  SELECT public.has_role(auth.uid(), 'admin') INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  WITH agg AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'queued')                                            AS queued_count,
      COUNT(*) FILTER (WHERE status = 'uploading')                                         AS uploading_count,
      COUNT(*) FILTER (WHERE status = 'processing')                                        AS processing_count,
      COUNT(*) FILTER (WHERE status = 'ready')                                             AS ready_count,
      COUNT(*) FILTER (WHERE status = 'failed')                                            AS failed_count,
      COUNT(*) FILTER (WHERE status IN ('queued','uploading')
                       AND last_ingest_at < now() - interval '30 minutes')                  AS stale_30m,
      COUNT(*) FILTER (WHERE status IN ('queued','uploading')
                       AND last_ingest_at < now() - interval '1 hour')                      AS stale_1h,
      COUNT(*) FILTER (WHERE status IN ('queued','uploading')
                       AND last_ingest_at < now() - interval '2 hours')                     AS stale_2h,
      MIN(last_ingest_at) FILTER (WHERE status IN ('queued','uploading'))                  AS oldest_last_ingest_at
    FROM public.live_replays
  ),
  top_stale AS (
    SELECT id, status, stream_uid, tus_offset, total_chunks_for_ingest,
           ingest_attempts, last_ingest_at, created_at, error_message
    FROM public.live_replays
    WHERE status IN ('queued','uploading')
    ORDER BY last_ingest_at ASC NULLS FIRST
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'now', now(),
    'queued_count', a.queued_count,
    'uploading_count', a.uploading_count,
    'processing_count', a.processing_count,
    'ready_count', a.ready_count,
    'failed_count', a.failed_count,
    'stale_30m', a.stale_30m,
    'stale_1h', a.stale_1h,
    'stale_2h', a.stale_2h,
    'oldest_last_ingest_at', a.oldest_last_ingest_at,
    'top_stale', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM top_stale t), '[]'::jsonb)
  )
  INTO v_result
  FROM agg a;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_replay_backlog_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_replay_backlog_summary() TO authenticated;
