-- ============================================================
-- B5-A′ : retention live_session_events 45 ngày + dọn cron trùng + REVOKE reward_claims
-- ============================================================

-- 1) Retention 45 ngày, xoá theo lô (mỗi lô 20k, tối đa 40 lô = 800k row/lượt)
CREATE OR REPLACE FUNCTION public.live_session_events_retention(
  _days integer DEFAULT 45,
  _batch integer DEFAULT 20000,
  _max_batches integer DEFAULT 40
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - make_interval(days => GREATEST(_days, 7));
  v_deleted bigint := 0;
  v_round integer := 0;
  v_n bigint;
BEGIN
  LOOP
    v_round := v_round + 1;
    EXIT WHEN v_round > GREATEST(_max_batches, 1);

    WITH victims AS (
      SELECT id FROM public.live_session_events
      WHERE created_at < v_cutoff
      ORDER BY created_at
      LIMIT GREATEST(_batch, 1000)
    ), del AS (
      DELETE FROM public.live_session_events e
      USING victims v WHERE e.id = v.id
      RETURNING 1
    )
    SELECT count(*) INTO v_n FROM del;

    v_deleted := v_deleted + COALESCE(v_n, 0);
    EXIT WHEN COALESCE(v_n, 0) = 0;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'cutoff', v_cutoff,
    'deleted', v_deleted,
    'batches', v_round - 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.live_session_events_retention(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_session_events_retention(integer, integer, integer) TO service_role;

-- 2) Cron retention 04:15 UTC hằng ngày
SELECT cron.unschedule('live-session-events-retention-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-session-events-retention-daily');

SELECT cron.schedule(
  'live-session-events-retention-daily',
  '15 4 * * *',
  $cron$SELECT public.live_session_events_retention(45, 20000, 40);$cron$
);

-- 3) Gộp cron replay readiness: xoá job -b (chỉ là bản lệch 30s của -a)
SELECT cron.unschedule('live-replay-readiness-check-b')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-replay-readiness-check-b');

-- 4) REVOKE quyền ghi thừa của anon trên reward_claims (đúng mẫu Batch 4)
REVOKE INSERT, UPDATE, DELETE ON public.reward_claims FROM anon;
GRANT SELECT ON public.reward_claims TO anon;               -- RLS vẫn chặn: chỉ chủ sở hữu/admin đọc được
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_claims TO authenticated;
GRANT ALL ON public.reward_claims TO service_role;