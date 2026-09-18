
-- 1. Fix trigger handle_new_user() to include email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  attempt INT := 0;
BEGIN
  base_username := lower(trim(COALESCE(
    NEW.raw_user_meta_data->>'username',
    SPLIT_PART(NEW.email, '@', 1)
  )));
  base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');
  IF length(base_username) < 3 THEN base_username := 'user'; END IF;
  IF length(base_username) > 26 THEN base_username := left(base_username, 26); END IF;
  final_username := base_username;

  LOOP
    BEGIN
      INSERT INTO public.profiles (id, username, full_name, avatar_url, email)
      VALUES (NEW.id, final_username,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
        LOWER(NEW.email));
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
$$;

-- 2. Backfill missing emails from auth.users
UPDATE profiles p
SET email = LOWER(u.email)
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL AND u.email IS NOT NULL;
