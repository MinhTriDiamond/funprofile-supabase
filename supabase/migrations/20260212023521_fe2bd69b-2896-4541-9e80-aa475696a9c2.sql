
CREATE OR REPLACE FUNCTION public.cleanup_profile_files()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- On DELETE, clean up both avatar and cover (only Supabase storage URLs)
  IF TG_OP = 'DELETE' THEN
    IF OLD.avatar_url IS NOT NULL AND OLD.avatar_url LIKE '%supabase%' THEN
      PERFORM delete_storage_object('avatars', substring(OLD.avatar_url from 'avatars/(.*)$'));
    END IF;
    
    IF OLD.cover_url IS NOT NULL AND OLD.cover_url LIKE '%supabase%' THEN
      PERFORM delete_storage_object('avatars', substring(OLD.cover_url from 'avatars/(.*)$'));
    END IF;
    
    RETURN OLD;
  END IF;
  
  -- On UPDATE, clean up old files if they changed (only Supabase storage URLs, skip R2/external URLs)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.avatar_url IS NOT NULL AND OLD.avatar_url != COALESCE(NEW.avatar_url, '') AND OLD.avatar_url LIKE '%supabase%' THEN
      PERFORM delete_storage_object('avatars', substring(OLD.avatar_url from 'avatars/(.*)$'));
    END IF;
    
    IF OLD.cover_url IS NOT NULL AND OLD.cover_url != COALESCE(NEW.cover_url, '') AND OLD.cover_url LIKE '%supabase%' THEN
      PERFORM delete_storage_object('avatars', substring(OLD.cover_url from 'avatars/(.*)$'));
    END IF;
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$function$;
