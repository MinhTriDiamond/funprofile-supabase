
CREATE OR REPLACE VIEW public.unified_user_light_score AS
SELECT
  COALESCE(v1.user_id, v2.user_id) AS user_id,
  COALESCE(v1.total_light_score, 0) AS v1_light_score,
  COALESCE(v1.actions_count, 0) AS v1_actions_count,
  COALESCE(v1.tier, 0) AS v1_tier,
  COALESCE(v1.consistency_streak, 0) AS v1_streak,
  v1.last_action_at AS v1_last_action_at,
  COALESCE(v2.v2_light_score, 0) AS v2_light_score,
  COALESCE(v2.v2_actions_count, 0) AS v2_actions_count,
  COALESCE(v2.v2_minted_amount, 0) AS v2_minted_amount,
  COALESCE(v1.total_light_score, 0) + COALESCE(v2.v2_light_score, 0) AS combined_light_score,
  COALESCE(v1.actions_count, 0) + COALESCE(v2.v2_actions_count, 0) AS combined_actions_count
FROM public.light_reputation v1
FULL OUTER JOIN (
  SELECT
    a.user_id,
    SUM(COALESCE(val.final_light_score, 0)) AS v2_light_score,
    COUNT(a.id) AS v2_actions_count,
    COALESCE(SUM(
      CASE WHEN bl.entry_type = 'mint' THEN bl.amount ELSE 0 END
    ), 0) AS v2_minted_amount
  FROM public.pplp_v2_user_actions a
  LEFT JOIN public.pplp_v2_validations val ON val.action_id = a.id AND val.validation_status = 'validated'
  LEFT JOIN public.pplp_v2_balance_ledger bl ON bl.reference_id = a.id AND bl.entry_type = 'mint'
  GROUP BY a.user_id
) v2 ON v1.user_id = v2.user_id;

CREATE OR REPLACE FUNCTION public.get_unified_light_score(p_user_id UUID)
RETURNS TABLE(
  user_id UUID,
  v1_light_score NUMERIC,
  v2_light_score NUMERIC,
  combined_light_score NUMERIC,
  v1_actions_count BIGINT,
  v2_actions_count BIGINT,
  v1_tier INT,
  v1_streak INT,
  v2_minted_amount NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.user_id,
    u.v1_light_score,
    u.v2_light_score,
    u.combined_light_score,
    u.v1_actions_count,
    u.v2_actions_count,
    u.v1_tier,
    u.v1_streak,
    u.v2_minted_amount
  FROM public.unified_user_light_score u
  WHERE u.user_id = p_user_id;
$$;
