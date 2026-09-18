
-- =============================================================
-- BUDDY CIRCLE "Đôi bạn cùng tiến" v1
-- =============================================================

-- 1) Tables ----------------------------------------------------
CREATE TABLE public.buddy_circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 60),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_members int NOT NULL DEFAULT 2 CHECK (max_members BETWEEN 2 AND 10),
  invite_code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_buddy_circles_owner ON public.buddy_circles(owner_id) WHERE status='active';
CREATE INDEX idx_buddy_circles_invite_code ON public.buddy_circles(invite_code);

CREATE TABLE public.buddy_members (
  circle_id uuid NOT NULL REFERENCES public.buddy_circles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);
CREATE INDEX idx_buddy_members_user ON public.buddy_members(user_id);

CREATE TABLE public.buddy_daily_quests (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  xp_reward int NOT NULL DEFAULT 30,
  mood_boost boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.buddy_daily_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id uuid NOT NULL REFERENCES public.buddy_circles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quest_id text NOT NULL REFERENCES public.buddy_daily_quests(id),
  utc_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  completed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (circle_id, user_id, quest_id, utc_date)
);
CREATE INDEX idx_buddy_progress_circle_date ON public.buddy_daily_progress(circle_id, utc_date);

-- 2) Seed 3 nhiệm vụ ------------------------------------------
INSERT INTO public.buddy_daily_quests (id, title, description, xp_reward, display_order) VALUES
  ('gratitude_to_buddy', 'Gửi lời biết ơn tới bạn cùng tiến', 'Đăng một dòng biết ơn dành cho người bạn cùng tiến của mình (≥ 50 ký tự), có thể tag tên bạn.', 30, 1),
  ('cheer_buddy', 'Vỗ tay cho Lumi của bạn cùng tiến', 'Mở trang Lumi của một thành viên cùng nhóm và bấm vỗ tay tiếp năng lượng cho bạn ấy.', 30, 2),
  ('inner_work_share', 'Chia sẻ 1 khoảnh khắc tỉnh thức', 'Viết một dòng ngắn về biết ơn / sám hối / phụng sự / giúp đỡ / trao tặng trong ngày (≥ 50 ký tự).', 30, 3)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description;

-- 3) Helper: có phải member của circle? -----------------------
CREATE OR REPLACE FUNCTION public.is_buddy_member(_circle_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.buddy_members WHERE circle_id=_circle_id AND user_id=_user_id);
$$;

-- 4) RLS -------------------------------------------------------
ALTER TABLE public.buddy_circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_daily_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buddy_daily_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their circles" ON public.buddy_circles FOR SELECT
  USING (public.is_buddy_member(id, auth.uid()));
CREATE POLICY "Owner can update circle" ON public.buddy_circles FOR UPDATE
  USING (owner_id = auth.uid());
CREATE POLICY "Owner can delete circle" ON public.buddy_circles FOR DELETE
  USING (owner_id = auth.uid());

CREATE POLICY "Members can view roster" ON public.buddy_members FOR SELECT
  USING (public.is_buddy_member(circle_id, auth.uid()));
CREATE POLICY "Self leave" ON public.buddy_members FOR DELETE
  USING (user_id = auth.uid());

CREATE POLICY "Public read quests" ON public.buddy_daily_quests FOR SELECT USING (true);

CREATE POLICY "Members view progress" ON public.buddy_daily_progress FOR SELECT
  USING (public.is_buddy_member(circle_id, auth.uid()));

-- 5) RPCs ------------------------------------------------------

