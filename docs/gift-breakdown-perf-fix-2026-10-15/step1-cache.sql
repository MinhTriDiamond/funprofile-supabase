-- Gift breakdown pre-aggregation cache (2026-10-15, Angel Muse)
-- Serves get_global_gift_breakdown + get_global_wallet_flow_breakdown.
-- Rows: one per (source, direction, token_symbol) with count + total_amount.
-- Prices are NOT cached: they are resolved live at RPC call time, as before.
CREATE TABLE IF NOT EXISTS public.gift_breakdown_cache (
  source       text NOT NULL,   -- donations_internal | donations_external | wallet_transfers | swaps
  direction    text NOT NULL,   -- all (donations) | sent | received (transfers/swaps)
  token_symbol text NOT NULL,   -- normalized symbol (normalize_price_symbol)
  tx_count     bigint NOT NULL,
  total_amount numeric NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, direction, token_symbol)
);

CREATE OR REPLACE FUNCTION public.refresh_gift_breakdown_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  n integer;
BEGIN
  DELETE FROM public.gift_breakdown_cache;

  -- donations, internal (== gift breakdown's donations set)
  INSERT INTO public.gift_breakdown_cache (source, direction, token_symbol, tx_count, total_amount)
  SELECT 'donations_internal', 'all', public.normalize_price_symbol(d.token_symbol),
         COUNT(*)::bigint, COALESCE(SUM((d.amount)::numeric), 0)
  FROM public.donations d
  WHERE d.status = 'confirmed'
    AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
    AND d.is_external IS NOT TRUE
    AND d.sender_id IS NOT NULL
    AND d.recipient_id IS NOT NULL
  GROUP BY public.normalize_price_symbol(d.token_symbol);

  -- donations, external
  INSERT INTO public.gift_breakdown_cache (source, direction, token_symbol, tx_count, total_amount)
  SELECT 'donations_external', 'all', public.normalize_price_symbol(d.token_symbol),
         COUNT(*)::bigint, COALESCE(SUM((d.amount)::numeric), 0)
  FROM public.donations d
  WHERE d.status = 'confirmed'
    AND d.amount ~ '^[0-9]+(\.[0-9]+)?$'
    AND (d.is_external IS TRUE OR d.sender_id IS NULL OR d.recipient_id IS NULL)
  GROUP BY public.normalize_price_symbol(d.token_symbol);

  -- wallet transfers, both directions
  INSERT INTO public.gift_breakdown_cache (source, direction, token_symbol, tx_count, total_amount)
  SELECT 'wallet_transfers',
         CASE wt.direction WHEN 'in' THEN 'received' ELSE 'sent' END,
         public.normalize_price_symbol(wt.token_symbol),
         COUNT(*)::bigint, COALESCE(SUM(wt.amount), 0)
  FROM public.wallet_transfers wt
  WHERE wt.status = 'confirmed' AND wt.direction IN ('in', 'out')
  GROUP BY 2, public.normalize_price_symbol(wt.token_symbol);

  -- swaps: 'sent' leg uses from_*, 'received' leg uses to_* (mirrors the RPC's CASE)
  INSERT INTO public.gift_breakdown_cache (source, direction, token_symbol, tx_count, total_amount)
  SELECT 'swaps', 'sent', public.normalize_price_symbol(s.from_symbol),
         COUNT(*)::bigint, COALESCE(SUM(s.from_amount), 0)
  FROM public.swap_transactions s
  WHERE s.status = 'confirmed'
  GROUP BY public.normalize_price_symbol(s.from_symbol);

  INSERT INTO public.gift_breakdown_cache (source, direction, token_symbol, tx_count, total_amount)
  SELECT 'swaps', 'received', public.normalize_price_symbol(s.to_symbol),
         COUNT(*)::bigint, COALESCE(SUM(s.to_amount), 0)
  FROM public.swap_transactions s
  WHERE s.status = 'confirmed'
  GROUP BY public.normalize_price_symbol(s.to_symbol);

  UPDATE public.gift_breakdown_cache SET refreshed_at = now();
  SELECT COUNT(*) INTO n FROM public.gift_breakdown_cache;
  RETURN n;
END;
$fn$;

SELECT public.refresh_gift_breakdown_cache() AS cache_rows;
