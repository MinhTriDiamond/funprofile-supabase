DELETE FROM public.mint_epochs
WHERE epoch_month IS NULL
  AND epoch_date >= '2026-06-01'
  AND epoch_date < '2026-07-01'
  AND status = 'open'
  AND mint_pool = 100000;