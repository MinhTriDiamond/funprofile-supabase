-- ROLLBACK for stats-unify-display (2026-10-15): restore the three original function definitions
-- (captured live just before the change) and drop the canonical helper.

CREATE OR REPLACE FUNCTION public.get_donation_global_stats(p_time_range text DEFAULT 'all'::text, p_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(totals_by_token jsonb, total_donated_usd numeric, total_donations bigint, total_donors bigint, total_recipients bigint, total_light_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_since timestamptz; v_until timestamptz;
BEGIN
  IF p_from IS NOT NULL OR p_to IS NOT NULL THEN
    v_since := p_from; v_until := p_to;
  ELSE
    v_until := NULL;
    v_since := CASE p_time_range
      WHEN 'day'   THEN now() - interval '1 day'
      WHEN 'week'  THEN now() - interval '7 days'
      WHEN 'month' THEN now() - interval '30 days'
      ELSE NULL END;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT d.token_symbol, d.amount_num AS amount,
      d.amount_usd,
      d.sender_id, d.recipient_id, d.tx_hash,
      d.light_score_earned
    FROM public.donation_board_base d
    WHERE d.status = 'confirmed'
      AND d.chain_id <> 97
      AND d.amount_usd > 0
      AND d.registry_eligible
      AND (d.registry_max_single_usd IS NULL OR d.amount_usd <= d.registry_max_single_usd)
      AND NOT d.sender_excluded
      AND NOT d.recipient_excluded
      AND (v_since IS NULL OR d.created_at >= v_since)
      AND (v_until IS NULL OR d.created_at <= v_until)
  ), per_token AS (
    SELECT token_symbol, SUM(amount) AS token_amount,
      SUM(amount_usd) AS token_usd, COUNT(DISTINCT tx_hash) AS token_transactions
    FROM base GROUP BY token_symbol
  )
  SELECT
    (SELECT COALESCE(jsonb_object_agg(token_symbol,
        jsonb_build_object('amount', token_amount, 'usd', token_usd, 'transactions', token_transactions)
        ORDER BY token_symbol), '{}'::jsonb) FROM per_token),
    (SELECT COALESCE(SUM(amount_usd), 0)::numeric FROM base),
    (SELECT COUNT(DISTINCT tx_hash) FROM base)::bigint,
    (SELECT COUNT(DISTINCT sender_id) FROM base)::bigint,
    (SELECT COUNT(DISTINCT recipient_id) FROM base)::bigint,
    (SELECT COALESCE(SUM(light_score_earned), 0)::numeric FROM base);
END; $function$
;

CREATE OR REPLACE FUNCTION public.get_app_stats(p_prices jsonb)
 RETURNS TABLE(total_users bigint, total_posts bigint, total_photos bigint, total_videos bigint, total_livestreams bigint, total_rewards numeric, treasury_camly_received numeric, total_camly_claimed numeric, total_videos_combined bigint, total_sent_usd numeric, total_received_usd numeric, unpriced_symbols text[], skipped_symbols text[], priced_coverage_pct numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c app_stats_cache%ROWTYPE;
  v_internal_usd NUMERIC := 0;
  v_unpriced TEXT[] := '{}';
  v_skipped TEXT[] := '{}';
  v_coverage NUMERIC := 100;
  v_rows_total BIGINT := 0;
  v_rows_priced BIGINT := 0;
BEGIN
  SELECT * INTO c FROM app_stats_cache WHERE id = 1;
  IF NOT FOUND THEN
    PERFORM refresh_app_stats_cache();
    SELECT * INTO c FROM app_stats_cache WHERE id = 1;
  END IF;

  WITH external_prices AS (
    SELECT sym, price FROM public.normalize_price_map(p_prices)
  ),
  donations_agg AS (
    -- SSOT 2026-10-15: doc tu gift_breakdown_cache (cung nguon voi Gift history),
    -- dinh nghia dong nhat ban goc: confirmed + noi bo + du 2 dau + amount hop le.
    SELECT gbc.token_symbol AS sym, gbc.total_amount AS amt, gbc.tx_count AS rows_cnt
    FROM public.gift_breakdown_cache gbc
    WHERE gbc.source = 'donations_internal'
  ),
  resolved AS (
    SELECT da.sym, da.amt, da.rows_cnt,
           COALESCE(e.price, public.get_token_price_now(da.sym)) AS price
    FROM donations_agg da
    LEFT JOIN external_prices e ON e.sym = da.sym
  )
  SELECT
    COALESCE(SUM(CASE WHEN r.price IS NOT NULL THEN r.amt * r.price ELSE 0 END), 0),
    COALESCE(ARRAY_AGG(DISTINCT r.sym) FILTER (WHERE r.price IS NULL AND r.sym <> 'FUN'), '{}'),
    COALESCE(ARRAY_AGG(DISTINCT r.sym) FILTER (WHERE r.sym = 'FUN'), '{}'),
    COALESCE(SUM(r.rows_cnt), 0),
    COALESCE(SUM(r.rows_cnt) FILTER (WHERE r.price IS NOT NULL OR r.sym = 'FUN'), 0)
  INTO v_internal_usd, v_unpriced, v_skipped, v_rows_total, v_rows_priced
  FROM resolved r;

  IF v_rows_total > 0 THEN
    v_coverage := ROUND((v_rows_priced::numeric / v_rows_total::numeric) * 100, 2);
  END IF;

  RETURN QUERY SELECT
    c.total_users, c.total_posts, c.total_photos, c.total_videos, c.total_livestreams,
    c.total_rewards, c.treasury_camly_received, c.total_camly_claimed,
    c.total_videos_combined, v_internal_usd, v_internal_usd,
    v_unpriced, v_skipped, v_coverage;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_unified_summary(_scope text, _target_user_id uuid DEFAULT NULL::uuid, _direction text DEFAULT NULL::text, _chain text DEFAULT NULL::text, _token_symbol text DEFAULT NULL::text, _tx_type text DEFAULT NULL::text, _status text DEFAULT NULL::text, _from_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, _to_ts timestamp with time zone DEFAULT NULL::timestamp with time zone, _search text DEFAULT NULL::text, _external_only boolean DEFAULT NULL::boolean, _counterparty_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _is_admin_all boolean := false;
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
    WHEN _status = 'all' THEN NULL
    WHEN _status IS NULL THEN ARRAY['success','confirmed','completed']
    WHEN _status IN ('success','confirmed','completed') THEN ARRAY['success','confirmed','completed']
    WHEN _status IN ('pending','processing') THEN ARRAY['pending','processing']
    WHEN _status = 'failed' THEN ARRAY['failed']
    ELSE ARRAY[_status]
  END;
  _result jsonb;
BEGIN
  IF _caller IS NOT NULL THEN _is_admin := public.has_role(_caller, 'admin'); END IF;
  IF _scope IS NULL OR _scope NOT IN ('self','profile','global','admin_all') THEN
    RAISE EXCEPTION 'INVALID_SCOPE' USING ERRCODE = '22023';
  END IF;
  IF _scope = 'self' THEN
    IF _caller IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501'; END IF;
    _effective := _caller;
  ELSIF _scope = 'profile' THEN
    IF _target_user_id IS NULL THEN RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE = '22023'; END IF;
    _effective := _target_user_id;
    _public_only := false;
  ELSIF _scope = 'admin_all' THEN
    IF _caller IS NULL OR NOT _is_admin THEN
      RAISE EXCEPTION 'FORBIDDEN: scope=admin_all requires admin role' USING ERRCODE = '42501';
    END IF;
    _is_admin_all := true;
  ELSE
    _is_global := true;
  END IF;

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
    FROM public.unified_transactions_snapshot v
    WHERE
      (
        _is_admin_all
        OR (_is_global = false AND v.user_id = _effective)
        OR
        (_is_global = true
          AND v.source_table = 'donations' AND v.tx_type = 'gift'
          AND v.status IN ('success','confirmed','completed')
          AND v.user_id IS NOT NULL AND v.counterparty_user_id IS NOT NULL
          AND v.is_external IS DISTINCT FROM true
          AND COALESCE(v.metadata->>'shadow','') NOT IN ('true','1')
          AND COALESCE(v.metadata->>'debug','')  NOT IN ('true','1')
          AND COALESCE(v.metadata->>'test','')   NOT IN ('true','1')
          AND v.direction = 'in'
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
           OR (_is_global AND v.user_id = _counterparty_user_id)
           OR (_is_admin_all AND v.user_id = _counterparty_user_id))
      AND (_s IS NULL OR v.user_id = ANY(_uids) OR (_is_admin_all AND v.user_id IS NULL))
      AND (_s IS NULL OR (v.source_table || '|' || v.source_id) = ANY(_keys))
      AND (NOT _public_only OR (v.source_table = 'donations' AND v.is_external = false))
  ),
  filtered_raw AS (
    SELECT * FROM base WHERE (_external_only IS NOT TRUE OR _resolved_external = true)
  ),
  filtered AS (
    SELECT * FROM (
      SELECT fr.*,
        ROW_NUMBER() OVER (
          PARTITION BY CASE
            WHEN _is_admin_all AND fr.source_table = 'donations'
              THEN fr.source_table || '|' || fr.source_id
            ELSE fr.id
          END
          ORDER BY (fr.direction = 'out') DESC, fr.id
        ) AS _rn
      FROM filtered_raw fr
    ) x WHERE _rn = 1
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
$function$
;

DROP FUNCTION IF EXISTS public.donation_board_usd_total();
