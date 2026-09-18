-- 1) Xóa text history rác (< 3 ký tự sau trim)
DELETE FROM public.search_history
WHERE type = 'text'
  AND char_length(btrim(query)) < 3;

-- 2) Xóa các query trung gian: cùng user, type=text, có query dài hơn cùng prefix trong vòng 120s
DELETE FROM public.search_history sh
USING public.search_history sh2
WHERE sh.user_id = sh2.user_id
  AND sh.type = 'text' AND sh2.type = 'text'
  AND sh.id <> sh2.id
  AND lower(btrim(sh2.query)) LIKE lower(btrim(sh.query)) || '%'
  AND char_length(btrim(sh2.query)) > char_length(btrim(sh.query))
  AND abs(extract(epoch FROM (sh2.last_used_at - sh.last_used_at))) < 120;

-- 3) Cleanup search_logs ngắn (nếu bảng tồn tại)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='search_logs') THEN
    EXECUTE 'DELETE FROM public.search_logs WHERE char_length(btrim(search_query)) < 3';
  END IF;
END $$;

-- 4) Giới hạn 20 record / user
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY last_used_at DESC) AS rn
  FROM public.search_history
)
DELETE FROM public.search_history
WHERE id IN (SELECT id FROM ranked WHERE rn > 20);