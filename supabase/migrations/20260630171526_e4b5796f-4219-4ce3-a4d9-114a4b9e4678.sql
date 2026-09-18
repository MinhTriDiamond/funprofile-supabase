-- =========================================================
-- M2: provider_registry + provider_request_log + flag
-- Blockchain Infrastructure Layer (BIL) v1
-- =========================================================

-- 1) Enums
DO $$ BEGIN
  CREATE TYPE public.provider_mode AS ENUM ('primary', 'secondary', 'backup', 'disabled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provider_health AS ENUM ('healthy', 'degraded', 'dead', 'unknown');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provider_kind AS ENUM (
    'rpc',          -- generic JSON-RPC
    'indexer',      -- Moralis, Alchemy, QuickNode indexer
    'explorer',     -- BscScan, Etherscan API
    'webhook',      -- push provider
    'utxo',         -- mempool.space, blockstream
    'price'         -- price oracle
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Bảng provider_registry
CREATE TABLE IF NOT EXISTS public.provider_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Định danh
  provider_key text NOT NULL,                            -- 'moralis', 'alchemy', 'bscscan', 'mempool'
  display_name text NOT NULL,
  provider_kind public.provider_kind NOT NULL,
  chain_key text NOT NULL REFERENCES public.chains_registry(chain_key) ON UPDATE CASCADE,

  -- Scheduling
  provider_mode public.provider_mode NOT NULL DEFAULT 'disabled',
  priority integer NOT NULL DEFAULT 100 CHECK (priority >= 0),
  weight integer NOT NULL DEFAULT 1 CHECK (weight >= 0),
  enabled boolean NOT NULL DEFAULT false,

  -- Endpoint
  base_url text,
  ws_url text,
  webhook_url text,

  -- Quota / rate limit
  max_requests_per_second integer,
  max_concurrent_requests integer,
  burst_limit integer,
  monthly_quota_calls bigint,
  monthly_quota_used bigint NOT NULL DEFAULT 0,
  monthly_quota_reset_at timestamptz,

  -- Capability flags (cho scheduler filter nhanh)
  supports_webhook boolean NOT NULL DEFAULT false,
  supports_logs boolean NOT NULL DEFAULT false,
  supports_internal_tx boolean NOT NULL DEFAULT false,
  supports_nft boolean NOT NULL DEFAULT false,
  supports_balance boolean NOT NULL DEFAULT false,
  supports_token_price boolean NOT NULL DEFAULT false,
  supports_token_metadata boolean NOT NULL DEFAULT false,
  capabilities text[] NOT NULL DEFAULT '{}',             -- ['erc20_transfers','native_transfers',...]

  -- Encryption (master key nằm trong Lovable Secret, KHÔNG trong DB)
  encrypted_api_key bytea,                                -- pgp_sym_encrypt(raw, FUN_PROVIDER_POOL_MASTER_KEY_V<n>)
  encryption_key_version smallint NOT NULL DEFAULT 1 CHECK (encryption_key_version > 0),
  api_key_last4 text,                                     -- chỉ cho provider key, KHÔNG cho master key

  -- Health
  health_status public.provider_health NOT NULL DEFAULT 'unknown',
  cooldown_until timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  last_error_message text,

  -- Counters
  success_count bigint NOT NULL DEFAULT 0,
  error_count bigint NOT NULL DEFAULT 0,
  consecutive_error_count integer NOT NULL DEFAULT 0,
  timeout_count bigint NOT NULL DEFAULT 0,
  rate_limit_count bigint NOT NULL DEFAULT 0,
  quota_exceeded_count bigint NOT NULL DEFAULT 0,
  network_error_count bigint NOT NULL DEFAULT 0,
  unknown_error_count bigint NOT NULL DEFAULT 0,

  -- Latency & uptime (aggregated periodically)
  avg_latency_ms integer,
  p50_latency_ms integer,
  p95_latency_ms integer,
  p99_latency_ms integer,
  uptime_pct_24h numeric(5,2),
  provider_score numeric(5,2),                            -- 0-100

  -- Audit
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,

  CONSTRAINT provider_registry_key_chain_unique UNIQUE (provider_key, chain_key)
);

