-- Hardening (2026-10-15): chan truy cap truc tiep vao 2 view hop nhat + cac bang noi bo.
-- App chi dung RPC (SECURITY DEFINER) — da kiem chung 208 file JS ban deploy: 0 tham chieu truc tiep.
ALTER TABLE public.gift_breakdown_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.v_unified_transactions FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.v_unified_transactions_primary FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.unified_transactions_snapshot FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.gift_breakdown_cache FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.donation_board_base FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.user_honor_stats_cache FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.user_honor_stats_refresh_queue FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.user_light_totals FROM anon, authenticated;
