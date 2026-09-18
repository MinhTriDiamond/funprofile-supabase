
-- Update fun_id generation to use @username format
CREATE OR REPLACE FUNCTION public.generate_fun_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set fun_id = @username
  IF NEW.fun_id IS NULL AND NEW.username IS NOT NULL THEN
    NEW.fun_id := '@' || NEW.username;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update existing users: set fun_id = @username where fun_id is null or uses old format
UPDATE profiles 
SET fun_id = '@' || username 
WHERE username IS NOT NULL 
  AND (fun_id IS NULL OR fun_id LIKE 'FUN-%');
