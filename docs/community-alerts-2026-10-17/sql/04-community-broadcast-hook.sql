-- Community broadcast hook: when the existing impersonation-scan system creates
-- an alert row, broadcast a community notification to ALL users (Trí's transparency model).
-- Dedup is shared with the username sensor via username_similarity_alerts (one alert per pair).
CREATE OR REPLACE FUNCTION public.broadcast_impersonation_alert_row(p_alert_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a record;
  v_a uuid; v_b uuid;
  v_reg_id uuid; v_alerted boolean;
  v_meta jsonb; v_count integer;
  s record; e record;
BEGIN
  SELECT * INTO a FROM public.impersonation_alerts WHERE id = p_alert_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_a := least(a.suspect_user_id, a.victim_user_id);
  v_b := greatest(a.suspect_user_id, a.victim_user_id);
  INSERT INTO public.username_similarity_alerts (user_a, user_b, rule, detected_via)
  VALUES (v_a, v_b, 'system_scan', 'system')
  ON CONFLICT (user_a, user_b) DO NOTHING
  RETURNING id INTO v_reg_id;
  IF v_reg_id IS NULL THEN
    SELECT id, (alerted_at IS NOT NULL) INTO v_reg_id, v_alerted
      FROM public.username_similarity_alerts WHERE user_a = v_a AND user_b = v_b;
    IF v_alerted THEN RETURN 0; END IF;
  END IF;
  SELECT id, username, created_at INTO s FROM public.profiles WHERE id = a.suspect_user_id;
  SELECT id, username, created_at INTO e FROM public.profiles WHERE id = a.victim_user_id;
  v_meta := jsonb_build_object(
    'mode', 'single',
    'source', 'system_scan',
    'alert_id', a.id,
    'name_similarity', a.name_similarity,
    'avatar_similarity', a.avatar_similarity,
    'overall_score', a.overall_score,
    'similar', jsonb_build_object('id', s.id, 'username', s.username, 'created_at', s.created_at),
    'existing', jsonb_build_object('id', e.id, 'username', e.username, 'created_at', e.created_at)
  );
  INSERT INTO public.notifications (user_id, actor_id, type, metadata)
  SELECT p.id, a.suspect_user_id, 'impersonation_alert', v_meta FROM public.profiles p;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.username_similarity_alerts SET alerted_at = now() WHERE id = v_reg_id;
  RETURN v_count;
END $$;

CREATE OR REPLACE FUNCTION public.trg_impersonation_alerts_community()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.broadcast_impersonation_alert_row(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'community broadcast failed for alert %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_impersonation_alerts_community ON public.impersonation_alerts;
CREATE TRIGGER trg_impersonation_alerts_community
  AFTER INSERT ON public.impersonation_alerts
  FOR EACH ROW EXECUTE FUNCTION public.trg_impersonation_alerts_community();
