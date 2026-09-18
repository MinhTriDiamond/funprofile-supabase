
-- Impersonation Protection v1
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Add columns to profiles for avatar fingerprint cache
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_phash text,
  ADD COLUMN IF NOT EXISTS impersonation_scanned_at timestamptz;

-- 2. Trigram index on name (computed expression)
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm
  ON public.profiles
  USING gin (lower(coalesce(display_name, full_name, username)) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_avatar_phash
  ON public.profiles (avatar_phash) WHERE avatar_phash IS NOT NULL;

-- 3. Alerts table
CREATE TABLE IF NOT EXISTS public.impersonation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  victim_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  suspect_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name_similarity numeric(5,2) NOT NULL DEFAULT 0,
  avatar_similarity numeric(5,2) NOT NULL DEFAULT 0,
  overall_score numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','victim_confirmed_impersonator','victim_confirmed_self','dismissed_by_admin','auto_resolved')),
  victim_response_at timestamptz,
  admin_action text,
  admin_id uuid,
  admin_note text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT impersonation_alerts_unique UNIQUE (victim_user_id, suspect_user_id),
  CONSTRAINT impersonation_alerts_not_self CHECK (victim_user_id <> suspect_user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.impersonation_alerts TO authenticated;
GRANT ALL ON public.impersonation_alerts TO service_role;

ALTER TABLE public.impersonation_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Victim can view own alerts"
  ON public.impersonation_alerts FOR SELECT
  TO authenticated
  USING (victim_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Victim can update own alerts"
  ON public.impersonation_alerts FOR UPDATE
  TO authenticated
  USING (victim_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (victim_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admin manages all"
  ON public.impersonation_alerts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX IF NOT EXISTS idx_impersonation_alerts_victim ON public.impersonation_alerts(victim_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_alerts_suspect ON public.impersonation_alerts(suspect_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_alerts_status ON public.impersonation_alerts(status, created_at DESC);

-- 4. updated_at trigger
CREATE TRIGGER trg_impersonation_alerts_updated_at
  BEFORE UPDATE ON public.impersonation_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Add new notification type to constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'like','love','care','wow','haha','pray','sad','angry','comment','comment_like','comment_reply','share','post_tagged',
  'friend_request','friend_accept','friend_accepted','friend_removed','reward_approved','reward_rejected',
  'account_banned','account_unbanned','donation','claim_reward','admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily',
  'live_started','reward_adjustment','epoch_claim_ready','epoch_reset_info','mint_request_rejected',
  'live_replay_failed','live_replay_expiring','live_replay_expired','live_auto_ended','live_reconnected',
  'quest_completed','streak_milestone','sbt_issued_quest',
  'mystery_box_received','mystery_box_legendary','mystery_box_expiring','mystery_box_expired',
  'guardian_invited','guardian_accepted','guardian_declined','attestation_received','did_promoted','sbt_issued','dispute_resolved','recovery_initiated',
  'pet_evolved','pet_cosmetic_received','pet_xp_granted','pet_cheer_received','pet_shop_purchased','pet_shop_failed','pet_battle_challenge','pet_battle_result',
  'buddy_invite','pet_lumi_ready','treasury_low_gas','treasury_low_camly','treasury_ledger_drift',
  'live_recording_missed','live_recording_failed','fun_mint_signed','fun_mint_confirmed',
  'impersonation_alert','impersonation_confirmed','impersonation_dismissed'
]));

-- 6. Trigger: scan new profiles
CREATE OR REPLACE FUNCTION public.trg_profile_impersonation_scan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- Only on INSERT (and avoid system / bot accounts without username)
  IF NEW.username IS NULL OR NEW.is_banned THEN
    RETURN NEW;
  END IF;
  v_url := current_setting('app.supabase_url', true);
  v_key := current_setting('app.service_role_key', true);
  IF v_url IS NULL OR v_url = '' THEN
    -- Settings not configured; skip silently. Backfill can re-scan.
    RETURN NEW;
  END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/identity-impersonation-scan',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || v_key
    ),
    body := jsonb_build_object('profile_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_impersonation_scan ON public.profiles;
CREATE TRIGGER trg_profiles_impersonation_scan
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profile_impersonation_scan();

-- Also re-scan on avatar/name change after onboarding completes
CREATE OR REPLACE FUNCTION public.trg_profile_impersonation_rescan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  IF (NEW.avatar_url IS DISTINCT FROM OLD.avatar_url)
     OR (coalesce(NEW.display_name, NEW.full_name, NEW.username)
         IS DISTINCT FROM coalesce(OLD.display_name, OLD.full_name, OLD.username)) THEN
    v_url := current_setting('app.supabase_url', true);
    v_key := current_setting('app.service_role_key', true);
    IF v_url IS NULL OR v_url = '' THEN RETURN NEW; END IF;
    PERFORM net.http_post(
      url := v_url || '/functions/v1/identity-impersonation-scan',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || v_key
      ),
      body := jsonb_build_object('profile_id', NEW.id, 'reason','profile_changed')
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_impersonation_rescan ON public.profiles;
CREATE TRIGGER trg_profiles_impersonation_rescan
  AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profile_impersonation_rescan();
