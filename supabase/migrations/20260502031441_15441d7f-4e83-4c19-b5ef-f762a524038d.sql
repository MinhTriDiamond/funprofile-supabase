-- Bổ sung index hot còn thiếu
CREATE INDEX IF NOT EXISTS idx_reactions_created_at ON public.reactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_posts_created_at ON public.shared_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_posts_user_created ON public.shared_posts(user_id, created_at DESC);

-- Function dọn dữ liệu định kỳ
CREATE OR REPLACE FUNCTION public.cleanup_old_system_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chunks_deleted bigint := 0;
  v_cron_deleted bigint := 0;
  v_result jsonb;
BEGIN
  -- Xoá chunked_recording_chunks > 7 ngày
  DELETE FROM public.chunked_recording_chunks
  WHERE created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_chunks_deleted = ROW_COUNT;

  -- Xoá cron.job_run_details > 7 ngày
  BEGIN
    DELETE FROM cron.job_run_details
    WHERE end_time < now() - interval '7 days';
    GET DIAGNOSTICS v_cron_deleted = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    v_cron_deleted := -1;
  END;

  v_result := jsonb_build_object(
    'ran_at', now(),
    'chunks_deleted', v_chunks_deleted,
    'cron_logs_deleted', v_cron_deleted
  );

  -- Audit
  INSERT INTO public.system_audit_log (action, details)
  VALUES ('cleanup_old_system_data', v_result)
  ON CONFLICT DO NOTHING;

  RETURN v_result;
EXCEPTION WHEN undefined_table THEN
  -- system_audit_log không tồn tại, vẫn trả result
  RETURN v_result;
END;
$$;

-- VACUUM ANALYZE light_actions để gọn dead tuples (chạy ngay)
-- Note: VACUUM không chạy được trong migration transaction, để cron chạy ANALYZE
COMMENT ON FUNCTION public.cleanup_old_system_data() IS 'Dọn chunked_recording_chunks và cron.job_run_details > 7 ngày. Chạy hằng ngày 03:30 UTC.';