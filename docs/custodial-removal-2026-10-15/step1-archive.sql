CREATE TABLE IF NOT EXISTS public.custodial_wallets_archive_20261015 (
  id uuid, user_id uuid, wallet_address text, chain_id integer,
  is_active boolean, created_at timestamptz, updated_at timestamptz
);
INSERT INTO public.custodial_wallets_archive_20261015 (id, user_id, wallet_address, chain_id, is_active, created_at, updated_at)
SELECT id, user_id, wallet_address, chain_id, is_active, created_at, updated_at FROM public.custodial_wallets
ON CONFLICT DO NOTHING;
ALTER TABLE public.custodial_wallets_archive_20261015 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.custodial_wallets_archive_20261015 FROM anon, authenticated, public;
SELECT (SELECT COUNT(*) FROM public.custodial_wallets_archive_20261015) AS archived,
       (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='custodial_wallets_archive_20261015' AND column_name ILIKE '%key%') AS key_columns;
