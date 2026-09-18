
-- 1. Bảng log
CREATE TABLE public.registry_validate_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason TEXT NOT NULL,
  chain_id INTEGER,
  token_symbol TEXT,
  token_address TEXT,
  tx_hash TEXT,
  sender_wallet TEXT,
  recipient_wallet TEXT,
  amount NUMERIC,
  extra JSONB DEFAULT '{}'::jsonb
);

-- 2. GRANT: service_role ghi/đọc, KHÔNG grant cho authenticated (log hệ thống)
GRANT ALL ON public.registry_validate_log TO service_role;
-- Admin sẽ đọc qua service_role edge function hoặc RLS policy dưới đây
GRANT SELECT ON public.registry_validate_log TO authenticated;

-- 3. RLS
ALTER TABLE public.registry_validate_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_registry_validate_log"
ON public.registry_validate_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Không tạo policy INSERT/UPDATE/DELETE cho authenticated → user thường không ghi được.
-- service_role bypass RLS nên edge function ghi tự do.

-- 4. Index hỗ trợ aggregation
CREATE INDEX idx_registry_validate_log_created_at ON public.registry_validate_log (created_at DESC);
CREATE INDEX idx_registry_validate_log_reason ON public.registry_validate_log (reason, created_at DESC);

-- 5. Cleanup housekeeping: xoá > 30 ngày, daily 03:00 UTC
SELECT cron.schedule(
  'registry-validate-log-cleanup-30d',
  '0 3 * * *',
  $$ DELETE FROM public.registry_validate_log WHERE created_at < now() - INTERVAL '30 days'; $$
);

-- 6. Cron one-shot T+24h: 2026-07-14 07:20 UTC
SELECT cron.schedule(
  'registry-validate-report-24h',
  '20 7 14 7 *',
  $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/registry-validate-report',
    headers:='{"Content-Type": "application/json", "apikey": "sb_publishable_2O67-byTv7js8tDjj7HGxg_hiFQ3WkI"}'::jsonb,
    body:='{"window_hours": 24, "self_unschedule": "registry-validate-report-24h"}'::jsonb
  );
  $$
);

-- 7. Cron one-shot T+48h: 2026-07-15 07:20 UTC
SELECT cron.schedule(
  'registry-validate-report-48h',
  '20 7 15 7 *',
  $$
  SELECT net.http_post(
    url:='https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/registry-validate-report',
    headers:='{"Content-Type": "application/json", "apikey": "sb_publishable_2O67-byTv7js8tDjj7HGxg_hiFQ3WkI"}'::jsonb,
    body:='{"window_hours": 48, "self_unschedule": "registry-validate-report-48h"}'::jsonb
  );
  $$
);
