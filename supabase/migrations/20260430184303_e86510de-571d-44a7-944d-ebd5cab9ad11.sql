-- Hạ ngưỡng dust threshold từ 200 → 100 FUN cho Monetary v1 (B+)
-- Mục đích: vớt thêm ~300 user LS thấp (5–200) vào epoch khi pool lớn (50M+)
ALTER TABLE public.mint_allocations DROP CONSTRAINT IF EXISTS mint_allocations_min_amount_when_pending;

ALTER TABLE public.mint_allocations
ADD CONSTRAINT mint_allocations_min_amount_when_pending
CHECK (
  status <> 'pending'
  OR allocation_amount_capped >= 100
  OR allocation_amount_capped = 0
);