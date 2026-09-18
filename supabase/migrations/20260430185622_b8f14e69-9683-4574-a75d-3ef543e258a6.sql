-- 1. Drop constraint chặn snapshot_at trước khi epoch end
-- (Gate "epoch phải hết chu kỳ mới hiển thị" được enforce ở UI + edge function)
ALTER TABLE public.mint_epochs
  DROP CONSTRAINT IF EXISTS mint_epochs_snapshot_after_epoch_end;

-- 2. Đồng bộ epoch 2026-04 với allocations đã insert thành công
UPDATE public.mint_epochs
SET
  status = 'snapshot',
  snapshot_at = '2026-04-30T18:51:04+00:00'::timestamptz,
  eligible_users = 207,
  rules_version = 'MonetaryV1',
  updated_at = now()
WHERE id = '46c67c60-f932-46d0-a749-db42c4ae5cd3';