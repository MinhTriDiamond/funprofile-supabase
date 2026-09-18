
-- ============================================================
-- BÀI 6: Full URL Governance System
-- ============================================================

-- 1) Username history for 301 redirects when username changes
CREATE TABLE IF NOT EXISTS public.username_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  old_username TEXT NOT NULL,
  new_username TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_username_history_lookup ON public.username_history(old_username);
CREATE UNIQUE INDEX uq_username_history ON public.username_history(user_id, old_username);

ALTER TABLE public.username_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read username history" ON public.username_history FOR SELECT USING (true);

-- Trigger: track username changes on profiles
CREATE OR REPLACE FUNCTION public.track_username_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.username IS NOT NULL AND OLD.username != '' AND NEW.username IS DISTINCT FROM OLD.username THEN
    INSERT INTO public.username_history (user_id, old_username, new_username)
    VALUES (NEW.id, OLD.username, NEW.username)
    ON CONFLICT (user_id, old_username) DO UPDATE SET new_username = EXCLUDED.new_username;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER track_username_change
  AFTER UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.track_username_change();

-- 2) Improved slug generation with rate limit (max 50 tries) + random suffix fallback
CREATE OR REPLACE FUNCTION public.generate_content_slug(title TEXT, p_user_id UUID, p_table_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 1;
  max_tries INTEGER := 50;
  random_suffix TEXT;
BEGIN
  IF title IS NULL OR trim(title) = '' THEN
    base_slug := CASE p_table_name
      WHEN 'reels' THEN 'video'
      WHEN 'live_sessions' THEN 'live'
      ELSE 'post'
    END;
  ELSE
    -- NFD-style accent removal via translate
    base_slug := translate(title, 
      'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'
    );
    base_slug := lower(base_slug);
    -- Keep alnum + space + _ + -
    base_slug := regexp_replace(base_slug, '[^a-z0-9\s_-]', '', 'g');
    -- space/hyphen -> _
    base_slug := regexp_replace(base_slug, '[\s-]+', '_', 'g');
    -- collapse __
    base_slug := regexp_replace(base_slug, '_+', '_', 'g');
    -- trim _
    base_slug := trim(both '_' from base_slug);
    -- max 60 chars
    IF length(base_slug) > 60 THEN
      base_slug := substring(base_slug from 1 for 60);
      base_slug := rtrim(base_slug, '_');
    END IF;
  END IF;

  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := CASE p_table_name
      WHEN 'reels' THEN 'video_auto'
      WHEN 'live_sessions' THEN 'live_auto'
      ELSE 'post_auto'
    END;
  END IF;

  -- Try base slug first, then _2, _3, ... up to max_tries
  final_slug := base_slug;
  
  IF p_table_name = 'posts' THEN
    WHILE counter <= max_tries AND EXISTS (SELECT 1 FROM posts WHERE user_id = p_user_id AND slug = final_slug) LOOP
      counter := counter + 1;
      final_slug := base_slug || '_' || counter;
    END LOOP;
  ELSIF p_table_name = 'reels' THEN
    WHILE counter <= max_tries AND EXISTS (SELECT 1 FROM reels WHERE user_id = p_user_id AND slug = final_slug) LOOP
      counter := counter + 1;
      final_slug := base_slug || '_' || counter;
    END LOOP;
  ELSIF p_table_name = 'live_sessions' THEN
    WHILE counter <= max_tries AND EXISTS (SELECT 1 FROM live_sessions WHERE owner_id = p_user_id AND slug = final_slug) LOOP
      counter := counter + 1;
      final_slug := base_slug || '_' || counter;
    END LOOP;
  END IF;

  -- If still colliding after max_tries, add random 4-char suffix
  IF counter > max_tries THEN
    random_suffix := substr(md5(random()::text), 1, 4);
    final_slug := substring(base_slug from 1 for 55) || '_' || random_suffix;
  END IF;

  RETURN final_slug;
END;
$function$;

-- Also update generate_post_slug to use same improved logic
CREATE OR REPLACE FUNCTION public.generate_post_slug(title TEXT, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.generate_content_slug(title, p_user_id, 'posts');
END;
$function$;
