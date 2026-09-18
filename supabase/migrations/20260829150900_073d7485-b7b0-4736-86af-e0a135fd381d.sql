CREATE OR REPLACE FUNCTION public.get_treasury_camly_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH bounds AS (
  SELECT now() - interval '7 days'  AS d7,
         now() - interval '30 days' AS d30,
         now() - interval '90 days' AS d90
),
pet AS (
  SELECT
    COALESCE(SUM(CASE WHEN o.confirmed_at >= b.d7  THEN o.price_camly END), 0) AS s7,
    COUNT(*) FILTER (WHERE o.confirmed_at >= b.d7)  AS c7,
    COALESCE(SUM(CASE WHEN o.confirmed_at >= b.d30 THEN o.price_camly END), 0) AS s30,
    COUNT(*) FILTER (WHERE o.confirmed_at >= b.d30) AS c30,
    COALESCE(SUM(CASE WHEN o.confirmed_at >= b.d90 THEN o.price_camly END), 0) AS s90,
    COUNT(*) FILTER (WHERE o.confirmed_at >= b.d90) AS c90,
    COALESCE(SUM(o.price_camly), 0) AS sall,
    COUNT(*) AS call_
  FROM public.pet_shop_orders o CROSS JOIN bounds b
  WHERE o.status = 'confirmed'
),
mb AS (
  SELECT
    COALESCE(SUM(CASE WHEN o.confirmed_at >= b.d7  THEN o.price_camly END), 0) AS s7,
    COUNT(*) FILTER (WHERE o.confirmed_at >= b.d7)  AS c7,
    COALESCE(SUM(CASE WHEN o.confirmed_at >= b.d30 THEN o.price_camly END), 0) AS s30,
    COUNT(*) FILTER (WHERE o.confirmed_at >= b.d30) AS c30,
    COALESCE(SUM(CASE WHEN o.confirmed_at >= b.d90 THEN o.price_camly END), 0) AS s90,
    COUNT(*) FILTER (WHERE o.confirmed_at >= b.d90) AS c90,
    COALESCE(SUM(o.price_camly), 0) AS sall,
    COUNT(*) AS call_
  FROM public.mystery_box_orders o CROSS JOIN bounds b
  WHERE o.status = 'confirmed'
),
outflow AS (
  SELECT COALESCE(SUM(f.amount), 0) AS total
  FROM public.treasury_flows f
  WHERE f.flow_type = 'outflow' AND f.token_symbol = 'CAMLY'
),
spend AS (
  SELECT user_id, SUM(price_camly) AS total_camly
  FROM (
    SELECT o.user_id, o.price_camly
    FROM public.pet_shop_orders o CROSS JOIN bounds b
    WHERE o.status = 'confirmed' AND o.confirmed_at >= b.d90
    UNION ALL
    SELECT o.user_id, o.price_camly
    FROM public.mystery_box_orders o CROSS JOIN bounds b
    WHERE o.status = 'confirmed' AND o.confirmed_at >= b.d90
  ) x
  WHERE user_id IS NOT NULL
  GROUP BY user_id
  ORDER BY 2 DESC
  LIMIT 10
),
top AS (
  SELECT jsonb_agg(
           jsonb_build_object(
             'user_id', s.user_id,
             'total_camly', s.total_camly,
             'id', p.id,
             'username', p.username,
             'full_name', p.full_name,
             'avatar_url', p.avatar_url
           ) ORDER BY s.total_camly DESC
         ) AS arr
  FROM spend s
  LEFT JOIN public.profiles p ON p.id = s.user_id
)
SELECT jsonb_build_object(
  'inflows', jsonb_build_object(
    'pet_shop', jsonb_build_object(
      'd7',  jsonb_build_object('sum', pet.s7,  'count', pet.c7),
      'd30', jsonb_build_object('sum', pet.s30, 'count', pet.c30),
      'd90', jsonb_build_object('sum', pet.s90, 'count', pet.c90),
      'all', jsonb_build_object('sum', pet.sall,'count', pet.call_)
    ),
    'mystery_box', jsonb_build_object(
      'd7',  jsonb_build_object('sum', mb.s7,  'count', mb.c7),
      'd30', jsonb_build_object('sum', mb.s30, 'count', mb.c30),
      'd90', jsonb_build_object('sum', mb.s90, 'count', mb.c90),
      'all', jsonb_build_object('sum', mb.sall,'count', mb.call_)
    ),
    'total_all_time', pet.sall + mb.sall
  ),
  'outflow_total', outflow.total,
  'top_spenders', COALESCE(top.arr, '[]'::jsonb)
)
FROM pet, mb, outflow, top;
$$;

REVOKE ALL ON FUNCTION public.get_treasury_camly_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_treasury_camly_overview() TO authenticated, service_role;