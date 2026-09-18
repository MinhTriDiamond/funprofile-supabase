-- 1. Trigger function: auto-create pet for new user
CREATE OR REPLACE FUNCTION public.create_pet_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pet_states (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_pet_for_new_user ON public.profiles;
CREATE TRIGGER trg_create_pet_for_new_user
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_pet_for_new_user();

-- 2. Thêm pet_lumi_ready vào notification type
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
CHECK (type = ANY (ARRAY[
  'like','love','care','wow','haha','pray','sad','angry','comment','comment_like','comment_reply',
  'share','friend_request','friend_accept','friend_accepted','friend_removed','reward_approved',
  'reward_rejected','account_banned','account_unbanned','donation','claim_reward',
  'admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily',
  'live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info','mint_request_rejected',
  'live_replay_failed','live_replay_expiring','live_replay_expired','live_auto_ended','live_reconnected',
  'quest_completed','streak_milestone','sbt_issued_quest','mystery_box_received','mystery_box_legendary',
  'mystery_box_expiring','mystery_box_expired','guardian_invited','guardian_accepted','guardian_declined',
  'attestation_received','did_promoted','sbt_issued','dispute_resolved','recovery_initiated',
  'pet_evolved','pet_cosmetic_received','pet_xp_granted','pet_cheer_received',
  'pet_shop_purchased','pet_shop_failed','pet_battle_challenge','pet_battle_result',
  'buddy_invite','buddy_member_joined','buddy_quest_complete','pet_lumi_ready'
]));

-- 3. Backfill: tạo Lumi cho mọi profile chưa có
WITH backfilled AS (
  INSERT INTO public.pet_states (user_id)
  SELECT p.id
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.pet_states ps WHERE ps.user_id = p.id)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id
)
-- 4. Gửi thông báo "Lumi của bạn đã sẵn sàng" cho mọi user vừa backfill
INSERT INTO public.notifications (user_id, actor_id, type, metadata, read, created_at)
SELECT
  b.user_id,
  b.user_id,
  'pet_lumi_ready',
  jsonb_build_object(
    'title', '🐣 Lumi của bạn đã sẵn sàng',
    'message', 'Gia đình FUN vừa tặng bạn một Lumi (linh thú đồng hành ánh sáng) hoàn toàn miễn phí. Vào /pet để đặt tên, cho ăn và bắt đầu hành trình cùng nhau nhé!',
    'cta_url', '/pet',
    'cta_text', 'Đón Lumi của bạn'
  ),
  false,
  now()
FROM backfilled b;