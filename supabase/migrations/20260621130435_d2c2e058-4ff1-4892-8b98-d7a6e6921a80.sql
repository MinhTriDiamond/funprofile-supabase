-- Audit table
CREATE TABLE IF NOT EXISTS public.btc_father_backfill_audit_20260621 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id uuid,
  tx_hash text,
  action text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.btc_father_backfill_audit_20260621 TO service_role;
GRANT SELECT ON public.btc_father_backfill_audit_20260621 TO authenticated;
ALTER TABLE public.btc_father_backfill_audit_20260621 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read" ON public.btc_father_backfill_audit_20260621 FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

-- Step 1: reclassify 6 donations external → internal
WITH ids(id) AS (VALUES
  ('9206f8b2-5e4e-4843-8b09-10db39992c07'::uuid),
  ('d10a74e1-3f32-4311-a144-9550d8f36ff0'::uuid),
  ('13d594c5-9036-4ebb-b61d-942743ca4b0c'::uuid),
  ('f8486a61-6a39-4560-b06a-999dfcd32c36'::uuid),
  ('a8acff69-3f45-495f-a1f5-133b7ca65751'::uuid),
  ('859c6e91-ce97-461a-8a82-b9c70f7fb74f'::uuid)
), upd AS (
  UPDATE public.donations d
  SET is_external = false,
      leaderboard_eligibility = 'internal'
  FROM ids
  WHERE d.id = ids.id
  RETURNING d.id, d.tx_hash, d.amount, d.recipient_id
)
INSERT INTO public.btc_father_backfill_audit_20260621(donation_id, tx_hash, action, payload)
SELECT id, tx_hash, 'reclassify_internal',
       jsonb_build_object('amount', amount, 'recipient_id', recipient_id)
FROM upd;

-- Step 2: backfill missing sender-side transactions for Father (4 dòng)
WITH missing AS (
  SELECT d.id AS donation_id, d.tx_hash, d.sender_id, d.recipient_id,
         d.sender_address, d.recipient_address, d.amount, d.token_symbol,
         COALESCE(d.confirmed_at, d.created_at) AS ts
  FROM public.donations d
  WHERE d.sender_id = '4466cccf-6287-4a19-9b19-c2bd4d763f47'
    AND d.token_symbol = 'BTC'
    AND COALESCE(d.confirmed_at, d.created_at) >= '2026-06-11'
    AND NOT EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.tx_hash = d.tx_hash AND t.user_id = d.sender_id
    )
), ins AS (
  INSERT INTO public.transactions
    (user_id, tx_hash, from_address, to_address, amount, token_symbol, chain_id, status, created_at)
  SELECT sender_id, tx_hash, sender_address, recipient_address,
         amount::text, token_symbol, 0, 'confirmed', ts
  FROM missing
  RETURNING id, tx_hash, user_id
)
INSERT INTO public.btc_father_backfill_audit_20260621(donation_id, tx_hash, action, payload)
SELECT m.donation_id, m.tx_hash, 'insert_sender_tx',
       jsonb_build_object('transaction_id', i.id, 'user_id', i.user_id, 'amount', m.amount)
FROM missing m JOIN ins i ON i.tx_hash = m.tx_hash AND i.user_id = m.sender_id;