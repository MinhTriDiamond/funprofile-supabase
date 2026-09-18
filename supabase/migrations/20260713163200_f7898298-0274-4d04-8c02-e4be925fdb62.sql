
DO $$
DECLARE
  existing_count int;
BEGIN
  SELECT count(*) INTO existing_count FROM cron.job WHERE schedule = '45 4 * * *';
  IF existing_count > 0 THEN
    RAISE EXCEPTION 'Slot 45 4 * * * đã có % job, dừng để tránh chồng tải', existing_count;
  END IF;

  -- Idempotent: xoá entry cũ nếu tồn tại
  PERFORM cron.unschedule('btc-raw-sat-guard-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'btc-raw-sat-guard-daily');
END $$;

SELECT cron.schedule(
  'btc-raw-sat-guard-daily',
  '45 4 * * *',
  $CRON$
  WITH scan AS (
    SELECT public.btc_raw_sat_guard_scan() AS r
  ),
  drift AS (
    SELECT
      r,
      COALESCE((r->'threshold_1000'->>'ok')::boolean, false)         AS ok1,
      COALESCE((r->'cross_table_ratio_1e8'->>'ok')::boolean, false)  AS ok2
    FROM scan
  )
  INSERT INTO public.notifications (user_id, actor_id, type, read, metadata, created_at)
  SELECT
    ur.user_id,
    'a97cbb6c-2d00-40e9-a35a-f181273b17bb'::uuid,
    'btc_guard_drift',
    false,
    jsonb_build_object(
      'title',      'BTC raw-satoshi guard phát hiện drift',
      'message',    'Guard btc_raw_sat_guard_scan() phát hiện hồi quy P0 BTC. Kiểm tra offenders trong metadata.checks.',
      'checks',     drift.r,
      'threshold',  1000,
      'checked_at', now(),
      'source',     'btc-raw-sat-guard-daily'
    ),
    now()
  FROM drift
  CROSS JOIN public.user_roles ur
  WHERE ur.role = 'admin'
    AND NOT (drift.ok1 AND drift.ok2);
  $CRON$
);
