CREATE OR REPLACE FUNCTION public.pet_unequip_cosmetic(_cosmetic_id uuid)
RETURNS public.pet_cosmetics_owned
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _user uuid := auth.uid();
  _owned public.pet_cosmetics_owned;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO _owned FROM public.pet_cosmetics_owned
    WHERE user_id = _user AND cosmetic_id = _cosmetic_id;
  IF _owned.id IS NULL THEN RAISE EXCEPTION 'NOT_OWNED'; END IF;

  UPDATE public.pet_cosmetics_owned
    SET equipped = false
    WHERE id = _owned.id
    RETURNING * INTO _owned;

  RETURN _owned;
END $$;