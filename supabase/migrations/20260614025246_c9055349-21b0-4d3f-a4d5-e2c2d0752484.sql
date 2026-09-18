
-- Founder Economy stats RPC (admin-only, bypasses 1000-row cap)
CREATE OR REPLACE FUNCTION public.get_founder_economy_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
  v_total_fun numeric;
  v_confirmed_count int;
  v_failed_count int;
  v_signing_count int;
  v_total_users_minted int;
  v_user_share numeric;
  v_platform_share numeric;
  v_daily jsonb;
  v_top_actions jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT
    COALESCE(SUM(amount_wei::numeric)/1e18, 0),
    COUNT(*) FILTER (WHERE status='confirmed'),
    COUNT(*) FILTER (WHERE status='failed'),
    COUNT(*) FILTER (WHERE status IN ('signing','signed','submitted','queued_split'))
  INTO v_total_fun, v_confirmed_count, v_failed_count, v_signing_count
  FROM pplp_mint_requests
  WHERE status='confirmed';

  SELECT COUNT(DISTINCT user_id) INTO v_total_users_minted
  FROM pplp_mint_requests WHERE status='confirmed';

  -- 99/85 user split, 1/15 platform (PPLP v2 split: 99/1; Monetary lock 15/85 applied separately)
  v_user_share := v_total_fun * 0.99;
  v_platform_share := v_total_fun * 0.01;

  -- Daily mint flow (last 30 days)
  SELECT COALESCE(jsonb_agg(d ORDER BY d->>'date'), '[]'::jsonb) INTO v_daily
  FROM (
    SELECT jsonb_build_object(
      'date', to_char(date_trunc('day', created_at), 'MM-DD'),
      'amount', ROUND(SUM(amount_wei::numeric)/1e18)
    ) AS d
    FROM pplp_mint_requests
    WHERE status='confirmed'
      AND created_at >= now() - interval '30 days'
    GROUP BY date_trunc('day', created_at)
  ) sub;

  -- Top actions by FUN minted
  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', action_type, 'amount', amt) ORDER BY amt DESC), '[]'::jsonb)
  INTO v_top_actions
  FROM (
    SELECT COALESCE(la.action_type, 'unknown') AS action_type,
           ROUND(SUM(pmr.amount_wei::numeric)/1e18) AS amt
    FROM pplp_mint_requests pmr
    LEFT JOIN light_actions la ON la.id = pmr.action_id
    WHERE pmr.status='confirmed'
    GROUP BY la.action_type
    ORDER BY amt DESC
    LIMIT 5
  ) t;

  result := jsonb_build_object(
    'total_fun_minted', ROUND(v_total_fun),
    'confirmed_count', v_confirmed_count,
    'failed_count', v_failed_count,
    'pending_count', v_signing_count,
    'unique_minters', v_total_users_minted,
    'user_share', ROUND(v_user_share),
    'platform_share', ROUND(v_platform_share),
    'daily_flow', v_daily,
    'top_actions', v_top_actions,
    'source', 'pplp_mint_requests (production)',
    'generated_at', now()
  );
  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.get_founder_economy_stats() TO authenticated;

-- Add 5 new SBT rules for "Danh Hiệu Ánh Sáng" auto-evaluator (is_active=false until reviewed)
INSERT INTO public.sbt_issuance_rules (sbt_type, display_name, description, category, mode, trust_weight, tc_impact, privacy_level, auto_conditions, is_active)
VALUES
  ('social_consistent_poster', 'Người Gieo Đều Đặn', 'Đăng bài hợp lệ ≥7 ngày liên tục', 'contribution', 'auto', 0.10, 0.02, 'public', '{"min_consecutive_days":7}'::jsonb, false),
  ('lovehub_participant', 'Bạn Đồng Hành LoveHUB', 'Tham gia ≥3 buổi LoveHUB', 'contribution', 'auto', 0.10, 0.02, 'public', '{"min_lovehub_sessions":3}'::jsonb, false),
  ('generous_giver', 'Trái Tim Hào Phóng', 'Tặng quà nội bộ ≥10 lần', 'contribution', 'auto', 0.15, 0.03, 'public', '{"min_internal_donations":10}'::jsonb, false),
  ('community_contributor_monthly', 'Đóng Góp Cộng Đồng', 'Top 10% Light Score trong tháng', 'milestone', 'auto', 0.15, 0.05, 'public', '{"top_percent":10}'::jsonb, false),
  ('community_recognized', 'Được Cộng Đồng Ghi Nhận', 'Có 1 bài đăng nhận ≥50 reaction', 'milestone', 'auto', 0.10, 0.03, 'public', '{"min_reactions_on_post":50}'::jsonb, false)
ON CONFLICT (sbt_type) DO NOTHING;
