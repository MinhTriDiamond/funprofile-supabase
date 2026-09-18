
CREATE OR REPLACE FUNCTION public.quest_set_progress(
  p_user_id UUID,
  p_quest_code TEXT,
  p_set_to INTEGER,
  p_evidence JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quest public.quest_definitions%ROWTYPE;
  v_progress public.quest_user_progress%ROWTYPE;
  v_period TEXT;
  v_did TEXT;
  v_tier trust_tier;
  v_streak INTEGER := 0;
  v_multiplier NUMERIC := 1.0;
  v_ls_raw NUMERIC := 0;
  v_ls_today NUMERIC := 0;
  v_ls_cap NUMERIC := 200;
  v_ls_awarded NUMERIC := 0;
  v_capped BOOLEAN := false;
  v_just_completed BOOLEAN := false;
  v_today DATE := (now() AT TIME ZONE 'UTC')::date;
  v_new_count INTEGER;
BEGIN
  SELECT * INTO v_quest FROM quest_definitions WHERE code = p_quest_code AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'quest_not_found');
  END IF;

  v_period := quest_period_key(v_quest.frequency);

  SELECT did_id INTO v_did FROM did_registry WHERE owner_user_id = p_user_id LIMIT 1;
  IF v_did IS NOT NULL THEN
    SELECT trust_tier INTO v_tier FROM trust_profile WHERE did_id = v_did;
  END IF;

  INSERT INTO quest_user_progress (user_id, quest_id, period_key, target_count, evidence)
  VALUES (p_user_id, v_quest.id, v_period, v_quest.target_count, COALESCE(p_evidence, '{}'::jsonb))
  ON CONFLICT (user_id, quest_id, period_key) DO NOTHING;

  SELECT * INTO v_progress
  FROM quest_user_progress
  WHERE user_id = p_user_id AND quest_id = v_quest.id AND period_key = v_period
  FOR UPDATE;

  IF v_progress.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_completed', true, 'ls_awarded', v_progress.ls_awarded);
  END IF;

  v_new_count := LEAST(GREATEST(v_progress.progress_count, p_set_to), v_quest.target_count);

  UPDATE quest_user_progress
  SET progress_count = v_new_count,
      evidence = quest_user_progress.evidence || COALESCE(p_evidence, '{}'::jsonb)
  WHERE id = v_progress.id;

  IF v_new_count >= v_quest.target_count THEN
    v_just_completed := true;

    IF v_tier IS NULL OR v_tier < v_quest.trust_tier_min THEN
      v_ls_awarded := 0;
      v_capped := true;
    ELSE
      SELECT current_streak INTO v_streak FROM quest_streaks WHERE user_id = p_user_id;
      v_streak := COALESCE(v_streak, 0);
      v_multiplier := quest_streak_multiplier(v_streak);
      v_ls_raw := v_quest.ls_base * v_multiplier;

      SELECT COALESCE(SUM(light_score), 0) INTO v_ls_today
      FROM light_actions
      WHERE user_id = p_user_id
        AND action_type = 'QUEST_REWARD'
        AND created_at >= v_today;

      IF v_ls_today + v_ls_raw > v_ls_cap THEN
        v_ls_awarded := GREATEST(v_ls_cap - v_ls_today, 0);
        v_capped := true;
      ELSE
        v_ls_awarded := v_ls_raw;
      END IF;
    END IF;

    UPDATE quest_user_progress
    SET completed_at = now(), ls_awarded = v_ls_awarded, ls_capped = v_capped
    WHERE id = v_progress.id;

    IF v_ls_awarded > 0 THEN
      INSERT INTO light_actions (
        user_id, action_type, reference_id, reference_type,
        content_preview, base_reward, light_score, is_eligible,
        unity_score, unity_multiplier, evaluated_at
      ) VALUES (
        p_user_id, 'QUEST_REWARD', v_quest.id, 'quest',
        v_quest.title_vi, v_quest.ls_base, v_ls_awarded, true,
        50, v_multiplier, now()
      );
    END IF;

    INSERT INTO quest_streaks (user_id, current_streak, longest_streak, last_active_date, total_quests_completed, total_ls_from_quests)
    VALUES (p_user_id, 1, 1, v_today, 1, v_ls_awarded)
    ON CONFLICT (user_id) DO UPDATE
    SET
      current_streak = CASE
        WHEN quest_streaks.last_active_date = v_today THEN quest_streaks.current_streak
        WHEN quest_streaks.last_active_date = v_today - 1 THEN quest_streaks.current_streak + 1
        ELSE 1
      END,
      longest_streak = GREATEST(quest_streaks.longest_streak,
        CASE
          WHEN quest_streaks.last_active_date = v_today THEN quest_streaks.current_streak
          WHEN quest_streaks.last_active_date = v_today - 1 THEN quest_streaks.current_streak + 1
          ELSE 1
        END),
      last_active_date = v_today,
      total_quests_completed = quest_streaks.total_quests_completed + 1,
      total_ls_from_quests = quest_streaks.total_ls_from_quests + v_ls_awarded,
      updated_at = now();
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'quest_code', p_quest_code,
    'progress', v_new_count,
    'target', v_quest.target_count,
    'just_completed', v_just_completed,
    'ls_awarded', v_ls_awarded,
    'capped', v_capped,
    'multiplier', v_multiplier,
    'streak', v_streak,
    'tier_ok', (v_tier IS NOT NULL AND v_tier >= v_quest.trust_tier_min)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.quest_set_progress(UUID, TEXT, INTEGER, JSONB) TO authenticated, service_role;
