CREATE TABLE public.m6b_gap_scan_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_symbol text NOT NULL,
  month date NOT NULL,
  half smallint NOT NULL DEFAULT 0,
  range_start timestamptz NOT NULL,
  range_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  est_rows integer NOT NULL DEFAULT 0,
  rows_scanned integer NOT NULL DEFAULT 0,
  gap_found integer NOT NULL DEFAULT 0,
  gap_samples jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT m6b_gap_scan_batches_status_chk CHECK (status IN ('pending','running','done','error','skipped')),
  CONSTRAINT m6b_gap_scan_batches_uniq UNIQUE (token_symbol, month, half)
);

GRANT SELECT ON public.m6b_gap_scan_batches TO authenticated;
GRANT ALL ON public.m6b_gap_scan_batches TO service_role;

ALTER TABLE public.m6b_gap_scan_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read gap scan batches"
  ON public.m6b_gap_scan_batches FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages gap scan batches"
  ON public.m6b_gap_scan_batches TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_m6b_gap_batches_status ON public.m6b_gap_scan_batches (status, month DESC);

CREATE TRIGGER trg_m6b_gap_batches_updated_at
  BEFORE UPDATE ON public.m6b_gap_scan_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sinh danh sách lô từ dữ liệu thật (token x tháng), tự cắt đôi lô > 8000 dòng
CREATE OR REPLACE FUNCTION public.m6b_gap_plan_batches(_max_rows integer DEFAULT 8000)
RETURNS TABLE (inserted integer, total_batches integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ins integer := 0;
BEGIN
  WITH src AS (
    SELECT upper(token_symbol) AS sym,
           date_trunc('month', occurred_at)::date AS m,
           count(*) AS c
      FROM public.v_unified_transactions
     WHERE token_symbol IS NOT NULL
     GROUP BY 1, 2
  ), planned AS (
    SELECT sym, m, c, 0 AS half FROM src WHERE c <= _max_rows
    UNION ALL
    SELECT sym, m, c, 1 FROM src WHERE c > _max_rows
    UNION ALL
    SELECT sym, m, c, 2 FROM src WHERE c > _max_rows
  ), ins AS (
    INSERT INTO public.m6b_gap_scan_batches
      (token_symbol, month, half, range_start, range_end, est_rows)
    SELECT sym, m, half,
      CASE half WHEN 2 THEN m::timestamptz + interval '15 days' ELSE m::timestamptz END,
      CASE half WHEN 1 THEN m::timestamptz + interval '15 days'
                ELSE (m + interval '1 month')::timestamptz END,
      CASE WHEN half = 0 THEN c ELSE (c / 2) END
      FROM planned
    ON CONFLICT (token_symbol, month, half) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_ins FROM ins;

  RETURN QUERY
    SELECT v_ins, (SELECT count(*)::integer FROM public.m6b_gap_scan_batches);
END;
$$;

REVOKE ALL ON FUNCTION public.m6b_gap_plan_batches(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.m6b_gap_plan_batches(integer) TO service_role;

-- Nhận 1 lô kế tiếp (atomic, không cho 2 tiến trình cùng nhận)
CREATE OR REPLACE FUNCTION public.m6b_gap_claim_next_batch()
RETURNS public.m6b_gap_scan_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.m6b_gap_scan_batches;
BEGIN
  UPDATE public.m6b_gap_scan_batches b
     SET status = 'running', started_at = now(), last_error = NULL
   WHERE b.id = (
      SELECT id FROM public.m6b_gap_scan_batches
       WHERE status = 'pending'
          OR (status = 'running' AND started_at < now() - interval '15 minutes')
       ORDER BY month DESC, token_symbol, half
       FOR UPDATE SKIP LOCKED
       LIMIT 1
   )
  RETURNING b.* INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.m6b_gap_claim_next_batch() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.m6b_gap_claim_next_batch() TO service_role;