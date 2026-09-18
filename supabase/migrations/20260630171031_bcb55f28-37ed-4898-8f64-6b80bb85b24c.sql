-- =========================================================
-- M1: chains_registry — Blockchain Infrastructure Layer v1
-- =========================================================

-- 1) Enum trạng thái chain
DO $$ BEGIN
  CREATE TYPE public.chain_status AS ENUM ('active', 'maintenance', 'deprecated', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Bảng chains_registry
CREATE TABLE IF NOT EXISTS public.chains_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Định danh
  chain_key text NOT NULL UNIQUE,                    -- 'bsc', 'eth', 'btc', 'polygon', ...
  chain_name text NOT NULL,                          -- 'BNB Smart Chain'
  chain_family text NOT NULL,                        -- 'evm' | 'utxo' | 'solana' | 'cosmos' | ...
  evm_chain_id integer,                              -- 56, 1, 137... NULL nếu non-EVM
  -- Native token metadata (cho UI)
  native_symbol text NOT NULL,                       -- 'BNB', 'ETH', 'BTC'
  native_name text NOT NULL,                         -- 'BNB', 'Ether', 'Bitcoin'
  native_decimals smallint NOT NULL DEFAULT 18 CHECK (native_decimals BETWEEN 0 AND 36),
  native_icon_url text,
  -- Explorer & confirmations
  explorer_url text,                                 -- 'https://bscscan.com'
  explorer_tx_path text DEFAULT '/tx/',              -- để FE render tx link
  explorer_address_path text DEFAULT '/address/',
  required_confirmations smallint NOT NULL DEFAULT 12 CHECK (required_confirmations >= 0),
  -- Trạng thái
  status public.chain_status NOT NULL DEFAULT 'disabled',
  enabled boolean NOT NULL DEFAULT false,            -- master switch
  scan_enabled boolean NOT NULL DEFAULT false,       -- cho phép scanner chạy
  webhook_enabled boolean NOT NULL DEFAULT false,    -- cho phép provider webhook
  explorer_enabled boolean NOT NULL DEFAULT false,   -- cho phép FE link explorer
  -- Misc
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT chains_registry_evm_id_check
    CHECK ((chain_family <> 'evm') OR (evm_chain_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS chains_registry_status_idx ON public.chains_registry(status);
CREATE INDEX IF NOT EXISTS chains_registry_enabled_idx ON public.chains_registry(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS chains_registry_family_idx ON public.chains_registry(chain_family);

-- 3) GRANTS (PostgREST mặc định không grant — phải khai báo tường minh)
GRANT SELECT ON public.chains_registry TO anon;
GRANT SELECT ON public.chains_registry TO authenticated;
GRANT ALL    ON public.chains_registry TO service_role;

-- 4) RLS
ALTER TABLE public.chains_registry ENABLE ROW LEVEL SECURITY;

-- Đọc: ai cũng được (registry là metadata công khai cho UI)
DROP POLICY IF EXISTS "chains_registry_read_all" ON public.chains_registry;
CREATE POLICY "chains_registry_read_all"
  ON public.chains_registry
  FOR SELECT
  USING (true);

-- Ghi: chỉ admin
DROP POLICY IF EXISTS "chains_registry_admin_write" ON public.chains_registry;
CREATE POLICY "chains_registry_admin_write"
  ON public.chains_registry
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_chains_registry_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chains_registry_set_updated_at ON public.chains_registry;
CREATE TRIGGER chains_registry_set_updated_at
  BEFORE UPDATE ON public.chains_registry
  FOR EACH ROW EXECUTE FUNCTION public.tg_chains_registry_set_updated_at();

-- 6) Seed 11 chain (chỉ bsc + btc active)
INSERT INTO public.chains_registry
  (chain_key, chain_name, chain_family, evm_chain_id,
   native_symbol, native_name, native_decimals,
   explorer_url, required_confirmations,
   status, enabled, scan_enabled, webhook_enabled, explorer_enabled, notes)
VALUES
  ('bsc',       'BNB Smart Chain',  'evm',   56,    'BNB',   'BNB',      18, 'https://bscscan.com',       12, 'active',     true,  true,  true,  true,  'Primary EVM chain cho FUN ecosystem'),
  ('btc',       'Bitcoin',          'utxo',  NULL,  'BTC',   'Bitcoin',  8,  'https://mempool.space',     2,  'active',     true,  true,  true,  true,  'Native BTC HD wallet support'),
  ('eth',       'Ethereum',         'evm',   1,     'ETH',   'Ether',    18, 'https://etherscan.io',      12, 'disabled',   false, false, false, false, 'Reserved for future'),
  ('polygon',   'Polygon PoS',      'evm',   137,   'MATIC', 'Polygon',  18, 'https://polygonscan.com',   30, 'disabled',   false, false, false, false, 'Reserved'),
  ('arbitrum',  'Arbitrum One',     'evm',   42161, 'ETH',   'Ether',    18, 'https://arbiscan.io',       12, 'disabled',   false, false, false, false, 'Reserved'),
  ('optimism',  'Optimism',         'evm',   10,    'ETH',   'Ether',    18, 'https://optimistic.etherscan.io', 12, 'disabled', false, false, false, false, 'Reserved'),
  ('base',      'Base',             'evm',   8453,  'ETH',   'Ether',    18, 'https://basescan.org',      12, 'disabled',   false, false, false, false, 'Reserved'),
  ('avalanche', 'Avalanche C-Chain','evm',   43114, 'AVAX',  'Avalanche',18, 'https://snowtrace.io',      12, 'disabled',   false, false, false, false, 'Reserved'),
  ('solana',    'Solana',           'solana',NULL,  'SOL',   'Solana',   9,  'https://solscan.io',        32, 'disabled',   false, false, false, false, 'Reserved'),
  ('ton',       'TON',              'ton',   NULL,  'TON',   'Toncoin',  9,  'https://tonscan.org',       1,  'disabled',   false, false, false, false, 'Reserved'),
  ('tron',      'TRON',             'tron',  NULL,  'TRX',   'TRON',     6,  'https://tronscan.org',      19, 'disabled',   false, false, false, false, 'Reserved')
ON CONFLICT (chain_key) DO NOTHING;
