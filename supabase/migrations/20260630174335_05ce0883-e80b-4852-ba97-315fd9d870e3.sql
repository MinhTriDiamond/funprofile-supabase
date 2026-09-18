
GRANT EXECUTE ON FUNCTION public.get_unified_transactions(uuid,text,text,text,text,text,timestamptz,timestamptz,text,int,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_unified_summary(uuid,timestamptz,timestamptz,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_unified_transaction_detail(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public._unified_tx_can_view(uuid) TO authenticated, service_role;
