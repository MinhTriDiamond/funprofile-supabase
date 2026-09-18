-- ============================================================================
-- G3 ROLLBACK — chỉ chạy khi cần revert Sub-phase G3
-- An toàn: 4 bảng mới đều 0 row, cột thêm nullable, feature flag OFF.
-- ============================================================================

BEGIN;

-- 1. Feature flags
DELETE FROM public.system_config WHERE key IN (
  'scan_btc_v2_enabled',
  'btc_discovery_v2_enabled',
  'btc_shadow_write_enabled',
  'btc_history_ssot_enabled',
  'benefactors_v2_enabled'
);

-- 2. Partial unique indexes on legacy tables
DROP INDEX IF EXISTS public.donations_btc_vout_uniq;
DROP INDEX IF EXISTS public.wallet_transfers_btc_vout_uniq;

-- 3. FK constraints
ALTER TABLE public.donations
  DROP CONSTRAINT IF EXISTS donations_superseded_by_fk;
ALTER TABLE public.wallet_transfers
  DROP CONSTRAINT IF EXISTS wallet_transfers_superseded_by_fk;

-- 4. Legacy added columns (giữ lại tags + integrity_status nếu đã dùng)
ALTER TABLE public.donations
  DROP COLUMN IF EXISTS vout_index,
  DROP COLUMN IF EXISTS classifier_version,
  DROP COLUMN IF EXISTS superseded_by;

ALTER TABLE public.wallet_transfers
  DROP COLUMN IF EXISTS vout_index,
  DROP COLUMN IF EXISTS classifier_version,
  DROP COLUMN IF EXISTS superseded_by;

-- 5. Drop 4 new tables (CASCADE removes triggers + policies)
DROP TABLE IF EXISTS public.btc_raw_tx_cache        CASCADE;
DROP TABLE IF EXISTS public.btc_ownership_snapshot  CASCADE;
DROP TABLE IF EXISTS public.btc_tx_semantic         CASCADE;
DROP TABLE IF EXISTS public.btc_review_queue        CASCADE;

COMMIT;
