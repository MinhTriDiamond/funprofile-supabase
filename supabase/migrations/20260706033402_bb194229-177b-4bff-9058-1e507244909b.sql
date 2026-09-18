-- Batch 2.3 · Nhánh 4 — RPC stats admin_all (SSOT)
-- Thay 5 query direct-read + vòng lặp phân trang trong useAdminDonationHistory
-- bằng 1 aggregate call chạy trên view v_unified_transactions_primary.

CREATE OR REPLACE FUNCTION public.get_unified_admin_stats(
  _from_ts timestamptz DEFAULT NULL,
  _to_ts   timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := false;
  _vn_start timestamptz;
  _vn_end   timestamptz;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: admin stats requires auth' USING ERRCODE = '42501';
  END IF;
  _is_admin := public.has_role(_caller, 'admin');
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'FORBIDDEN: admin stats requires admin role' USING ERRCODE = '42501';
  END IF;

  -- Ghi audit (best-effort — không block RPC nếu insert lỗi).
  BEGIN
    INSERT INTO public.admin_sql_audit(admin_id, sql_hash, sql_preview, mode, ip, row_count)
    VALUES (
      _caller,
      md5('rpc:get_unified_admin_stats'),
      left('rpc:get_unified_admin_stats(from=' || COALESCE(_from_ts::text,'') ||
           ' to=' || COALESCE(_to_ts::text,'') || ')', 200),
      'read', NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Múi giờ VN (UTC+7) — 1 ngày = [00:00 VN, 24:00 VN).
  _vn_start := date_trunc('day', now() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh';
  _vn_end   := _vn_start + interval '1 day';

  WITH filtered AS (
    SELECT * FROM (
      SELECT v.*,
        ROW_NUMBER() OVER (
          PARTITION BY v.source_table || '|' || v.source_id
          ORDER BY (v.direction = 'out') DESC, v.id
        ) AS _rn
      FROM public.v_unified_transactions_primary v
      WHERE v.source_table = 'donations'
        AND COALESCE(v.metadata->>'shadow','') NOT IN ('true','1')
        AND COALESCE(v.metadata->>'debug','')  NOT IN ('true','1')
        AND COALESCE(v.metadata->>'test','')   NOT IN ('true','1')
        AND (_from_ts IS NULL OR v.occurred_at >= _from_ts)
        AND (_to_ts   IS NULL OR v.occurred_at <= _to_ts)
    ) x WHERE _rn = 1
  ),
  totals AS (
    SELECT
      COUNT(*)::bigint AS total_count,
      COUNT(*) FILTER (WHERE status IN ('success','confirmed','completed'))::bigint AS confirmed_count,
      COUNT(*) FILTER (WHERE status IN ('pending','processing'))::bigint AS pending_count,
      COUNT(*) FILTER (WHERE COALESCE(created_at, occurred_at) >= _vn_start
                         AND COALESCE(created_at, occurred_at) <  _vn_end)::bigint AS today_count,
      COALESCE(SUM(amount_decimal), 0)::numeric AS total_value,
      COALESCE(SUM((metadata->>'light_score_earned')::numeric)
               FILTER (WHERE metadata ? 'light_score_earned'), 0)::numeric AS total_light_score
    FROM filtered
  ),
  by_token AS (
    SELECT COALESCE(jsonb_object_agg(token_symbol, sum_amt), '{}'::jsonb) AS data
    FROM (
      SELECT token_symbol, COALESCE(SUM(amount_decimal), 0)::numeric AS sum_amt
      FROM filtered
      WHERE token_symbol IS NOT NULL
      GROUP BY token_symbol
    ) t
  )
  SELECT jsonb_build_object(
    'total_count',      t.total_count,
    'confirmed_count',  t.confirmed_count,
    'pending_count',    t.pending_count,
    'today_count',      t.today_count,
    'total_value',      t.total_value,
    'total_light_score',t.total_light_score,
    'by_token',         (SELECT data FROM by_token)
  ) INTO _result
  FROM totals t;

  RETURN _result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_unified_admin_stats(timestamptz, timestamptz)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_unified_admin_stats(timestamptz, timestamptz) IS
  'Batch 2.3 (M6D) — Aggregate stats cho Admin Panel Donations. Admin-only, ghi audit.';
