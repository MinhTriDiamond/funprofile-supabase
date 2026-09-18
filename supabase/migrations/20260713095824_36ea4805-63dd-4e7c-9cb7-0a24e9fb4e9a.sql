CREATE TABLE public._backup_btc_p0_fix_20260713 AS
SELECT * FROM public.transactions
WHERE upper(token_symbol)='BTC' AND (amount)::numeric > 1000;

ALTER TABLE public._backup_btc_p0_fix_20260713 ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public._backup_btc_p0_fix_20260713 TO service_role;
-- Không grant anon/authenticated: bảng backup chỉ để service_role dùng khi rollback.
COMMENT ON TABLE public._backup_btc_p0_fix_20260713 IS 'Backup 18 row BTC transactions.amount > 1000 (satoshi thô) trước khi convert sang BTC canonical — sự cố P0 07/2026';