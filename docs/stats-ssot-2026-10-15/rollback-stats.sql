-- Rollback tong the stats-ssot-2026-10-15:
-- 1) Khoi phuc dinh nghia goc cua cac ham tu cac file defs/ tuong ung:
--    get_benefactor_leaderboard, get_recipient_leaderboard, get_token_leaderboard,
--    get_donation_global_stats, get_app_stats(p_prices), get_my_rewards,
--    get_user_rewards_v2, get_user_rewards_v2_single, get_light_community,
--    refresh_app_stats_cache, refresh_gift_breakdown_cache, refresh_user_honor_stats_cache,
--    get_user_honor_stats (ban goc truoc lop cache nam o profile-perf-2026-10-15/rollback-honor-original.sql).
-- 2) Do cac job + bang moi:
SELECT cron.unschedule('donation-board-base-refresh');
SELECT cron.unschedule('honor-stats-stale-refresh');
SELECT cron.unschedule('user-light-totals-refresh');
DROP TABLE IF EXISTS public.donation_board_base;
DROP TABLE IF EXISTS public.user_light_totals;
DROP FUNCTION IF EXISTS public.refresh_donation_board_base();
DROP FUNCTION IF EXISTS public.refresh_user_light_totals();
DROP FUNCTION IF EXISTS public.refresh_stalest_honor_stats(integer);
-- user_honor_stats_cache giu lai (lop cache vinh danh da dung tu van de trang profile).
