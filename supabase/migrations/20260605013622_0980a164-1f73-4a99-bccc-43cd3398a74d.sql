ALTER PUBLICATION supabase_realtime ADD TABLE public.pet_shop_orders;
ALTER TABLE public.pet_shop_orders REPLICA IDENTITY FULL;