CREATE OR REPLACE FUNCTION public.tmp_p0_fake_failure()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email LIKE 'p0fake%@fun-profile-test.invalid' THEN
    RAISE EXCEPTION 'TMP_P0_FAKE_FAILURE: nhánh lỗi lạ chưa từng biết';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tmp_p0_fake_failure_trg
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tmp_p0_fake_failure();