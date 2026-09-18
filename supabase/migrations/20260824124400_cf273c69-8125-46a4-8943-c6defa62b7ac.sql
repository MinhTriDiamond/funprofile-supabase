DROP TRIGGER IF EXISTS tmp_p0_fake_failure_trg ON public.profiles;
DROP FUNCTION IF EXISTS public.tmp_p0_fake_failure();

CREATE OR REPLACE FUNCTION public.diagnose_signup_failure(
  _source TEXT,
  _email TEXT,
  _username TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state TEXT;
  v_msg TEXT;
  v_id UUID := gen_random_uuid();
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, username, email)
    VALUES (v_id, COALESCE(_username, 'probe'), lower(COALESCE(_email, '')));
    -- Luôn RAISE để rollback sub-transaction: KHÔNG để lại bất kỳ dữ liệu nào
    RAISE EXCEPTION 'PROBE_OK' USING ERRCODE = 'ZZ000';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;

  IF v_msg = 'PROBE_OK' THEN
    v_state := NULL;
    v_msg := 'profiles INSERT hợp lệ — lỗi nằm NGOÀI trigger trên profiles';
  END IF;

  PERFORM public.log_signup_failure(
    left(_source, 48) || ':probe', _email, _username, v_state, v_msg,
    jsonb_build_object('probe', true)
  );

  RETURN jsonb_build_object('sqlstate', v_state, 'message', v_msg);
END;
$$;

REVOKE ALL ON FUNCTION public.diagnose_signup_failure(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diagnose_signup_failure(TEXT, TEXT, TEXT) TO service_role;