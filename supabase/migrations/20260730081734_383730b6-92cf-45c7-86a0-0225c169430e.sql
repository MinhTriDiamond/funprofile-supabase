
ALTER TABLE public.pplp_mint_requests ADD COLUMN IF NOT EXISTS epoch_id uuid REFERENCES public.mint_epochs(id);

CREATE INDEX IF NOT EXISTS idx_pplp_mint_requests_user_epoch
  ON public.pplp_mint_requests (user_id, epoch_id) WHERE epoch_id IS NOT NULL;

UPDATE public.pplp_mint_requests mr
SET epoch_id = a.epoch_id
FROM public.mint_allocations a
WHERE a.mint_request_id = mr.id AND mr.epoch_id IS NULL;

UPDATE public.pplp_mint_requests c
SET epoch_id = p.epoch_id
FROM public.pplp_mint_requests p
WHERE c.parent_request_id = p.id AND c.epoch_id IS NULL AND p.epoch_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_monthly_mint_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cap NUMERIC := 1050000;
  v_month_start TIMESTAMPTZ;
  v_month_end TIMESTAMPTZ;
  v_existing_total NUMERIC := 0;
  v_new_total NUMERIC;
BEGIN
  IF NEW.status IN ('rejected', 'failed', 'cancelled', 'split_parent') THEN
    RETURN NEW;
  END IF;

  IF NEW.epoch_id IS NULL AND NEW.parent_request_id IS NOT NULL THEN
    SELECT p.epoch_id INTO NEW.epoch_id
    FROM public.pplp_mint_requests p WHERE p.id = NEW.parent_request_id;
  END IF;

  IF NEW.epoch_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount_display), 0)
    INTO v_existing_total
    FROM public.pplp_mint_requests
    WHERE user_id = NEW.user_id
      AND epoch_id = NEW.epoch_id
      AND status NOT IN ('rejected', 'failed', 'cancelled', 'split_parent')
      AND (TG_OP = 'INSERT' OR id <> NEW.id);
  ELSE
    v_month_start := date_trunc('month', COALESCE(NEW.created_at, now()));
    v_month_end := v_month_start + INTERVAL '1 month';

    SELECT COALESCE(SUM(amount_display), 0)
    INTO v_existing_total
    FROM public.pplp_mint_requests
    WHERE user_id = NEW.user_id
      AND epoch_id IS NULL
      AND created_at >= v_month_start
      AND created_at < v_month_end
      AND status NOT IN ('rejected', 'failed', 'cancelled', 'split_parent')
      AND (TG_OP = 'INSERT' OR id <> NEW.id);
  END IF;

  v_new_total := v_existing_total + COALESCE(NEW.amount_display, 0);

  IF v_new_total > v_cap THEN
    RAISE EXCEPTION 'Mint cap exceeded: user % đã có %/% FUN trong kỳ này, lệnh mới % FUN sẽ vượt trần',
      NEW.user_id, v_existing_total, v_cap, NEW.amount_display
      USING ERRCODE = 'check_violation',
            HINT = 'Trần 1.050.000 FUN/kỳ/user.';
  END IF;

  RETURN NEW;
END;
$function$;
