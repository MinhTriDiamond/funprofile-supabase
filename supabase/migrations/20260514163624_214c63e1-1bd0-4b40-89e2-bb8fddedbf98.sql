
-- 1. Premium grants tracking (one-time per user)
CREATE TABLE IF NOT EXISTS public.mystery_box_premium_grants (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  trigger_balance numeric(30,8) NOT NULL,
  inventory_id uuid REFERENCES public.mystery_box_inventory(id) ON DELETE SET NULL
);

ALTER TABLE public.mystery_box_premium_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin reads premium grants"
ON public.mystery_box_premium_grants FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "User reads own premium grant"
ON public.mystery_box_premium_grants FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 2. Auto-grant function based on CAMLY balance ≥ 1M
CREATE OR REPLACE FUNCTION public.mystery_box_check_premium_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric(30,8);
  v_inv_id uuid;
  v_threshold constant numeric := 1000000;
BEGIN
  -- Skip nếu user đã được tặng
  IF EXISTS (SELECT 1 FROM public.mystery_box_premium_grants WHERE user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  -- Tính balance hiện tại
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.pplp_v2_balance_ledger
  WHERE user_id = NEW.user_id;

  IF v_balance < v_threshold THEN
    RETURN NEW;
  END IF;

  -- Cấp 1 hộp Huyền Thoại (idempotent qua bảng grants)
  BEGIN
    SELECT public.mystery_box_grant(
      NEW.user_id,
      'legendary_box',
      'premium_purchase',
      NULL
    ) INTO v_inv_id;

    INSERT INTO public.mystery_box_premium_grants (user_id, trigger_balance, inventory_id)
    VALUES (NEW.user_id, v_balance, v_inv_id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mystery_box_check_premium_grant failed for user %: %', NEW.user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mystery_box_premium_check ON public.pplp_v2_balance_ledger;
CREATE TRIGGER trg_mystery_box_premium_check
AFTER INSERT ON public.pplp_v2_balance_ledger
FOR EACH ROW
EXECUTE FUNCTION public.mystery_box_check_premium_grant();

-- 3. Stats daily aggregation table
CREATE TABLE IF NOT EXISTS public.mystery_box_stats_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date date NOT NULL,
  box_def_id uuid NOT NULL REFERENCES public.mystery_box_definitions(id) ON DELETE CASCADE,
  reward_code text NOT NULL,
  opens_count int NOT NULL DEFAULT 0,
  expected_pct numeric(5,2) NOT NULL DEFAULT 0,
  actual_pct numeric(5,2) NOT NULL DEFAULT 0,
  delta_pct numeric(6,2) GENERATED ALWAYS AS (actual_pct - expected_pct) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stat_date, box_def_id, reward_code)
);

CREATE INDEX IF NOT EXISTS idx_mb_stats_daily_date ON public.mystery_box_stats_daily(stat_date DESC);

ALTER TABLE public.mystery_box_stats_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads stats daily"
ON public.mystery_box_stats_daily FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Risk log (open quá nhanh, IP trùng, etc.)
CREATE TABLE IF NOT EXISTS public.mystery_box_risk_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  inventory_id uuid REFERENCES public.mystery_box_inventory(id) ON DELETE SET NULL,
  risk_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mb_risk_user ON public.mystery_box_risk_log(user_id);
CREATE INDEX IF NOT EXISTS idx_mb_risk_unresolved ON public.mystery_box_risk_log(resolved) WHERE NOT resolved;

ALTER TABLE public.mystery_box_risk_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads risk log"
ON public.mystery_box_risk_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin updates risk log"
ON public.mystery_box_risk_log FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
