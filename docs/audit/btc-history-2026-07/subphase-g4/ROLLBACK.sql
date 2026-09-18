-- G4 rollback — chạy khi cần gỡ Sub-phase G4
-- An toàn: chỉ xoá dữ liệu do parser v2 sinh + gỡ RPC/cột thêm ở G4.
-- KHÔNG đụng bảng cũ (donations, wallet_transfers) hay dữ liệu G3.

BEGIN;

-- 1) Xoá row do parser v2 tạo (chỉ những row có classifier_version=v2.0.0-g4)
DELETE FROM public.btc_tx_semantic
WHERE classifier_version = 'v2.0.0-g4';

-- 2) Xoá review queue chưa duyệt do parser/discovery v2 enqueue trong G4
--    (thay '<G4_START_TS>' bằng thời điểm apply migration)
DELETE FROM public.btc_review_queue
WHERE created_at >= '2026-07-03 00:00:00+00'
  AND reviewer_id IS NULL
  AND status = 'pending';

-- 3) Xoá cache do parser v2 tự fetch trong G4
DELETE FROM public.btc_raw_tx_cache
WHERE fetched_at >= '2026-07-03 00:00:00+00';

-- 4) Xoá ownership snapshot do discovery v2 auto-apply (rất hiếm khi bật)
DELETE FROM public.btc_ownership_snapshot
WHERE source = 'hd_change_verified'
  AND verified_at >= '2026-07-03 00:00:00+00';

-- 5) Gỡ RPC + cột + index thêm ở G4
DROP FUNCTION IF EXISTS public.btc_persist_semantic_batch(JSONB, JSONB, JSONB);
DROP INDEX    IF EXISTS public.btc_raw_tx_cache_sha256_idx;
ALTER TABLE public.btc_raw_tx_cache DROP COLUMN IF EXISTS raw_sha256;

COMMIT;

-- 6) Xoá 2 edge function qua Lovable UI:
--    - btc-parser-v2
--    - btc-discovery-v2
