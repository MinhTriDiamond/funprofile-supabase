CREATE TABLE IF NOT EXISTS public.founder_admin_audit (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action       text NOT NULL,
  target_kind  text,
  target_ref   text,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.founder_admin_audit TO authenticated;
GRANT ALL ON public.founder_admin_audit TO service_role;

ALTER TABLE public.founder_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read founder audit log"
ON public.founder_admin_audit
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can insert own founder audit entries"
ON public.founder_admin_audit
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND admin_id = auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_founder_admin_audit_created_at
  ON public.founder_admin_audit (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_founder_admin_audit_admin_id
  ON public.founder_admin_audit (admin_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_founder_admin_action(
  _action      text,
  _target_kind text DEFAULT NULL,
  _target_ref  text DEFAULT NULL,
  _payload     jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated';
  END IF;
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO public.founder_admin_audit (admin_id, action, target_kind, target_ref, payload)
  VALUES (auth.uid(), _action, _target_kind, _target_ref, COALESCE(_payload, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_founder_admin_action(text, text, text, jsonb) TO authenticated;