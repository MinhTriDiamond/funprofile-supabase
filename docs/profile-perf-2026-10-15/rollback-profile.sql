-- Rollback go profile-perf-2026-10-15:
-- 1) Tra ham get_user_honor_stats ve dinh nghia goc: chay file rollback-honor-original.sql.
-- 2) Bo cron + bang cache vinh danh:
SELECT cron.unschedule('honor-stats-refresh-drain');
DROP FUNCTION IF EXISTS public.drain_honor_stats_refresh_queue(integer);
DROP FUNCTION IF EXISTS public.refresh_user_honor_stats_cache(uuid);
DROP FUNCTION IF EXISTS public.get_user_honor_stats_compute(uuid);
DROP TABLE IF EXISTS public.user_honor_stats_refresh_queue;
DROP TABLE IF EXISTS public.user_honor_stats_cache;
-- 3) Bo index nhanh qua tang:
DROP INDEX CONCURRENTLY IF EXISTS public.idx_posts_gift_sender_created;
