-- File migration đã tạo sẵn: supabase/migrations/20260705074823_batch1_3_status_default_confirmed.sql
-- Migration này CREATE OR REPLACE 2 function get_unified_summary + get_unified_transactions,
-- chỉ thay đổi block `_statuses text[] := CASE ... END`:
--   WHEN _status = 'all' THEN NULL
--   WHEN _status IS NULL THEN ARRAY['success','confirmed','completed']  -- MỚI
-- (Trước đây: _status IS NULL → NULL → trả tất cả trạng thái.)
-- Nội dung SQL đầy đủ nằm trong file .sql tương ứng trong repo.
SELECT 'migration_placeholder — see file 20260705074823_batch1_3_status_default_confirmed.sql'::text;