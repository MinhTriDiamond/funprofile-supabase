-- Rolled-back live test of the client guard (writer simulated as role 'authenticated')
BEGIN;
CREATE TEMP TABLE _gt(msg text);
GRANT INSERT, SELECT ON _gt TO authenticated;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.donations (sender_id, recipient_id, amount, amount_usd, token_symbol, tx_hash, status, chain_id)
    VALUES ('c0adf0c4-6d67-4cae-96ff-2d54b8784445', '45d20c2e-4179-470c-941d-8669350cedbc', '1', 1, '<script>alert(1)</script>', '0xtest1', 'confirmed', 56);
    INSERT INTO _gt VALUES ('bad payload: NOT BLOCKED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _gt VALUES ('bad payload -> ' || SQLERRM);
  END;
  BEGIN
    INSERT INTO public.donations (sender_id, recipient_id, amount, amount_usd, token_symbol, tx_hash, status, chain_id)
    VALUES ('c0adf0c4-6d67-4cae-96ff-2d54b8784445', '45d20c2e-4179-470c-941d-8669350cedbc', '-1', -1, 'USDT', '0xabc', 'confirmed', 56);
    INSERT INTO _gt VALUES ('negative payload: NOT BLOCKED');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _gt VALUES ('negative payload -> ' || SQLERRM);
  END;
  BEGIN
    INSERT INTO public.donations (sender_id, recipient_id, amount, amount_usd, token_symbol, tx_hash, status, chain_id)
    VALUES ('c0adf0c4-6d67-4cae-96ff-2d54b8784445', '45d20c2e-4179-470c-941d-8669350cedbc', '5', 5, 'USDT', '0x5060dda597ae2e3224f4f2425ef3d55643af03de794bcdb84de9211a882e9329', 'confirmed', 56);
    INSERT INTO _gt VALUES ('clean payload: INSERTED (unexpected in this simulation)');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _gt VALUES ('clean payload -> ' || SQLERRM);
  END;
END $$;
RESET ROLE;
SELECT msg FROM _gt;
ROLLBACK;
