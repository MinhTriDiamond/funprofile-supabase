-- 1) Rollback: xoá các allocation chưa claim của epoch tháng 4/2026
DELETE FROM public.mint_allocations a
USING public.mint_epochs e
WHERE a.epoch_id = e.id
  AND e.epoch_month = '2026-04'
  AND a.status = 'pending'
  AND a.mint_request_id IS NULL;

-- 2) Đưa epoch tháng 4 về trạng thái 'open' để chờ snapshot đúng hạn (đầu tháng 5)
UPDATE public.mint_epochs
SET status = 'open',
    snapshot_at = NULL,
    updated_at = now()
WHERE epoch_month = '2026-04';

-- 3) CHECK constraint: snapshot_at phải >= đầu tháng kế tiếp của epoch_date
ALTER TABLE public.mint_epochs
  DROP CONSTRAINT IF EXISTS mint_epochs_snapshot_after_epoch_end;

ALTER TABLE public.mint_epochs
  ADD CONSTRAINT mint_epochs_snapshot_after_epoch_end
  CHECK (
    snapshot_at IS NULL
    OR snapshot_at >= (epoch_date + INTERVAL '1 month')
  );

-- 4) CHECK constraint: allocation pending phải >= 200 FUN (MIN_MINT_AMOUNT)
ALTER TABLE public.mint_allocations
  DROP CONSTRAINT IF EXISTS mint_allocations_min_amount_when_pending;

ALTER TABLE public.mint_allocations
  ADD CONSTRAINT mint_allocations_min_amount_when_pending
  CHECK (
    status <> 'pending'
    OR allocation_amount_capped >= 200
    OR allocation_amount_capped = 0
  );