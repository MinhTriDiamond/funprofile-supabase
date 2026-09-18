ALTER TABLE public.profile_btc_aux_addresses
  ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

-- Đánh dấu các nguồn đáng tin (do user/admin xác nhận hoặc thủ công) là verified
UPDATE public.profile_btc_aux_addresses
SET verified = true
WHERE source IN ('hd_change', 'manual', 'user_confirmed');

CREATE INDEX IF NOT EXISTS idx_btc_aux_verified
  ON public.profile_btc_aux_addresses (address) WHERE verified = true;