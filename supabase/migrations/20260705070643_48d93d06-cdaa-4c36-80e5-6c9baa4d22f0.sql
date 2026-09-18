
-- B1: token_ingest_filters
CREATE TABLE public.token_ingest_filters (
  token_symbol TEXT PRIMARY KEY,
  chain TEXT NOT NULL DEFAULT 'bsc',
  min_amount NUMERIC NOT NULL CHECK (min_amount >= 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT ON public.token_ingest_filters TO authenticated, anon;
GRANT ALL ON public.token_ingest_filters TO service_role;
ALTER TABLE public.token_ingest_filters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read filters public" ON public.token_ingest_filters FOR SELECT USING (true);
CREATE POLICY "admin manage filters" ON public.token_ingest_filters FOR ALL
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.token_ingest_filters (token_symbol, chain, min_amount, notes) VALUES
  ('USDT','bsc',1,'Anti dust/spam - Angel policy 05/07/2026'),
  ('BNB','bsc',0.001,'Anti dust/spam - Angel policy 05/07/2026'),
  ('BTCB','bsc',0.0001,'Anti dust/spam'),
  ('CAMLY','bsc',1000,'Anti dust/spam'),
  ('FUN','bsc',1,'Anti dust/spam'),
  ('BTC','btc',0.00001,'Anti dust');

-- B3: external_tx_filter_log
CREATE TABLE public.external_tx_filter_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash TEXT,
  reason TEXT NOT NULL,
  token_symbol TEXT,
  amount NUMERIC,
  sender_address TEXT,
  recipient_address TEXT,
  chain TEXT,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ext_filter_log_created ON public.external_tx_filter_log (created_at DESC);
CREATE INDEX idx_ext_filter_log_reason ON public.external_tx_filter_log (reason, created_at DESC);
GRANT SELECT ON public.external_tx_filter_log TO authenticated;
GRANT ALL ON public.external_tx_filter_log TO service_role;
ALTER TABLE public.external_tx_filter_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read filter log" ON public.external_tx_filter_log FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- B5: donations.filter_status + backup + mark spam
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS filter_status TEXT;
CREATE INDEX IF NOT EXISTS idx_donations_filter_status ON public.donations (filter_status) WHERE filter_status IS NOT NULL;

-- Backup existing spam rows
CREATE TABLE IF NOT EXISTS public.donations_spam_backup_20260705 AS
SELECT * FROM public.donations WHERE 1=0;
GRANT ALL ON public.donations_spam_backup_20260705 TO service_role;
ALTER TABLE public.donations_spam_backup_20260705 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin only backup" ON public.donations_spam_backup_20260705 FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

WITH spam AS (
  SELECT d.id
  FROM public.donations d
  LEFT JOIN public.token_ingest_filters f
    ON f.token_symbol = d.token_symbol
  WHERE d.is_external = true
    AND d.filter_status IS NULL
    AND (
      -- dust
      (f.min_amount IS NOT NULL AND (d.amount)::numeric < f.min_amount)
      -- unknown token entirely (rare)
      OR f.token_symbol IS NULL
      -- blacklisted sender
      OR lower(d.sender_address) IN (SELECT lower(wallet_address) FROM public.blacklisted_wallets)
    )
),
backup AS (
  INSERT INTO public.donations_spam_backup_20260705
  SELECT d.* FROM public.donations d JOIN spam s ON s.id = d.id
  RETURNING id
)
UPDATE public.donations
SET filter_status = 'filtered_spam'
WHERE id IN (SELECT id FROM spam);

-- Remove orphan gift_celebration posts pointing to filtered tx
DELETE FROM public.posts p
USING public.donations d
WHERE d.filter_status = 'filtered_spam'
  AND d.tx_hash IS NOT NULL
  AND p.post_type = 'gift_celebration'
  AND (p.metadata->>'tx_hash') = d.tx_hash;
