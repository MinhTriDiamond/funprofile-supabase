
-- ============== ENUMS ==============
DO $$ BEGIN
  CREATE TYPE quest_frequency AS ENUM ('daily','weekly','once','per_event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============== TABLES ==============
CREATE TABLE IF NOT EXISTS public.quest_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title_vi TEXT NOT NULL,
  title_en TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  ls_base NUMERIC NOT NULL DEFAULT 0,
  target_count INTEGER NOT NULL DEFAULT 1,
  frequency quest_frequency NOT NULL DEFAULT 'daily',
  trigger_event TEXT NOT NULL,
  trigger_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  trust_tier_min trust_tier NOT NULL DEFAULT 'T1',
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quest_user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  quest_id UUID NOT NULL REFERENCES public.quest_definitions(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  progress_count INTEGER NOT NULL DEFAULT 0,
  target_count INTEGER NOT NULL DEFAULT 1,
  completed_at TIMESTAMPTZ,
  ls_awarded NUMERIC NOT NULL DEFAULT 0,
  ls_capped BOOLEAN NOT NULL DEFAULT false,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, quest_id, period_key)
);
CREATE INDEX IF NOT EXISTS idx_qup_user_period ON public.quest_user_progress(user_id, period_key);
CREATE INDEX IF NOT EXISTS idx_qup_completed ON public.quest_user_progress(user_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS public.quest_streaks (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date DATE,
  freeze_passes_remaining INTEGER NOT NULL DEFAULT 1,
  freeze_pass_refilled_at TIMESTAMPTZ,
  total_quests_completed INTEGER NOT NULL DEFAULT 0,
  total_ls_from_quests NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============== RLS ==============
ALTER TABLE public.quest_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quest_definitions_public_read" ON public.quest_definitions;
CREATE POLICY "quest_definitions_public_read" ON public.quest_definitions
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "quest_definitions_admin_write" ON public.quest_definitions;
CREATE POLICY "quest_definitions_admin_write" ON public.quest_definitions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "qup_owner_read" ON public.quest_user_progress;
CREATE POLICY "qup_owner_read" ON public.quest_user_progress
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "qstreak_owner_read" ON public.quest_streaks;
CREATE POLICY "qstreak_owner_read" ON public.quest_streaks
  FOR SELECT USING (auth.uid() = user_id);

-- updated_at triggers
DROP TRIGGER IF EXISTS quest_def_updated ON public.quest_definitions;
CREATE TRIGGER quest_def_updated BEFORE UPDATE ON public.quest_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS quest_progress_updated ON public.quest_user_progress;
CREATE TRIGGER quest_progress_updated BEFORE UPDATE ON public.quest_user_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============== HELPERS ==============
CREATE OR REPLACE FUNCTION public.quest_period_key(p_freq quest_frequency, p_now TIMESTAMPTZ DEFAULT now())
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_freq
    WHEN 'daily' THEN to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    WHEN 'weekly' THEN to_char(p_now AT TIME ZONE 'UTC', 'IYYY-"W"IW')
    WHEN 'once' THEN 'lifetime'
    WHEN 'per_event' THEN to_char(p_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')
  END
$$;

CREATE OR REPLACE FUNCTION public.quest_streak_multiplier(p_streak INTEGER)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_streak >= 30 THEN 1.25
    WHEN p_streak >= 14 THEN 1.15
    WHEN p_streak >= 7 THEN 1.10
    WHEN p_streak >= 3 THEN 1.05
    ELSE 1.00
  END::numeric
$$;

-- ============== MAIN RPC ==============
CREATE OR REPLACE FUNCTION public.quest_record_progress(
  p_user_id UUID,
  p_quest_code TEXT,
  p_increment INTEGER DEFAULT 1,
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
  v_last_active DATE;
BEGIN
  SELECT * INTO v_quest FROM quest_definitions WHERE code = p_quest_code AND is_active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'quest_not_found');
  END IF;

  v_period := quest_period_key(v_quest.frequency);

  -- Trust tier lookup
  SELECT did_id INTO v_did FROM did_registry WHERE owner_user_id = p_user_id LIMIT 1;
  IF v_did IS NOT NULL THEN
    SELECT trust_tier INTO v_tier FROM trust_profile WHERE did_id = v_did;
  END IF;

  -- Upsert progress
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

  UPDATE quest_user_progress
  SET progress_count = LEAST(v_progress.progress_count + p_increment, v_quest.target_count),
      evidence = quest_user_progress.evidence || COALESCE(p_evidence, '{}'::jsonb)
  WHERE id = v_progress.id
  RETURNING * INTO v_progress;

  IF v_progress.progress_count >= v_quest.target_count THEN
    v_just_completed := true;

    -- Trust gate: tier below min => complete but 0 LS
    IF v_tier IS NULL OR v_tier < v_quest.trust_tier_min THEN
      v_ls_awarded := 0;
      v_capped := true;
    ELSE
      SELECT current_streak INTO v_streak FROM quest_streaks WHERE user_id = p_user_id;
      v_streak := COALESCE(v_streak, 0);
      v_multiplier := quest_streak_multiplier(v_streak);
      v_ls_raw := v_quest.ls_base * v_multiplier;

      -- Cap: 25% of 7d-avg LS or 200, whichever smaller; first compute today's quest LS sum
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

    -- Record light action (only if positive)
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

    -- Update streak: only bump if first completion today
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
    'progress', v_progress.progress_count,
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

GRANT EXECUTE ON FUNCTION public.quest_record_progress(UUID, TEXT, INTEGER, JSONB) TO authenticated, service_role;

-- ============== Notification CHECK constraint ==============
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'like','love','care','wow','haha','pray','sad','angry',
  'comment','comment_like','comment_reply','share',
  'friend_request','friend_accept','friend_accepted','friend_removed',
  'reward_approved','reward_rejected','account_banned','account_unbanned',
  'donation','claim_reward','admin_shared_device','admin_email_farm',
  'admin_blacklisted_ip','admin_fraud_daily','live_started',
  'reward_adjustment','epoch_claim_ready','epoch_reset_info',
  'mint_request_rejected','live_replay_failed','live_replay_expiring',
  'live_replay_expired','live_auto_ended','live_reconnected',
  'quest_completed','streak_milestone','sbt_issued_quest'
]));

