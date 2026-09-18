-- Snapshot backup table for wallet recovery 2026-06-01
CREATE TABLE IF NOT EXISTS public.profiles_wallet_backup_20260601 (
  id UUID PRIMARY KEY,
  wallet_address TEXT,
  external_wallet_address TEXT,
  public_wallet_address TEXT,
  custodial_wallet_address TEXT,
  updated_at TIMESTAMPTZ,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.profiles_wallet_backup_20260601 TO service_role;

ALTER TABLE public.profiles_wallet_backup_20260601 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view wallet backup"
ON public.profiles_wallet_backup_20260601
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Populate snapshot for all 1515 affected users (excluding 4 already-handled)
INSERT INTO public.profiles_wallet_backup_20260601
  (id, wallet_address, external_wallet_address, public_wallet_address, custodial_wallet_address, updated_at)
SELECT id, wallet_address, external_wallet_address, public_wallet_address, custodial_wallet_address, updated_at
FROM public.profiles
WHERE lower(public_wallet_address) = '0x9be9c53afc767efb8915c0f2c088b782f91714ca'
  AND id NOT IN (
    '70640edc-337f-4e89-bd7e-9501bd79ec9f',
    '1cc8b5cd-795b-4375-afa3-3db63e878692',
    '76e7410b-e0af-4f96-bfc4-2803ef561575',
    '58008daf-528d-45b5-9b17-a4ef64df943f'
  )
ON CONFLICT (id) DO NOTHING;