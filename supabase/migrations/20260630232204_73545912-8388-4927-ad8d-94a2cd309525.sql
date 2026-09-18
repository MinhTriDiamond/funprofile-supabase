
-- M5-UX1: Profile enrichment cho Unified Transaction History RPCs.
-- Mục tiêu: trả thêm sender/recipient/owner/counterparty profile (display_name, username,
-- avatar_url, wallet_address) để UI render giống Legacy.
-- Không đổi view v_unified_transactions / v_unified_transactions_primary.
-- Không đổi chữ ký RPC; chỉ thêm cột mới ở cuối + đổi detail trả object thay vì array.

-- ============================================================
-- Helper: profile lite (display_name, username, avatar_url)
-- ============================================================
CREATE OR REPLACE FUNCTION public._unified_profile_lite(_uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN _uid IS NULL THEN NULL
    ELSE (
      SELECT jsonb_build_object(
        'user_id', p.id,
        'display_name', COALESCE(NULLIF(p.display_name,''), NULLIF(p.full_name,''), p.username),
        'username', p.username,
        'avatar_url', p.avatar_url
      )
      FROM public.profiles p
      WHERE p.id = _uid
      LIMIT 1
    )
  END
$$;

REVOKE ALL ON FUNCTION public._unified_profile_lite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._unified_profile_lite(uuid) TO authenticated, anon, service_role;

-- ============================================================
-- 1) get_unified_transactions — DROP + CREATE (đổi RETURNS TABLE)
-- ============================================================
DROP FUNCTION IF EXISTS public.get_unified_transactions(uuid,text,text,text,text,text,timestamptz,timestamptz,text,int,int);

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
  -- ===== Khối cột cũ M4 (giữ nguyên thứ tự) =====
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
  -- ===== Cột mới M5-UX1: profile enrichment =====
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
  _lim int := LEAST(GREATEST(COALESCE(_limit, 50), 1), 500);
  _off int := GREATEST(COALESCE(_offset, 0), 0);
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
         -- owner = chủ row (chính là target user)
         own.display_name, own.username, own.avatar_url,
         -- counterparty (đối phương nội bộ)
         cpt.display_name, cpt.username, cpt.avatar_url,
         -- sender / recipient suy từ direction
         CASE WHEN p.direction = 'out' THEN p.user_id ELSE p.counterparty_user_id END,
         CASE WHEN p.direction = 'out' THEN own.display_name ELSE cpt.display_name END,
         CASE WHEN p.direction = 'out' THEN own.username ELSE cpt.username END,
         CASE WHEN p.direction = 'out' THEN own.avatar_url ELSE cpt.avatar_url END,
         p.sender_address,
         CASE WHEN p.direction = 'in'  THEN p.user_id ELSE p.counterparty_user_id END,
         CASE WHEN p.direction = 'in'  THEN own.display_name ELSE cpt.display_name END,
         CASE WHEN p.direction = 'in'  THEN own.username ELSE cpt.username END,
         CASE WHEN p.direction = 'in'  THEN own.avatar_url ELSE cpt.avatar_url END,
         p.recipient_address
  FROM page p
  LEFT JOIN LATERAL (
    SELECT pr.display_name, pr.username, pr.avatar_url
    FROM public.profiles pr WHERE pr.id = p.user_id LIMIT 1
  ) own ON TRUE
  LEFT JOIN LATERAL (
    SELECT pr.display_name, pr.username, pr.avatar_url
    FROM public.profiles pr WHERE pr.id = p.counterparty_user_id LIMIT 1
  ) cpt ON TRUE
  ORDER BY p.occurred_at DESC NULLS LAST, p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_unified_transactions(uuid,text,text,text,text,text,timestamptz,timestamptz,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_transactions(uuid,text,text,text,text,text,timestamptz,timestamptz,text,int,int) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.get_unified_transactions IS 'M5-UX1: Unified tx history + profile enrichment (owner/counterparty/sender/recipient). Cột mới thêm ở cuối, không phá FE cũ.';

-- ============================================================
-- 2) get_unified_transaction_detail — trả object {primary, counterpart, sender, recipient, explorer_url, confirmations}
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
  _primary jsonb;
  _counterpart jsonb;
  _sender jsonb;
  _recipient jsonb;
  _sender_uid uuid;
  _recipient_uid uuid;
  _sender_addr text;
  _recipient_addr text;
  _explorer text;
  _chain text;
  _tx_hash_val text;
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

  IF _rows IS NULL OR jsonb_array_length(_rows) = 0 THEN
    RETURN jsonb_build_object('primary', NULL, 'counterpart', NULL,
      'sender', NULL, 'recipient', NULL, 'explorer_url', NULL, 'confirmations', NULL);
  END IF;

  -- ưu tiên row của caller làm primary; fallback row đầu
  SELECT elem
  INTO _primary
  FROM jsonb_array_elements(_rows) elem
  WHERE _caller IS NOT NULL AND (elem->>'user_id')::uuid = _caller
  LIMIT 1;

  IF _primary IS NULL THEN
    _primary := _rows->0;
  END IF;

  SELECT elem
  INTO _counterpart
  FROM jsonb_array_elements(_rows) elem
  WHERE elem->>'id' <> (_primary->>'id')
  LIMIT 1;

  -- Suy sender / recipient từ direction của primary
  IF (_primary->>'direction') = 'out' THEN
    _sender_uid := NULLIF(_primary->>'user_id','')::uuid;
    _recipient_uid := NULLIF(_primary->>'counterparty_user_id','')::uuid;
  ELSIF (_primary->>'direction') = 'in' THEN
    _recipient_uid := NULLIF(_primary->>'user_id','')::uuid;
    _sender_uid := NULLIF(_primary->>'counterparty_user_id','')::uuid;
  ELSE
    _sender_uid := NULLIF(_primary->>'user_id','')::uuid;
    _recipient_uid := NULLIF(_primary->>'counterparty_user_id','')::uuid;
  END IF;

  _sender_addr := _primary->>'sender_address';
  _recipient_addr := _primary->>'recipient_address';

  _sender := COALESCE(public._unified_profile_lite(_sender_uid),
    jsonb_build_object('user_id', NULL, 'display_name', NULL, 'username', NULL, 'avatar_url', NULL));
  _sender := _sender || jsonb_build_object('address', _sender_addr);

  _recipient := COALESCE(public._unified_profile_lite(_recipient_uid),
    jsonb_build_object('user_id', NULL, 'display_name', NULL, 'username', NULL, 'avatar_url', NULL));
  _recipient := _recipient || jsonb_build_object('address', _recipient_addr);

  _chain := _primary->>'chain';
  _tx_hash_val := _primary->>'tx_hash';
  IF _tx_hash_val IS NOT NULL THEN
    IF _chain = 'bsc' THEN
      _explorer := 'https://bscscan.com/tx/' || _tx_hash_val;
    ELSIF _chain = 'bsc_testnet' THEN
      _explorer := 'https://testnet.bscscan.com/tx/' || _tx_hash_val;
    ELSIF _chain = 'btc' THEN
      _explorer := 'https://mempool.space/tx/' || _tx_hash_val;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'primary', _primary,
    'counterpart', _counterpart,
    'sender', _sender,
    'recipient', _recipient,
    'explorer_url', _explorer,
    'confirmations', NULL,
    'raw', _rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_unified_transaction_detail(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_unified_transaction_detail(text,text,text) TO authenticated, anon, service_role;

COMMENT ON FUNCTION public.get_unified_transaction_detail IS 'M5-UX1: Detail trả object {primary, counterpart, sender, recipient, explorer_url} — đủ render receipt card đẹp.';
