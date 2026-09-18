CREATE UNIQUE INDEX IF NOT EXISTS donations_btc_txhash_vout_uniq
ON public.donations (tx_hash, vout_index)
WHERE vout_index IS NOT NULL AND token_symbol = 'BTC';

COMMENT ON INDEX public.donations_btc_txhash_vout_uniq IS
'Chong dem trung BTC theo vout. Audit btc-external-flags-20260823.';