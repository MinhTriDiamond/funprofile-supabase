CREATE OR REPLACE VIEW public.public_pet_states AS
SELECT
  ps.user_id,
  ps.name,
  ps.species,
  ps.mood,
  ps.level,
  ps.evolution_stage,
  ps.cheers_received_total,
  ps.visible,
  (
    SELECT c.slug FROM public.pet_cosmetics_owned o
    JOIN public.pet_cosmetics_catalog c ON c.id = o.cosmetic_id
    WHERE o.user_id = ps.user_id AND o.equipped = true AND c.slot = 'skin' LIMIT 1
  ) AS equipped_skin_slug,
  (
    SELECT c.slug FROM public.pet_cosmetics_owned o
    JOIN public.pet_cosmetics_catalog c ON c.id = o.cosmetic_id
    WHERE o.user_id = ps.user_id AND o.equipped = true AND c.slot = 'background' LIMIT 1
  ) AS equipped_frame_slug,
  (
    SELECT c.slug FROM public.pet_cosmetics_owned o
    JOIN public.pet_cosmetics_catalog c ON c.id = o.cosmetic_id
    WHERE o.user_id = ps.user_id AND o.equipped = true AND c.slot = 'hat' LIMIT 1
  ) AS equipped_hat_slug,
  (
    SELECT c.slug FROM public.pet_cosmetics_owned o
    JOIN public.pet_cosmetics_catalog c ON c.id = o.cosmetic_id
    WHERE o.user_id = ps.user_id AND o.equipped = true AND c.slot = 'aura' LIMIT 1
  ) AS equipped_aura_slug,
  (
    SELECT c.slug FROM public.pet_cosmetics_owned o
    JOIN public.pet_cosmetics_catalog c ON c.id = o.cosmetic_id
    WHERE o.user_id = ps.user_id AND o.equipped = true AND c.slot = 'accessory' LIMIT 1
  ) AS equipped_accessory_slug
FROM public.pet_states ps
WHERE ps.visible = true;

GRANT SELECT ON public.public_pet_states TO anon, authenticated;