CREATE TABLE public.swap_failures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tx_hash text,
  chain_id integer,
  user_id uuid,
  stage text NOT NULL,
  reason text,
  http_status integer,
  sqlstate text,
  error_message text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 1,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_failed_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.swap_failures TO authenticated;
GRANT ALL ON public.swap_failures TO service_role;

ALTER TABLE public.swap_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view swap failures"
ON public.swap_failures FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX swap_failures_dedup_idx
ON public.swap_failures (coalesce(tx_hash, ''), coalesce(chain_id, -1), stage);

CREATE INDEX swap_failures_last_failed_idx ON public.swap_failures (last_failed_at DESC);

CREATE TRIGGER update_swap_failures_updated_at
BEFORE UPDATE ON public.swap_failures
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.log_swap_failure(
  p_stage text,
  p_tx_hash text DEFAULT NULL,
  p_chain_id integer DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_http_status integer DEFAULT NULL,
  p_sqlstate text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.swap_failures AS sf
    (tx_hash, chain_id, user_id, stage, reason, http_status, sqlstate, error_message, context)
  VALUES (p_tx_hash, p_chain_id, p_user_id, p_stage, p_reason, p_http_status, p_sqlstate, p_error_message, coalesce(p_context, '{}'::jsonb))
  ON CONFLICT (coalesce(tx_hash, ''), coalesce(chain_id, -1), stage)
  DO UPDATE SET
    attempts = sf.attempts + 1,
    last_failed_at = now(),
    reason = coalesce(EXCLUDED.reason, sf.reason),
    http_status = coalesce(EXCLUDED.http_status, sf.http_status),
    sqlstate = coalesce(EXCLUDED.sqlstate, sf.sqlstate),
    error_message = coalesce(EXCLUDED.error_message, sf.error_message),
    context = sf.context || EXCLUDED.context
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_swap_failure(text, text, integer, uuid, text, integer, text, text, jsonb) TO authenticated, service_role;