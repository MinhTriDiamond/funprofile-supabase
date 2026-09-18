
-- Cron 2 phút/lần để retry archive replay sang R2
SELECT cron.unschedule('live-replay-archive-every-2min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-replay-archive-every-2min');

SELECT cron.schedule(
  'live-replay-archive-every-2min',
  '*/2 * * * *',
  $$
  select net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-replay-archive-cron',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{"limit":5}'::jsonb
  );
  $$
);
