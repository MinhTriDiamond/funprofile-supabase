CREATE TABLE IF NOT EXISTS public.token_price_current (
  symbol text PRIMARY KEY,
  price_usd numeric NOT NULL CHECK (price_usd > 0),
  usd_24h_change numeric,
  source text NOT NULL DEFAULT 'coingecko',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.token_price_current TO anon;
GRANT SELECT ON public.token_price_current TO authenticated;
GRANT ALL ON public.token_price_current TO service_role;

ALTER TABLE public.token_price_current ENABLE ROW LEVEL SECURITY;

CREATE POLICY "token_price_current_public_read"
ON public.token_price_current FOR SELECT
USING (true);

CREATE OR REPLACE FUNCTION public.token_price_current_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_token_price_current_touch ON public.token_price_current;
CREATE TRIGGER trg_token_price_current_touch
BEFORE UPDATE ON public.token_price_current
FOR EACH ROW EXECUTE FUNCTION public.token_price_current_touch();

-- SSOT: giá hiện tại. Trả NULL khi không có giá thật hoặc giá quá cũ (> 60 phút).
CREATE OR REPLACE FUNCTION public.get_token_price_now(p_symbol text)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT price_usd
  FROM public.token_price_current
  WHERE symbol = upper(trim(p_symbol))
    AND fetched_at > now() - interval '60 minutes'
$$;

-- SSOT: giá lịch sử theo ngày. Ưu tiên đúng ngày, fallback ngày gần nhất trước đó trong 7 ngày.
CREATE OR REPLACE FUNCTION public.get_token_price_at(p_symbol text, p_date date)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT price_usd
  FROM public.token_price_history
  WHERE symbol = upper(trim(p_symbol))
    AND date <= p_date
    AND date >= p_date - 7
  ORDER BY date DESC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_token_price_now(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_token_price_at(text, date) TO anon, authenticated, service_role;