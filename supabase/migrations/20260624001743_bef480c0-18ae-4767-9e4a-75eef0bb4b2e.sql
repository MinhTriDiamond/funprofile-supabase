
-- 1. Audit table
CREATE TABLE IF NOT EXISTS public.admin_sql_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  sql_hash text NOT NULL,
  sql_preview text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('read','write')),
  ip text,
  row_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_sql_audit_admin ON public.admin_sql_audit(admin_id, created_at DESC);

GRANT SELECT ON public.admin_sql_audit TO authenticated;
GRANT ALL ON public.admin_sql_audit TO service_role;

ALTER TABLE public.admin_sql_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view admin_sql_audit" ON public.admin_sql_audit;
CREATE POLICY "Admins can view admin_sql_audit"
  ON public.admin_sql_audit
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. SQL exec function (chỉ gọi qua edge function admin-sql, đã verify quyền + filter từ khoá)
CREATE OR REPLACE FUNCTION public.admin_sql_exec(_sql text)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
BEGIN
  -- Defense in depth: chặn DDL nguy hiểm ngay tại DB (edge function đã chặn rồi, đây là lớp 2)
  IF _sql ~* '\m(drop|truncate|grant|revoke|create\s+role|create\s+user|alter\s+system|copy\s+)\M' THEN
    RAISE EXCEPTION 'forbidden_keyword';
  END IF;

  FOR rec IN EXECUTE format('SELECT to_jsonb(t) AS row FROM (%s) t', _sql)
  LOOP
    RETURN NEXT rec.row;
  END LOOP;
  RETURN;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'admin_sql_exec_error: %', SQLERRM;
END;
$$;

-- Chỉ service_role mới được gọi (edge function admin-sql chạy với service_role)
REVOKE ALL ON FUNCTION public.admin_sql_exec(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_sql_exec(text) FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_sql_exec(text) TO service_role;
