CREATE OR REPLACE FUNCTION public.get_user_donation_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH raw AS (
    SELECT public.get_unified_summary('profile', p_user_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL) AS j
  ),
  by_token AS (
    SELECT
      CASE
        WHEN upper(x->>'token_symbol') = 'BNB' AND (x->>'chain_id')::int = 97 THEN 'BNB (BSC Testnet)'
        WHEN upper(x->>'token_symbol') = 'BNB' THEN 'BNB (BSC Chain)'
        ELSE x->>'token_symbol'
      END AS token_symbol,
      x->>'direction' AS direction,
      SUM((x->>'count')::numeric) AS cnt,
      SUM((x->>'sum_amount')::numeric) AS sum_amount
    FROM raw, jsonb_array_elements(j->'by_token') AS x
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'received', COALESCE((
      SELECT jsonb_object_agg(token_symbol, jsonb_build_object('amount', sum_amount, 'count', cnt))
      FROM by_token WHERE direction = 'in'
    ), '{}'::jsonb),
    'sent', COALESCE((
      SELECT jsonb_object_agg(token_symbol, jsonb_build_object('amount', sum_amount, 'count', cnt))
      FROM by_token WHERE direction = 'out'
    ), '{}'::jsonb)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.get_user_donation_summary(uuid) TO authenticated, service_role;