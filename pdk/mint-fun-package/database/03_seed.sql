-- =============================================================
-- FUN Money Mint Package — 03_seed.sql
-- Seed cấu hình khởi tạo cho LoveHUB.fun.
-- Budget: 50M FUN / tháng (riêng biệt với FUN Profile).
-- Yêu cầu chạy SAU 02_functions.sql.
-- =============================================================

-- ────────────────────────────────────────────────────────────
-- epoch_config: budget 50M FUN/tháng cho LoveHUB
-- ────────────────────────────────────────────────────────────
INSERT INTO public.epoch_config (
  config_key, system_stage, base_rate,
  alpha, beta, gamma, delta, epsilon, zeta,
  soft_ceiling, min_epoch_mint,
  modulator_min, modulator_max,
  user_pool_pct, ecosystem_pool_pct, treasury_pool_pct,
  strategic_pool_pct, resilience_pool_pct,
  instant_portion_pct, locked_portion_pct,
  base_vesting_days, unlock_check_interval_days,
  max_share_per_user, is_active
) VALUES (
  'default', 'bootstrap', 500000,
  100, 80, 60, 50, 40, 30,
  50000000,   -- SoftCeiling 50M FUN/tháng cho LoveHUB
  50000000,
  0.65, 1.25,
  0.70, 0.12, 0.10, 0.05, 0.03,
  0.15, 0.85,           -- 15/85 lock
  28, 7,
  0.03, true
) ON CONFLICT (config_key) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- pplp_v25_config: hệ số Light Score v2.5
-- ────────────────────────────────────────────────────────────
INSERT INTO public.pplp_v25_config (
  config_key, alpha, beta, gamma,
  tier_thresholds, tier_multipliers,
  iis_min, iis_max, im_min, im_max,
  display_compression, is_active
) VALUES (
  'default', 0.4, 0.3, 0.3,
  '{"Seed Light": 0, "Pure Light": 100, "Guiding Light": 500, "Radiant Light": 2000, "Legacy Light": 10000, "Cosmic Light": 50000}'::jsonb,
  '{"Seed Light": 0.5, "Pure Light": 1.0, "Guiding Light": 1.5, "Radiant Light": 2.0, "Legacy Light": 3.0, "Cosmic Light": 5.0}'::jsonb,
  0.0, 1.5, 0.0, 3.0,
  'log', true
) ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- Bổ sung cột Light Score v2.5 vào profiles (nếu chưa có)
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS wallet_address        text,
  ADD COLUMN IF NOT EXISTS total_light_score     numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_light_score       numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS display_light_score   numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS light_tier            text    DEFAULT 'Seed Light',
  ADD COLUMN IF NOT EXISTS iis_value             numeric DEFAULT 1.0;

CREATE INDEX IF NOT EXISTS idx_profiles_wallet_address_lower
  ON public.profiles (lower(wallet_address))
  WHERE wallet_address IS NOT NULL;
