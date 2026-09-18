-- Đồng bộ cron reconciler dùng Bearer anon key (giống orphan-recover),
-- tránh 401 khi CRON_SHARED_SECRET có set trong env edge function.

SELECT cron.unschedule('agora-webcam-replay-reconciler-every-5min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agora-webcam-replay-reconciler-every-5min');

SELECT cron.schedule(
  'agora-webcam-replay-reconciler-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-webcam-replay-reconciler',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"source":"pg_cron","limit":10}'::jsonb
  );
  $$
);