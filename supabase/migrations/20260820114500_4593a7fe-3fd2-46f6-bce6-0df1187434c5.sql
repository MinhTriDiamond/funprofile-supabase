-- ============================================================
-- Admin Backfill giao dịch on-chain (chỉ Admin)
-- Luồng: Quét → Preview → Admin xác nhận → Ghi
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_backfill_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('all','single','multi')),
  wallets text[] NOT NULL DEFAULT '{}',
  from_ts timestamptz,
  to_ts timestamptz,
  from_block bigint,
  to_block bigint,
  cursor_block bigint,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','scanning','preview_ready','writing','done','failed','cancelled')),
  progress_pct integer NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_backfill_jobs TO authenticated;
GRANT ALL ON public.admin_backfill_jobs TO service_role;

ALTER TABLE public.admin_backfill_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins xem job backfill"
  ON public.admin_backfill_jobs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role toàn quyền job backfill"
  ON public.admin_backfill_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_abj_scope_created ON public.admin_backfill_jobs (scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abj_status ON public.admin_backfill_jobs (status);

CREATE TABLE IF NOT EXISTS public.admin_backfill_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.admin_backfill_jobs(id) ON DELETE CASCADE,
  tx_hash text NOT NULL,
  log_index integer NOT NULL DEFAULT 0,
  block_number bigint NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  token_symbol text NOT NULL,
  token_address text,
  amount_raw text NOT NULL,
  amount_display text NOT NULL,
  usd_value numeric,
  classification text NOT NULL
    CHECK (classification IN ('internal','external_in','swap_suspect','dust_filtered','already_in_db')),
  matched_user_id uuid,
  selected boolean NOT NULL DEFAULT false,
  written boolean NOT NULL DEFAULT false,
  written_at timestamptz,
  skip_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, tx_hash, log_index)
);

GRANT SELECT ON public.admin_backfill_candidates TO authenticated;
GRANT ALL ON public.admin_backfill_candidates TO service_role;

ALTER TABLE public.admin_backfill_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins xem candidate backfill"
  ON public.admin_backfill_candidates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role toàn quyền candidate backfill"
  ON public.admin_backfill_candidates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_abc_job ON public.admin_backfill_candidates (job_id, classification);

CREATE TRIGGER trg_abj_updated_at
  BEFORE UPDATE ON public.admin_backfill_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RPC 1: tạo job (validate admin + rate-limit + single-flight)
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_backfill_create_job(
  p_scope text,
  p_wallets text[] DEFAULT '{}',
  p_from_ts timestamptz DEFAULT NULL,
  p_to_ts timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_wallets text[];
  v_from timestamptz;
  v_to timestamptz;
  v_last timestamptz;
  v_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Chỉ admin được tạo job backfill' USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN ('all','single','multi') THEN
    RAISE EXCEPTION 'scope không hợp lệ: %', p_scope USING ERRCODE = '22023';
  END IF;

  v_to := COALESCE(p_to_ts, now());
  v_from := COALESCE(p_from_ts, v_to - interval '24 hours');

  IF v_from >= v_to THEN
    RAISE EXCEPTION 'Khoảng thời gian không hợp lệ' USING ERRCODE = '22023';
  END IF;
  IF v_to - v_from > interval '30 days' THEN
    RAISE EXCEPTION 'Khoảng thời gian tối đa 30 ngày' USING ERRCODE = '22023';
  END IF;

  IF p_scope = 'all' THEN
    v_wallets := '{}'::text[];
    SELECT max(created_at) INTO v_last
      FROM public.admin_backfill_jobs WHERE scope = 'all';
    IF v_last IS NOT NULL AND v_last > now() - interval '4 hours' THEN
      RAISE EXCEPTION 'Phạm vi toàn hệ thống chỉ chạy 1 lần / 4 giờ (lần gần nhất: %)', v_last
        USING ERRCODE = '55000';
    END IF;
  ELSE
    SELECT array_agg(DISTINCT lower(w)) INTO v_wallets
      FROM unnest(COALESCE(p_wallets, '{}'::text[])) AS w
      WHERE w ~* '^0x[0-9a-f]{40}$';
    IF v_wallets IS NULL OR array_length(v_wallets, 1) = 0 THEN
      RAISE EXCEPTION 'Cần ít nhất 1 địa chỉ ví EVM hợp lệ' USING ERRCODE = '22023';
    END IF;
    IF p_scope = 'single' AND array_length(v_wallets, 1) <> 1 THEN
      RAISE EXCEPTION 'scope single chỉ nhận đúng 1 ví' USING ERRCODE = '22023';
    END IF;
    IF array_length(v_wallets, 1) > 50 THEN
      RAISE EXCEPTION 'Tối đa 50 ví cho 1 job' USING ERRCODE = '22023';
    END IF;
    SELECT max(created_at) INTO v_last
      FROM public.admin_backfill_jobs
      WHERE created_by = v_uid AND scope IN ('single','multi');
    IF v_last IS NOT NULL AND v_last > now() - interval '5 minutes' THEN
      RAISE EXCEPTION 'Vui lòng chờ 5 phút giữa 2 job (lần gần nhất: %)', v_last
        USING ERRCODE = '55000';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.admin_backfill_jobs
    WHERE status IN ('queued','scanning','writing')
      AND created_at > now() - interval '1 hour'
  ) THEN
    RAISE EXCEPTION 'Đang có 1 job backfill chạy — chờ hoàn tất' USING ERRCODE = '55006';
  END IF;

  INSERT INTO public.admin_backfill_jobs (scope, wallets, from_ts, to_ts, created_by)
  VALUES (p_scope, COALESCE(v_wallets, '{}'::text[]), v_from, v_to, v_uid)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backfill_create_job(text, text[], timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backfill_create_job(text, text[], timestamptz, timestamptz) TO authenticated, service_role;

-- ============================================================
-- RPC 2: chọn / bỏ chọn dòng để ghi
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_backfill_toggle_selection(
  p_job_id uuid,
  p_candidate_ids uuid[],
  p_selected boolean
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count integer;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Chỉ admin được thao tác' USING ERRCODE = '42501';
  END IF;

  UPDATE public.admin_backfill_candidates
     SET selected = p_selected
   WHERE job_id = p_job_id
     AND id = ANY(COALESCE(p_candidate_ids, '{}'::uuid[]))
     AND written = false
     -- swap_suspect chỉ lưu vết transactions, dust/already_in_db không ghi
     AND classification IN ('internal','external_in');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backfill_toggle_selection(uuid, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backfill_toggle_selection(uuid, uuid[], boolean) TO authenticated, service_role;

-- ============================================================
-- RPC 3: xem job + candidates
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_backfill_job_view(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_job jsonb;
  v_rows jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Chỉ admin được xem' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(j) INTO v_job FROM public.admin_backfill_jobs j WHERE j.id = p_job_id;
  IF v_job IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy job' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.block_number DESC, c.log_index), '[]'::jsonb)
    INTO v_rows
    FROM public.admin_backfill_candidates c
   WHERE c.job_id = p_job_id;

  RETURN jsonb_build_object('job', v_job, 'candidates', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backfill_job_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backfill_job_view(uuid) TO authenticated, service_role;
