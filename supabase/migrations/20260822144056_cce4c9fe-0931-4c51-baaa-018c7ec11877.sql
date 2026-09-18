-- 1. Mở rộng status
ALTER TABLE public.donations DROP CONSTRAINT IF EXISTS donations_status_check;
ALTER TABLE public.donations ADD CONSTRAINT donations_status_check
  CHECK (status = ANY (ARRAY['pending'::text,'confirmed'::text,'failed'::text,'pending_verification'::text,'rejected_unverified'::text]));

-- 2. Mốc bắt đầu đếm hạn
ALTER TABLE public.donations ADD COLUMN IF NOT EXISTS pending_verification_since timestamptz;
CREATE INDEX IF NOT EXISTS idx_donations_pending_verification
  ON public.donations (pending_verification_since)
  WHERE status = 'pending_verification';

-- 3. Hàm sweep (strict-match merge + soft reject sau 30 ngày)
CREATE OR REPLACE FUNCTION public.btc_pending_verification_sweep(_ttl_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merged int := 0;
  v_rejected int := 0;
  v_errors text[] := ARRAY[]::text[];
  r record;
  v_real_id uuid;
BEGIN
  -- Nhánh A: strict-match merge
  BEGIN
    FOR r IN
      SELECT id, sender_id, recipient_id, amount, post_id, message_id, tx_hash
      FROM public.donations
      WHERE status = 'pending_verification'
        AND token_symbol = 'BTC'
        AND tx_hash LIKE 'btc-manual-%'
    LOOP
      SELECT d2.id INTO v_real_id
      FROM public.donations d2
      WHERE d2.token_symbol = 'BTC'
        AND d2.tx_hash NOT LIKE 'btc-manual-%'
        AND d2.id <> r.id
        AND d2.sender_id IS NOT DISTINCT FROM r.sender_id
        AND d2.recipient_id = r.recipient_id
        AND d2.amount = r.amount
        AND d2.sender_address IS NOT NULL
        -- Khớp chặt: địa chỉ gửi on-chain phải thuộc chính người gửi
        AND (
          EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = r.sender_id AND p.btc_address = d2.sender_address)
          OR EXISTS (SELECT 1 FROM public.profile_btc_aux_addresses a
                     WHERE a.user_id = r.sender_id AND a.address = d2.sender_address
                       AND a.disabled_at IS NULL)
        )
      ORDER BY d2.created_at
      LIMIT 1;

      IF v_real_id IS NOT NULL THEN
        DELETE FROM public.transactions WHERE tx_hash = r.tx_hash;
        UPDATE public.donations SET post_id = NULL, message_id = NULL WHERE id = r.id;
        IF r.message_id IS NOT NULL THEN
          DELETE FROM public.messages WHERE id = r.message_id;
        END IF;
        IF r.post_id IS NOT NULL THEN
          DELETE FROM public.posts WHERE id = r.post_id;
        END IF;
        DELETE FROM public.donations WHERE id = r.id;

        INSERT INTO public.pplp_v2_event_log (event_type, reference_table, reference_id, payload)
        VALUES ('btc_pending_merged', 'donations', v_real_id,
                jsonb_build_object('deleted_fake_donation_id', r.id, 'fake_tx_hash', r.tx_hash,
                                   'kept_real_donation_id', v_real_id));
        v_merged := v_merged + 1;
      END IF;
      v_real_id := NULL;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || ('merge: ' || SQLERRM);
  END;

  -- Nhánh B: soft reject sau TTL
  BEGIN
    WITH expired AS (
      UPDATE public.donations
      SET status = 'rejected_unverified'
      WHERE status = 'pending_verification'
        AND pending_verification_since IS NOT NULL
        AND pending_verification_since < now() - make_interval(days => _ttl_days)
      RETURNING id
    )
    SELECT count(*) INTO v_rejected FROM expired;

    IF v_rejected > 0 THEN
      INSERT INTO public.pplp_v2_event_log (event_type, reference_table, payload)
      VALUES ('btc_pending_rejected', 'donations',
              jsonb_build_object('rejected_count', v_rejected, 'ttl_days', _ttl_days));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_errors := v_errors || ('reject: ' || SQLERRM);
  END;

  INSERT INTO public.pplp_v2_event_log (event_type, reference_table, payload)
  VALUES ('btc_pending_sweep_run', 'donations',
          jsonb_build_object('merged', v_merged, 'rejected', v_rejected, 'errors', v_errors,
                             'ttl_days', _ttl_days));

  RETURN jsonb_build_object('ok', true, 'merged', v_merged, 'rejected', v_rejected, 'errors', v_errors);
END;
$$;

REVOKE ALL ON FUNCTION public.btc_pending_verification_sweep(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.btc_pending_verification_sweep(int) TO service_role;

-- 4. Cron 1 lần/ngày
SELECT cron.unschedule('btc-pending-verification-sweep-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'btc-pending-verification-sweep-daily');

SELECT cron.schedule(
  'btc-pending-verification-sweep-daily',
  '10 4 * * *',
  $$SELECT public.btc_pending_verification_sweep(30);$$
);