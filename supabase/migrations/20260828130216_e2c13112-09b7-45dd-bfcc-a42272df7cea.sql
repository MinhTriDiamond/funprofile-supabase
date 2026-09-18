DO $mig$
DECLARE
  def text;
  newdef text;
  old_join constant text := 'LEFT JOIN profiles p ON p.id = t.user_id';
  old_ext  constant text := 'false AS is_external,
            t.amount AS amount_raw,';
  old_meta constant text := '''{}''::jsonb AS metadata,';
BEGIN
  def := pg_get_viewdef('public.v_unified_transactions'::regclass, true);

  IF position(old_join in def) = 0 OR position(old_ext in def) = 0 OR position(old_meta in def) = 0 THEN
    RAISE EXCEPTION 'Khong tim thay moc thay the trong dinh nghia view (join=%, ext=%, meta=%)',
      position(old_join in def), position(old_ext in def), position(old_meta in def);
  END IF;

  newdef := replace(def, old_join, old_join || '
             LEFT JOIN v_internal_addresses fi ON fi.addr = lower(NULLIF(t.from_address, ''''))
             LEFT JOIN v_internal_addresses ti ON ti.addr = lower(NULLIF(t.to_address, ''''))');

  newdef := replace(newdef, old_ext,
    'CASE
                WHEN NULLIF(t.from_address, '''') IS NULL OR NULLIF(t.to_address, '''') IS NULL THEN false
                ELSE (fi.addr IS NULL OR ti.addr IS NULL)
            END AS is_external,
            t.amount AS amount_raw,');

  newdef := replace(newdef, old_meta,
    'CASE
                WHEN NULLIF(t.from_address, '''') IS NULL OR NULLIF(t.to_address, '''') IS NULL
                  THEN jsonb_build_object(''external_undetermined'', true)
                ELSE ''{}''::jsonb
            END AS metadata,');

  EXECUTE 'CREATE OR REPLACE VIEW public.v_unified_transactions AS ' || newdef;
END
$mig$;