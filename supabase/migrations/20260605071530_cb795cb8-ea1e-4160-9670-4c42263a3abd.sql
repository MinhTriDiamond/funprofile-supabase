
-- 1) Bỏ cột from_address khỏi view công khai Pet Shop (đang lộ ví người mua)
DROP VIEW IF EXISTS public.pet_shop_orders_public;
CREATE VIEW public.pet_shop_orders_public
WITH (security_invoker = on) AS
SELECT
  o.id,
  o.user_id,
  o.cosmetic_id,
  o.price_camly,
  o.tx_hash,
  o.confirmed_at,
  o.created_at,
  c.slug       AS cosmetic_slug,
  c.name_vi    AS cosmetic_name_vi,
  c.name_en    AS cosmetic_name_en,
  c.rarity     AS cosmetic_rarity,
  c.slot       AS cosmetic_slot,
  c.sprite_url AS cosmetic_sprite_url
FROM public.pet_shop_orders o
JOIN public.pet_cosmetics_catalog c ON c.id = o.cosmetic_id
WHERE o.status = 'confirmed' AND o.tx_hash IS NOT NULL;

GRANT SELECT ON public.pet_shop_orders_public   TO anon, authenticated;
GRANT SELECT ON public.mystery_box_orders_public TO anon, authenticated;

-- 2) Mở quyền đọc các đơn đã confirmed để hỗ trợ view công khai (security_invoker).
DROP POLICY IF EXISTS "orders_public_read_confirmed" ON public.pet_shop_orders;
CREATE POLICY "orders_public_read_confirmed"
  ON public.pet_shop_orders FOR SELECT
  TO anon, authenticated
  USING (status = 'confirmed' AND tx_hash IS NOT NULL);

DROP POLICY IF EXISTS "mb_orders_public_read_confirmed" ON public.mystery_box_orders;
CREATE POLICY "mb_orders_public_read_confirmed"
  ON public.mystery_box_orders FOR SELECT
  TO anon, authenticated
  USING (status = 'confirmed' AND tx_hash IS NOT NULL);

-- 3) Đảm bảo anon đọc được bảng base qua view (security_invoker chuyển kiểm tra quyền sang user)
GRANT SELECT (id, user_id, cosmetic_id, price_camly, tx_hash, confirmed_at, created_at, status)
  ON public.pet_shop_orders TO anon, authenticated;
GRANT SELECT (id, user_id, box_def_id, box_code, price_camly, tx_hash, confirmed_at, created_at, status)
  ON public.mystery_box_orders TO anon, authenticated;
GRANT SELECT ON public.pet_cosmetics_catalog       TO anon, authenticated;
GRANT SELECT ON public.mystery_box_definitions     TO anon, authenticated;