-- Tạo circle (đồng thời insert owner vào member)
CREATE OR REPLACE FUNCTION public.buddy_circle_create(_name text, _max_members int)
RETURNS public.buddy_circles
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_code text;
  v_row public.buddy_circles;
  v_active int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF _max_members NOT BETWEEN 2 AND 10 THEN RAISE EXCEPTION 'INVALID_SIZE'; END IF;
  IF length(trim(coalesce(_name,''))) < 2 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;

  SELECT count(*) INTO v_active FROM public.buddy_circles
    WHERE owner_id=v_me AND status='active';
  IF v_active >= 3 THEN RAISE EXCEPTION 'TOO_MANY_CIRCLES'; END IF;

  -- Sinh invite_code 8 ký tự không trùng (thử tối đa 5 lần)
  FOR i IN 1..5 LOOP
    v_code := upper(substring(replace(encode(gen_random_bytes(8),'base64'),'/','A') from 1 for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.buddy_circles WHERE invite_code=v_code);
  END LOOP;

  INSERT INTO public.buddy_circles (name, owner_id, max_members, invite_code)
  VALUES (trim(_name), v_me, _max_members, v_code)
  RETURNING * INTO v_row;

  INSERT INTO public.buddy_members(circle_id, user_id, role)
  VALUES (v_row.id, v_me, 'owner');

  RETURN v_row;
END; $$;

-- Tham gia bằng mã
CREATE OR REPLACE FUNCTION public.buddy_circle_join_by_code(_code text)
RETURNS public.buddy_circles
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_row public.buddy_circles;
  v_count int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_row FROM public.buddy_circles WHERE invite_code = upper(trim(_code)) AND status='active';
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'INVALID_CODE'; END IF;
  IF EXISTS (SELECT 1 FROM public.buddy_members WHERE circle_id=v_row.id AND user_id=v_me) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;
  SELECT count(*) INTO v_count FROM public.buddy_members WHERE circle_id=v_row.id;
  IF v_count >= v_row.max_members THEN RAISE EXCEPTION 'CIRCLE_FULL'; END IF;

  INSERT INTO public.buddy_members(circle_id, user_id, role) VALUES (v_row.id, v_me, 'member');

  -- Notify các thành viên hiện có
  INSERT INTO public.notifications(user_id, type, title, message, metadata)
  SELECT m.user_id, 'buddy_member_joined',
         'Có bạn mới vào nhóm Ánh Sáng',
         'Một bạn vừa tham gia nhóm "' || v_row.name || '" của bạn.',
         jsonb_build_object('circle_id', v_row.id, 'new_user_id', v_me)
  FROM public.buddy_members m WHERE m.circle_id = v_row.id AND m.user_id <> v_me;

  RETURN v_row;
END; $$;

-- Mời 1 user cụ thể vào circle (gửi notification)
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

  INSERT INTO public.notifications(user_id, type, title, message, metadata)
  VALUES (_user_id, 'buddy_invite',
          'Bạn được mời vào nhóm Ánh Sáng',
          'Bạn vừa được mời vào nhóm "' || v_circle.name || '" để cùng tiến mỗi ngày.',
          jsonb_build_object('circle_id', _circle_id, 'invite_code', v_circle.invite_code, 'inviter_id', v_me));
END; $$;

-- Rời circle (nếu owner rời và còn người -> promote sớm nhất; trống -> archive)
CREATE OR REPLACE FUNCTION public.buddy_circle_leave(_circle_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_circle public.buddy_circles;
  v_next uuid;
  v_remaining int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  SELECT * INTO v_circle FROM public.buddy_circles WHERE id=_circle_id;
  IF v_circle.id IS NULL THEN RAISE EXCEPTION 'CIRCLE_NOT_FOUND'; END IF;
  IF NOT public.is_buddy_member(_circle_id, v_me) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;

  DELETE FROM public.buddy_members WHERE circle_id=_circle_id AND user_id=v_me;
  SELECT count(*) INTO v_remaining FROM public.buddy_members WHERE circle_id=_circle_id;

  IF v_remaining = 0 THEN
    UPDATE public.buddy_circles SET status='archived', updated_at=now() WHERE id=_circle_id;
  ELSIF v_circle.owner_id = v_me THEN
    SELECT user_id INTO v_next FROM public.buddy_members
      WHERE circle_id=_circle_id ORDER BY joined_at ASC LIMIT 1;
    UPDATE public.buddy_circles SET owner_id=v_next, updated_at=now() WHERE id=_circle_id;
    UPDATE public.buddy_members SET role='owner' WHERE circle_id=_circle_id AND user_id=v_next;
  END IF;
END; $$;

-- Hoàn thành 1 quest trong ngày
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
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT public.is_buddy_member(_circle_id, v_me) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  SELECT * INTO v_quest FROM public.buddy_daily_quests WHERE id=_quest_id;
  IF v_quest.id IS NULL THEN RAISE EXCEPTION 'QUEST_NOT_FOUND'; END IF;

  INSERT INTO public.buddy_daily_progress (circle_id, user_id, quest_id, utc_date)
  VALUES (_circle_id, v_me, _quest_id, v_today)
  ON CONFLICT (circle_id, user_id, quest_id, utc_date) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_just_completed := v_inserted > 0;

  SELECT count(*) INTO v_done_today FROM public.buddy_daily_progress
    WHERE circle_id=_circle_id AND user_id=v_me AND utc_date=v_today;
  SELECT count(*) INTO v_total_quests FROM public.buddy_daily_quests;
  v_all_done := v_done_today >= v_total_quests;

  -- Trao XP + mood lần đầu tiên user hoàn thành đủ 3 trong ngày
  IF v_just_completed AND v_all_done THEN
    PERFORM public.apply_pet_xp_grant(v_me, COALESCE(v_quest.xp_reward,30) * v_total_quests, 'buddy_circle');
    IF v_quest.mood_boost THEN
      UPDATE public.pet_states SET mood='happy', last_interaction_at=now()
        WHERE user_id=v_me AND mood IN ('sad','hungry','sleepy','calm');
    END IF;
    INSERT INTO public.notifications(user_id, type, title, message, metadata)
    VALUES (v_me, 'buddy_quest_complete',
            'Hôm nay nhóm bạn cùng toả sáng',
            'Bạn vừa hoàn thành đủ 3 nhiệm vụ Đôi bạn cùng tiến hôm nay. +XP Lumi & năng lượng.',
            jsonb_build_object('circle_id', _circle_id, 'date', v_today));
  END IF;

  RETURN jsonb_build_object(
    'just_completed', v_just_completed,
    'done_today', v_done_today,
    'total_quests', v_total_quests,
    'all_done_today', v_all_done
  );
END; $$;

-- 6) Cập nhật CHECK constraint notifications.type ---------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['like','love','care','wow','haha','pray','sad','angry',
    'comment','comment_like','comment_reply','share','friend_request','friend_accept',
    'friend_accepted','friend_removed','reward_approved','reward_rejected','account_banned',
    'account_unbanned','donation','claim_reward','admin_shared_device','admin_email_farm',
    'admin_blacklisted_ip','admin_fraud_daily','live_started','reward_adjustment',
    'epoch_claim_ready','epoch_reset_info','mint_request_rejected','live_replay_failed',
    'live_replay_expiring','live_replay_expired','live_auto_ended','live_reconnected',
    'quest_completed','streak_milestone','sbt_issued_quest','mystery_box_received',
    'mystery_box_legendary','mystery_box_expiring','mystery_box_expired','guardian_invited',
    'guardian_accepted','guardian_declined','attestation_received','did_promoted','sbt_issued',
    'dispute_resolved','recovery_initiated','pet_evolved','pet_cosmetic_received',
    'pet_xp_granted','pet_cheer_received','pet_shop_purchased','pet_shop_failed',
    'pet_battle_challenge','pet_battle_result',
    'buddy_invite','buddy_member_joined','buddy_quest_complete']));

-- 7) Trigger updated_at ----------------------------------------
CREATE TRIGGER buddy_circles_updated_at BEFORE UPDATE ON public.buddy_circles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
