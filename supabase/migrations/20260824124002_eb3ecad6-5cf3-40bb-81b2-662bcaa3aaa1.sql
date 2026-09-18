CREATE TABLE IF NOT EXISTS public.signup_failure_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  email_input TEXT,
  username_input TEXT,
  sqlstate TEXT,
  error_message TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.signup_failure_log TO authenticated;
GRANT ALL ON public.signup_failure_log TO service_role;

ALTER TABLE public.signup_failure_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read signup failures"
ON public.signup_failure_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_signup_failure_log_occurred_at
  ON public.signup_failure_log (occurred_at DESC);

CREATE OR REPLACE FUNCTION public.log_signup_failure(
  _source TEXT,
  _email TEXT DEFAULT NULL,
  _username TEXT DEFAULT NULL,
  _sqlstate TEXT DEFAULT NULL,
  _error_message TEXT DEFAULT NULL,
  _context JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.signup_failure_log (source, email_input, username_input, sqlstate, error_message, context)
  VALUES (left(COALESCE(_source, 'unknown'), 64), left(_email, 320), left(_username, 64),
          left(_sqlstate, 16), left(_error_message, 4000), COALESCE(_context, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_signup_failure(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_signup_failure(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  base_username := lower(trim(COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  )));
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');

  IF length(base_username) < 3 THEN base_username := 'user'; END IF;

  -- Nhánh 1: username không bắt đầu bằng chữ cái (số hoặc gạch dưới)
  IF base_username !~ '^[a-z]' THEN
    base_username := 'u' || base_username;
  END IF;

  -- Nhánh 3: chừa 5 ký tự cho hậu tố retry '_xxxx' để không vượt 30 ký tự
  IF length(base_username) > 25 THEN
    base_username := left(base_username, 25);
  END IF;

  -- Nhánh 2: username thuộc danh sách reserved
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
        -- CHỈ fallback cho 3 nhánh lỗi đã xác định; mọi lỗi khác phải RAISE
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
  RETURN NEW;
END;
$function$;