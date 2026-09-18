
-- =====================================================================
-- M6 Search Round 3 — Normalize search + fix BTC/EVM address expansion
-- =====================================================================
-- Áp cho: get_unified_transactions, get_unified_counterparties
-- KHÔNG đụng get_unified_summary (không có _search).
-- Contract RPC (tên tham số + kiểu trả về) GIỮ NGUYÊN.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_unified_transactions(
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
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0,
  _external_only boolean DEFAULT NULL,
  _counterparty_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id text, source_table text, source_id text, user_id uuid, counterparty_user_id uuid,
  tx_hash text, chain text, chain_id integer, network text,
  token_symbol text, token_address text, decimals integer,
  direction text, direction_confidence text, tx_type text, status text,
  is_external boolean, amount_raw text, amount_decimal numeric, fee_raw text,
  block_number bigint, occurred_at timestamptz, confirmed_at timestamptz, created_at timestamptz,
  memo text, sender_address text, recipient_address text, metadata jsonb,
  total_count bigint,
  owner_display_name text, owner_username text, owner_avatar_url text,
  counterparty_display_name text, counterparty_username text, counterparty_avatar_url text,
  sender_user_id uuid, sender_display_name text, sender_username text, sender_avatar_url text, sender_wallet_address text,
  recipient_user_id uuid, recipient_display_name text, recipient_username text, recipient_avatar_url text, recipient_wallet_address text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _effective uuid;
  _is_global boolean := false;
  _public_only boolean := false;
  _lim int := LEAST(GREATEST(COALESCE(_limit, 50), 1), 5000);
  _off int := GREATEST(COALESCE(_offset, 0), 0);

  -- Search normalization (Round 3)
  _s          text := NULLIF(trim(COALESCE(_search, '')), '');
  _s_low      text := lower(COALESCE(_s, ''));
  -- Bỏ prefix '0x' để suffix/middle hex vẫn match; giữ nguyên bản gốc cho username/token
  _s_norm     text := CASE WHEN _s_low LIKE '0x%' THEN substr(_s_low, 3) ELSE _s_low END;
  _s_len      int  := COALESCE(length(_s_norm), 0);
  _s_pat      text := '%' || _s_low  || '%';   -- dùng cho text (username/memo)
  _n_pat      text := '%' || _s_norm || '%';   -- dùng cho hash/address (đã strip 0x)
  _n_prefix   text := _s_norm || '%';          -- prefix nhẹ khi 4-5 ký tự
  _is_hex     boolean := _s_norm ~ '^[a-f0-9]+$';
  _is_btc     boolean := _s_low  ~ '^(bc1|tb1|[13])[a-z0-9]{3,}$';
  _addr_ok    boolean := _s_len >= 6;   -- bật contains cho address/hash
  _addr_prefix boolean := _s_len >= 4;  -- bật prefix cho address/hash (nhẹ)

  _statuses text[] := CASE
    WHEN _status IS NULL OR _status = 'all' THEN NULL
    WHEN _status IN ('success','confirmed','completed') THEN ARRAY['success','confirmed','completed']
    WHEN _status IN ('pending','processing') THEN ARRAY['pending','processing']
    WHEN _status = 'failed' THEN ARRAY['failed']
    ELSE ARRAY[_status]
  END;
BEGIN
  IF _caller IS NOT NULL THEN
    _is_admin := public.has_role(_caller, 'admin');
  END IF;

  IF _scope IS NULL OR _scope NOT IN ('self','profile','global') THEN
    RAISE EXCEPTION 'INVALID_SCOPE: must be self|profile|global' USING ERRCODE = '22023';
  END IF;

  IF _scope = 'self' THEN
    IF _caller IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED: scope=self requires auth' USING ERRCODE = '42501';
    END IF;
    _effective := _caller;
    _public_only := false;
  ELSIF _scope = 'profile' THEN
    IF _target_user_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_TARGET: scope=profile requires _target_user_id' USING ERRCODE = '22023';
    END IF;
    _effective := _target_user_id;
    _public_only := NOT (_is_admin OR _caller = _target_user_id);
  ELSE
    _is_global := true;
    _effective := NULL;
    _public_only := false;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT v.*,
      own.display_name AS _own_dn, own.username AS _own_un, own.avatar_url AS _own_av, own.full_name AS _own_fn,
      own.public_wallet_address AS _own_pw, own.custodial_wallet_address AS _own_cw,
      own.external_wallet_address AS _own_ew, own.btc_address AS _own_btc,
      cpt.display_name AS _cpt_dn, cpt.username AS _cpt_un, cpt.avatar_url AS _cpt_av, cpt.full_name AS _cpt_fn,
      cpt.public_wallet_address AS _cpt_pw, cpt.custodial_wallet_address AS _cpt_cw,
      cpt.external_wallet_address AS _cpt_ew, cpt.btc_address AS _cpt_btc,
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
    LEFT JOIN public.profiles own ON own.id = v.user_id
    LEFT JOIN public.profiles cpt ON cpt.id = v.counterparty_user_id
    WHERE
      (
        (_is_global = false AND v.user_id = _effective)
        OR
        (_is_global = true
          AND v.source_table = 'donations'
          AND v.tx_type = 'gift'
          AND v.status IN ('success','confirmed','completed')
          AND v.user_id IS NOT NULL
          AND v.counterparty_user_id IS NOT NULL
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
      AND (_counterparty_user_id IS NULL
           OR v.counterparty_user_id = _counterparty_user_id
           OR (_is_global AND v.user_id = _counterparty_user_id))
      AND (
        _s IS NULL OR (
          -- (A) HEX (0x…, hoặc chuỗi hex thuần) → chỉ đối chiếu field trực tiếp trên row
          (
            _is_hex AND (
              (_addr_ok AND (
                 lower(v.tx_hash)           LIKE _n_pat OR
                 lower(v.sender_address)    LIKE _n_pat OR
                 lower(v.recipient_address) LIKE _n_pat
              ))
              OR
              (NOT _addr_ok AND _addr_prefix AND (
                 lower(v.tx_hash)           LIKE _n_prefix OR
                 lower(v.sender_address)    LIKE _n_prefix OR
                 lower(v.recipient_address) LIKE _n_prefix
              ))
            )
          )
          -- (B) BTC address → chỉ đối chiếu field trực tiếp trên row (KHÔNG join profile.btc_address)
          OR (
            _is_btc AND _addr_prefix AND (
              lower(v.tx_hash)           LIKE _n_pat OR
              lower(v.sender_address)    LIKE _n_pat OR
              lower(v.recipient_address) LIKE _n_pat
            )
          )
          -- (C) TEXT: username/display_name/full_name/memo/token — user-level search
          OR (
            NOT _is_hex AND NOT _is_btc AND (
              v.memo ILIKE _s_pat OR
              own.username     ILIKE _s_pat OR
              own.display_name ILIKE _s_pat OR
              own.full_name    ILIKE _s_pat OR
              cpt.username     ILIKE _s_pat OR
              cpt.display_name ILIKE _s_pat OR
              cpt.full_name    ILIKE _s_pat OR
              upper(v.token_symbol) = upper(_s)
            )
          )
        )
      )
      AND (
        NOT _public_only OR (
          v.source_table = 'donations' AND v.is_external = false
        )
      )
  ),
  filtered AS (
    SELECT * FROM base
    WHERE (_external_only IS NOT TRUE OR _resolved_external = true)
  ),
  counted AS ( SELECT COUNT(*)::bigint AS c FROM filtered ),
  page AS (
    SELECT b.*
    FROM filtered b
    ORDER BY b.occurred_at DESC NULLS LAST, b.id
    LIMIT _lim OFFSET _off
  )
  SELECT p.id, p.source_table, p.source_id,
         p.user_id, p.counterparty_user_id,
         p.tx_hash, p.chain, p.chain_id, p.network,
         p.token_symbol, p.token_address, p.decimals,
         p.direction, p.direction_confidence,
         p.tx_type, p.status,
         p._resolved_external AS is_external,
         p.amount_raw, p.amount_decimal, p.fee_raw,
         p.block_number,
         p.occurred_at, p.confirmed_at, p.created_at,
         p.memo, p.sender_address, p.recipient_address,
         CASE WHEN _is_admin THEN p.metadata ELSE NULL END AS metadata,
         (SELECT c FROM counted) AS total_count,
         p._own_dn, p._own_un, p._own_av,
         p._cpt_dn, p._cpt_un, p._cpt_av,
         CASE WHEN p.direction = 'out' THEN p.user_id ELSE p.counterparty_user_id END,
         CASE WHEN p.direction = 'out' THEN p._own_dn ELSE p._cpt_dn END,
         CASE WHEN p.direction = 'out' THEN p._own_un ELSE p._cpt_un END,
         CASE WHEN p.direction = 'out' THEN p._own_av ELSE p._cpt_av END,
         COALESCE(p.sender_address,
           CASE WHEN p.direction = 'out' THEN p._own_pw ELSE p._cpt_pw END),
         CASE WHEN p.direction = 'in'  THEN p.user_id ELSE p.counterparty_user_id END,
         CASE WHEN p.direction = 'in'  THEN p._own_dn ELSE p._cpt_dn END,
         CASE WHEN p.direction = 'in'  THEN p._own_un ELSE p._cpt_un END,
         CASE WHEN p.direction = 'in'  THEN p._own_av ELSE p._cpt_av END,
         COALESCE(p.recipient_address,
           CASE WHEN p.direction = 'in'  THEN p._own_pw ELSE p._cpt_pw END)
  FROM page p
  ORDER BY p.occurred_at DESC NULLS LAST, p.id;
END;
$function$;


-- =====================================================================
-- get_unified_counterparties — cùng predicate search
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_unified_counterparties(
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
  _limit integer DEFAULT 200
)
RETURNS TABLE(user_id uuid, display_name text, username text, avatar_url text, tx_count bigint)
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
  _statuses text[] := CASE
    WHEN _status IS NULL OR _status = 'all' THEN NULL
    WHEN _status IN ('success','confirmed','completed') THEN ARRAY['success','confirmed','completed']
    WHEN _status IN ('pending','processing') THEN ARRAY['pending','processing']
    WHEN _status = 'failed' THEN ARRAY['failed']
    ELSE ARRAY[_status]
  END;
  _s        text := NULLIF(trim(COALESCE(_search, '')), '');
  _s_low    text := lower(COALESCE(_s, ''));
  _s_norm   text := CASE WHEN _s_low LIKE '0x%' THEN substr(_s_low, 3) ELSE _s_low END;
  _s_len    int  := COALESCE(length(_s_norm), 0);
  _s_pat    text := '%' || _s_low  || '%';
  _n_pat    text := '%' || _s_norm || '%';
  _n_prefix text := _s_norm || '%';
  _is_hex   boolean := _s_norm ~ '^[a-f0-9]+$';
  _is_btc   boolean := _s_low  ~ '^(bc1|tb1|[13])[a-z0-9]{3,}$';
  _addr_ok    boolean := _s_len >= 6;
  _addr_prefix boolean := _s_len >= 4;
BEGIN
  IF _caller IS NOT NULL THEN
    _is_admin := public.has_role(_caller, 'admin');
  END IF;

  IF _scope IS NULL OR _scope NOT IN ('self','profile','global') THEN
    RAISE EXCEPTION 'INVALID_SCOPE' USING ERRCODE = '22023';
  END IF;

  IF _scope = 'self' THEN
    IF _caller IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
    _effective := _caller;
  ELSIF _scope = 'profile' THEN
    IF _target_user_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE = '22023';
    END IF;
    _effective := _target_user_id;
    _public_only := NOT (_is_admin OR _caller = _target_user_id);
  ELSE
    _is_global := true;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      v.counterparty_user_id AS counterparty_user_id,
      v.user_id AS owner_user_id,
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
    LEFT JOIN public.profiles own ON own.id = v.user_id
    LEFT JOIN public.profiles cpt ON cpt.id = v.counterparty_user_id
    WHERE
      (
        (_is_global = false AND v.user_id = _effective)
        OR
        (_is_global = true
          AND v.source_table = 'donations'
          AND v.tx_type = 'gift'
          AND v.status IN ('success','confirmed','completed')
          AND v.user_id IS NOT NULL
          AND v.counterparty_user_id IS NOT NULL
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
      AND (
        _s IS NULL OR (
          (
            _is_hex AND (
              (_addr_ok AND (
                 lower(v.tx_hash)           LIKE _n_pat OR
                 lower(v.sender_address)    LIKE _n_pat OR
                 lower(v.recipient_address) LIKE _n_pat
              ))
              OR
              (NOT _addr_ok AND _addr_prefix AND (
                 lower(v.tx_hash)           LIKE _n_prefix OR
                 lower(v.sender_address)    LIKE _n_prefix OR
                 lower(v.recipient_address) LIKE _n_prefix
              ))
            )
          )
          OR (
            _is_btc AND _addr_prefix AND (
              lower(v.tx_hash)           LIKE _n_pat OR
              lower(v.sender_address)    LIKE _n_pat OR
              lower(v.recipient_address) LIKE _n_pat
            )
          )
          OR (
            NOT _is_hex AND NOT _is_btc AND (
              v.memo ILIKE _s_pat OR
              cpt.username ILIKE _s_pat OR
              cpt.display_name ILIKE _s_pat OR
              cpt.full_name ILIKE _s_pat OR
              upper(v.token_symbol) = upper(_s)
            )
          )
        )
      )
      AND (
        NOT _public_only OR (
          v.source_table = 'donations' AND v.is_external = false
        )
      )
  ),
  expanded AS (
    SELECT counterparty_user_id AS uid FROM base
      WHERE counterparty_user_id IS NOT NULL
        AND (_external_only IS NOT TRUE OR _resolved_external = true)
    UNION ALL
    SELECT owner_user_id AS uid FROM base
      WHERE _is_global AND owner_user_id IS NOT NULL
  ),
  agg AS (
    SELECT uid, COUNT(*)::bigint AS c
    FROM expanded
    GROUP BY uid
  )
  SELECT a.uid,
         p.display_name,
         p.username,
         p.avatar_url,
         a.c
  FROM agg a
  LEFT JOIN public.profiles p ON p.id = a.uid
  ORDER BY a.c DESC, COALESCE(p.display_name, p.username, '') ASC
  LIMIT GREATEST(COALESCE(_limit, 200), 1);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_unified_transactions(text, uuid, text, text, text, text, text, timestamptz, timestamptz, text, integer, integer, boolean, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_unified_counterparties(text, uuid, text, text, text, text, text, timestamptz, timestamptz, text, boolean, integer) TO anon, authenticated, service_role;
