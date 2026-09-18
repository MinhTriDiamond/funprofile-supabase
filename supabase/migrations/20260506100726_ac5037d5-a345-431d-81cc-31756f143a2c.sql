-- Ensure extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule existing if any
DO $$
BEGIN
  PERFORM cron.unschedule('live-replay-expiry-hourly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='live-replay-expiry-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

SELECT cron.schedule(
  'live-replay-expiry-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/live-replay-expiry-cron',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);