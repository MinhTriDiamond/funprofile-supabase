
CREATE OR REPLACE VIEW public.mystery_box_orders_public
WITH (security_invoker = on) AS
SELECT
  o.id,
  o.user_id,
  o.box_def_id,
  o.box_code,
  o.price_camly,
  o.tx_hash,
  o.confirmed_at,
  o.created_at,
  d.name_vi  AS box_name_vi,
  d.name_en  AS box_name_en,
  d.tier     AS box_tier,
  d.icon     AS box_icon
FROM public.mystery_box_orders o
LEFT JOIN public.mystery_box_definitions d ON d.id = o.box_def_id
WHERE o.status = 'confirmed';

GRANT SELECT ON public.mystery_box_orders_public TO anon, authenticated;
GRANT SELECT ON public.pet_shop_orders_public   TO anon, authenticated;
