-- Fix mutable search_path on update_pplp_mint_requests_updated_at
CREATE OR REPLACE FUNCTION public.update_pplp_mint_requests_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;