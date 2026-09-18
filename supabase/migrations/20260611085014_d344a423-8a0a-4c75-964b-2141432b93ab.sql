CREATE TABLE public.profile_btc_aux_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  address text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'hd_change',
  first_seen_tx text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.profile_btc_aux_addresses TO anon, authenticated;
GRANT ALL ON public.profile_btc_aux_addresses TO service_role;

ALTER TABLE public.profile_btc_aux_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read aux btc addresses"
  ON public.profile_btc_aux_addresses FOR SELECT USING (true);

CREATE POLICY "Service role manages aux btc addresses"
  ON public.profile_btc_aux_addresses FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_profile_btc_aux_user ON public.profile_btc_aux_addresses(user_id);
CREATE INDEX idx_profile_btc_aux_address ON public.profile_btc_aux_addresses(address);