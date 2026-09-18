-- ============================================
-- 1. Bảng cache giá lịch sử
-- ============================================
CREATE TABLE IF NOT EXISTS public.token_price_history (
  symbol TEXT NOT NULL,
  date DATE NOT NULL,
  price_usd NUMERIC(30, 12) NOT NULL,
  source TEXT NOT NULL DEFAULT 'coingecko',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, date)
);

ALTER TABLE public.token_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tph_public_read" ON public.token_price_history;
CREATE POLICY "tph_public_read" ON public.token_price_history
  FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_tph_symbol_date ON public.token_price_history(symbol, date DESC);

-- ============================================
-- 2. Cột truy vết nguồn giá trên donations
-- ============================================
ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS price_source TEXT;
-- giá trị: 'historical' | 'reference' | 'testnet_skip' | NULL

-- ============================================
-- 3. Sửa get_token_reference_usd: FUN trả NULL
-- ============================================
CREATE OR REPLACE FUNCTION public.get_token_reference_usd(p_symbol TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF upper(p_symbol) = 'FUN' THEN
    RETURN NULL;  -- FUN testnet: không có tỷ giá USD
  END IF;
  RETURN CASE upper(p_symbol)
    WHEN 'CAMLY' THEN 0.000014
    WHEN 'BTC'   THEN 100000
    WHEN 'BTCB'  THEN 100000
    WHEN 'BNB'   THEN 700
    WHEN 'USDT'  THEN 1
    WHEN 'USDC'  THEN 1
    WHEN 'ETH'   THEN 3500
    WHEN 'POL'   THEN 0.5
    ELSE NULL
  END::NUMERIC;
END;
$$;

-- ============================================
-- 4. Sửa trigger: ưu tiên giá lịch sử
-- ============================================
CREATE OR REPLACE FUNCTION public.donations_set_usd_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price NUMERIC;
  v_source TEXT;
  v_sym TEXT;
  v_date DATE;
BEGIN
  IF NEW.token_symbol IS NULL THEN
    RETURN NEW;
  END IF;

  v_sym := upper(NEW.token_symbol);

  -- FUN testnet: luôn để rỗng
  IF v_sym = 'FUN' THEN
    NEW.amount_usd := NULL;
    NEW.price_usd_at_donation := NULL;
    NEW.price_source := 'testnet_skip';
    RETURN NEW;
  END IF;

  -- Nếu amount_usd đã có (do code set thẳng) thì giữ nguyên
  IF NEW.amount_usd IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_date := (COALESCE(NEW.created_at, now()))::date;

  -- 1) Thử lấy giá lịch sử
  SELECT price_usd INTO v_price
  FROM public.token_price_history
  WHERE symbol = v_sym AND date = v_date
  LIMIT 1;

  IF v_price IS NOT NULL THEN
    v_source := 'historical';
  ELSE
    -- 2) Fallback giá tham chiếu (sẽ được backfill sau khi có dữ liệu lịch sử)
    v_price := public.get_token_reference_usd(v_sym);
    v_source := CASE WHEN v_price IS NULL THEN NULL ELSE 'reference' END;
  END IF;

  NEW.price_usd_at_donation := v_price;
  NEW.amount_usd := CASE
    WHEN v_price IS NULL THEN NULL
    ELSE NEW.amount::NUMERIC * v_price
  END;
  NEW.price_source := v_source;

  RETURN NEW;
END;
$$;