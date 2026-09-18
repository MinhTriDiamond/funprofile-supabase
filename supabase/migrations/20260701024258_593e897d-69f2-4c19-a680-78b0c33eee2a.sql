CREATE OR REPLACE FUNCTION public.get_unified_transactions(
  _target_user_id uuid DEFAULT NULL,
  _direction text DEFAULT NULL,
  _chain text DEFAULT NULL,
  _token_symbol text DEFAULT NULL,
  _tx_type text DEFAULT NULL,
  _status text DEFAULT NULL,
  _from_ts timestamptz DEFAULT NULL,
  _to_ts timestamptz DEFAULT NULL,
  _search text DEFAULT NULL,
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
  total_count bigint,
  owner_display_name text, owner_username text, owner_avatar_url text,
  counterparty_display_name text, counterparty_username text, counterparty_avatar_url text,
  sender_user_id uuid, sender_display_name text, sender_username text,
  sender_avatar_url text, sender_wallet_address text,
  recipient_user_id uuid, recipient_display_name text, recipient_username text,
  recipient_avatar_url text, recipient_wallet_address text
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
  _lim int := LEAST(GREATEST(COALESCE(_limit, 50), 1), 5000);
  _off int := GREATEST(COALESCE(_offset, 0), 0);
  _s text := NULLIF(trim(COALESCE(_search, '')), '');
  _s_norm text := lower(COALESCE(_s, ''));
  _match_external boolean := _s_norm IN ('ví ngoài','vi ngoai','vingoai','external','ext wallet','external wallet');
BEGIN
  IF _caller IS NOT NULL THEN
    _is_admin := public.has_role(_caller, 'admin');
  END IF;

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
      _effective := _target_user_id;
      _public_only := true;
    END IF;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT v.*,
           own.display_name AS _own_dn, own.username AS _own_un, own.avatar_url AS _own_av, own.full_name AS _own_fn,
           cpt.display_name AS _cpt_dn, cpt.username AS _cpt_un, cpt.avatar_url AS _cpt_av, cpt.full_name AS _cpt_fn
    FROM public.v_unified_transactions_primary v
    LEFT JOIN public.profiles own ON own.id = v.user_id
    LEFT JOIN public.profiles cpt ON cpt.id = v.counterparty_user_id
    WHERE v.user_id = _effective
      AND (_direction IS NULL OR v.direction = _direction)
      AND (_chain IS NULL OR v.chain = _chain)
      AND (_token_symbol IS NULL OR upper(v.token_symbol) = upper(_token_symbol))
      AND (_tx_type IS NULL OR v.tx_type = _tx_type)
      AND (_status IS NULL OR v.status = _status)
      AND (_from_ts IS NULL OR v.occurred_at >= _from_ts)
      AND (_to_ts IS NULL OR v.occurred_at <= _to_ts)
      AND (
        _s IS NULL OR
        (_match_external AND v.is_external = true) OR
        v.tx_hash ILIKE '%' || _s || '%' OR
        v.memo ILIKE '%' || _s || '%' OR
        v.sender_address ILIKE '%' || _s || '%' OR
        v.recipient_address ILIKE '%' || _s || '%' OR
        (length(_s) BETWEEN 3 AND 12 AND (
          right(COALESCE(v.sender_address,''), length(_s))    ILIKE _s OR
          right(COALESCE(v.recipient_address,''), length(_s)) ILIKE _s
        )) OR
        own.username     ILIKE '%' || _s || '%' OR
        own.display_name ILIKE '%' || _s || '%' OR
        own.full_name    ILIKE '%' || _s || '%' OR
        cpt.username     ILIKE '%' || _s || '%' OR
        cpt.display_name ILIKE '%' || _s || '%' OR
        cpt.full_name    ILIKE '%' || _s || '%' OR
        upper(v.token_symbol) = upper(_s)
      )
      AND (
        NOT _public_only OR (
          v.source_table = 'donations' AND v.is_external = false
        )
      )
  ),
  counted AS ( SELECT COUNT(*)::bigint AS c FROM base ),
  page AS (
    SELECT b.*
    FROM base b
    ORDER BY b.occurred_at DESC NULLS LAST, b.id
    LIMIT _lim OFFSET _off
  )
  SELECT p.id, p.source_table, p.source_id,
         p.user_id, p.counterparty_user_id,
         p.tx_hash, p.chain, p.chain_id, p.network,
         p.token_symbol, p.token_address, p.decimals,
         p.direction, p.direction_confidence,
         p.tx_type, p.status, p.is_external,
         p.amount_raw, p.amount_decimal, p.fee_raw,
         p.block_number,
         p.occurred_at, p.confirmed_at, p.created_at,
         p.memo, p.sender_address, p.recipient_address,
         p.metadata,
         (SELECT c FROM counted) AS total_count,
         p._own_dn, p._own_un, p._own_av,
         p._cpt_dn, p._cpt_un, p._cpt_av,
         CASE WHEN p.direction = 'out' THEN p.user_id ELSE p.counterparty_user_id END,
         CASE WHEN p.direction = 'out' THEN p._own_dn ELSE p._cpt_dn END,
         CASE WHEN p.direction = 'out' THEN p._own_un ELSE p._cpt_un END,
         CASE WHEN p.direction = 'out' THEN p._own_av ELSE p._cpt_av END,
         p.sender_address,
         CASE WHEN p.direction = 'in'  THEN p.user_id ELSE p.counterparty_user_id END,
         CASE WHEN p.direction = 'in'  THEN p._own_dn ELSE p._cpt_dn END,
         CASE WHEN p.direction = 'in'  THEN p._own_un ELSE p._cpt_un END,
         CASE WHEN p.direction = 'in'  THEN p._own_av ELSE p._cpt_av END,
         p.recipient_address
  FROM page p
  ORDER BY p.occurred_at DESC NULLS LAST, p.id;
END;
$$;

COMMENT ON FUNCTION public.get_unified_transactions IS
'M5-UX5: Search mở rộng (sender/recipient profile, wallet suffix, "ví ngoài"). Không đổi chữ ký + cột trả về.';