CREATE INDEX IF NOT EXISTS provider_registry_chain_idx ON public.provider_registry(chain_key);
CREATE INDEX IF NOT EXISTS provider_registry_mode_idx  ON public.provider_registry(provider_mode);
CREATE INDEX IF NOT EXISTS provider_registry_enabled_idx ON public.provider_registry(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS provider_registry_health_idx ON public.provider_registry(health_status);
CREATE INDEX IF NOT EXISTS provider_registry_caps_gin  ON public.provider_registry USING gin(capabilities);

GRANT SELECT ON public.provider_registry TO authenticated;   -- RLS sẽ siết admin-only ở dưới
GRANT ALL    ON public.provider_registry TO service_role;

ALTER TABLE public.provider_registry ENABLE ROW LEVEL SECURITY;

-- Đọc: chỉ admin (registry chứa metadata key + endpoint)
DROP POLICY IF EXISTS "provider_registry_admin_read" ON public.provider_registry;
CREATE POLICY "provider_registry_admin_read"
  ON public.provider_registry
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Ghi: chỉ admin
DROP POLICY IF EXISTS "provider_registry_admin_write" ON public.provider_registry;
CREATE POLICY "provider_registry_admin_write"
  ON public.provider_registry
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_provider_registry_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS provider_registry_set_updated_at ON public.provider_registry;
CREATE TRIGGER provider_registry_set_updated_at
  BEFORE UPDATE ON public.provider_registry
  FOR EACH ROW EXECUTE FUNCTION public.tg_provider_registry_set_updated_at();

-- 3) Bảng provider_request_log (append-only, do edge service_role ghi)
CREATE TABLE IF NOT EXISTS public.provider_request_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.provider_registry(id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  chain_key text NOT NULL,
  capability text,
  method text,
  status_code integer,
  latency_ms integer,
  success boolean NOT NULL DEFAULT false,
  error_code text,
  error_class text,                                       -- 'timeout' | 'rate_limit' | 'quota' | 'network' | 'unknown' | 'auth'
  attempt_number smallint NOT NULL DEFAULT 1,
  request_id text,                                        -- correlation id
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS provider_request_log_provider_idx ON public.provider_request_log(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS provider_request_log_created_idx  ON public.provider_request_log(created_at DESC);
CREATE INDEX IF NOT EXISTS provider_request_log_error_class_idx ON public.provider_request_log(error_class) WHERE success = false;

GRANT SELECT ON public.provider_request_log TO authenticated;  -- RLS siết admin-only
GRANT ALL    ON public.provider_request_log TO service_role;

ALTER TABLE public.provider_request_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_request_log_admin_read" ON public.provider_request_log;
CREATE POLICY "provider_request_log_admin_read"
  ON public.provider_request_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- INSERT/UPDATE/DELETE: chỉ service_role (đã có GRANT, không cần policy cho service_role vì RLS bypass)
-- Không tạo policy ghi cho authenticated → chặn frontend ghi.

-- 4) Feature flag provider_pool_enabled = false
INSERT INTO public.app_settings (key, value)
VALUES ('provider_pool_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 5) Comments cho rõ ngữ nghĩa
COMMENT ON COLUMN public.provider_registry.encrypted_api_key IS
  'Mã hóa bằng pgp_sym_encrypt() với FUN_PROVIDER_POOL_MASTER_KEY_V<encryption_key_version>. KHÔNG bao giờ expose ra frontend.';
COMMENT ON COLUMN public.provider_registry.encryption_key_version IS
  'Version của master key hiện đang mã hóa encrypted_api_key. Map sang env var qua _shared/providerPool.ts.';
COMMENT ON COLUMN public.provider_registry.api_key_last4 IS
  'Last 4 ký tự của PROVIDER API KEY (không phải master key) để admin UI hiển thị ••••a1b2.';
COMMENT ON TABLE public.provider_request_log IS
  'Append-only log mọi request qua providerPool. Service_role ghi, admin read.';
