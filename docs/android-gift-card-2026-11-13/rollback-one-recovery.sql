-- NOT executed. Take a fresh backup and obtain authorization before rollback.
-- Only IDs inserted by the one-TX Android recovery are targeted.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $rollback$
DECLARE
  h constant text := '0x0e47286f240e22b9006cf5f58b6a3ea12d6e33022c1e0d753a6443efd03e5ad4';
  d constant uuid := 'da0c3856-8c02-404a-ac2f-4d44bec72206';
  p constant uuid := '0082e117-2559-40c4-8c77-2822f3ba66b7';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.donations WHERE id=d AND tx_hash=h
    AND metadata->>'source'='android-gift-recovery-2026-11-13') THEN
    RAISE EXCEPTION 'Recovery identity mismatch; no deletion';
  END IF;
  DELETE FROM public.unified_transactions_snapshot WHERE source_table='donations' AND source_id=d::text AND tx_hash=h;
  DELETE FROM public.transactions WHERE tx_hash=h
    AND user_id IN ('1c98a6eb-b939-43ab-aa6a-96a50b7b559f'::uuid,'5812ad63-2fc7-4858-9cea-264a7d151ce6'::uuid)
    AND from_address='0x7e12ce3a5e95ce580b647a1a3f5700266f471ec8'
    AND to_address='0x8b73415e530163df2e1ec4d45a641858a4af4bfb';
  DELETE FROM public.donations WHERE id=d AND tx_hash=h;
  DELETE FROM public.posts WHERE id=p AND tx_hash=h AND metadata->>'source'='android-gift-recovery-2026-11-13';
END;
$rollback$;
COMMIT;
