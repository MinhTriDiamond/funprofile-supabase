
-- Set (upsert) one secret: encrypts value with master key, writes audit
CREATE OR REPLACE FUNCTION public.app_secret_set(
  _name text,
  _value text,
  _key text,
  _actor uuid,
  _description text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _existed boolean;
BEGIN
  IF _name !~ '^[A-Z][A-Z0-9_]{2,127}$' THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF coalesce(length(_value),0) < 1 OR length(_value) > 24576 THEN
    RAISE EXCEPTION 'invalid_value_length';
  END IF;
  IF coalesce(length(_key),0) < 16 THEN
    RAISE EXCEPTION 'invalid_master_key';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.app_secrets WHERE name = _name) INTO _existed;

  INSERT INTO public.app_secrets(name, encrypted_value, description, created_by, updated_by)
  VALUES (_name, pgp_sym_encrypt(_value, _key), _description, _actor, _actor)
  ON CONFLICT (name) DO UPDATE
    SET encrypted_value = EXCLUDED.encrypted_value,
        description = COALESCE(EXCLUDED.description, public.app_secrets.description),
        updated_by = _actor,
        updated_at = now();

  INSERT INTO public.app_secrets_audit(secret_name, action, actor_id)
  VALUES (_name, CASE WHEN _existed THEN 'update' ELSE 'create' END, _actor);

  RETURN CASE WHEN _existed THEN 'updated' ELSE 'created' END;
END;
$$;

REVOKE ALL ON FUNCTION public.app_secret_set(text,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_secret_set(text,text,text,uuid,text) TO service_role;

-- Delete one secret
CREATE OR REPLACE FUNCTION public.app_secret_delete(_name text, _actor uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n int;
BEGIN
  DELETE FROM public.app_secrets WHERE name = _name;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n > 0 THEN
    INSERT INTO public.app_secrets_audit(secret_name, action, actor_id)
    VALUES (_name, 'delete', _actor);
  END IF;
  RETURN _n > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.app_secret_delete(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_secret_delete(text,uuid) TO service_role;

-- Internal getter — ONLY service_role; never expose to client
CREATE OR REPLACE FUNCTION public.app_secret_get(_name text, _key text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE _v bytea;
BEGIN
  SELECT encrypted_value INTO _v FROM public.app_secrets WHERE name = _name;
  IF _v IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(_v, _key);
END;
$$;

REVOKE ALL ON FUNCTION public.app_secret_get(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_secret_get(text,text) TO service_role;
