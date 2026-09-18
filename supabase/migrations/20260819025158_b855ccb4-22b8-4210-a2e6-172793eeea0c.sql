-- P0-1: chặn client tự INSERT đơn + tự đặt giá.
DROP POLICY IF EXISTS "orders_owner_insert" ON public.pet_shop_orders;
DROP POLICY IF EXISTS "mb_orders_owner_insert" ON public.mystery_box_orders;

CREATE POLICY "orders_no_client_insert" ON public.pet_shop_orders
  FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "mb_orders_no_client_insert" ON public.mystery_box_orders
  FOR INSERT TO authenticated, anon WITH CHECK (false);

REVOKE INSERT, UPDATE, DELETE ON public.pet_shop_orders FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.mystery_box_orders FROM anon, authenticated;
GRANT SELECT ON public.pet_shop_orders TO authenticated;
GRANT SELECT ON public.mystery_box_orders TO authenticated;
GRANT ALL ON public.pet_shop_orders TO service_role;
GRANT ALL ON public.mystery_box_orders TO service_role;