-- =============================================================
-- FUN Money Mint Package — CRON_SETUP.sql
-- Chạy SAU khi đã deploy edge functions.
-- Thay thế:
--   {PROJECT_REF}   → project ref Supabase của LoveHUB
--   {ANON_KEY}      → publishable/anon key của LoveHUB
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ────────────────────────────────────────────────────────────
-- 1. Auto-submit mint requests (15 phút / lần)
-- ────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'pplp-auto-submit-15m',
  '*/15 * * * *',
  $$SELECT net.http_post(
      url:='https://{PROJECT_REF}.supabase.co/functions/v1/pplp-auto-submit',
      headers:='{"Content-Type":"application/json","apikey":"{ANON_KEY}","Authorization":"Bearer {ANON_KEY}"}'::jsonb,
      body:='{}'::jsonb
    );$$
);

-- ────────────────────────────────────────────────────────────
-- 2. Auto-flip light_actions pending → approved/rejected (23:00 UTC daily)
-- ────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'light-actions-auto-flip-daily',
  '0 23 * * *',
  $$SELECT public.auto_flip_pending_light_actions();$$
);

-- ────────────────────────────────────────────────────────────
-- 3. VVU calculator (mỗi 6 giờ)
-- ────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'pplp-v25-vvu-6h',
  '0 */6 * * *',
  $$SELECT net.http_post(
      url:='https://{PROJECT_REF}.supabase.co/functions/v1/pplp-v25-vvu-calculate',
      headers:='{"Content-Type":"application/json","apikey":"{ANON_KEY}","Authorization":"Bearer {ANON_KEY}"}'::jsonb,
      body:='{}'::jsonb
    );$$
);

-- ────────────────────────────────────────────────────────────
-- 4. Intent calculator (mỗi 6 giờ)
-- ────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'pplp-v25-intent-6h',
  '30 */6 * * *',
  $$SELECT net.http_post(
      url:='https://{PROJECT_REF}.supabase.co/functions/v1/pplp-v25-intent-calculator',
      headers:='{"Content-Type":"application/json","apikey":"{ANON_KEY}","Authorization":"Bearer {ANON_KEY}"}'::jsonb,
      body:='{}'::jsonb
    );$$
);

-- ────────────────────────────────────────────────────────────
-- 5. Impact calculator (mỗi 12 giờ)
-- ────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'pplp-v25-impact-12h',
  '0 */12 * * *',
  $$SELECT net.http_post(
      url:='https://{PROJECT_REF}.supabase.co/functions/v1/pplp-v25-impact-calculator',
      headers:='{"Content-Type":"application/json","apikey":"{ANON_KEY}","Authorization":"Bearer {ANON_KEY}"}'::jsonb,
      body:='{}'::jsonb
    );$$
);

-- ────────────────────────────────────────────────────────────
-- 6. Aggregate PLS/NLS/LLS → TLS (04:00 UTC daily)
-- ────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'pplp-v25-aggregate-daily',
  '0 4 * * *',
  $$SELECT net.http_post(
      url:='https://{PROJECT_REF}.supabase.co/functions/v1/pplp-v25-aggregate',
      headers:='{"Content-Type":"application/json","apikey":"{ANON_KEY}","Authorization":"Bearer {ANON_KEY}"}'::jsonb,
      body:='{}'::jsonb
    );$$
);

-- ────────────────────────────────────────────────────────────
-- 7. Tier assigner (05:00 UTC daily)
-- ────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'pplp-v25-tier-daily',
  '0 5 * * *',
  $$SELECT net.http_post(
      url:='https://{PROJECT_REF}.supabase.co/functions/v1/pplp-v25-tier-assigner',
      headers:='{"Content-Type":"application/json","apikey":"{ANON_KEY}","Authorization":"Bearer {ANON_KEY}"}'::jsonb,
      body:='{}'::jsonb
    );$$
);

-- ────────────────────────────────────────────────────────────
-- 8. Epoch snapshot cuối tháng (23:30 UTC ngày cuối tháng)
-- ────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'pplp-epoch-snapshot-monthly',
  '30 23 28-31 * *',
  $$
  DO $body$
  BEGIN
    IF (CURRENT_DATE + INTERVAL '1 day')::date = date_trunc('month', CURRENT_DATE + INTERVAL '1 month')::date THEN
      PERFORM net.http_post(
        url:='https://{PROJECT_REF}.supabase.co/functions/v1/pplp-epoch-snapshot',
        headers:='{"Content-Type":"application/json","apikey":"{ANON_KEY}","Authorization":"Bearer {ANON_KEY}"}'::jsonb,
        body:='{}'::jsonb
      );
    END IF;
  END
  $body$;
  $$
);

-- ────────────────────────────────────────────────────────────
-- 9. Batch processor (mỗi giờ)
-- ────────────────────────────────────────────────────────────
SELECT cron.schedule(
  'pplp-batch-processor-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
      url:='https://{PROJECT_REF}.supabase.co/functions/v1/pplp-batch-processor',
      headers:='{"Content-Type":"application/json","apikey":"{ANON_KEY}","Authorization":"Bearer {ANON_KEY}"}'::jsonb,
      body:='{}'::jsonb
    );$$
);
