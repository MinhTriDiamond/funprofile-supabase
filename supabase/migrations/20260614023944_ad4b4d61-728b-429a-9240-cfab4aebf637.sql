
-- Founder Dashboard: production-truth RPC aggregates (admin-only)
-- Fixes: 1000-row cap, wrong source tables, sbt_category column typo

CREATE OR REPLACE FUNCTION public.get_founder_identity_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_total_dids int;
  v_new_7d int;
  v_by_level jsonb;
  v_by_entity jsonb;
  v_by_tier jsonb;
  v_by_sybil jsonb;
  v_avg_tc numeric;
  v_total_sbts int;
  v_sbt_by_category jsonb;
  v_dispute_pending int;
  v_recovery_active int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT count(*) INTO v_total_dids FROM did_registry;
  SELECT count(*) INTO v_new_7d FROM did_registry WHERE created_at > now() - interval '7 days';

  SELECT coalesce(jsonb_object_agg(did_level, c), '{}'::jsonb) INTO v_by_level
  FROM (SELECT did_level, count(*) c FROM did_registry GROUP BY did_level) x;

  SELECT coalesce(jsonb_object_agg(entity_type, c), '{}'::jsonb) INTO v_by_entity
  FROM (SELECT entity_type, count(*) c FROM did_registry GROUP BY entity_type) x;

  SELECT coalesce(jsonb_object_agg(trust_tier, c), '{}'::jsonb) INTO v_by_tier
  FROM (SELECT trust_tier, count(*) c FROM trust_profile GROUP BY trust_tier) x;

  SELECT coalesce(jsonb_object_agg(sybil_risk, c), '{}'::jsonb) INTO v_by_sybil
  FROM (SELECT sybil_risk, count(*) c FROM trust_profile GROUP BY sybil_risk) x;

  SELECT coalesce(avg(tc), 0) INTO v_avg_tc FROM trust_profile;

  SELECT count(*) INTO v_total_sbts FROM sbt_registry WHERE status = 'active';

  SELECT coalesce(jsonb_object_agg(sbt_category, c), '{}'::jsonb) INTO v_sbt_by_category
  FROM (SELECT sbt_category, count(*) c FROM sbt_registry WHERE status='active' GROUP BY sbt_category) x;

  SELECT count(*) INTO v_dispute_pending FROM identity_disputes
   WHERE status IN ('pending','investigating');

  SELECT count(*) INTO v_recovery_active FROM identity_recovery_log
   WHERE status IN ('pending','in_progress');

  result := jsonb_build_object(
    'total_dids', v_total_dids,
    'new_dids_7d', v_new_7d,
    'by_level', v_by_level,
    'by_entity', v_by_entity,
    'by_tier', v_by_tier,
    'by_sybil', v_by_sybil,
    'avg_tc', v_avg_tc,
    'total_sbts_active', v_total_sbts,
    'sbt_by_category', v_sbt_by_category,
    'dispute_pending', v_dispute_pending,
    'recovery_active', v_recovery_active,
    'generated_at', now()
  );
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_founder_identity_stats() TO authenticated;


CREATE OR REPLACE FUNCTION public.get_founder_overview_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_total_raw_ls numeric;
  v_total_display_ls numeric;
  v_total_fun_minted numeric;
  v_total_actions int;
  v_approved int;
  v_validation_rate int;
  v_dau int; v_wau int; v_mau int;
  v_top jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- Light Score totals from canonical source pplp_v25_light_scores (latest snapshot per user)
  SELECT coalesce(sum(raw_ls), 0), coalesce(sum(display_ls), 0)
    INTO v_total_raw_ls, v_total_display_ls
  FROM pplp_v25_light_scores
  WHERE is_current = true;

  -- Total FUN minted: sum of confirmed mint requests (amount_display in FUN units)
  SELECT coalesce(sum(amount_display), 0) INTO v_total_fun_minted
  FROM pplp_mint_requests
  WHERE status = 'confirmed';

  -- Light actions: total + approved (current month) → validation rate
  SELECT count(*) INTO v_total_actions FROM light_actions
   WHERE created_at >= date_trunc('month', now());
  SELECT count(*) INTO v_approved FROM light_actions
   WHERE created_at >= date_trunc('month', now()) AND is_eligible = true;
  v_validation_rate := CASE WHEN v_total_actions > 0
                            THEN round(100.0 * v_approved / v_total_actions)::int
                            ELSE 0 END;

  -- DAU/WAU/MAU from REAL light_actions (distinct user_id)
  SELECT count(DISTINCT user_id) INTO v_dau FROM light_actions WHERE created_at >= now() - interval '1 day';
  SELECT count(DISTINCT user_id) INTO v_wau FROM light_actions WHERE created_at >= now() - interval '7 days';
  SELECT count(DISTINCT user_id) INTO v_mau FROM light_actions WHERE created_at >= now() - interval '30 days';

  -- Top action categories (last 30d)
  SELECT coalesce(jsonb_agg(jsonb_build_object('code', action_type, 'count', c) ORDER BY c DESC), '[]'::jsonb)
    INTO v_top
  FROM (
    SELECT action_type, count(*) c
    FROM light_actions
    WHERE created_at >= now() - interval '30 days'
    GROUP BY action_type
    ORDER BY c DESC
    LIMIT 8
  ) x;

  result := jsonb_build_object(
    'total_light_score_raw', v_total_raw_ls,
    'total_light_score_display', v_total_display_ls,
    'total_fun_minted', v_total_fun_minted,
    'total_actions_month', v_total_actions,
    'validation_rate', v_validation_rate,
    'dau', v_dau, 'wau', v_wau, 'mau', v_mau,
    'top_categories', v_top,
    'generated_at', now()
  );
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_founder_overview_stats() TO authenticated;
