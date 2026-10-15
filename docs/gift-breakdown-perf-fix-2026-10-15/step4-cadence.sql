DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gift-breakdown-cache-refresh') THEN
    PERFORM cron.unschedule('gift-breakdown-cache-refresh');
  END IF;
END $$;
SELECT cron.schedule('gift-breakdown-cache-refresh', '*/5 * * * *', 'SELECT public.refresh_gift_breakdown_cache()') AS job_id;
