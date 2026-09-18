
CREATE OR REPLACE FUNCTION public.live_replay_force_resync(p_replay_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role boolean;
BEGIN
  SELECT public.has_role(auth.uid(), 'admin') INTO v_role;
  IF NOT v_role THEN
    RAISE EXCEPTION 'Only admin can force resync';
  END IF;

  UPDATE public.live_replays
  SET tus_offset = 0,
      next_chunk_seq = 0,
      status = CASE WHEN status = 'failed' THEN 'uploading'::text ELSE status::text END::live_replay_status,
      error_message = NULL,
      last_ingest_at = NULL
  WHERE id = p_replay_id;

  RETURN jsonb_build_object('ok', true, 'replay_id', p_replay_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.live_replay_recover_409_failed()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role boolean;
  v_count integer;
BEGIN
  SELECT public.has_role(auth.uid(), 'admin') INTO v_role;
  IF NOT v_role THEN
    RAISE EXCEPTION 'Only admin can recover replays';
  END IF;

  WITH upd AS (
    UPDATE public.live_replays
    SET status = 'uploading'::live_replay_status,
        tus_offset = 0,
        next_chunk_seq = 0,
        error_message = NULL,
        last_ingest_at = NULL
    WHERE status = 'failed'
      AND (error_message ILIKE '%TUS PATCH 409%' OR error_message ILIKE '%Mismatched Upload-Offset%' OR error_message ILIKE '%10029%')
    RETURNING id
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN jsonb_build_object('ok', true, 'recovered', v_count);
END;
$$;

-- One-shot recovery for the 7 currently-failed replays
UPDATE public.live_replays
SET status = 'uploading'::live_replay_status,
    tus_offset = 0,
    next_chunk_seq = 0,
    error_message = NULL,
    last_ingest_at = NULL
WHERE status = 'failed'
  AND (error_message ILIKE '%TUS PATCH 409%' OR error_message ILIKE '%Mismatched Upload-Offset%' OR error_message ILIKE '%10029%');
