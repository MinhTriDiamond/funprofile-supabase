
-- Function to remove Vietnamese diacritics and normalize text
CREATE OR REPLACE FUNCTION public.normalize_username(input_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  result text;
BEGIN
  result := input_text;
  
  -- Convert to lowercase
  result := lower(result);
  
  -- Remove Vietnamese diacritics
  result := translate(result, 
    'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyдaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  );
  
  -- Remove spaces and special characters, keep only alphanumeric and underscore
  result := regexp_replace(result, '[^a-z0-9_]', '', 'g');
  
  RETURN result;
END;
$function$;

-- Update fun_id generation to use normalized username (no @, lowercase, no diacritics)
CREATE OR REPLACE FUNCTION public.generate_fun_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set fun_id = normalized username (lowercase, no diacritics, no spaces)
  IF NEW.fun_id IS NULL AND NEW.username IS NOT NULL THEN
    NEW.fun_id := public.normalize_username(NEW.username);
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update existing users with normalized fun_id, handling duplicates by adding suffix
DO $$
DECLARE
  rec RECORD;
  normalized_id text;
  final_id text;
  counter int;
BEGIN
  FOR rec IN 
    SELECT id, username 
    FROM profiles 
    WHERE username IS NOT NULL 
    ORDER BY created_at ASC
  LOOP
    normalized_id := public.normalize_username(rec.username);
    final_id := normalized_id;
    counter := 1;
    
    -- Check for existing fun_id and add suffix if needed
    WHILE EXISTS (SELECT 1 FROM profiles WHERE fun_id = final_id AND id != rec.id) LOOP
      counter := counter + 1;
      final_id := normalized_id || counter::text;
    END LOOP;
    
    UPDATE profiles SET fun_id = final_id WHERE id = rec.id;
  END LOOP;
END $$;
