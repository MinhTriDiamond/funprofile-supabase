
-- =====================================================================
-- Phase 7A + 7C: Summary khớp list + Facets nhẹ cho dropdown
-- =====================================================================

DROP FUNCTION IF EXISTS public.get_unified_summary(text, uuid, timestamptz, timestamptz, text, text);

CREATE OR REPLACE FUNCTION public.get_unified_summary(
  _scope text,
  _target_user_id uuid DEFAULT NULL,
  _direction text DEFAULT NULL,
  _chain text DEFAULT NULL,
  _token_symbol text DEFAULT NULL,
  _tx_type text DEFAULT NULL,
  _status text DEFAULT NULL,
  _from_ts timestamptz DEFAULT NULL,
  _to_ts timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
  _external_only boolean DEFAULT NULL,
  _counterparty_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _effective uuid;
  _is_global boolean := false;
  _public_only boolean := false;
  _s          text := NULLIF(trim(COALESCE(_search, '')), '');
  _s_low      text := lower(COALESCE(_s, ''));
  _s_norm     text := CASE WHEN _s_low LIKE '0x%' THEN substr(_s_low, 3) ELSE _s_low END;
  _s_len      int  := COALESCE(length(_s_norm), 0);
  _s_pat      text := '%' || _s_low  || '%';
  _n_pat      text := '%' || _s_norm || '%';
  _n_prefix   text := _s_norm || '%';
  _is_alnum   boolean := _s_norm ~ '^[a-z0-9]+$';
  _is_hex     boolean := _s_norm ~ '^[0-9a-f]+$';
  _is_txhash  boolean := _is_hex AND _s_len = 64;
  _is_evm_full   boolean := _is_hex AND _s_len = 40;
  _is_evm_suffix boolean := _is_hex AND _s_len BETWEEN 8 AND 39;
  _can_expand_evm boolean := (_is_evm_full OR _is_evm_suffix) AND NOT _is_txhash;
  _addr_ok    boolean := _s_len >= 6;
  _addr_prefix boolean := _s_len >= 4;
  _uids       uuid[]  := NULL;
  _keys       text[]  := NULL;
  _cw_uids    uuid[]  := NULL;
  _statuses text[] := CASE
    WHEN _status IS NULL OR _status = 'all' THEN NULL
    WHEN _status IN ('success','confirmed','completed') THEN ARRAY['success','confirmed','completed']
    WHEN _status IN ('pending','processing') THEN ARRAY['pending','processing']
    WHEN _status = 'failed' THEN ARRAY['failed']
    ELSE ARRAY[_status]
  END;
  _result jsonb;
BEGIN
  IF _caller IS NOT NULL THEN _is_admin := public.has_role(_caller, 'admin'); END IF;
  IF _scope IS NULL OR _scope NOT IN ('self','profile','global') THEN
    RAISE EXCEPTION 'INVALID_SCOPE' USING ERRCODE = '22023';
  END IF;
  IF _scope = 'self' THEN
    IF _caller IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
    _effective := _caller;
  ELSIF _scope = 'profile' THEN
    IF _target_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE = '22023'; END IF;
    _effective := _target_user_id;
    _public_only := NOT (_is_admin OR _caller = _target_user_id);
  ELSE
    _is_global := true;
  END IF;

  -- ROUND 7: EVM wallet expansion (unique only).
  IF _s IS NOT NULL AND _can_expand_evm THEN
    SELECT array_agg(uid) INTO _cw_uids FROM (
      SELECT p.id AS uid FROM public.profiles p
      WHERE
        (_is_evm_full AND (
            lower(p.public_wallet_address)    = '0x' || _s_norm
         OR lower(p.custodial_wallet_address) = '0x' || _s_norm
         OR lower(p.external_wallet_address)  = '0x' || _s_norm))
        OR
        (_is_evm_suffix AND (
            lower(p.public_wallet_address)    LIKE '%' || _s_norm
         OR lower(p.custodial_wallet_address) LIKE '%' || _s_norm
         OR lower(p.external_wallet_address)  LIKE '%' || _s_norm))
    ) q;
    IF _cw_uids IS NULL OR array_length(_cw_uids, 1) <> 1 THEN
      _cw_uids := NULL;
    END IF;
  END IF;

  IF _s IS NOT NULL THEN
    WITH
    cu AS (
      SELECT p.id AS uid FROM public.profiles p
      WHERE p.username ILIKE _s_pat OR p.display_name ILIKE _s_pat OR p.full_name ILIKE _s_pat
    ),
    ck AS (
      SELECT d.sender_id AS uid, 'donations'::text AS st, d.id::text AS sid FROM public.donations d
      WHERE d.sender_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(d.tx_hash) LIKE _n_pat OR lower(d.sender_address) LIKE _n_pat OR lower(d.recipient_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(d.tx_hash) LIKE _n_prefix OR lower(d.sender_address) LIKE _n_prefix OR lower(d.recipient_address) LIKE _n_prefix))
        ))
        OR d.message ILIKE _s_pat OR upper(d.token_symbol) = upper(_s)
      )
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE d.recipient_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(d.tx_hash) LIKE _n_pat OR lower(d.sender_address) LIKE _n_pat OR lower(d.recipient_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(d.tx_hash) LIKE _n_prefix OR lower(d.sender_address) LIKE _n_prefix OR lower(d.recipient_address) LIKE _n_prefix))
        ))
        OR d.message ILIKE _s_pat OR upper(d.token_symbol) = upper(_s)
      )
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE w.user_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(w.tx_hash) LIKE _n_pat OR lower(w.counterparty_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(w.tx_hash) LIKE _n_prefix OR lower(w.counterparty_address) LIKE _n_prefix))
        ))
        OR upper(w.token_symbol) = upper(_s)
      )
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE t.user_id IS NOT NULL AND (
        (_is_alnum AND (
          (_addr_ok AND (lower(t.tx_hash) LIKE _n_pat OR lower(t.from_address) LIKE _n_pat OR lower(t.to_address) LIKE _n_pat))
          OR (NOT _addr_ok AND _addr_prefix AND (lower(t.tx_hash) LIKE _n_prefix OR lower(t.from_address) LIKE _n_prefix OR lower(t.to_address) LIKE _n_prefix))
        ))
        OR upper(t.token_symbol) = upper(_s)
      )
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE s.user_id IS NOT NULL AND _is_alnum AND (
        (_addr_ok AND lower(s.tx_hash) LIKE _n_pat)
        OR (NOT _addr_ok AND _addr_prefix AND lower(s.tx_hash) LIKE _n_prefix)
      )
      UNION
      SELECT d.sender_id, 'donations', d.id::text FROM public.donations d
      WHERE d.sender_id IS NOT NULL
        AND (d.sender_id IN (SELECT uid FROM cu) OR d.recipient_id IN (SELECT uid FROM cu))
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE d.recipient_id IS NOT NULL
        AND (d.sender_id IN (SELECT uid FROM cu) OR d.recipient_id IN (SELECT uid FROM cu))
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE w.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE t.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE s.user_id IN (SELECT uid FROM cu)
      UNION
      SELECT d.sender_id, 'donations', d.id::text FROM public.donations d
      WHERE _cw_uids IS NOT NULL AND d.sender_id IS NOT NULL
        AND d.chain_id IN (1,56,97)
        AND (d.sender_id = ANY(_cw_uids) OR d.recipient_id = ANY(_cw_uids))
      UNION
      SELECT d.recipient_id, 'donations', d.id::text FROM public.donations d
      WHERE _cw_uids IS NOT NULL AND d.recipient_id IS NOT NULL
        AND d.chain_id IN (1,56,97)
        AND (d.sender_id = ANY(_cw_uids) OR d.recipient_id = ANY(_cw_uids))
      UNION
      SELECT w.user_id, 'wallet_transfers', w.id::text FROM public.wallet_transfers w
      WHERE _cw_uids IS NOT NULL AND w.user_id = ANY(_cw_uids) AND w.chain_id IN (1,56,97)
      UNION
      SELECT t.user_id, 'transactions', t.id::text FROM public.transactions t
      WHERE _cw_uids IS NOT NULL AND t.user_id = ANY(_cw_uids) AND t.chain_id IN (1,56,97)
      UNION
      SELECT s.user_id, 'swap_transactions', s.id::text FROM public.swap_transactions s
      WHERE _cw_uids IS NOT NULL AND s.user_id = ANY(_cw_uids) AND s.chain_id IN (1,56,97)
    )
    SELECT
      COALESCE(array_agg(DISTINCT uid) FILTER (WHERE uid IS NOT NULL), ARRAY[]::uuid[]),
      COALESCE(array_agg(DISTINCT (st || '|' || sid)), ARRAY[]::text[])
    INTO _uids, _keys FROM ck;

    IF _uids IS NULL OR array_length(_uids, 1) IS NULL THEN
      RETURN jsonb_build_object(
        'scope', _scope,
        'target_user_id', _effective,
        'totals', jsonb_build_object(
          'count_in', 0, 'count_out', 0, 'count_unknown', 0, 'count_pending', 0, 'count_total', 0,
          'sum_in', 0, 'sum_out', 0, 'sum_unknown', 0, 'net', 0
        ),
        'by_token', '[]'::jsonb, 'by_chain', '[]'::jsonb,
        'by_type', '[]'::jsonb, 'by_status', '[]'::jsonb
      );
    END IF;
  END IF;

  WITH base AS (
    SELECT v.*,
      (
        v.counterparty_user_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.profiles p2
          WHERE p2.id <> v.user_id
            AND (
              lower(p2.public_wallet_address)    = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.custodial_wallet_address) = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.external_wallet_address)  = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
              OR lower(p2.btc_address)             = lower(NULLIF(CASE WHEN v.direction='out' THEN v.recipient_address ELSE v.sender_address END, ''))
            )
        )
      ) AS _resolved_external
    FROM public.v_unified_transactions_primary v
    WHERE
      (
        (_is_global = false AND v.user_id = _effective)
        OR
        (_is_global = true
          AND v.source_table = 'donations' AND v.tx_type = 'gift'
          AND v.status IN ('success','confirmed','completed')
          AND v.user_id IS NOT NULL AND v.counterparty_user_id IS NOT NULL
          AND v.is_external IS DISTINCT FROM true
          AND COALESCE(v.metadata->>'shadow','') NOT IN ('true','1')
          AND COALESCE(v.metadata->>'debug','')  NOT IN ('true','1')
          AND COALESCE(v.metadata->>'test','')   NOT IN ('true','1')
          AND v.direction = 'out'
        )
      )
      AND (_direction IS NULL OR _direction = 'all' OR v.direction = _direction OR _is_global)
      AND (_chain IS NULL OR _chain = 'all' OR v.chain = _chain)
      AND (_token_symbol IS NULL OR _token_symbol = 'all' OR upper(v.token_symbol) = upper(_token_symbol))
      AND (_tx_type IS NULL OR _tx_type = 'all' OR v.tx_type = _tx_type OR _is_global)
      AND (_statuses IS NULL OR v.status = ANY(_statuses) OR _is_global)
      AND (_from_ts IS NULL OR v.occurred_at >= _from_ts)
      AND (_to_ts IS NULL OR v.occurred_at <= _to_ts)
      AND (_counterparty_user_id IS NULL OR v.counterparty_user_id = _counterparty_user_id
           OR (_is_global AND v.user_id = _counterparty_user_id))
      AND (_s IS NULL OR v.user_id = ANY(_uids))
      AND (_s IS NULL OR (v.source_table || '|' || v.source_id) = ANY(_keys))
      AND (NOT _public_only OR (v.source_table = 'donations' AND v.is_external = false))
  ),
  filtered AS (
    SELECT * FROM base WHERE (_external_only IS NOT TRUE OR _resolved_external = true)
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE direction = 'in')      AS count_in,
      COUNT(*) FILTER (WHERE direction = 'out')     AS count_out,
      COUNT(*) FILTER (WHERE direction = 'unknown') AS count_unknown,
      COUNT(*) FILTER (WHERE status IN ('pending','processing')) AS count_pending,
      COUNT(*)                                       AS count_total,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'in'),      0) AS sum_in,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'out'),     0) AS sum_out,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'unknown'), 0) AS sum_unknown
    FROM filtered
  ),
  by_token AS (
    SELECT jsonb_agg(jsonb_build_object(
      'token_symbol', token_symbol, 'direction', direction,
      'count', cnt, 'sum_amount', sum_amt
    )) AS data
    FROM (
      SELECT token_symbol, direction, COUNT(*) AS cnt, COALESCE(SUM(amount_decimal),0) AS sum_amt
      FROM filtered GROUP BY token_symbol, direction
    ) t
  ),
  by_chain AS (
    SELECT jsonb_agg(jsonb_build_object('chain', chain, 'direction', direction, 'count', cnt)) AS data
    FROM ( SELECT chain, direction, COUNT(*) AS cnt FROM filtered GROUP BY chain, direction ) t
  ),
  by_type AS (
    SELECT jsonb_agg(jsonb_build_object('tx_type', tx_type, 'count', cnt)) AS data
    FROM ( SELECT tx_type, COUNT(*) AS cnt FROM filtered GROUP BY tx_type ) t
  ),
  by_status AS (
    SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) AS data
    FROM ( SELECT status, COUNT(*) AS cnt FROM filtered GROUP BY status ) t
  )
  SELECT jsonb_build_object(
    'scope', _scope,
    'target_user_id', _effective,
    'totals', jsonb_build_object(
      'count_in', t.count_in, 'count_out', t.count_out, 'count_unknown', t.count_unknown,
      'count_pending', t.count_pending, 'count_total', t.count_total,
      'sum_in', t.sum_in, 'sum_out', t.sum_out, 'sum_unknown', t.sum_unknown,
      'net', (t.sum_in - t.sum_out)
    ),
    'by_token',  COALESCE((SELECT data FROM by_token),  '[]'::jsonb),
    'by_chain',  COALESCE((SELECT data FROM by_chain),  '[]'::jsonb),
    'by_type',   COALESCE((SELECT data FROM by_type),   '[]'::jsonb),
    'by_status', COALESCE((SELECT data FROM by_status), '[]'::jsonb)
  )
  INTO _result
  FROM totals t;

  RETURN _result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_unified_summary(
  text, uuid, text, text, text, text, text, timestamptz, timestamptz, text, boolean, uuid
) TO authenticated, anon;

