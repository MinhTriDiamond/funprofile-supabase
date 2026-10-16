-- Regression test against the installed schema. Only temporary rows are written.
BEGIN;

CREATE TEMP TABLE rtmp_status_contract (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status text NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  installed_check text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO STRICT installed_check
  FROM pg_constraint
  WHERE conrelid = 'public.live_sessions'::regclass
    AND conname = 'live_sessions_status_check';
  EXECUTE 'ALTER TABLE rtmp_status_contract ADD CONSTRAINT status_contract_check ' || installed_check;
END;
$$;

CREATE TRIGGER status_contract_guard
  BEFORE UPDATE ON rtmp_status_contract
  FOR EACH ROW EXECUTE FUNCTION public.live_sessions_state_guard();

-- Exercise loss, recovery, fenced end and replay without touching real sessions.
INSERT INTO rtmp_status_contract (status) VALUES ('live');
UPDATE rtmp_status_contract SET status = 'reconnecting' WHERE id = 1;
UPDATE rtmp_status_contract SET status = 'live' WHERE id = 1;
UPDATE rtmp_status_contract SET status = 'reconnecting' WHERE id = 1;
UPDATE rtmp_status_contract SET status = 'ending' WHERE id = 1;
UPDATE rtmp_status_contract SET status = 'processing_replay' WHERE id = 1;
UPDATE rtmp_status_contract SET status = 'archived' WHERE id = 1;

DO $$
DECLARE
  terminal_status text;
  terminal_id integer;
BEGIN
  -- Invalid arbitrary states must still be rejected.
  BEGIN
    INSERT INTO rtmp_status_contract (status) VALUES ('invalid_rtmp_status');
    RAISE EXCEPTION 'invalid status was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Adding reconnecting must not allow a terminal session to become active.
  FOREACH terminal_status IN ARRAY ARRAY['ended', 'processing_replay', 'posted', 'replay_posted', 'archived'] LOOP
    INSERT INTO rtmp_status_contract (status) VALUES (terminal_status) RETURNING id INTO terminal_id;
    BEGIN
      UPDATE rtmp_status_contract SET status = 'reconnecting' WHERE id = terminal_id;
      RAISE EXCEPTION 'terminal status % was reopened', terminal_status;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'invalid_transition:%' THEN RAISE; END IF;
    END;
  END LOOP;
END;
$$;

ROLLBACK;
