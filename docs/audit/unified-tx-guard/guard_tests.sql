-- Guard tests cho v_unified_transactions_primary
-- Chay: psql "$DATABASE_URL" -f docs/audit/unified-tx-guard/guard_tests.sql
-- Moi dong phai tra PASS.

\pset pager off

-- G1: khong lot dong spam (donations.filter_status = 'filtered_spam')
SELECT 'G1 spam_filtered' AS test,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL (' || count(*) || ')' END AS result
FROM public.v_unified_transactions_primary WHERE is_spam IS TRUE;

-- G2: dedup - moi (user_id, tx_hash, direction) chi 1 dong
SELECT 'G2 dedup_unique' AS test,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL (' || count(*) || ')' END AS result
FROM (
  SELECT user_id, lower(tx_hash) AS h, direction, count(*) c
  FROM public.v_unified_transactions_primary
  WHERE tx_hash IS NOT NULL
  GROUP BY 1,2,3 HAVING count(*) > 1
) x;

-- G3: token rac (is_junk_token = true) bi loai khoi view
SELECT 'G3 junk_token_filtered' AS test,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL (' || count(*) || ')' END AS result
FROM public.v_unified_transactions_primary p
JOIN public.transactions t ON t.id::text = p.source_id
WHERE p.source_table = 'transactions' AND t.is_junk_token IS TRUE;

-- G4: dong khong bi gan co van hien binh thuong (control cho G3)
SELECT 'G4 junk_control_present' AS test,
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM public.v_unified_transactions_primary p
JOIN public.transactions t ON t.id::text = p.source_id
WHERE p.source_table = 'transactions' AND t.is_junk_token IS FALSE;

-- G5: khong con raw-wei lo lieu (amount_decimal cuc lon voi token co gia)
SELECT 'G5 no_raw_wei_outlier' AS test,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL (' || count(*) || ')' END AS result
FROM public.v_unified_transactions_primary
WHERE token_symbol IN ('USDT','BNB','BTC') AND amount_decimal > 1000000;
