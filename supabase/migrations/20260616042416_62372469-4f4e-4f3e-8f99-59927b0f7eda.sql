
CREATE OR REPLACE FUNCTION public.trg_profile_impersonation_scan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.username IS NULL OR NEW.is_banned THEN RETURN NEW; END IF;
  PERFORM net.http_post(
    url := 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/identity-impersonation-scan',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'apikey','sb_publishable_2O67-byTv7js8tDjj7HGxg_hiFQ3WkI',
      'Authorization','Bearer sb_publishable_2O67-byTv7js8tDjj7HGxg_hiFQ3WkI'
    ),
    body := jsonb_build_object('profile_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_profile_impersonation_rescan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.avatar_url IS DISTINCT FROM OLD.avatar_url)
     OR (coalesce(NEW.display_name, NEW.full_name, NEW.username)
         IS DISTINCT FROM coalesce(OLD.display_name, OLD.full_name, OLD.username)) THEN
    PERFORM net.http_post(
      url := 'https://bhtsnervqiwchluwuxki.supabase.co/functions/v1/identity-impersonation-scan',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'apikey','sb_publishable_2O67-byTv7js8tDjj7HGxg_hiFQ3WkI',
        'Authorization','Bearer sb_publishable_2O67-byTv7js8tDjj7HGxg_hiFQ3WkI'
      ),
      body := jsonb_build_object('profile_id', NEW.id, 'reason','profile_changed')
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;
