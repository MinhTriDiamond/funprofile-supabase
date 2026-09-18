
CREATE TABLE IF NOT EXISTS public.tokens_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL,
  network text NOT NULL,
  token_address text,
  symbol text NOT NULL,
  name text NOT NULL,
  decimals integer NOT NULL CHECK (decimals >= 0 AND decimals <= 36),
  risk_level text NOT NULL DEFAULT 'allowed'
    CHECK (risk_level IN ('trusted','allowed','suspicious','blocked')),
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tokens_registry_chain_addr_uidx
  ON public.tokens_registry (chain_id, lower(token_address))
  WHERE token_address IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tokens_registry_chain_native_uidx
  ON public.tokens_registry (chain_id, symbol)
  WHERE token_address IS NULL;

CREATE INDEX IF NOT EXISTS tokens_registry_active_idx
  ON public.tokens_registry (chain_id, is_active, risk_level);

GRANT SELECT ON public.tokens_registry TO authenticated, anon;
GRANT ALL ON public.tokens_registry TO service_role;

ALTER TABLE public.tokens_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tokens_registry read for all"
  ON public.tokens_registry FOR SELECT USING (true);

CREATE POLICY "tokens_registry admin write"
  ON public.tokens_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.tokens_registry_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS tokens_registry_touch_trg ON public.tokens_registry;
CREATE TRIGGER tokens_registry_touch_trg
  BEFORE UPDATE ON public.tokens_registry
  FOR EACH ROW EXECUTE FUNCTION public.tokens_registry_touch();


CREATE TABLE IF NOT EXISTS public.suspicious_wallet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_id integer NOT NULL,
  network text NOT NULL,
  watched_address text NOT NULL,
  tx_hash text NOT NULL,
  log_index integer,
  from_address text,
  to_address text,
  raw_token_address text,
  raw_symbol text,
  raw_decimals integer,
  raw_amount_wei text,
  reason text NOT NULL,
  source text NOT NULL DEFAULT 'fetch-wallet-history',
  occurrences integer NOT NULL DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS suspicious_wallet_events_uidx
  ON public.suspicious_wallet_events (
    chain_id,
    tx_hash,
    lower(watched_address),
    COALESCE(lower(raw_token_address), 'native'),
    COALESCE(log_index, -1)
  );

CREATE INDEX IF NOT EXISTS suspicious_wallet_events_addr_idx
  ON public.suspicious_wallet_events (lower(watched_address), last_seen_at DESC);

CREATE INDEX IF NOT EXISTS suspicious_wallet_events_reason_idx
  ON public.suspicious_wallet_events (reason, last_seen_at DESC);

GRANT SELECT ON public.suspicious_wallet_events TO authenticated;
GRANT ALL ON public.suspicious_wallet_events TO service_role;

ALTER TABLE public.suspicious_wallet_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suspicious admin read all"
  ON public.suspicious_wallet_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "suspicious user read own"
  ON public.suspicious_wallet_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.custodial_wallets cw
      WHERE cw.user_id = auth.uid()
        AND lower(cw.wallet_address) = lower(suspicious_wallet_events.watched_address)
    )
    OR EXISTS (
      SELECT 1 FROM public.user_watched_wallets uw
      WHERE uw.user_id = auth.uid()
        AND lower(uw.address) = lower(suspicious_wallet_events.watched_address)
    )
  );


INSERT INTO public.tokens_registry
  (chain_id, network, token_address, symbol, name, decimals, risk_level, is_verified, is_active, source, notes)
VALUES
  (56, 'bsc', NULL, 'BNB', 'BNB', 18, 'trusted', true, true, 'core', 'BSC mainnet native'),
  (97, 'bsc-testnet', NULL, 'tBNB', 'Test BNB', 18, 'allowed', true, true, 'core/testnet', 'BSC testnet native'),
  (0,  'bitcoin', NULL, 'BTC', 'Bitcoin', 8, 'trusted', true, true, 'core', 'Bitcoin native'),
  (56, 'bsc', lower('0x55d398326f99059fF775485246999027B3197955'),
       'USDT', 'Tether USD', 18, 'trusted', true, true, 'core', 'BSC-USD (BEP20)'),
  (56, 'bsc', lower('0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c'),
       'BTCB', 'Bitcoin BEP20', 18, 'trusted', true, true, 'core', 'Wrapped BTC trên BSC'),
  (56, 'bsc', lower('0x76A797A59Ba2C17726896976B7B3747BfD1d220f'),
       'TONCOIN', 'Wrapped TON Coin', 9, 'allowed', true, true, 'manual',
       'Duyệt 2026-06-22: token thật nhưng không phải lõi ecosystem'),
  (97, 'bsc-testnet', lower('0x39A1A5894CdadCAdF20D52E9D5912EaB31250cd6'),
       'FUN', 'FUN Money (Testnet)', 18, 'allowed', true, true, 'manual/testnet',
       'Testnet hợp lệ; UI nên label rõ Testnet'),
  (97, 'bsc-testnet', lower('0x0910B5e3a07e94B7c2cA46BAB7d020A6BcDce413'),
       'CAMLY', 'CAMLY (Testnet)', 3, 'allowed', true, true, 'manual/testnet',
       'Testnet hợp lệ; UI nên label rõ Testnet')
ON CONFLICT DO NOTHING;
