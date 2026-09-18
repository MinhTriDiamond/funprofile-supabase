DO $$
DECLARE
  job_names text[] := ARRAY[
    'pplp-v25-aggregate-daily',
    'pplp-v25-tier-daily',
    'pplp-v25-intent-6h',
    'pplp-v25-impact-12h',
    'pplp-v2-auto-attest-internal-10min',
    'pplp-mint-stale-recovery-2h',
    'pplp-mark-suspected-farming-daily'
  ];
  jn text;
BEGIN
  FOREACH jn IN ARRAY job_names LOOP
    PERFORM cron.unschedule(jn) WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = jn);
  END LOOP;
END $$;

SELECT cron.schedule('pplp-v25-aggregate-daily','0 4 * * *', $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/pplp-v25-aggregate',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{}'::jsonb
  );
$$);

SELECT cron.schedule('pplp-v25-tier-daily','0 5 * * *', $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/pplp-v25-tier-assigner',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{}'::jsonb
  );
$$);

SELECT cron.schedule('pplp-v25-intent-6h','0 */6 * * *', $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/pplp-v25-intent-calculator',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{}'::jsonb
  );
$$);

SELECT cron.schedule('pplp-v25-impact-12h','0 */12 * * *', $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/pplp-v25-impact-calculator',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{}'::jsonb
  );
$$);

SELECT cron.schedule('pplp-v2-auto-attest-internal-10min','*/10 * * * *', $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/pplp-v2-auto-attest-internal',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{}'::jsonb
  );
$$);

SELECT cron.schedule('pplp-mint-stale-recovery-2h','0 */2 * * *', $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/pplp-remint-stale',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw"}'::jsonb,
    body:='{}'::jsonb
  );
$$);

SELECT cron.schedule('pplp-mark-suspected-farming-daily','0 6 * * *', $$
  SELECT public.mark_suspected_farming();
$$);