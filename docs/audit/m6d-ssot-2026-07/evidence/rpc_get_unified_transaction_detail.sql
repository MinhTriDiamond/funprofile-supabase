                                                                              pg_get_functiondef                                                                               
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
 CREATE OR REPLACE FUNCTION public.get_unified_transaction_detail(_tx_hash text DEFAULT NULL::text, _source_table text DEFAULT NULL::text, _source_id text DEFAULT NULL::text)+
  RETURNS jsonb                                                                                                                                                               +
  LANGUAGE plpgsql                                                                                                                                                            +
  STABLE SECURITY DEFINER                                                                                                                                                     +
  SET search_path TO 'public'                                                                                                                                                 +
 AS $function$                                                                                                                                                                +
 DECLARE                                                                                                                                                                      +
   _caller uuid := auth.uid();                                                                                                                                                +
   _is_admin boolean := false;                                                                                                                                                +
   _rows jsonb;                                                                                                                                                               +
   _primary jsonb;                                                                                                                                                            +
   _counterpart jsonb;                                                                                                                                                        +
   _sender jsonb;                                                                                                                                                             +
   _recipient jsonb;                                                                                                                                                          +
   _sender_uid uuid;                                                                                                                                                          +
   _recipient_uid uuid;                                                                                                                                                       +
   _sender_addr text;                                                                                                                                                         +
   _recipient_addr text;                                                                                                                                                      +
   _explorer text;                                                                                                                                                            +
   _chain text;                                                                                                                                                               +
   _tx_hash_val text;                                                                                                                                                         +
 BEGIN                                                                                                                                                                        +
   IF _caller IS NOT NULL THEN                                                                                                                                                +
     _is_admin := public.has_role(_caller, 'admin');                                                                                                                          +
   END IF;                                                                                                                                                                    +
                                                                                                                                                                              +
   IF (_tx_hash IS NULL OR _tx_hash = '') AND (_source_id IS NULL OR _source_id = '') THEN                                                                                    +
     RAISE EXCEPTION 'tx_hash or source_id required' USING ERRCODE = '22023';                                                                                                 +
   END IF;                                                                                                                                                                    +
                                                                                                                                                                              +
   SELECT jsonb_agg(to_jsonb(v) ORDER BY v.direction)                                                                                                                         +
   INTO _rows                                                                                                                                                                 +
   FROM public.v_unified_transactions v                                                                                                                                       +
   WHERE                                                                                                                                                                      +
     (_tx_hash IS NULL OR v.tx_hash = _tx_hash)                                                                                                                               +
     AND (_source_table IS NULL OR v.source_table = _source_table)                                                                                                            +
     AND (_source_id IS NULL OR v.source_id = _source_id)                                                                                                                     +
     AND (                                                                                                                                                                    +
       _is_admin                                                                                                                                                              +
       OR (_caller IS NOT NULL AND v.user_id = _caller)                                                                                                                       +
       OR (v.source_table = 'donations' AND v.is_external = false)                                                                                                            +
     );                                                                                                                                                                       +
                                                                                                                                                                              +
   IF _rows IS NULL OR jsonb_array_length(_rows) = 0 THEN                                                                                                                     +
     RETURN jsonb_build_object('primary', NULL, 'counterpart', NULL,                                                                                                          +
       'sender', NULL, 'recipient', NULL, 'explorer_url', NULL, 'confirmations', NULL);                                                                                       +
   END IF;                                                                                                                                                                    +
                                                                                                                                                                              +
   -- ưu tiên row của caller làm primary; fallback row đầu                                                                                                                    +
   SELECT elem                                                                                                                                                                +
   INTO _primary                                                                                                                                                              +
   FROM jsonb_array_elements(_rows) elem                                                                                                                                      +
   WHERE _caller IS NOT NULL AND (elem->>'user_id')::uuid = _caller                                                                                                           +
   LIMIT 1;                                                                                                                                                                   +
                                                                                                                                                                              +
   IF _primary IS NULL THEN                                                                                                                                                   +
     _primary := _rows->0;                                                                                                                                                    +
   END IF;                                                                                                                                                                    +
                                                                                                                                                                              +
   SELECT elem                                                                                                                                                                +
   INTO _counterpart                                                                                                                                                          +
   FROM jsonb_array_elements(_rows) elem                                                                                                                                      +
   WHERE elem->>'id' <> (_primary->>'id')                                                                                                                                     +
   LIMIT 1;                                                                                                                                                                   +
                                                                                                                                                                              +
   -- Suy sender / recipient từ direction của primary                                                                                                                         +
   IF (_primary->>'direction') = 'out' THEN                                                                                                                                   +
     _sender_uid := NULLIF(_primary->>'user_id','')::uuid;                                                                                                                    +
     _recipient_uid := NULLIF(_primary->>'counterparty_user_id','')::uuid;                                                                                                    +
   ELSIF (_primary->>'direction') = 'in' THEN                                                                                                                                 +
     _recipient_uid := NULLIF(_primary->>'user_id','')::uuid;                                                                                                                 +
     _sender_uid := NULLIF(_primary->>'counterparty_user_id','')::uuid;                                                                                                       +
   ELSE                                                                                                                                                                       +
     _sender_uid := NULLIF(_primary->>'user_id','')::uuid;                                                                                                                    +
     _recipient_uid := NULLIF(_primary->>'counterparty_user_id','')::uuid;                                                                                                    +
   END IF;                                                                                                                                                                    +
                                                                                                                                                                              +
   _sender_addr := _primary->>'sender_address';                                                                                                                               +
   _recipient_addr := _primary->>'recipient_address';                                                                                                                         +
                                                                                                                                                                              +
   _sender := COALESCE(public._unified_profile_lite(_sender_uid),                                                                                                             +
     jsonb_build_object('user_id', NULL, 'display_name', NULL, 'username', NULL, 'avatar_url', NULL));                                                                        +
   _sender := _sender || jsonb_build_object('address', _sender_addr);                                                                                                         +
                                                                                                                                                                              +
   _recipient := COALESCE(public._unified_profile_lite(_recipient_uid),                                                                                                       +
     jsonb_build_object('user_id', NULL, 'display_name', NULL, 'username', NULL, 'avatar_url', NULL));                                                                        +
   _recipient := _recipient || jsonb_build_object('address', _recipient_addr);                                                                                                +
                                                                                                                                                                              +
   _chain := _primary->>'chain';                                                                                                                                              +
   _tx_hash_val := _primary->>'tx_hash';                                                                                                                                      +
   IF _tx_hash_val IS NOT NULL THEN                                                                                                                                           +
     IF _chain = 'bsc' THEN                                                                                                                                                   +
       _explorer := 'https://bscscan.com/tx/' || _tx_hash_val;                                                                                                                +
     ELSIF _chain = 'bsc_testnet' THEN                                                                                                                                        +
       _explorer := 'https://testnet.bscscan.com/tx/' || _tx_hash_val;                                                                                                        +
     ELSIF _chain = 'btc' THEN                                                                                                                                                +
       _explorer := 'https://mempool.space/tx/' || _tx_hash_val;                                                                                                              +
     END IF;                                                                                                                                                                  +
   END IF;                                                                                                                                                                    +
                                                                                                                                                                              +
   RETURN jsonb_build_object(                                                                                                                                                 +
     'primary', _primary,                                                                                                                                                     +
     'counterpart', _counterpart,                                                                                                                                             +
     'sender', _sender,                                                                                                                                                       +
     'recipient', _recipient,                                                                                                                                                 +
     'explorer_url', _explorer,                                                                                                                                               +
     'confirmations', NULL,                                                                                                                                                   +
     'raw', _rows                                                                                                                                                             +
   );                                                                                                                                                                         +
 END;                                                                                                                                                                         +
 $function$                                                                                                                                                                   +
 
(1 row)

