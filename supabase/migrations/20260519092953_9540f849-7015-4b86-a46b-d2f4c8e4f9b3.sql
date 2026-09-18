-- Fix buddy_circle_invite & buddy_quest_complete:
-- 1) notifications table doesn't have title/message → move into metadata
-- 2) buddy_quest_complete now verifies real user action before recording progress

CREATE OR REPLACE FUNCTION public.buddy_circle_invite(_circle_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_circle public.buddy_circles;
  v_count int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF v_me = _user_id THEN RAISE EXCEPTION 'CANNOT_INVITE_SELF'; END IF;
  IF NOT public.is_buddy_member(_circle_id, v_me) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  SELECT * INTO v_circle FROM public.buddy_circles WHERE id=_circle_id AND status='active';
  IF v_circle.id IS NULL THEN RAISE EXCEPTION 'CIRCLE_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members WHERE circle_id=_circle_id AND user_id=_user_id) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;
  SELECT count(*) INTO v_count FROM public.buddy_members WHERE circle_id=_circle_id;
  IF v_count >= v_circle.max_members THEN RAISE EXCEPTION 'CIRCLE_FULL'; END IF;

  INSERT INTO public.notifications(user_id, actor_id, type, metadata)
  VALUES (_user_id, v_me, 'buddy_invite',
          jsonb_build_object(
            'circle_id', _circle_id,
            'invite_code', v_circle.invite_code,
            'circle_name', v_circle.name,
            'inviter_id', v_me,
            'title', 'Bạn được mời vào nhóm Ánh Sáng',
            'message', 'Bạn vừa được mời vào nhóm "' || v_circle.name || '" để cùng tiến mỗi ngày.'
          ));
END; $$;

CREATE OR REPLACE FUNCTION public.buddy_quest_complete(_circle_id uuid, _quest_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_quest public.buddy_daily_quests;
  v_just_completed boolean := false;
  v_done_today int;
  v_total_quests int;
  v_all_done boolean := false;
  v_inserted int := 0;
  v_ok boolean := false;
  v_buddy_ids uuid[];
  v_match_clause text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_buddy_member(_circle_id, v_me) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  SELECT * INTO v_quest FROM public.buddy_daily_quests WHERE id=_quest_id;
  IF v_quest.id IS NULL THEN RAISE EXCEPTION 'QUEST_NOT_FOUND'; END IF;

  -- Tập member khác trong circle để verify
  SELECT array_agg(user_id) INTO v_buddy_ids
    FROM public.buddy_members
    WHERE circle_id=_circle_id AND user_id<>v_me;

  -- === VERIFY THEO QUEST ===
  IF _quest_id = 'gratitude_to_buddy' THEN
    -- Cần post hôm nay ≥ 50 ký tự VÀ nhắc tới ít nhất 1 buddy (username hoặc display_name)
    IF v_buddy_ids IS NULL OR array_length(v_buddy_ids,1) IS NULL THEN
      v_ok := false;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.posts p
        WHERE p.user_id = v_me
          AND (p.created_at AT TIME ZONE 'UTC')::date = v_today
          AND length(coalesce(p.content,'')) >= 50
          AND EXISTS (
            SELECT 1 FROM public.public_profiles pp
            WHERE pp.id = ANY(v_buddy_ids)
              AND (
                (pp.username IS NOT NULL AND p.content ILIKE '%@' || pp.username || '%')
                OR (pp.display_name IS NOT NULL AND length(pp.display_name) >= 2
                    AND p.content ILIKE '%' || pp.display_name || '%')
              )
          )
      ) INTO v_ok;
    END IF;
  ELSIF _quest_id = 'cheer_buddy' THEN
    IF v_buddy_ids IS NULL OR array_length(v_buddy_ids,1) IS NULL THEN
      v_ok := false;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.pet_cheers c
        WHERE c.from_user_id = v_me
          AND c.to_user_id = ANY(v_buddy_ids)
          AND (c.created_at AT TIME ZONE 'UTC')::date = v_today
      ) INTO v_ok;
    END IF;
  ELSIF _quest_id = 'inner_work_share' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.posts p
      WHERE p.user_id = v_me
        AND (p.created_at AT TIME ZONE 'UTC')::date = v_today
        AND length(coalesce(p.content,'')) >= 50
    ) INTO v_ok;
  ELSE
    -- Quest chưa định nghĩa luật verify → mặc định không cho
    v_ok := false;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'QUEST_NOT_DONE_YET';
  END IF;

  INSERT INTO public.buddy_daily_progress (circle_id, user_id, quest_id, utc_date)
  VALUES (_circle_id, v_me, _quest_id, v_today)
  ON CONFLICT (circle_id, user_id, quest_id, utc_date) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_just_completed := v_inserted > 0;

  SELECT count(*) INTO v_done_today FROM public.buddy_daily_progress
    WHERE circle_id=_circle_id AND user_id=v_me AND utc_date=v_today;
  SELECT count(*) INTO v_total_quests FROM public.buddy_daily_quests;
  v_all_done := v_done_today >= v_total_quests;

  IF v_just_completed AND v_all_done THEN
    PERFORM public.apply_pet_xp_grant(v_me, COALESCE(v_quest.xp_reward,30) * v_total_quests, 'buddy_circle');
    IF v_quest.mood_boost THEN
      UPDATE public.pet_states SET mood='happy', last_interaction_at=now()
        WHERE user_id=v_me AND mood IN ('sad','hungry','sleepy','calm');
    END IF;
    INSERT INTO public.notifications(user_id, type, metadata)
    VALUES (v_me, 'buddy_quest_complete',
            jsonb_build_object(
              'circle_id', _circle_id,
              'date', v_today,
              'title', 'Hôm nay nhóm bạn cùng toả sáng',
              'message', 'Bạn vừa hoàn thành đủ 3 nhiệm vụ Đôi bạn cùng tiến hôm nay. +XP Lumi & năng lượng.'
            ));
  END IF;

  RETURN jsonb_build_object(
    'just_completed', v_just_completed,
    'done_today', v_done_today,
    'total_quests', v_total_quests,
    'all_done_today', v_all_done
  );
END; $$;