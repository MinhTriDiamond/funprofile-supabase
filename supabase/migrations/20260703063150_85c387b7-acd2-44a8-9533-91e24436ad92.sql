
-- G3 · BTC Semantic Rebuild Foundation

-- 1. btc_tx_semantic
CREATE TABLE IF NOT EXISTS public.btc_tx_semantic (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain_family        TEXT NOT NULL DEFAULT 'bitcoin' CHECK (chain_family = 'bitcoin'),
  tx_hash             TEXT NOT NULL,
  vout_index          INT  NOT NULL CHECK (vout_index >= 0),
  block_height        INT,
  block_time          TIMESTAMPTZ,
  flow_type           TEXT NOT NULL CHECK (flow_type IN (
    'internal_donation','external_in','external_out',
    'self_transfer','change','treasury_flow','coinjoin_holdout'
  )),
  sender_user         UUID,
  recipient_user      UUID,
  sender_address      TEXT,
  recipient_address   TEXT NOT NULL,
  amount_sat          BIGINT NOT NULL CHECK (amount_sat >= 0),
  is_self_transfer    BOOLEAN NOT NULL DEFAULT false,
  is_change           BOOLEAN NOT NULL DEFAULT false,
  is_treasury         BOOLEAN NOT NULL DEFAULT false,
  is_coinjoin         BOOLEAN NOT NULL DEFAULT false,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  classifier_version  TEXT NOT NULL,
  classified_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_tx_cached_at    TIMESTAMPTZ,
  review_queue_id     UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS btc_tx_semantic_unique_vout
  ON public.btc_tx_semantic (chain_family, tx_hash, vout_index, recipient_address);
CREATE INDEX IF NOT EXISTS btc_tx_semantic_sender_time_idx
  ON public.btc_tx_semantic (sender_user, block_time DESC);
CREATE INDEX IF NOT EXISTS btc_tx_semantic_recipient_time_idx
  ON public.btc_tx_semantic (recipient_user, block_time DESC);
CREATE INDEX IF NOT EXISTS btc_tx_semantic_tx_hash_idx
  ON public.btc_tx_semantic (tx_hash);
CREATE INDEX IF NOT EXISTS btc_tx_semantic_flow_idx
  ON public.btc_tx_semantic (flow_type);

GRANT SELECT ON public.btc_tx_semantic TO authenticated;
GRANT ALL   ON public.btc_tx_semantic TO service_role;
ALTER TABLE public.btc_tx_semantic ENABLE ROW LEVEL SECURITY;

CREATE POLICY "btc_tx_semantic_read_authenticated"
  ON public.btc_tx_semantic FOR SELECT TO authenticated USING (true);
CREATE POLICY "btc_tx_semantic_service_all"
  ON public.btc_tx_semantic FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. btc_review_queue (admin-only; 'founder' role sẽ bổ sung khi enum app_role mở rộng)
CREATE TABLE IF NOT EXISTS public.btc_review_queue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tx_hash             TEXT NOT NULL,
  vout_index          INT,
  reason              TEXT NOT NULL CHECK (reason IN (
    'coinjoin_multi_owner','father_aux_manual','hd_change_needs_verify',
    'ambiguous_ownership','class_b_suspect','treasury_flow_unclassified'
  )),
  severity            TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN (
    'critical','high','medium','low'
  )),
  evidence            JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_verdict   JSONB,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','approved','rejected','deferred'
  )),
  reviewer_id         UUID,
  reviewer_verdict    JSONB,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS btc_review_queue_status_idx
  ON public.btc_review_queue (status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS btc_review_queue_tx_idx
  ON public.btc_review_queue (tx_hash);

GRANT SELECT, UPDATE ON public.btc_review_queue TO authenticated;
GRANT ALL ON public.btc_review_queue TO service_role;
ALTER TABLE public.btc_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "btc_review_queue_admin_read"
  ON public.btc_review_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "btc_review_queue_admin_update"
  ON public.btc_review_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "btc_review_queue_service_all"
  ON public.btc_review_queue FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.btc_tx_semantic
  ADD CONSTRAINT btc_tx_semantic_review_queue_fk
  FOREIGN KEY (review_queue_id) REFERENCES public.btc_review_queue(id) ON DELETE SET NULL;

-- 3. btc_ownership_snapshot
CREATE TABLE IF NOT EXISTS public.btc_ownership_snapshot (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address               TEXT NOT NULL,
  user_id               UUID NOT NULL,
  source                TEXT NOT NULL CHECK (source IN (
    'custodial','profile_primary','hd_change_verified','manual_review'
  )),
  confidence            NUMERIC(4,3) NOT NULL DEFAULT 1.000
    CHECK (confidence >= 0 AND confidence <= 1),
  integrity_status      TEXT NOT NULL DEFAULT 'ok' CHECK (integrity_status IN (
    'ok','needs_review','revoked'
  )),
  tx_count_at_verify    INT,
  funded_btc_at_verify  NUMERIC(20,8),
  verified_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by           UUID,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS btc_ownership_snapshot_address_uniq
  ON public.btc_ownership_snapshot (address);
CREATE INDEX IF NOT EXISTS btc_ownership_snapshot_user_idx
  ON public.btc_ownership_snapshot (user_id);

GRANT SELECT ON public.btc_ownership_snapshot TO authenticated;
GRANT ALL   ON public.btc_ownership_snapshot TO service_role;
ALTER TABLE public.btc_ownership_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "btc_ownership_snapshot_read_authenticated"
  ON public.btc_ownership_snapshot FOR SELECT TO authenticated USING (true);
CREATE POLICY "btc_ownership_snapshot_service_all"
  ON public.btc_ownership_snapshot FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. btc_raw_tx_cache
CREATE TABLE IF NOT EXISTS public.btc_raw_tx_cache (
  tx_hash       TEXT PRIMARY KEY,
  raw_json      JSONB NOT NULL,
  block_height  INT,
  block_time    TIMESTAMPTZ,
  size_bytes    INT,
  source        TEXT NOT NULL DEFAULT 'mempool.space',
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS btc_raw_tx_cache_fetched_idx
  ON public.btc_raw_tx_cache (fetched_at DESC);
CREATE INDEX IF NOT EXISTS btc_raw_tx_cache_block_time_idx
  ON public.btc_raw_tx_cache (block_time DESC);

GRANT ALL ON public.btc_raw_tx_cache TO service_role;
ALTER TABLE public.btc_raw_tx_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "btc_raw_tx_cache_service_all"
  ON public.btc_raw_tx_cache FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. Legacy columns
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS vout_index          INT,
  ADD COLUMN IF NOT EXISTS classifier_version  TEXT,
  ADD COLUMN IF NOT EXISTS tags                TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS superseded_by       UUID;

ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_superseded_by_fk;
ALTER TABLE public.donations
  ADD  CONSTRAINT donations_superseded_by_fk
  FOREIGN KEY (superseded_by) REFERENCES public.btc_tx_semantic(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS donations_btc_vout_uniq
  ON public.donations (chain_family, tx_hash, vout_index, recipient_address)
  WHERE chain_family = 'bitcoin' AND vout_index IS NOT NULL;

ALTER TABLE public.wallet_transfers
  ADD COLUMN IF NOT EXISTS vout_index          INT,
  ADD COLUMN IF NOT EXISTS classifier_version  TEXT,
  ADD COLUMN IF NOT EXISTS tags                TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS superseded_by       UUID,
  ADD COLUMN IF NOT EXISTS integrity_status    TEXT NOT NULL DEFAULT 'ok';

ALTER TABLE public.wallet_transfers
  DROP CONSTRAINT IF EXISTS wallet_transfers_superseded_by_fk;
ALTER TABLE public.wallet_transfers
  ADD  CONSTRAINT wallet_transfers_superseded_by_fk
  FOREIGN KEY (superseded_by) REFERENCES public.btc_tx_semantic(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transfers_btc_vout_uniq
  ON public.wallet_transfers (chain_family, tx_hash, vout_index, counterparty_address)
  WHERE chain_family = 'bitcoin' AND vout_index IS NOT NULL;

-- 6. updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_btc_tx_semantic_updated_at ON public.btc_tx_semantic;
CREATE TRIGGER trg_btc_tx_semantic_updated_at BEFORE UPDATE ON public.btc_tx_semantic
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_btc_review_queue_updated_at ON public.btc_review_queue;
CREATE TRIGGER trg_btc_review_queue_updated_at BEFORE UPDATE ON public.btc_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_btc_ownership_snapshot_updated_at ON public.btc_ownership_snapshot;
CREATE TRIGGER trg_btc_ownership_snapshot_updated_at BEFORE UPDATE ON public.btc_ownership_snapshot
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Feature flags
INSERT INTO public.system_config (key, value) VALUES
  ('scan_btc_v2_enabled',        '{"enabled": false}'::jsonb),
  ('btc_discovery_v2_enabled',   '{"enabled": false}'::jsonb),
  ('btc_shadow_write_enabled',   '{"enabled": false}'::jsonb),
  ('btc_history_ssot_enabled',   '{"enabled": false}'::jsonb),
  ('benefactors_v2_enabled',     '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
