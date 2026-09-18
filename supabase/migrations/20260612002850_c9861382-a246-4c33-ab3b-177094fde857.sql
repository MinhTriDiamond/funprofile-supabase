-- Step 2: Schema for BTC history integrity
-- Add recipient_address to donations to keep on-chain evidence of which output the row was created from
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS recipient_address text;

CREATE INDEX IF NOT EXISTS idx_donations_btc_recipient_address
  ON public.donations (recipient_address)
  WHERE token_symbol = 'BTC';

CREATE INDEX IF NOT EXISTS idx_donations_btc_tx
  ON public.donations (tx_hash)
  WHERE token_symbol = 'BTC';

-- Audit table for the BTC history repair
CREATE TABLE IF NOT EXISTS public.btc_history_repair_audit_20260612 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  donation_id uuid,
  tx_hash text NOT NULL,
  action text NOT NULL,
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.btc_history_repair_audit_20260612 TO service_role;
GRANT SELECT ON public.btc_history_repair_audit_20260612 TO authenticated;

ALTER TABLE public.btc_history_repair_audit_20260612 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read btc repair audit"
ON public.btc_history_repair_audit_20260612
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));