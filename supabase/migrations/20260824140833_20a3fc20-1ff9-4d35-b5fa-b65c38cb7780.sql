SELECT cron.schedule(
  'stale-reminder-batch-2',
  '20 14 25 8 *',
  $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/stale-account-reminder-send',
    headers:='{"Content-Type": "application/json", "apikey": "sb_publishable_2O67-byTv7js8tDjj7HGxg_hiFQ3WkI"}'::jsonb,
    body:='{"cron": true, "batch_number": 2, "self_unschedule": "stale-reminder-batch-2"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'stale-reminder-batch-3',
  '20 14 26 8 *',
  $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/stale-account-reminder-send',
    headers:='{"Content-Type": "application/json", "apikey": "sb_publishable_2O67-byTv7js8tDjj7HGxg_hiFQ3WkI"}'::jsonb,
    body:='{"cron": true, "batch_number": 3, "self_unschedule": "stale-reminder-batch-3"}'::jsonb
  );
  $$
);