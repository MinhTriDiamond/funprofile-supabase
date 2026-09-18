ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS amount_normalized numeric,
  ADD COLUMN IF NOT EXISTS amount_fix_note text;

-- Backfill lô 1: 34 dòng raw wei >= 1e15, token 18 decimals (USDT/BNB chain 56)
UPDATE public.transactions
SET amount_normalized = (amount::numeric / power(10::numeric, 18)),
    amount_fix_note = 'tx-scale-20260827: raw wei /10^18 (lot1)'
WHERE amount ~ '^[0-9]{13,}$'
  AND amount::numeric >= 1e15
  AND chain_id = 56
  AND token_symbol IN ('USDT','BNB')
  AND amount_normalized IS NULL;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_amount_not_raw_wei_chk
  CHECK (amount IS NULL OR amount !~ '^[0-9]{13,}$') NOT VALID;