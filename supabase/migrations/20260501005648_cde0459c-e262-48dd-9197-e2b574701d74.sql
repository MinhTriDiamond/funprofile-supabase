-- Add anti-whale cap config if it does not exist yet
ALTER TABLE public.epoch_config
  ADD COLUMN IF NOT EXISTS max_share_per_user numeric DEFAULT 0.03;

-- Ensure current Monetary v1 config uses 50M monthly pool and 3% max share per user
UPDATE public.epoch_config
SET soft_ceiling = 50000000,
    min_epoch_mint = 50000000,
    user_pool_pct = 0.70,
    max_share_per_user = 0.03,
    updated_at = now()
WHERE config_key = 'default'
  AND is_active = true;

-- Recalculate April 2026 allocations using 50M total mint, 35M userRewardPool,
-- and anti-whale cap of 3% of userRewardPool = 1,050,000 FUN/user.
DO $$
DECLARE
  v_epoch_id uuid;
  v_total_mint numeric := 50000000;
  v_user_pool numeric := 35000000;
  v_cap_pct numeric := 0.03;
  v_cap_amount numeric := 1050000;
  v_total_light numeric;
  v_eligible_count integer;
  v_total_users integer;
BEGIN
  SELECT id INTO v_epoch_id
  FROM public.mint_epochs
  WHERE epoch_month = '2026-04'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_epoch_id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy mint epoch 2026-04';
  END IF;

  CREATE TEMP TABLE tmp_april_allocation ON COMMIT DROP AS
  WITH v1 AS (
    SELECT user_id, sum(light_score)::numeric AS v1_score
    FROM public.light_actions
    WHERE is_eligible = true
      AND mint_status = 'approved'
      AND created_at >= '2026-04-01T00:00:00Z'::timestamptz
      AND created_at < '2026-05-01T00:00:00Z'::timestamptz
    GROUP BY user_id
  ),
  v2 AS (
    SELECT a.user_id, sum(v.final_light_score)::numeric AS v2_score
    FROM public.pplp_v2_validations v
    JOIN public.pplp_v2_user_actions a ON a.id = v.action_id
    WHERE v.validation_status = 'validated'
      AND v.created_at >= '2026-04-01T00:00:00Z'::timestamptz
      AND v.created_at < '2026-05-01T00:00:00Z'::timestamptz
    GROUP BY a.user_id
  ),
  base_scores AS (
    SELECT
      coalesce(v1.user_id, v2.user_id) AS user_id,
      coalesce(v1.v1_score, 0) + coalesce(v2.v2_score, 0) AS total_light,
      coalesce(v2.v2_score, 0) AS v2_score
    FROM v1
    FULL JOIN v2 ON v2.user_id = v1.user_id
  ),
  banned_filtered AS (
    SELECT b.*
    FROM base_scores b
    LEFT JOIN public.profiles p ON p.id = b.user_id
    WHERE coalesce(p.is_banned, false) = false
  ),
  eligible AS (
    SELECT *
    FROM banned_filtered
    WHERE total_light >= 10
  ),
  weighted AS (
    SELECT
      e.user_id,
      e.total_light,
      e.v2_score,
      coalesce(ls.raw_ls, e.total_light)::numeric
        * coalesce(t.tier_multiplier, 1)::numeric
        * coalesce(ls.consistency_multiplier, 1)::numeric AS weighted_score
    FROM eligible e
    LEFT JOIN public.pplp_v25_light_scores ls
      ON ls.user_id = e.user_id AND ls.is_current = true
    LEFT JOIN public.pplp_v25_tier_assignments t
      ON t.user_id = e.user_id AND t.is_current = true
  ),
  weighted_sum AS (
    SELECT sum(weighted_score)::numeric AS total_weighted
    FROM weighted
  ),
  real_allocs AS (
    SELECT
      w.user_id,
      w.total_light,
      w.v2_score,
      CASE WHEN ws.total_weighted > 0 THEN (w.weighted_score / ws.total_weighted) * 100 ELSE 0 END AS share_percent,
      CASE WHEN ws.total_weighted > 0 THEN (w.weighted_score / ws.total_weighted) * v_user_pool ELSE 0 END AS raw_alloc
    FROM weighted w
    CROSS JOIN weighted_sum ws
  ),
  eligible_rows AS (
    SELECT
      user_id,
      round(total_light, 2) AS light_score_total,
      round(share_percent, 4) AS share_percent,
      round(raw_alloc, 2) AS allocation_amount,
      least(floor(raw_alloc), v_cap_amount)::numeric AS allocation_amount_capped,
      floor(least(floor(raw_alloc), v_cap_amount) * 0.15)::numeric AS instant_amount,
      (least(floor(raw_alloc), v_cap_amount) - floor(least(floor(raw_alloc), v_cap_amount) * 0.15))::numeric AS locked_amount,
      true AS is_eligible,
      CASE
        WHEN raw_alloc < 100 THEN ARRAY['BELOW_DUST_THRESHOLD', 'MonetaryV1+AntiWhale3pct-userPool35M']::text[]
        WHEN raw_alloc > v_cap_amount THEN ARRAY['EPOCH_ELIGIBLE', 'MONETARY_V1', 'capped_at_3pct', 'cap_amount=1050000', 'userRewardPool_share>3pct']::text[]
        WHEN v2_score > 0 THEN ARRAY['EPOCH_ELIGIBLE', 'V2_PARTICIPANT', 'MONETARY_V1']::text[]
        ELSE ARRAY['EPOCH_ELIGIBLE', 'MONETARY_V1']::text[]
      END AS reason_codes,
      'pending'::text AS status
    FROM real_allocs
  ),
  ineligible_rows AS (
    SELECT
      user_id,
      round(total_light, 2) AS light_score_total,
      0::numeric AS share_percent,
      0::numeric AS allocation_amount,
      0::numeric AS allocation_amount_capped,
      0::numeric AS instant_amount,
      0::numeric AS locked_amount,
      false AS is_eligible,
      ARRAY['BELOW_MIN_LIGHT_THRESHOLD']::text[] AS reason_codes,
      'pending'::text AS status
    FROM banned_filtered
    WHERE total_light < 10
  )
  SELECT * FROM eligible_rows WHERE allocation_amount_capped >= 100
  UNION ALL
  SELECT
    user_id, light_score_total, 0::numeric, 0::numeric, 0::numeric, 0::numeric, 0::numeric,
    false, reason_codes, status
  FROM eligible_rows
  WHERE allocation_amount_capped < 100
  UNION ALL
  SELECT * FROM ineligible_rows;

  SELECT coalesce(sum(light_score_total) FILTER (WHERE is_eligible), 0),
         count(*) FILTER (WHERE is_eligible),
         count(*)
  INTO v_total_light, v_eligible_count, v_total_users
  FROM tmp_april_allocation;

  DELETE FROM public.mint_allocations
  WHERE epoch_id = v_epoch_id;

  INSERT INTO public.mint_allocations (
    epoch_id,
    user_id,
    light_score_total,
    share_percent,
    allocation_amount,
    allocation_amount_capped,
    instant_amount,
    locked_amount,
    is_eligible,
    reason_codes,
    status
  )
  SELECT
    v_epoch_id,
    user_id,
    light_score_total,
    share_percent,
    allocation_amount,
    allocation_amount_capped,
    instant_amount,
    locked_amount,
    is_eligible,
    reason_codes,
    status
  FROM tmp_april_allocation;

  UPDATE public.mint_epochs
  SET mint_pool = v_total_mint,
      final_mint = v_total_mint,
      total_cap = v_total_mint,
      soft_ceiling = v_total_mint,
      total_light_score = v_total_light,
      eligible_users = v_eligible_count,
      unique_users = v_total_users,
      total_actions = v_total_users,
      status = 'snapshot',
      rules_version = 'MonetaryV1+AntiWhale3pct-userPool35M',
      allocation_breakdown = jsonb_build_object(
        'user_pool', v_user_pool,
        'ecosystem_pool', v_total_mint * 0.12,
        'treasury_pool', v_total_mint * 0.10,
        'strategic_pool', v_total_mint * 0.05,
        'resilience_pool', v_total_mint * 0.03,
        'max_share_per_user', v_cap_pct,
        'cap_amount', v_cap_amount,
        'rule_basis', 'userRewardPool'
      ),
      updated_at = now()
  WHERE id = v_epoch_id;
END $$;