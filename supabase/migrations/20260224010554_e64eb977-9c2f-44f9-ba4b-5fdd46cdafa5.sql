
-- Add slug to reels table
ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE INDEX IF NOT EXISTS idx_reels_slug ON public.reels(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_user_slug ON public.reels(user_id, slug) WHERE slug IS NOT NULL;

-- Add slug to live_sessions table
ALTER TABLE public.live_sessions ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE INDEX IF NOT EXISTS idx_live_sessions_slug ON public.live_sessions(slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_live_sessions_owner_slug ON public.live_sessions(owner_id, slug) WHERE slug IS NOT NULL;

-- Reuse the same generate_post_slug function but generalize it
-- Create a generic slug generator
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
  slug_exists BOOLEAN;
BEGIN
  IF title IS NULL OR trim(title) = '' THEN
    base_slug := CASE p_table_name
      WHEN 'reels' THEN 'video'
      WHEN 'live_sessions' THEN 'live'
      ELSE 'post'
    END;
  ELSE
    base_slug := title;
    base_slug := translate(base_slug, 
      'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'
    );
    base_slug := lower(base_slug);
    base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '_', 'g');
    base_slug := trim(both '_' from base_slug);
    IF length(base_slug) > 60 THEN
      base_slug := substring(base_slug from 1 for 60);
      IF position('_' in base_slug) > 0 THEN
        base_slug := substring(base_slug from 1 for length(base_slug) - position('_' in reverse(base_slug)));
      END IF;
    END IF;
  END IF;

  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := CASE p_table_name
      WHEN 'reels' THEN 'video_auto'
      WHEN 'live_sessions' THEN 'live_auto'
      ELSE 'post_auto'
    END;
  END IF;

  final_slug := base_slug;
  
  IF p_table_name = 'reels' THEN
    WHILE EXISTS (SELECT 1 FROM reels WHERE user_id = p_user_id AND slug = final_slug) LOOP
      counter := counter + 1;
      final_slug := base_slug || '_' || counter;
    END LOOP;
  ELSIF p_table_name = 'live_sessions' THEN
    WHILE EXISTS (SELECT 1 FROM live_sessions WHERE owner_id = p_user_id AND slug = final_slug) LOOP
      counter := counter + 1;
      final_slug := base_slug || '_' || counter;
    END LOOP;
  END IF;

  RETURN final_slug;
END;
$function$;

-- Trigger for reels
CREATE OR REPLACE FUNCTION public.auto_generate_reel_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN
    NEW.slug := public.generate_content_slug(NEW.caption, NEW.user_id, 'reels');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_auto_generate_reel_slug ON public.reels;
CREATE TRIGGER trigger_auto_generate_reel_slug
  BEFORE INSERT ON public.reels
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_reel_slug();

-- Trigger for live_sessions
CREATE OR REPLACE FUNCTION public.auto_generate_live_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN
    NEW.slug := public.generate_content_slug(NEW.title, NEW.owner_id, 'live_sessions');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_auto_generate_live_slug ON public.live_sessions;
CREATE TRIGGER trigger_auto_generate_live_slug
  BEFORE INSERT ON public.live_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_live_slug();

-- Backfill reels
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT id, caption, user_id FROM reels WHERE slug IS NULL LOOP
    UPDATE reels SET slug = public.generate_content_slug(rec.caption, rec.user_id, 'reels') WHERE id = rec.id;
  END LOOP;
END;
$$;

-- Backfill live_sessions
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT id, title, owner_id FROM live_sessions WHERE slug IS NULL LOOP
    UPDATE live_sessions SET slug = public.generate_content_slug(rec.title, rec.owner_id, 'live_sessions') WHERE id = rec.id;
  END LOOP;
END;
$$;