-- =====================================================================
-- Facets: distinct tokens/chains cho dropdown, không nhận filter search.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_unified_facets(
  _scope text,
  _target_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _effective uuid;
  _is_global boolean := false;
  _public_only boolean := false;
  _tokens text[];
  _chains text[];
BEGIN
  IF _caller IS NOT NULL THEN _is_admin := public.has_role(_caller, 'admin'); END IF;
  IF _scope IS NULL OR _scope NOT IN ('self','profile','global') THEN
    RAISE EXCEPTION 'INVALID_SCOPE' USING ERRCODE = '22023';
  END IF;
  IF _scope = 'self' THEN
    IF _caller IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
    _effective := _caller;
  ELSIF _scope = 'profile' THEN
    IF _target_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE = '22023'; END IF;
    _effective := _target_user_id;
    _public_only := NOT (_is_admin OR _caller = _target_user_id);
  ELSE
    _is_global := true;
  END IF;

  WITH base AS (
    SELECT v.token_symbol, v.chain
    FROM public.v_unified_transactions_primary v
    WHERE
      (
        (_is_global = false AND v.user_id = _effective)
        OR
        (_is_global = true
          AND v.source_table = 'donations' AND v.tx_type = 'gift'
          AND v.status IN ('success','confirmed','completed')
          AND v.user_id IS NOT NULL AND v.counterparty_user_id IS NOT NULL
          AND v.is_external IS DISTINCT FROM true
          AND COALESCE(v.metadata->>'shadow','') NOT IN ('true','1')
          AND COALESCE(v.metadata->>'debug','')  NOT IN ('true','1')
          AND COALESCE(v.metadata->>'test','')   NOT IN ('true','1')
          AND v.direction = 'out'
        )
      )
      AND (NOT _public_only OR (v.source_table = 'donations' AND v.is_external = false))
  )
  SELECT
    COALESCE((SELECT array_agg(DISTINCT token_symbol ORDER BY token_symbol) FROM base WHERE token_symbol IS NOT NULL), ARRAY[]::text[]),
    COALESCE((SELECT array_agg(DISTINCT chain        ORDER BY chain)        FROM base WHERE chain        IS NOT NULL), ARRAY[]::text[])
  INTO _tokens, _chains;

  RETURN jsonb_build_object(
    'scope', _scope,
    'target_user_id', _effective,
    'tokens', to_jsonb(_tokens),
    'chains', to_jsonb(_chains)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_unified_facets(text, uuid) TO authenticated, anon;
