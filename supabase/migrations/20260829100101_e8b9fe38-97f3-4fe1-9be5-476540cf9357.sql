-- 1) Helper chuẩn hoá symbol (SSOT duy nhất)
CREATE OR REPLACE FUNCTION public.normalize_price_symbol(p_symbol text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE upper(trim(coalesce(p_symbol, '')))
    WHEN 'TONCOIN' THEN 'TON'
    WHEN 'WBNB' THEN 'BNB'
    WHEN 'WBTC' THEN 'BTC'
    ELSE upper(trim(coalesce(p_symbol, '')))
  END
$$;

-- 2) get_token_price_at dùng helper
CREATE OR REPLACE FUNCTION public.get_token_price_at(p_symbol text, p_date date)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT price_usd
  FROM public.token_price_history
  WHERE symbol = public.normalize_price_symbol(p_symbol)
    AND date <= p_date
    AND date >= p_date - 7
  ORDER BY date DESC
  LIMIT 1
$$;

-- 3) Trigger ghi giá USD cho donation: bỏ hardcode
CREATE OR REPLACE FUNCTION public.donations_set_usd_default()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_price NUMERIC;
  v_source TEXT;
  v_sym TEXT;
  v_date DATE;
  v_hist NUMERIC;
  v_near NUMERIC;
  v_code_price NUMERIC;
  v_diff_pct NUMERIC;
BEGIN
  IF NEW.token_symbol IS NULL THEN
    RETURN NEW;
  END IF;

  v_sym := public.normalize_price_symbol(NEW.token_symbol);

  -- FUN testnet: luôn để rỗng
  IF v_sym = 'FUN' THEN
    NEW.amount_usd := NULL;
    NEW.price_usd_at_donation := NULL;
    NEW.price_source := 'testnet_skip';
    RETURN NEW;
  END IF;

  v_date := (COALESCE(NEW.created_at, now()))::date;

  SELECT price_usd INTO v_hist
  FROM public.token_price_history
  WHERE symbol = v_sym AND date = v_date
  LIMIT 1;

  -- Nhánh code truyền sẵn amount_usd: GIỮ NGUYÊN (log-only validate)
  IF NEW.amount_usd IS NOT NULL THEN
    IF v_hist IS NOT NULL AND NEW.amount::NUMERIC > 0 THEN
      v_code_price := NEW.amount_usd / NEW.amount::NUMERIC;
      v_diff_pct := abs(v_code_price - v_hist) / v_hist * 100;
      IF v_diff_pct > 2 THEN
        INSERT INTO public.donation_price_validation_log
          (donation_id, token_symbol, donation_date, amount, code_amount_usd,
           code_price_usd, history_price_usd, diff_pct, verdict, phase)
        VALUES (NEW.id, v_sym, v_date, NEW.amount::NUMERIC, NEW.amount_usd,
                v_code_price, v_hist, v_diff_pct, 'validation_failed', 'enforce');
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_hist IS NOT NULL THEN
    v_price := v_hist;
    v_source := 'historical';
  ELSE
    -- SSOT: giá gần nhất trong cửa sổ 7 ngày
    v_near := public.get_token_price_at(v_sym, v_date);
    IF v_near IS NOT NULL THEN
      v_price := v_near;
      v_source := 'historical_nearby';
    ELSE
      -- KHÔNG fallback hardcode: để trống + pending, không chặn donation
      v_price := NULL;
      v_source := 'pending';

      INSERT INTO public.donation_price_validation_log
        (donation_id, token_symbol, donation_date, amount, code_amount_usd,
         code_price_usd, history_price_usd, diff_pct, verdict, phase)
      VALUES (NEW.id, v_sym, v_date, NEW.amount::NUMERIC,
              NULL, NULL, NULL, NULL, 'pending', 'enforce');
    END IF;
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