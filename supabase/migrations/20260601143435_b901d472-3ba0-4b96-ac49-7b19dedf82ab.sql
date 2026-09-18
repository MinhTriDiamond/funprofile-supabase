CREATE OR REPLACE FUNCTION public.prevent_wallet_hijack()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict_user uuid;
  v_new_addr text;
  v_col text;
BEGIN
  FOR v_col, v_new_addr IN
    SELECT * FROM (VALUES
      ('public_wallet_address',   lower(NEW.public_wallet_address)),
      ('external_wallet_address', lower(NEW.external_wallet_address)),
      ('wallet_address',          lower(NEW.wallet_address)),
      ('custodial_wallet_address',lower(NEW.custodial_wallet_address))
    ) AS t(col, addr)
  LOOP
    IF v_new_addr IS NULL OR v_new_addr = '' THEN
      CONTINUE;
    END IF;

    IF TG_OP = 'UPDATE' THEN
      IF (v_col = 'public_wallet_address'    AND lower(OLD.public_wallet_address)    IS NOT DISTINCT FROM v_new_addr)
      OR (v_col = 'external_wallet_address'  AND lower(OLD.external_wallet_address)  IS NOT DISTINCT FROM v_new_addr)
      OR (v_col = 'wallet_address'           AND lower(OLD.wallet_address)           IS NOT DISTINCT FROM v_new_addr)
      OR (v_col = 'custodial_wallet_address' AND lower(OLD.custodial_wallet_address) IS NOT DISTINCT FROM v_new_addr)
      THEN
        CONTINUE;
      END IF;
    END IF;

    SELECT id INTO v_conflict_user
    FROM public.profiles
    WHERE id <> NEW.id
      AND (
        lower(public_wallet_address)    = v_new_addr OR
        lower(external_wallet_address)  = v_new_addr OR
        lower(wallet_address)           = v_new_addr OR
        lower(custodial_wallet_address) = v_new_addr
      )
    LIMIT 1;

    IF v_conflict_user IS NOT NULL THEN
      RAISE EXCEPTION 'WALLET_HIJACK_BLOCKED: address % (col=%) đã thuộc về user % — không được gán cho user %',
        v_new_addr, v_col, v_conflict_user, NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_wallet_hijack() IS
  'Chặn gán địa chỉ ví đã thuộc về user khác. Bảo vệ trước SQL thủ công sai WHERE và bug code.';