
-- M4: RPCs for Unified Transaction History (read-only)
-- get_unified_transactions / get_unified_summary / get_unified_transaction_detail

-- ============================================================
-- Helper: resolve effective target user with authorization
-- Returns NULL if caller is not allowed to view target
-- ============================================================
CREATE OR REPLACE FUNCTION public._unified_tx_can_view(_target uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
BEGIN
  IF _target IS NULL THEN
    RETURN false;
  END IF;
  IF _caller IS NOT NULL AND _caller = _target THEN
    RETURN true;
  END IF;
  IF _caller IS NOT NULL AND public.has_role(_caller, 'admin') THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;

-- ============================================================
-- 1) get_unified_transactions
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_unified_transactions(
  _target_user_id uuid DEFAULT NULL,
  _direction text DEFAULT NULL,         -- 'in' | 'out' | 'unknown' | NULL
  _chain text DEFAULT NULL,
  _token_symbol text DEFAULT NULL,
  _tx_type text DEFAULT NULL,
  _status text DEFAULT NULL,
  _from_ts timestamptz DEFAULT NULL,
  _to_ts timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,            -- tx_hash / memo / address
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id text, source_table text, source_id text,
  user_id uuid, counterparty_user_id uuid,
  tx_hash text, chain text, chain_id int, network text,
  token_symbol text, token_address text, decimals int,
  direction text, direction_confidence text,
  tx_type text, status text, is_external boolean,
  amount_raw text, amount_decimal numeric, fee_raw text,
  block_number bigint,
  occurred_at timestamptz, confirmed_at timestamptz, created_at timestamptz,
  memo text, sender_address text, recipient_address text,
  metadata jsonb,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _effective uuid;
  _public_only boolean := false;
  _lim int := LEAST(GREATEST(COALESCE(_limit, 50), 1), 500);
  _off int := GREATEST(COALESCE(_offset, 0), 0);
BEGIN
  IF _caller IS NOT NULL THEN
    _is_admin := public.has_role(_caller, 'admin');
  END IF;

  -- Resolve effective target
  IF _target_user_id IS NULL THEN
    IF _caller IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: target_user_id required for anonymous'
        USING ERRCODE = '42501';
    END IF;
    _effective := _caller;
  ELSE
    IF _is_admin OR _caller = _target_user_id THEN
      _effective := _target_user_id;
    ELSE
      -- viewing someone else => public rows only
      _effective := _target_user_id;
      _public_only := true;
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT v.*
    FROM public.v_unified_transactions_primary v
    WHERE v.user_id = _effective
      AND (_direction IS NULL OR v.direction = _direction)
      AND (_chain IS NULL OR v.chain = _chain)
      AND (_token_symbol IS NULL OR upper(v.token_symbol) = upper(_token_symbol))
      AND (_tx_type IS NULL OR v.tx_type = _tx_type)
      AND (_status IS NULL OR v.status = _status)
      AND (_from_ts IS NULL OR v.occurred_at >= _from_ts)
      AND (_to_ts IS NULL OR v.occurred_at <= _to_ts)
      AND (
        _search IS NULL OR _search = '' OR
        v.tx_hash ILIKE '%' || _search || '%' OR
        v.memo ILIKE '%' || _search || '%' OR
        v.sender_address ILIKE '%' || _search || '%' OR
        v.recipient_address ILIKE '%' || _search || '%'
      )
      AND (
        NOT _public_only OR (
          -- public-only view: only donations rows (publicly visible)
          v.source_table = 'donations' AND v.is_external = false
        )
      )
  ), counted AS (
    SELECT COUNT(*)::bigint AS c FROM base
  )
  SELECT b.id, b.source_table, b.source_id,
         b.user_id, b.counterparty_user_id,
         b.tx_hash, b.chain, b.chain_id, b.network,
         b.token_symbol, b.token_address, b.decimals,
         b.direction, b.direction_confidence,
         b.tx_type, b.status, b.is_external,
         b.amount_raw, b.amount_decimal, b.fee_raw,
         b.block_number,
         b.occurred_at, b.confirmed_at, b.created_at,
         b.memo, b.sender_address, b.recipient_address,
         b.metadata,
         (SELECT c FROM counted) AS total_count
  FROM base b
  ORDER BY b.occurred_at DESC NULLS LAST, b.id
  LIMIT _lim OFFSET _off;
END;
$$;