-- ============== SEED 8 QUESTS ==============
INSERT INTO public.quest_definitions (code, title_vi, title_en, description, category, ls_base, target_count, frequency, trigger_event, trigger_filter, trust_tier_min, icon, sort_order)
VALUES
  ('DAILY_INNER_WORK_POST', 'Đăng bài Sám Hối / Soi Tâm', 'Post Inner Work', 'Đăng 1 bài INNER_WORK ≥150 ký tự để chiêm nghiệm chính mình.', 'create', 30, 1, 'daily', 'post.create', '{"action_type":"INNER_WORK","min_length":150}'::jsonb, 'T1', 'BookHeart', 10),
  ('DAILY_GIFT_ANY', 'Tặng quà ít nhất 1 người', 'Gift to a friend', 'Trao tặng bất kỳ token nào cho 1 user khác.', 'giving', 40, 1, 'daily', 'donation.send', '{}'::jsonb, 'T1', 'Gift', 20),
  ('DAILY_REACT_5', 'Thả 5 cảm xúc cho bài người khác', 'React to 5 posts', 'Thể hiện sự kết nối với 5 bài viết khác nhau.', 'engage', 15, 5, 'daily', 'reaction.create', '{}'::jsonb, 'T1', 'Heart', 30),
  ('DAILY_COMMENT_3', 'Bình luận 3 bài', 'Comment on 3 posts', 'Để lại 3 bình luận tử tế cho cộng đồng.', 'engage', 15, 3, 'daily', 'comment.create', '{}'::jsonb, 'T1', 'MessageCircle', 40),
  ('WEEKLY_INVITE_FRIEND', 'Mời 1 người bạn mới', 'Invite a friend', 'Mời bạn đăng ký thành công và đạt T1 trong 7 ngày.', 'grow', 80, 1, 'weekly', 'invite.success_t1', '{}'::jsonb, 'T1', 'UserPlus', 50),
  ('ONCE_IDENTITY_ONBOARD', 'Hoàn thành Identity Onboarding', 'Finish Identity onboarding', 'Hoàn tất 4 bước trong wizard Identity.', 'identity', 50, 1, 'once', 'identity.onboarding_complete', '{}'::jsonb, 'T0', 'ShieldCheck', 60),
  ('WEEKLY_LOGIN_STREAK_7', 'Streak login 7 ngày', '7-day login streak', 'Đăng nhập đều đặn 7 ngày liên tiếp.', 'habit', 60, 7, 'weekly', 'user.daily_login', '{}'::jsonb, 'T1', 'Flame', 70),
  ('EVENT_CHANNELING_ZOOM', 'Tham gia Channeling Zoom ≥30 phút', 'Channeling Zoom ≥30min', 'Tham dự buổi Channeling đủ 30 phút.', 'channeling', 70, 1, 'per_event', 'event.attendance', '{"min_minutes":30,"event_type":"channeling"}'::jsonb, 'T1', 'Sparkles', 80)
ON CONFLICT (code) DO NOTHING;
