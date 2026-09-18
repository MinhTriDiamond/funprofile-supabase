REVOKE EXECUTE ON FUNCTION public.m6b_gap_plan_batches(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.m6b_gap_claim_next_batch() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.m6b_gap_scan_run_batch(uuid) FROM anon, authenticated;