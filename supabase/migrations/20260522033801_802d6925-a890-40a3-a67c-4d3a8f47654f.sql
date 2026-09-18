
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  base_username TEXT;
  final_username TEXT;
  attempt INT := 0;
  v_wallet TEXT;
  v_has_password BOOLEAN;
BEGIN
  base_username := lower(trim(COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  )));
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');
  IF length(base_username) < 3 THEN base_username := 'user'; END IF;
  IF length(base_username) > 26 THEN base_username := left(base_username, 26); END IF;
  final_username := base_username;

  -- Ví ngoài: chuẩn hóa lowercase + chỉ chấp nhận format hợp lệ
  v_wallet := lower(trim(COALESCE(NEW.raw_user_meta_data->>'wallet_address', '')));
  IF v_wallet !~ '^0x[a-f0-9]{40}$' THEN
    v_wallet := NULL;
  END IF;

  -- Cờ has_password: user có encrypted_password ngay từ đầu nghĩa là đăng ký bằng password
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
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      IF attempt >= 5 THEN RAISE; END IF;
      final_username := base_username || '_' || substr(md5(random()::text), 1, 4);
    END;
  END LOOP;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$function$;
