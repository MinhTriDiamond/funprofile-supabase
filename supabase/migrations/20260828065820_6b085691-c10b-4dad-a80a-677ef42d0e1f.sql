-- Atomic outflow: insert flow + debit vault trong 1 transaction, khoá dòng vault
CREATE OR REPLACE FUNCTION public.treasury_record_outflow_atomic(
  _vault_key text,
  _token_symbol text,
  _amount numeric,
  _reason text DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb,
  _reference_table text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vault public.treasury_vaults;
  v_flow_id uuid;
BEGIN
  IF _token_symbol IS NULL OR btrim(_token_symbol) = '' THEN
    RAISE EXCEPTION 'token_symbol required';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  SELECT * INTO v_vault
  FROM public.treasury_vaults
  WHERE vault_key = _vault_key AND token_symbol = _token_symbol
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vault % (%) không tồn tại', _vault_key, _token_symbol;
  END IF;

  IF v_vault.balance < _amount THEN
    RAISE EXCEPTION 'Vault % (%) không đủ số dư (cần %, có %)',
      _vault_key, _token_symbol, _amount, v_vault.balance;
  END IF;

  INSERT INTO public.treasury_flows (
    flow_type, source, destination_vault, amount, token_symbol,
    reason, reference_table, reference_id, metadata
  ) VALUES (
    'outflow', _vault_key, NULL, _amount, _token_symbol,
    COALESCE(_reason, 'Chi từ ví treasury (ghi nhận thủ công)'),
    COALESCE(_reference_table, 'onchain_tx'), _reference_id, COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_flow_id;

  UPDATE public.treasury_vaults
  SET balance = balance - _amount,
      total_outflow = total_outflow + _amount,
      updated_at = now()
  WHERE vault_key = _vault_key AND token_symbol = _token_symbol;

  RETURN jsonb_build_object(
    'flow_id', v_flow_id,
    'vault_key', _vault_key,
    'token_symbol', _token_symbol,
    'amount', _amount,
    'balance_after', v_vault.balance - _amount
  );
END;
$$;

-- Atomic recycle: chia theo allocation_pct của vault cùng token, insert flow + credit vault
CREATE OR REPLACE FUNCTION public.treasury_recycle_atomic(
  _source text,
  _token_symbol text,
  _amount numeric,
  _reason text DEFAULT NULL,
  _reference_table text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_portion numeric;
  v_total numeric := 0;
  v_flows jsonb := '[]'::jsonb;
  v_count int := 0;
BEGIN
  IF _token_symbol IS NULL OR btrim(_token_symbol) = '' THEN
    RAISE EXCEPTION 'token_symbol required';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be > 0';
  END IF;

  FOR v_rec IN
    SELECT vault_key, allocation_pct
    FROM public.treasury_vaults
    WHERE is_active = true AND token_symbol = _token_symbol
    ORDER BY vault_key
    FOR UPDATE
  LOOP
    v_count := v_count + 1;
    v_portion := floor(_amount * COALESCE(v_rec.allocation_pct, 0));
    IF v_portion > 0 THEN
      INSERT INTO public.treasury_flows (
        flow_type, source, destination_vault, amount, token_symbol,
        reason, reference_table, reference_id
      ) VALUES (
        'recycle', COALESCE(_source, 'unknown'), v_rec.vault_key, v_portion, _token_symbol,
        COALESCE(_reason, 'Platform fee recycle'), _reference_table, _reference_id
      );

      UPDATE public.treasury_vaults
      SET balance = balance + v_portion,
          total_inflow = total_inflow + v_portion,
          updated_at = now()
      WHERE vault_key = v_rec.vault_key AND token_symbol = _token_symbol;

      v_total := v_total + v_portion;
      v_flows := v_flows || jsonb_build_object('vault', v_rec.vault_key, 'amount', v_portion);
    END IF;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Không có vault active nào cho token %', _token_symbol;
  END IF;

  RETURN jsonb_build_object(
    'token_symbol', _token_symbol,
    'requested', _amount,
    'total_recycled', v_total,
    'flows', v_flows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.treasury_record_outflow_atomic(text, text, numeric, text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.treasury_recycle_atomic(text, text, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.treasury_record_outflow_atomic(text, text, numeric, text, jsonb, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.treasury_recycle_atomic(text, text, numeric, text, text, uuid) TO service_role;