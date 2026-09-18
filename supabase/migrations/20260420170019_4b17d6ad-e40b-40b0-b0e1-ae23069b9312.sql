-- 1. Thêm cột parent_request_id để hỗ trợ split mint request theo on-chain action
ALTER TABLE public.pplp_mint_requests 
  ADD COLUMN IF NOT EXISTS parent_request_id uuid REFERENCES public.pplp_mint_requests(id);

CREATE INDEX IF NOT EXISTS idx_pplp_mint_requests_parent 
  ON public.pplp_mint_requests(parent_request_id) 
  WHERE parent_request_id IS NOT NULL;

-- 2. Audit log trước khi đổi cap
INSERT INTO public.pplp_v2_event_log (event_type, payload)
VALUES (
  'epoch.cap.updated',
  jsonb_build_object(
    'before', 5000000,
    'after', 20000000,
    'severity', 'info',
    'reason', '6 on-chain actions registered (INNER_WORK, CHANNELING, GIVING, HELPING, GRATITUDE, SERVICE), theoretical ceiling 180M/month',
    'phase', 'C-step1',
    'safety_margin_pct', 11,
    'next_step', '50M after 2+ weeks stable'
  )
);

-- 3. Nâng cap off-chain 5M → 20M FUN/tháng
UPDATE public.epoch_config 
SET soft_ceiling = 20000000, 
    updated_at = now() 
WHERE config_key = 'default' AND is_active = true;