CREATE TABLE public.migration_gap_signups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  signup_method TEXT NOT NULL DEFAULT 'unknown',
  wallet_address TEXT,
  username TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.migration_gap_signups TO service_role;
REVOKE ALL ON public.migration_gap_signups FROM anon, authenticated;

ALTER TABLE public.migration_gap_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only_migration_gap_signups"
ON public.migration_gap_signups
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX idx_migration_gap_signups_created_at ON public.migration_gap_signups(created_at DESC);

INSERT INTO public.app_settings (key, value)
VALUES ('export_cutoff_time', '"2026-09-16T00:00:00Z"'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  reserved_names TEXT[] := ARRAY['admin','administrator','system','root','moderator','mod','support','help','lovable','supabase','null','undefined','api','www','mail','email','test','demo'];
  base_username TEXT;
  final_username TEXT;
  fallback_username TEXT;
  attempt INT := 0;
  v_wallet TEXT;
  v_has_password BOOLEAN;
  v_msg TEXT;
  v_cutoff TIMESTAMPTZ;
  v_method TEXT;
BEGIN
  base_username := lower(trim(COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  )));
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');

  IF length(base_username) < 3 THEN base_username := 'user'; END IF;

  IF base_username !~ '^[a-z]' THEN
    base_username := 'u' || base_username;
  END IF;

  IF length(base_username) > 25 THEN
    base_username := left(base_username, 25);
  END IF;

  IF lower(base_username) = ANY(reserved_names) THEN
    base_username := base_username || substr(md5(random()::text), 1, 4);
  END IF;

  final_username := base_username;
  fallback_username := 'u' || substr(replace(NEW.id::text, '-', ''), 1, 12);

  v_wallet := lower(trim(COALESCE(NEW.raw_user_meta_data->>'wallet_address', '')));
  IF v_wallet !~ '^0x[a-f0-9]{40}$' THEN
    v_wallet := NULL;
  END IF;

  v_has_password := (NEW.encrypted_password IS NOT NULL AND NEW.encrypted_password <> '');

  LOOP
    BEGIN
      INSERT INTO public.profiles (id, username, full_name, avatar_url, email, external_wallet_address, has_password)
      VALUES (NEW.id, final_username,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
        LOWER(NEW.email),
        v_wallet,
        v_has_password);
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        attempt := attempt + 1;
        IF attempt = 5 THEN
          final_username := fallback_username;
        ELSIF attempt > 5 THEN
          RAISE;
        ELSE
          final_username := base_username || '_' || substr(md5(random()::text), 1, 4);
        END IF;
      WHEN raise_exception THEN
        GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
        IF v_msg LIKE 'Username must be 3-30 characters%'
           OR v_msg LIKE 'Username %is reserved%' THEN
          attempt := attempt + 1;
          IF attempt > 5 THEN RAISE; END IF;
          final_username := fallback_username;
        ELSE
          RAISE;
        END IF;
    END;
  END LOOP;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');

  -- Nhánh ghi log migration gap (không bao giờ làm gãy signup)
  BEGIN
    SELECT (value #>> '{}')::timestamptz INTO v_cutoff
    FROM public.app_settings WHERE key = 'export_cutoff_time';

    IF v_cutoff IS NOT NULL AND COALESCE(NEW.created_at, now()) >= v_cutoff THEN
      IF v_has_password THEN
        v_method := 'password';
      ELSIF COALESCE(NEW.raw_app_meta_data->>'provider', '') = 'google' THEN
        v_method := 'oauth_google';
      ELSIF v_wallet IS NOT NULL THEN
        v_method := 'wallet';
      ELSE
        v_method := 'otp';
      END IF;

      INSERT INTO public.migration_gap_signups (user_id, email, signup_method, wallet_address, username, created_at)
      VALUES (NEW.id, LOWER(NEW.email), v_method, v_wallet, final_username, COALESCE(NEW.created_at, now()))
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;