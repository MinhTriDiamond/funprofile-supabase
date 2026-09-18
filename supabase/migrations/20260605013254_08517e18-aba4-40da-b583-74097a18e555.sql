
-- Public view of confirmed pet shop orders for the community ticker.
-- Exposes only non-sensitive columns. Anonymous users can read.
CREATE OR REPLACE VIEW public.pet_shop_orders_public
WITH (security_invoker = on) AS
SELECT
  o.id,
  o.user_id,
  o.cosmetic_id,
  o.price_camly,
  o.tx_hash,
  o.from_address,
  o.confirmed_at,
  o.created_at,
  c.slug          AS cosmetic_slug,
  c.name_vi       AS cosmetic_name_vi,
  c.name_en       AS cosmetic_name_en,
  c.rarity        AS cosmetic_rarity,
  c.slot          AS cosmetic_slot,
  c.sprite_url    AS cosmetic_sprite_url
FROM public.pet_shop_orders o
JOIN public.pet_cosmetics_catalog c ON c.id = o.cosmetic_id
WHERE o.status = 'confirmed'
  AND o.tx_hash IS NOT NULL;

GRANT SELECT ON public.pet_shop_orders_public TO anon, authenticated;