-- ============================================================
-- 2) get_unified_summary
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_unified_summary(
  _target_user_id uuid DEFAULT NULL,
  _from_ts timestamptz DEFAULT NULL,
  _to_ts timestamptz DEFAULT NULL,
  _chain text DEFAULT NULL,
  _token_symbol text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _effective uuid;
  _public_only boolean := false;
  _result jsonb;
BEGIN
  IF _caller IS NOT NULL THEN
    _is_admin := public.has_role(_caller, 'admin');
  END IF;

  IF _target_user_id IS NULL THEN
    IF _caller IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
    _effective := _caller;
  ELSE
    IF _is_admin OR _caller = _target_user_id THEN
      _effective := _target_user_id;
    ELSE
      _effective := _target_user_id;
      _public_only := true;
    END IF;
  END IF;

  WITH base AS (
    SELECT v.*
    FROM public.v_unified_transactions_primary v
    WHERE v.user_id = _effective
      AND (_from_ts IS NULL OR v.occurred_at >= _from_ts)
      AND (_to_ts IS NULL OR v.occurred_at <= _to_ts)
      AND (_chain IS NULL OR v.chain = _chain)
      AND (_token_symbol IS NULL OR upper(v.token_symbol) = upper(_token_symbol))
      AND (status IS NULL OR v.status IN ('confirmed','success','completed','pending','failed'))
      AND (
        NOT _public_only OR (
          v.source_table = 'donations' AND v.is_external = false
        )
      )
  ),
  totals AS (
    SELECT
      COUNT(*) FILTER (WHERE direction = 'in')      AS count_in,
      COUNT(*) FILTER (WHERE direction = 'out')     AS count_out,
      COUNT(*) FILTER (WHERE direction = 'unknown') AS count_unknown,
      COUNT(*)                                       AS count_total,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'in'  AND status IN ('confirmed','success','completed')), 0) AS sum_in,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'out' AND status IN ('confirmed','success','completed')), 0) AS sum_out,
      COALESCE(SUM(amount_decimal) FILTER (WHERE direction = 'unknown'), 0) AS sum_unknown
    FROM base
  ),
  by_token AS (
    SELECT jsonb_agg(jsonb_build_object(
      'token_symbol', token_symbol,
      'direction', direction,
      'count', cnt,
      'sum_amount', sum_amt
    )) AS data
    FROM (
      SELECT token_symbol, direction, COUNT(*) AS cnt, SUM(amount_decimal) AS sum_amt
      FROM base GROUP BY token_symbol, direction
    ) t
  ),
  by_chain AS (
    SELECT jsonb_agg(jsonb_build_object(
      'chain', chain, 'direction', direction, 'count', cnt
    )) AS data
    FROM ( SELECT chain, direction, COUNT(*) AS cnt FROM base GROUP BY chain, direction ) t
  ),
  by_type AS (
    SELECT jsonb_agg(jsonb_build_object('tx_type', tx_type, 'count', cnt)) AS data
    FROM ( SELECT tx_type, COUNT(*) AS cnt FROM base GROUP BY tx_type ) t
  ),
  by_status AS (
    SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt)) AS data
    FROM ( SELECT status, COUNT(*) AS cnt FROM base GROUP BY status ) t
  )
  SELECT jsonb_build_object(
    'target_user_id', _effective,
    'public_only', _public_only,
    'totals', jsonb_build_object(
      'count_in', t.count_in,
      'count_out', t.count_out,
      'count_unknown', t.count_unknown,
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
  )
  INTO _result
  FROM totals t;

  RETURN _result;
END;
$$;

-- ============================================================
-- 3) get_unified_transaction_detail
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_unified_transaction_detail(
  _tx_hash text DEFAULT NULL,
  _source_table text DEFAULT NULL,
  _source_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _rows jsonb;
BEGIN
  IF _caller IS NOT NULL THEN
    _is_admin := public.has_role(_caller, 'admin');
  END IF;

  IF (_tx_hash IS NULL OR _tx_hash = '') AND (_source_id IS NULL OR _source_id = '') THEN
    RAISE EXCEPTION 'tx_hash or source_id required' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(to_jsonb(v) ORDER BY v.direction)
  INTO _rows
  FROM public.v_unified_transactions v
  WHERE
    (_tx_hash IS NULL OR v.tx_hash = _tx_hash)
    AND (_source_table IS NULL OR v.source_table = _source_table)
    AND (_source_id IS NULL OR v.source_id = _source_id)
    AND (
      _is_admin
      OR (_caller IS NOT NULL AND v.user_id = _caller)
      OR (v.source_table = 'donations' AND v.is_external = false)
    );

  RETURN COALESCE(_rows, '[]'::jsonb);
END;
$$;

-- ============================================================
-- Grants
-- ============================================================
REVOKE ALL ON FUNCTION public.get_unified_transactions(uuid,text,text,text,text,text,timestamptz,timestamptz,text,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_unified_summary(uuid,timestamptz,timestamptz,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_unified_transaction_detail(text,text,text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_unified_transactions(uuid,text,text,text,text,text,timestamptz,timestamptz,text,int,int) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_unified_summary(uuid,timestamptz,timestamptz,text,text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_unified_transaction_detail(text,text,text) TO authenticated, anon;

COMMENT ON FUNCTION public.get_unified_transactions IS 'M4: Read unified tx history. Self/admin = full; others = public donations only. Anon must pass target_user_id (public-only).';
COMMENT ON FUNCTION public.get_unified_summary IS 'M4: Summary in/out/unknown. Net = in - out. Unknown tách riêng, không gộp.';
COMMENT ON FUNCTION public.get_unified_transaction_detail IS 'M4: Detail by tx_hash or source_id. Returns both directions (A out + B in) for admin/participants.';
