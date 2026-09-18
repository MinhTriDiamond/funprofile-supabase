CREATE TABLE IF NOT EXISTS public.user_watched_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address text NOT NULL,
  chain text NOT NULL CHECK (chain IN ('bsc','btc')),
  label text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, address, chain)
);

CREATE INDEX IF NOT EXISTS idx_uww_user ON public.user_watched_wallets(user_id) WHERE enabled = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_watched_wallets TO authenticated;
GRANT ALL ON public.user_watched_wallets TO service_role;

ALTER TABLE public.user_watched_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User selects own watched wallets"
  ON public.user_watched_wallets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "User inserts own watched wallets"
  ON public.user_watched_wallets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User updates own watched wallets"
  ON public.user_watched_wallets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "User deletes own watched wallets"
  ON public.user_watched_wallets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Normalize: EVM lowercase, trim
CREATE OR REPLACE FUNCTION public.normalize_user_watched_wallet()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.address := trim(NEW.address);
  IF NEW.chain = 'bsc' THEN
    NEW.address := lower(NEW.address);
    IF NEW.address !~ '^0x[0-9a-f]{40}$' THEN
      RAISE EXCEPTION 'Invalid EVM address: %', NEW.address;
    END IF;
  END IF;
  IF NEW.chain = 'btc' THEN
    IF length(NEW.address) < 26 OR length(NEW.address) > 90 THEN
      RAISE EXCEPTION 'Invalid BTC address: %', NEW.address;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_user_watched_wallet ON public.user_watched_wallets;
CREATE TRIGGER trg_normalize_user_watched_wallet
  BEFORE INSERT OR UPDATE ON public.user_watched_wallets
  FOR EACH ROW EXECUTE FUNCTION public.normalize_user_watched_wallet();