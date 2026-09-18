
-- Add slug column to posts table
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS slug TEXT;

-- Create index for slug lookups
CREATE INDEX IF NOT EXISTS idx_posts_slug ON public.posts(slug);

-- Create unique index per user (each user's posts must have unique slugs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_user_slug ON public.posts(user_id, slug) WHERE slug IS NOT NULL;

-- Function to remove Vietnamese accents and generate slug
CREATE OR REPLACE FUNCTION public.generate_post_slug(title TEXT, p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 1;
BEGIN
  -- Return fallback if empty
  IF title IS NULL OR trim(title) = '' THEN
    base_slug := 'post';
  ELSE
    -- Remove Vietnamese accents
    base_slug := title;
    base_slug := translate(base_slug, 
      'áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ',
      'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'
    );
    -- Lowercase
    base_slug := lower(base_slug);
    -- Replace spaces and special chars with underscore
    base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '_', 'g');
    -- Trim underscores from start/end
    base_slug := trim(both '_' from base_slug);
    -- Limit to 60 chars, cut at last underscore if needed
    IF length(base_slug) > 60 THEN
      base_slug := substring(base_slug from 1 for 60);
      -- Cut at last underscore to avoid cutting mid-word
      IF position('_' in base_slug) > 0 THEN
        base_slug := substring(base_slug from 1 for length(base_slug) - position('_' in reverse(base_slug)));
      END IF;
    END IF;
  END IF;

  -- Handle empty result
  IF base_slug = '' OR base_slug IS NULL THEN
    base_slug := 'post_auto';
  END IF;

  -- Check uniqueness within user's posts
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM posts WHERE user_id = p_user_id AND slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '_' || counter;
  END LOOP;

  RETURN final_slug;
END;
$function$;

-- Trigger to auto-generate slug on insert
CREATE OR REPLACE FUNCTION public.auto_generate_post_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.slug IS NULL OR trim(NEW.slug) = '' THEN
    NEW.slug := public.generate_post_slug(NEW.content, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_auto_generate_post_slug ON public.posts;
CREATE TRIGGER trigger_auto_generate_post_slug
  BEFORE INSERT ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_post_slug();
