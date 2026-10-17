CREATE OR REPLACE FUNCTION public.broadcast_username_similarity_alert(
  p_similar uuid, p_existing uuid, p_rule text, p_note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_a uuid := least(p_similar, p_existing);
  v_b uuid := greatest(p_similar, p_existing);
  v_reg_id uuid;
  v_meta jsonb;
  v_count integer;
  v_alerted boolean;
  s record; e record;
BEGIN
  INSERT INTO public.username_similarity_alerts (user_a, user_b, rule)
  VALUES (v_a, v_b, p_rule)
  ON CONFLICT (user_a, user_b) DO NOTHING
  RETURNING id INTO v_reg_id;
  IF v_reg_id IS NULL THEN
    SELECT id, (alerted_at IS NOT NULL) INTO v_reg_id, v_alerted
      FROM public.username_similarity_alerts WHERE user_a = v_a AND user_b = v_b;
    IF v_alerted THEN RETURN 0; END IF;
  END IF;
  SELECT id, username, created_at INTO s FROM public.profiles WHERE id = p_similar;
  SELECT id, username, created_at INTO e FROM public.profiles WHERE id = p_existing;
  v_meta := jsonb_build_object(
    'mode', 'single',
    'rule', p_rule,
    'note', p_note,
    'similar', jsonb_build_object('id', s.id, 'username', s.username, 'created_at', s.created_at),
    'existing', jsonb_build_object('id', e.id, 'username', e.username, 'created_at', e.created_at)
  );
  INSERT INTO public.notifications (user_id, actor_id, type, metadata)
  SELECT p.id, p_similar, 'impersonation_alert', v_meta FROM public.profiles p;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.username_similarity_alerts SET alerted_at = now() WHERE id = v_reg_id;
  RETURN v_count;
END $$;
