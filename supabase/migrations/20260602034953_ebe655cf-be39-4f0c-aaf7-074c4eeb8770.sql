ALTER VIEW public.pet_arena_public SET (security_invoker = on);

ALTER FUNCTION public.check_post_rate_limit() SET search_path = public;
ALTER FUNCTION public.get_content_stats_grouped_vn(p_type text, p_mode text, p_limit integer, p_offset integer) SET search_path = public;
ALTER FUNCTION public.get_signups_by_date_vn(p_date text) SET search_path = public;
ALTER FUNCTION public.get_signups_by_range_vn(p_start_date text, p_end_date text) SET search_path = public;
ALTER FUNCTION public.get_signups_grouped_vn(p_mode text, p_limit integer, p_offset integer) SET search_path = public;
ALTER FUNCTION public.get_user_posts_by_period_vn(p_user_id uuid, p_type text, p_date text, p_mode text, p_date_from text, p_date_to text) SET search_path = public;
ALTER FUNCTION public.pet_level_for_xp(_xp integer) SET search_path = public;
ALTER FUNCTION public.pet_stage_for_xp(_xp integer) SET search_path = public;
ALTER FUNCTION public.quest_period_key(p_freq quest_frequency, p_now timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.quest_streak_multiplier(p_streak integer) SET search_path = public;

CREATE POLICY "Deny all client access" ON public.email_verification_tokens
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);

CREATE POLICY "Deny all client access" ON public.identity_verification_events
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);