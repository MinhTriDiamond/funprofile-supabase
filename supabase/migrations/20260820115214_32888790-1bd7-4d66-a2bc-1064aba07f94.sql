-- Least-privilege: default privileges của project đang cấp INSERT/UPDATE/DELETE
-- cho anon/authenticated ⇒ thu hồi tường minh (chuẩn đã áp dụng ở Batch 4).
REVOKE ALL ON public.admin_backfill_jobs FROM anon;
REVOKE ALL ON public.admin_backfill_candidates FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.admin_backfill_jobs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.admin_backfill_candidates FROM authenticated;
GRANT SELECT ON public.admin_backfill_jobs TO authenticated;
GRANT SELECT ON public.admin_backfill_candidates TO authenticated;
GRANT ALL ON public.admin_backfill_jobs TO service_role;
GRANT ALL ON public.admin_backfill_candidates TO service_role;
