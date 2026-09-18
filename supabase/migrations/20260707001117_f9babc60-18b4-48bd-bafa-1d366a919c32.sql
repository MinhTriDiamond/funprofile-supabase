CREATE OR REPLACE FUNCTION public.get_unified_summary(
  _scope text,
  _target_user_id uuid DEFAULT NULL::uuid,
  _direction text DEFAULT NULL::text,
  _chain text DEFAULT NULL::text,
  _token_symbol text DEFAULT NULL::text,
  _tx_type text DEFAULT NULL::text,
  _status text DEFAULT NULL::text,
  _from_ts timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _to_ts timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _search text DEFAULT NULL::text,
  _external_only boolean DEFAULT NULL::boolean,
  _counterparty_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
BEGIN
  WITH filtered AS (
    SELECT * FROM public.get_unified_transactions(
      _scope,
      _target_user_id,
      _direction,
      _chain,
      _token_symbol,
      _tx_type,
      _status,
      _from_ts,
      _to_ts,
      _search,
      5000,
      0,
      _external_only,
      _counterparty_user_id
    )
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE direction = 'in')      AS count_in,
      COUNT(*) FILTER (WHERE direction = 'out')     AS count_out,
      COUNT(*) FILTER (WHERE direction = 'unknown') AS count_unknown,
      COUNT(*) FILTER (WHERE status IN ('pending','processing')) AS count_pending,
      COUNT(*) AS count_total,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'in'),      0) AS sum_in,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'out'),     0) AS sum_out,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'unknown'), 0) AS sum_unknown
    FROM filtered
  ),
  by_token AS (
    SELECT jsonb_agg(jsonb_build_object(
      'token_symbol', token_symbol,
      'chain_id', chain_id,
      'chain', chain,
      'direction', direction,
      'count', cnt,
      'sum_amount', sum_amt
    )) AS data
    FROM (
      SELECT token_symbol, chain_id, chain, direction, COUNT(*) AS cnt, COALESCE(SUM(amount_decimal),0) AS sum_amt
      FROM filtered
      GROUP BY token_symbol, chain_id, chain, direction
    ) t
  ),
  by_chain AS (
    SELECT jsonb_agg(jsonb_build_object('chain', chain, 'direction', direction, 'count', cnt)) AS data
    FROM (SELECT chain, direction, COUNT(*) AS cnt FROM filtered GROUP BY chain, direction) t
  ),
  by_type AS (
    SELECT jsonb_agg(jsonb_build_object('tx_type', tx_type, 'count', cnt)) AS data
    FROM (SELECT tx_type, COUNT(*) AS cnt FROM filtered GROUP BY tx_type) t
  ),
  by_status AS (
    SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) AS data
    FROM (SELECT status, COUNT(*) AS cnt FROM filtered GROUP BY status) t
  )
  SELECT jsonb_build_object(
    'scope', _scope,
    'target_user_id', _target_user_id,
    'totals', jsonb_build_object(
      'count_in', t.count_in,
      'count_out', t.count_out,
      'count_unknown', t.count_unknown,
      'count_pending', t.count_pending,
      'count_total', t.count_total,
      'sum_in', t.sum_in,
      'sum_out', t.sum_out,
      'sum_unknown', t.sum_unknown,
      'net', (t.sum_in - t.sum_out)
    ),
    'by_token',  COALESCE((SELECT data FROM by_token),  '[]'::jsonb),
    'by_chain',  COALESCE((SELECT data FROM by_chain),  '[]'::jsonb),
    'by_type',   COALESCE((SELECT data FROM by_type),   '[]'::jsonb),
    'by_status', COALESCE((SELECT data FROM by_status), '[]'::jsonb)
  ) INTO _result
  FROM totals t;

  RETURN _result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_unified_summary(text, uuid, text, text, text, text, text, timestamptz, timestamptz, text, boolean, uuid)
  TO authenticated, service_role;

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
      x->>'token_symbol' AS token_symbol,
      x->>'direction' AS direction,
      (x->>'count')::numeric AS cnt,
      (x->>'sum_amount')::numeric AS sum_amount
    FROM raw, jsonb_array_elements(j->'by_token') AS x
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