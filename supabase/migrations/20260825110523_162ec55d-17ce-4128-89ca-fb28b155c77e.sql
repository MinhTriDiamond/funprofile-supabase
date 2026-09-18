-- A-CONFIRM: revoke dead anon default privileges on tables with no anon/public policy
DO $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public' AND c.relkind = 'r'
      AND c.relacl::text LIKE '%anon=arwdDxtm%'
      AND c.relname NOT IN (
        SELECT DISTINCT tablename FROM pg_policies
        WHERE schemaname = 'public'
          AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
      )
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', r.relname);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'revoked anon on % tables', n;
END $$;

-- swap_failures: admin-only read surface, no client writes
REVOKE ALL ON TABLE public.swap_failures FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.swap_failures FROM authenticated;
GRANT SELECT ON TABLE public.swap_failures TO authenticated;
GRANT ALL ON TABLE public.swap_failures TO service_role;