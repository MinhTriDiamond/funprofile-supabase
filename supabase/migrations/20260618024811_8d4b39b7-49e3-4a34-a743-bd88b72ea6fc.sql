
-- 1) Kill-switch publisher
INSERT INTO public.app_settings (key, value)
VALUES ('federation_outbox_publisher_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_fp_outbox_publisher_scan
  ON public.fun_profile_event_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_fp_outbox_status_created
  ON public.fun_profile_event_outbox (status, created_at DESC);

-- 3) Toggle publisher (admin)
CREATE OR REPLACE FUNCTION public.fun_profile_toggle_outbox_publisher(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
  END IF;
  INSERT INTO public.app_settings (key, value, updated_at)
  VALUES ('federation_outbox_publisher_enabled', to_jsonb(p_enabled), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN jsonb_build_object('enabled', p_enabled);
END;
$$;

-- 4) Retry one (admin) — đẩy 1 row về pending, attempts giữ nguyên, next_attempt_at = now()
CREATE OR REPLACE FUNCTION public.fun_profile_outbox_retry_one(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_updated int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
  END IF;
  UPDATE public.fun_profile_event_outbox
    SET status = 'pending',
        next_attempt_at = now(),
        last_error = COALESCE(last_error, '') || ' [admin_retry@' || now() || ']',
        updated_at = now()
    WHERE id = p_id AND status IN ('failed','dead');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

-- 5) Retry dead batch (admin)
CREATE OR REPLACE FUNCTION public.fun_profile_outbox_retry_dead_batch(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_updated int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'FORBIDDEN_NOT_ADMIN';
  END IF;
  WITH cte AS (
    SELECT id FROM public.fun_profile_event_outbox
    WHERE status = 'dead'
    ORDER BY updated_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.fun_profile_event_outbox o
    SET status = 'pending',
        next_attempt_at = now(),
        last_error = COALESCE(last_error,'') || ' [admin_retry_batch@' || now() || ']',
        updated_at = now()
    FROM cte WHERE o.id = cte.id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

-- 6) Publisher claim batch (service_role only)
CREATE OR REPLACE FUNCTION public.fun_profile_outbox_publisher_claim(p_limit int DEFAULT 20)
RETURNS SETOF public.fun_profile_event_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_enabled boolean;
BEGIN
  SELECT (value)::text::boolean INTO v_enabled
    FROM public.app_settings WHERE key = 'federation_outbox_publisher_enabled';
  IF NOT COALESCE(v_enabled,false) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.fun_profile_event_outbox
    WHERE status IN ('pending','failed') AND next_attempt_at <= now()
    ORDER BY next_attempt_at ASC
    LIMIT GREATEST(1, LEAST(p_limit, 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.fun_profile_event_outbox o
    SET status = 'in_flight',
        attempts = o.attempts + 1,
        updated_at = now()
    FROM claimed WHERE o.id = claimed.id
    RETURNING o.*;
END;
$$;

-- 7) Publisher ACK (service_role only)
-- Backoff seconds by attempts: 1=1s, 2=5s, 3=30s, 4=300s, 5=1800s, 6=7200s, 7=21600s; >=8 → dead
CREATE OR REPLACE FUNCTION public.fun_profile_outbox_publisher_ack(
  p_id uuid,
  p_success boolean,
  p_error text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int;
  v_next_status text;
  v_delay_seconds int;
BEGIN
  IF p_success THEN
    UPDATE public.fun_profile_event_outbox
      SET status = 'sent', sent_at = now(), last_error = NULL, updated_at = now()
      WHERE id = p_id;
    RETURN jsonb_build_object('status','sent');
  END IF;

  SELECT attempts INTO v_attempts FROM public.fun_profile_event_outbox WHERE id = p_id;

  IF v_attempts >= 8 THEN
    v_next_status := 'dead';
    UPDATE public.fun_profile_event_outbox
      SET status = 'dead', last_error = p_error, updated_at = now()
      WHERE id = p_id;
    RETURN jsonb_build_object('status','dead','attempts',v_attempts);
  END IF;

  v_delay_seconds := CASE v_attempts
    WHEN 1 THEN 1
    WHEN 2 THEN 5
    WHEN 3 THEN 30
    WHEN 4 THEN 300
    WHEN 5 THEN 1800
    WHEN 6 THEN 7200
    ELSE 21600
  END;

  UPDATE public.fun_profile_event_outbox
    SET status = 'failed',
        last_error = p_error,
        next_attempt_at = now() + (v_delay_seconds || ' seconds')::interval,
        updated_at = now()
    WHERE id = p_id;
  RETURN jsonb_build_object('status','failed','attempts',v_attempts,'retry_in_seconds',v_delay_seconds);
END;
$$;

-- Update CHECK constraint to allow 'in_flight'
DO $$
DECLARE c_name text;
BEGIN
  SELECT conname INTO c_name FROM pg_constraint
    WHERE conrelid = 'public.fun_profile_event_outbox'::regclass
      AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.fun_profile_event_outbox DROP CONSTRAINT %I', c_name);
  END IF;
  ALTER TABLE public.fun_profile_event_outbox
    ADD CONSTRAINT fun_profile_event_outbox_status_check
    CHECK (status IN ('pending','in_flight','sent','failed','dead'));
END$$;

REVOKE ALL ON FUNCTION public.fun_profile_outbox_publisher_claim(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fun_profile_outbox_publisher_ack(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fun_profile_outbox_publisher_claim(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.fun_profile_outbox_publisher_ack(uuid, boolean, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.fun_profile_toggle_outbox_publisher(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fun_profile_outbox_retry_one(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fun_profile_outbox_retry_dead_batch(int) TO authenticated;
