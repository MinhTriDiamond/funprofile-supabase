-- B3-01: chặn user thường tự set is_reward_eligible (bằng chứng live: UPDATE thành công trước khi vá)

CREATE OR REPLACE FUNCTION public.posts_freeze_system_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
BEGIN
  -- Chỉ áp dụng cho writer đi qua Data API (anon/authenticated).
  -- service_role / postgres (edge function, cron, migration) được ghi tự do.
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  IF v_uid IS NOT NULL THEN
    v_is_admin := public.has_role(v_uid, 'admin'::app_role);
  END IF;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  NEW.is_reward_eligible := OLD.is_reward_eligible;
  NEW.moderation_status  := OLD.moderation_status;
  NEW.content_hash       := OLD.content_hash;
  NEW.pplp_pillar        := OLD.pplp_pillar;
  NEW.user_id            := OLD.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_freeze_system_columns ON public.posts;
CREATE TRIGGER trg_posts_freeze_system_columns
BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.posts_freeze_system_columns();

-- RLS: viết rõ WITH CHECK (trước đây NULL, chỉ dựa vào USING)
DROP POLICY IF EXISTS "Users can update their own posts" ON public.posts;
CREATE POLICY "Users can update their own posts"
ON public.posts
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Khách chưa đăng nhập không cần quyền ghi
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.posts FROM anon;
GRANT SELECT ON public.posts TO anon;