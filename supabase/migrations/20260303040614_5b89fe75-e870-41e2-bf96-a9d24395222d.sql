
-- PR4: Fix security linter warnings

-- 1. Add RLS policies for live_recordings (currently RLS enabled but no policies)
CREATE POLICY "Host can view own recordings"
ON public.live_recordings FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id = live_recordings.live_id
    AND ls.host_user_id = auth.uid()
  )
);

CREATE POLICY "Host can insert recordings"
ON public.live_recordings FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id = live_recordings.live_id
    AND ls.host_user_id = auth.uid()
  )
);

-- 2. Add RLS policies for rate_limit_state (internal table, restrict to service role)
CREATE POLICY "Service role manages rate limits"
ON public.rate_limit_state FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Fix functions without search_path set
CREATE OR REPLACE FUNCTION public.track_slug_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.slug IS DISTINCT FROM NEW.slug THEN
    INSERT INTO public.slug_redirects (content_type, content_id, old_slug, new_slug)
    VALUES (TG_ARGV[0], NEW.id, OLD.slug, NEW.slug)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_username_format()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    IF NEW.username !~ '^[a-z][a-z0-9_.]{2,29}$' THEN
      RAISE EXCEPTION 'Username must be 3-30 characters, start with lowercase letter, contain only lowercase letters, numbers, dots and underscores';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Fix reel_views INSERT policy: require authentication
DROP POLICY IF EXISTS "Anyone can record views" ON public.reel_views;
CREATE POLICY "Authenticated users can record views"
ON public.reel_views FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
