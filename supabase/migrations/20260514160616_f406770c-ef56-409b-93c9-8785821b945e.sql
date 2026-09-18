
CREATE OR REPLACE FUNCTION public.mystery_box_set_expiry()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.expires_at IS NULL AND NEW.opened_at IS NULL THEN
    NEW.expires_at := now() + interval '90 days';
  END IF;
  RETURN NEW;
END;$$;
