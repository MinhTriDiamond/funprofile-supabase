-- 1. profiles: hide moderation columns from regular users
REVOKE SELECT (admin_notes, ban_reason, fraud_risk_level, wallet_risk_status, fraud_trusted) ON public.profiles FROM authenticated;
REVOKE SELECT (admin_notes, ban_reason, fraud_risk_level, wallet_risk_status, fraud_trusted) ON public.profiles FROM anon;

CREATE OR REPLACE VIEW public.my_profile_moderation AS
SELECT id, username, full_name, avatar_url, cover_url, display_name, reward_status,
       admin_notes, ban_reason, fraud_risk_level, wallet_risk_status, fraud_trusted,
       claim_freeze_until, last_wallet_change_at, wallet_change_count_30d,
       created_at, btc_address, social_links
FROM public.profiles
WHERE id = auth.uid();

CREATE OR REPLACE VIEW public.admin_profiles_moderation AS
SELECT id, username, full_name, avatar_url, wallet_address, admin_notes, ban_reason,
       banned_at, pending_reward, reward_status, fraud_risk_level, wallet_risk_status,
       fraud_trusted, is_banned, is_restricted
FROM public.profiles
WHERE public.has_role(auth.uid(), 'admin'::app_role);

GRANT SELECT ON public.my_profile_moderation TO authenticated;
GRANT SELECT ON public.admin_profiles_moderation TO authenticated;

-- 2. chat_settings: remove blanket read of everyone's settings
DROP POLICY IF EXISTS "Users can view others' message permissions" ON public.chat_settings;

CREATE OR REPLACE FUNCTION public.get_who_can_message(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT who_can_message FROM public.chat_settings WHERE user_id = p_user_id),
    'everyone'
  )
  WHERE auth.uid() IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_who_can_message(uuid) TO authenticated;

-- 3. pplp_mint_requests: only service role may insert
DROP POLICY IF EXISTS "Service role can insert mint requests" ON public.pplp_mint_requests;
CREATE POLICY "Service role can insert mint requests"
ON public.pplp_mint_requests
FOR INSERT
WITH CHECK (auth.role() = 'service_role');