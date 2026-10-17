DO $$
DECLARE v int; r text;
BEGIN
  -- helper unit tests
  r := public.usernames_similar('angeldieugnoc', 'angeldieungoc');
  IF r IS DISTINCT FROM 'skeleton' THEN RAISE EXCEPTION 'FAIL skeleton: %', r; END IF;
  r := public.usernames_similar('angel.su.nguyen', 'angelsunguyen');
  IF r IS DISTINCT FROM 'normalized' THEN RAISE EXCEPTION 'FAIL normalized: %', r; END IF;
  r := public.usernames_similar('cuong', 'huong');
  IF r IS DISTINCT FROM 'edit1' THEN RAISE EXCEPTION 'FAIL edit1: %', r; END IF;
  r := public.usernames_similar('angeldieungoc', 'leminhtri');
  IF r IS NOT NULL THEN RAISE EXCEPTION 'FAIL null-case: %', r; END IF;
  RAISE NOTICE 'HELPER TESTS PASSED';
  -- broadcast test on the proven fake pair (rolled back below)
  v := public.broadcast_username_similarity_alert(
    '360d15b2-fccb-4a24-811a-6c36cc902175',
    'edb32940-ead0-4c24-a514-cf781d35414e',
    'skeleton', 'test');
  RAISE NOTICE 'broadcast inserted % notifications', v;
  IF v < 1600 THEN RAISE EXCEPTION 'FAIL broadcast count %', v; END IF;
  -- replay must be a no-op
  v := public.broadcast_username_similarity_alert(
    '360d15b2-fccb-4a24-811a-6c36cc902175',
    'edb32940-ead0-4c24-a514-cf781d35414e',
    'skeleton', 'test');
  IF v <> 0 THEN RAISE EXCEPTION 'FAIL replay inserted %', v; END IF;
  RAISE NOTICE 'BROADCAST + REPLAY TESTS PASSED';
  RAISE EXCEPTION 'test-rollback';
END $$;
