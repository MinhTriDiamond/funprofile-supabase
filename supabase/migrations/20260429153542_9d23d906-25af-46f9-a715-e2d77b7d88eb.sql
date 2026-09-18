-- =========================================
-- Auto trigger VVU calculation realtime
-- =========================================

CREATE OR REPLACE FUNCTION public.trigger_pplp_v25_vvu_calc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text := 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/pplp-v25-vvu-calculate';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJodHNuZXJ2cWl3Y2hsdXd1eGtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNDAxMzksImV4cCI6MjA3NzkxNjEzOX0.YccI5Y5qKKt1FzPt8g2C2lm0WADVQ0m21HZEKNn82Sw';
  table_name text := TG_TABLE_NAME;
BEGIN
  -- Chỉ trigger khi đủ điều kiện
  IF table_name = 'light_actions' AND NEW.is_eligible IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF table_name = 'pplp_v2_user_actions' AND NEW.status <> 'validated' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := fn_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key
    ),
    body := jsonb_build_object(
      'source_table', table_name,
      'source_id', NEW.id,
      'vvu_type', 'personal'
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Không chặn insert nếu net.http_post fail
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_v25_vvu_light_actions ON public.light_actions;
CREATE TRIGGER trg_v25_vvu_light_actions
  AFTER INSERT OR UPDATE OF is_eligible ON public.light_actions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_pplp_v25_vvu_calc();

DROP TRIGGER IF EXISTS trg_v25_vvu_v2_actions ON public.pplp_v2_user_actions;
CREATE TRIGGER trg_v25_vvu_v2_actions
  AFTER INSERT OR UPDATE OF status ON public.pplp_v2_user_actions
  FOR EACH ROW EXECUTE FUNCTION public.trigger_pplp_v25_vvu_calc();

-- =========================================
-- Farming detection RPC (cron daily)
-- =========================================
CREATE OR REPLACE FUNCTION public.mark_suspected_farming()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  flagged int;
  cleared int;
BEGIN
  -- Set farming_score từ intent_metrics (1 - iis_value/1.5 → càng cao càng nghi)
  UPDATE public.profiles p
  SET farming_score = GREATEST(0, LEAST(1, 1 - im.iis_value / 1.5))
  FROM public.pplp_v25_intent_metrics im
  WHERE p.id = im.user_id;

  UPDATE public.profiles SET suspected_farming = true
  WHERE farming_score >= 0.5 AND suspected_farming = false;
  GET DIAGNOSTICS flagged = ROW_COUNT;

  UPDATE public.profiles SET suspected_farming = false
  WHERE (farming_score IS NULL OR farming_score < 0.4) AND suspected_farming = true;
  GET DIAGNOSTICS cleared = ROW_COUNT;

  RETURN jsonb_build_object('flagged', flagged, 'cleared', cleared, 'at', now());
END;
$$;

-- =========================================
-- Dashboard stats RPC for admin
-- =========================================
CREATE OR REPLACE FUNCTION public.pplp_v25_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  SELECT jsonb_build_object(
    'vvu_rows', (SELECT count(*) FROM pplp_v25_vvu_log),
    'users_scored_v25', (SELECT count(*) FROM pplp_v25_light_scores WHERE is_current = true),
    'profiles_with_raw_ls', (SELECT count(*) FROM profiles WHERE raw_light_score > 0),
    'eligible_actions', (SELECT count(*) FROM light_actions WHERE is_eligible = true),
    'pending_sig', (SELECT count(*) FROM light_actions WHERE mint_status = 'pending_sig'),
    'v2_validated', (SELECT count(*) FROM pplp_v2_user_actions WHERE status = 'validated'),
    'v2_proof_pending', (SELECT count(*) FROM pplp_v2_user_actions WHERE status = 'proof_pending'),
    'suspected_farmers', (SELECT count(*) FROM profiles WHERE suspected_farming = true),
    'oldest_pending_sig_age_hours', (
      SELECT EXTRACT(EPOCH FROM (now() - MIN(created_at)))/3600
      FROM light_actions WHERE mint_status = 'pending_sig'
    )
  ) INTO result;
  RETURN result;
END;
$$;