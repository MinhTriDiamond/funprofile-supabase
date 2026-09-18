-- 1. Mở rộng CHECK constraint thêm 2 type mint cho user
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
CHECK (type = ANY (ARRAY[
  'like','love','care','wow','haha','pray','sad','angry',
  'comment','comment_like','comment_reply','share','post_tagged',
  'friend_request','friend_accept','friend_accepted','friend_removed',
  'reward_approved','reward_rejected','account_banned','account_unbanned',
  'donation','claim_reward',
  'admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily',
  'live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info',
  'mint_request_rejected',
  'live_replay_failed','live_replay_expiring','live_replay_expired',
  'live_auto_ended','live_reconnected',
  'quest_completed','streak_milestone','sbt_issued_quest',
  'mystery_box_received','mystery_box_legendary','mystery_box_expiring','mystery_box_expired',
  'guardian_invited','guardian_accepted','guardian_declined',
  'attestation_received','did_promoted','sbt_issued','dispute_resolved','recovery_initiated',
  'pet_evolved','pet_cosmetic_received','pet_xp_granted','pet_cheer_received',
  'pet_shop_purchased','pet_shop_failed','pet_battle_challenge','pet_battle_result',
  'buddy_invite','pet_lumi_ready',
  'treasury_low_gas','treasury_low_camly','treasury_ledger_drift',
  'live_recording_missed','live_recording_failed',
  -- NEW: thông báo mint cho user
  'fun_mint_signed','fun_mint_confirmed'
]));

-- 2. Trigger function: noti khi mint signed / confirmed
CREATE OR REPLACE FUNCTION public.pplp_mint_notify_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_is_child boolean;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_action := COALESCE(NEW.action_name, '');
  v_is_child := NEW.parent_request_id IS NOT NULL;

  -- signed
  IF NEW.status = 'signed'
     AND COALESCE(OLD.status,'') IN ('pending_sig','signing')
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications
       WHERE user_id = NEW.user_id
         AND type = 'fun_mint_signed'
         AND (metadata->>'request_id') = NEW.id::text
     )
  THEN
    INSERT INTO public.notifications (user_id, actor_id, type, read, metadata)
    VALUES (
      NEW.user_id, NEW.user_id, 'fun_mint_signed', false,
      jsonb_build_object(
        'request_id', NEW.id::text,
        'amount', NEW.amount_display,
        'action', v_action,
        'is_split_child', v_is_child
      )
    );
  END IF;

  -- confirmed
  IF NEW.status = 'confirmed'
     AND COALESCE(OLD.status,'') <> 'confirmed'
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications
       WHERE user_id = NEW.user_id
         AND type = 'fun_mint_confirmed'
         AND (metadata->>'request_id') = NEW.id::text
     )
  THEN
    INSERT INTO public.notifications (user_id, actor_id, type, read, metadata)
    VALUES (
      NEW.user_id, NEW.user_id, 'fun_mint_confirmed', false,
      jsonb_build_object(
        'request_id', NEW.id::text,
        'amount', NEW.amount_display,
        'action', v_action,
        'tx_hash', NEW.tx_hash,
        'is_split_child', v_is_child
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pplp_mint_notify_user_trigger ON public.pplp_mint_requests;
CREATE TRIGGER pplp_mint_notify_user_trigger
AFTER UPDATE OF status ON public.pplp_mint_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.pplp_mint_notify_user();