-- Rolled-back live tests for the audit hardening guards (writer simulated as role 'authenticated' with a JWT sub)
BEGIN;
CREATE TEMP TABLE _gt2(msg text);
GRANT INSERT, SELECT ON _gt2 TO authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0adf0c4-6d67-4cae-96ff-2d54b8784445","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_status text; v_elig boolean;
BEGIN
  -- 1) forged light action claiming approved status + eligibility
  INSERT INTO public.light_actions (user_id, action_type, reference_type, light_score, mint_status, is_eligible)
  VALUES ('c0adf0c4-6d67-4cae-96ff-2d54b8784445', 'post', 'post', 9999, 'approved', true)
  RETURNING mint_status, is_eligible INTO v_status, v_elig;
  INSERT INTO _gt2 VALUES ('light_actions forged insert -> stored mint_status=' || v_status || ', is_eligible=' || v_elig);
  -- 2) crypto_gifts client write must be rejected
  BEGIN
    INSERT INTO public.crypto_gifts (from_user_id, to_user_id, token, amount_numeric, status)
    VALUES ('c0adf0c4-6d67-4cae-96ff-2d54b8784445', '45d20c2e-4179-470c-941d-8669350cedbc', 'USDT', 100, 'confirmed');
    INSERT INTO _gt2 VALUES ('crypto_gifts insert -> NOT BLOCKED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _gt2 VALUES ('crypto_gifts insert -> ' || SQLERRM);
  END;
  -- 3) wallet_transfers with XSS token must be rejected
  BEGIN
    INSERT INTO public.wallet_transfers (user_id, tx_hash, direction, token_symbol, amount, status)
    VALUES ('c0adf0c4-6d67-4cae-96ff-2d54b8784445', '0xabc', 'out', '<script>alert(1)</script>', 5, 'confirmed');
    INSERT INTO _gt2 VALUES ('wallet_transfers bad token -> NOT BLOCKED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _gt2 VALUES ('wallet_transfers bad token -> ' || SQLERRM);
  END;
  -- 4) clean wallet transfer passes the guard (insert succeeds inside this rolled-back tx)
  INSERT INTO public.wallet_transfers (user_id, tx_hash, direction, token_symbol, amount, status)
  VALUES ('c0adf0c4-6d67-4cae-96ff-2d54b8784445', '0x5060dda597ae2e3224f4f2425ef3d55643af03de794bcdb84de9211a882e9329', 'out', 'USDT', 5, 'confirmed');
  INSERT INTO _gt2 VALUES ('wallet_transfers clean -> inserted OK (rolled back)');
END $$;
RESET ROLE;
SELECT msg FROM _gt2;
ROLLBACK;
