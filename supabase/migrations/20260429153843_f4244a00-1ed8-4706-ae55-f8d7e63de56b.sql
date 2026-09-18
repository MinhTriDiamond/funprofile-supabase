-- Backfill VVU cho light_actions
WITH
  ovr AS (
    SELECT action_type, base_multiplier, quality_bonus, daily_cap, over_cap_multiplier
    FROM public.pplp_v25_action_overrides WHERE is_active = true
  ),
  ranked AS (
    SELECT la.id, la.user_id, la.action_type, la.base_reward, la.light_score,
      COALESCE(la.quality_score,1) qs, COALESCE(la.integrity_score,1) is_,
      COALESCE(la.impact_score,1) ims, COALESCE(la.unity_score,1) us,
      ROW_NUMBER() OVER (PARTITION BY la.user_id, la.action_type, date_trunc('day', la.created_at) ORDER BY la.created_at) AS daily_rank
    FROM public.light_actions la WHERE la.is_eligible = true
  ),
  computed AS (
    SELECT r.id, r.user_id,
      LEAST(1.5, (r.qs+r.is_+r.ims+r.us)/4.0 + COALESCE(o.quality_bonus,0)) AS quality_score,
      COALESCE(r.base_reward, r.light_score, 0) * COALESCE(o.base_multiplier, 1) AS base_value,
      CASE WHEN o.daily_cap IS NOT NULL AND r.daily_rank > o.daily_cap THEN COALESCE(o.over_cap_multiplier, 0.3) ELSE 1.0 END AS over_cap_factor
    FROM ranked r LEFT JOIN ovr o ON o.action_type = r.action_type
  ),
  trust AS (
    SELECT p.id AS user_id,
      GREATEST(0.3, LEAST(1.5, COALESCE(tp.tc, p.trust_level, 1.0)::numeric)) AS tc
    FROM public.profiles p
    LEFT JOIN public.did_registry dr ON dr.owner_user_id = p.id
    LEFT JOIN public.trust_profile tp ON tp.did_id = dr.did_id
  )
INSERT INTO public.pplp_v25_vvu_log
  (user_id, source_table, source_id, vvu_type, base_value, quality_score, trust_context, iis_value, im_value, anti_abuse_factor, erp_factor, vvu_value, computed_at)
SELECT c.user_id, 'light_actions', c.id, 'personal',
  c.base_value, c.quality_score, COALESCE(t.tc,1.0),
  1.0, 1.0, 1.0, 1.0,
  c.base_value * c.quality_score * COALESCE(t.tc,1.0) * c.over_cap_factor,
  now()
FROM computed c LEFT JOIN trust t ON t.user_id = c.user_id
WHERE c.user_id IS NOT NULL
ON CONFLICT (source_table, source_id, vvu_type) DO UPDATE SET
  base_value = EXCLUDED.base_value,
  quality_score = EXCLUDED.quality_score,
  trust_context = EXCLUDED.trust_context,
  vvu_value = EXCLUDED.vvu_value,
  computed_at = now();

-- Mark all current as not current
UPDATE public.pplp_v25_light_scores SET is_current = false WHERE is_current = true;

-- Aggregate
WITH
  phase AS (SELECT alpha, beta, gamma FROM public.pplp_v25_phase_config WHERE is_active = true LIMIT 1),
  sums AS (
    SELECT v.user_id,
      SUM(CASE WHEN v.vvu_type='personal' THEN v.vvu_value ELSE 0 END) AS sum_personal,
      SUM(CASE WHEN v.vvu_type='network' THEN v.vvu_value ELSE 0 END) AS sum_network,
      SUM(CASE WHEN v.vvu_type='legacy'  THEN v.vvu_value ELSE 0 END) AS sum_legacy
    FROM public.pplp_v25_vvu_log v GROUP BY v.user_id
  ),
  m AS (
    SELECT s.user_id, s.sum_personal, s.sum_network, s.sum_legacy,
      GREATEST(0.9, LEAST(1.3, 1 + ln(1 + GREATEST(0, COALESCE(lr.consistency_streak,0))) / 10)) AS cm,
      GREATEST(0.5, LEAST(1.2, 1 + COALESCE(lr.sequence_bonus,0))) AS rm
    FROM sums s LEFT JOIN public.light_reputation lr ON lr.user_id = s.user_id
  ),
  scored AS (
    SELECT m.user_id,
      m.sum_personal * m.cm * m.rm AS pls,
      m.sum_network * m.cm AS nls,
      m.sum_legacy AS lls,
      m.cm, m.rm,
      (SELECT alpha FROM phase) a,
      (SELECT beta FROM phase) b,
      (SELECT gamma FROM phase) g
    FROM m
  )
INSERT INTO public.pplp_v25_light_scores
  (user_id, epoch_label, pls, nls, lls, tls, raw_ls, display_ls,
   consistency_multiplier, reliability_multiplier, alpha, beta, gamma, is_current)
SELECT user_id, to_char(now(), 'YYYY-MM-DD'),
  pls, nls, lls,
  (a*pls + b*nls + g*lls) AS tls,
  (a*pls + b*nls + g*lls) AS raw_ls,
  100 * ln(1 + GREATEST(0, a*pls + b*nls + g*lls)) AS display_ls,
  cm, rm, a, b, g, true
FROM scored;

-- Sync vào profiles
UPDATE public.profiles p
SET raw_light_score = ls.raw_ls,
    display_light_score = ls.display_ls
FROM public.pplp_v25_light_scores ls
WHERE ls.user_id = p.id AND ls.is_current = true;