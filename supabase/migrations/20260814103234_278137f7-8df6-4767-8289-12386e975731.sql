-- Batch 2 · Mục 2: REVOKE 18 function nhóm B read-only/internal (PUBLIC + anon + authenticated)
-- Loại trừ: get_global_gift_breakdown, get_global_wallet_flow_breakdown, resolve_live_session_route_id (FE gọi thật)
-- Loại trừ: is_buddy_member, is_conversation_admin, is_conversation_participant, is_gov_attester, is_org_admin (RLS policy dùng)

REVOKE ALL ON FUNCTION public._unified_profile_lite(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._unified_tx_can_view(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.end_livestream(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fun_profile_get_outbox_event_flags() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_content_slug(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.generate_post_slug(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_daily_signups_vn(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_live_recording_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_member_reward_breakdown() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_did() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_unified_light_score(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_light_score(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_block_between(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pet_battle_compute_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pplp_v25_dashboard_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_active_live_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_all_active_live_states() FROM PUBLIC, anon, authenticated;

-- Giữ đường service-role (cron + edge function)
GRANT EXECUTE ON FUNCTION public._unified_profile_lite(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._unified_tx_can_view(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.end_livestream(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fun_profile_get_outbox_event_flags() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_content_slug(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_post_slug(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_signups_vn(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_live_recording_context(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_member_reward_breakdown() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_did() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_unified_light_score(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_light_score(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_block_between(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pet_battle_compute_stats(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pplp_v25_dashboard_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_active_live_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_all_active_live_states() TO service_role;