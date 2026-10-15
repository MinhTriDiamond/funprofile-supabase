-- Rollback unified-perf-2026-10-15:
-- 1) Khoi phuc 5 dinh nghia goc tu defs/: get_unified_transactions.sql,
--    get_unified_summary.sql, get_unified_counterparties.sql,
--    get_unified_facets.sql, get_unified_admin_stats.sql (tro lai v_unified_transactions_primary).
-- 2) Do job + snapshot:
SELECT cron.unschedule('unified-tx-snapshot-refresh');
DROP FUNCTION IF EXISTS public.refresh_unified_transactions_snapshot();
DROP TABLE IF EXISTS public.unified_transactions_snapshot;
