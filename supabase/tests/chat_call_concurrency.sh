#!/usr/bin/env bash
# Local-only PostgreSQL race test. Requires the fixture and three migrations
# from chat_security_realtime_fixture.sql already loaded on port 55432.
set -euo pipefail

PGHOST=/tmp
PGPORT=55432
PGDATABASE=chat_hardening_test
PSQL=(psql -X -qAt -h "$PGHOST" -p "$PGPORT" -d "$PGDATABASE" -v ON_ERROR_STOP=1)
USER_A=10000000-0000-0000-0000-000000000001
USER_B=10000000-0000-0000-0000-000000000002
CONV_START=30000000-0000-0000-0000-000000000001
CONV_ACCEPT=30000000-0000-0000-0000-000000000010
CONV_END=30000000-0000-0000-0000-000000000020
CALL_ACCEPT=30000000-0000-0000-0000-000000000011
CALL_END=30000000-0000-0000-0000-000000000021
LOG_PREFIX=/tmp/chat-call-concurrency-$$

if [[ "$("${PSQL[@]}" -Atc 'show port')" != "$PGPORT" || "$("${PSQL[@]}" -Atc 'select current_database()')" != "$PGDATABASE" ]]; then
  echo 'Refusing to run unless connected to local chat_hardening_test on port 55432.' >&2
  exit 2
fi

"${PSQL[@]}" -c "
DELETE FROM public.conversations WHERE id IN ('$CONV_START','$CONV_ACCEPT','$CONV_END');
INSERT INTO public.conversations(id,type,created_by) VALUES
 ('$CONV_START','group','$USER_A'),('$CONV_ACCEPT','group','$USER_A'),('$CONV_END','group','$USER_A');
INSERT INTO public.conversation_participants(conversation_id,user_id,role) VALUES
 ('$CONV_START','$USER_A','admin'),('$CONV_START','$USER_B','member'),
 ('$CONV_ACCEPT','$USER_A','admin'),('$CONV_ACCEPT','$USER_B','member'),
 ('$CONV_END','$USER_A','admin'),('$CONV_END','$USER_B','member');
INSERT INTO public.call_sessions(id,conversation_id,initiator_id,call_type,status,channel_name) VALUES
 ('$CALL_ACCEPT','$CONV_ACCEPT','$USER_A','voice','ringing','race-accept-decline'),
 ('$CALL_END','$CONV_END','$USER_A','voice','active','race-end');
INSERT INTO public.call_participants(call_session_id,user_id,joined_at) VALUES
 ('$CALL_ACCEPT','$USER_A',now()),('$CALL_END','$USER_A',now()),('$CALL_END','$USER_B',now());
" >/dev/null

"${PSQL[@]}" -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$USER_A',true); SELECT pg_sleep(0.2); SELECT (public.start_call_session('$CONV_START','voice')).id; COMMIT;" >"$LOG_PREFIX-start-a" 2>&1 &
start_a_pid=$!
"${PSQL[@]}" -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$USER_B',true); SELECT pg_sleep(0.2); SELECT (public.start_call_session('$CONV_START','voice')).id; COMMIT;" >"$LOG_PREFIX-start-b" 2>&1 &
start_b_pid=$!
set +e
wait "$start_a_pid"; start_a_rc=$?
wait "$start_b_pid"; start_b_rc=$?
set -e
if ! { [[ $start_a_rc -eq 0 && $start_b_rc -eq 1 ]] || [[ $start_a_rc -eq 1 && $start_b_rc -eq 0 ]]; }; then
  cat "$LOG_PREFIX-start-a" "$LOG_PREFIX-start-b" >&2
  echo 'Expected exactly one of two concurrent starts to be rejected.' >&2
  exit 1
fi
"${PSQL[@]}" -c "DO \$\$ BEGIN IF (SELECT count(*) FROM public.call_sessions WHERE conversation_id='$CONV_START' AND status IN ('pending','ringing','active'))<>1 THEN RAISE EXCEPTION 'concurrent starts created duplicate open calls'; END IF; END \$\$;"

"${PSQL[@]}" -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$USER_B',true); SELECT pg_sleep(0.2); SELECT public.accept_call_session('$CALL_ACCEPT'); COMMIT;" >"$LOG_PREFIX-accept" 2>&1 &
accept_pid=$!
"${PSQL[@]}" -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$USER_B',true); SELECT pg_sleep(0.2); SELECT public.decline_call_session('$CALL_ACCEPT'); COMMIT;" >"$LOG_PREFIX-decline" 2>&1 &
decline_pid=$!
wait "$accept_pid"
wait "$decline_pid"
accept_true_count=$(rg -xc 't' "$LOG_PREFIX-accept" || echo 0)
decline_true_count=$(rg -xc 't' "$LOG_PREFIX-decline" || echo 0)
if (( accept_true_count + decline_true_count != 1 )); then
  cat "$LOG_PREFIX-accept" "$LOG_PREFIX-decline" >&2
  echo 'Expected exactly one concurrent accept/decline transition to win.' >&2
  exit 1
fi
"${PSQL[@]}" -c "DO \$\$ BEGIN IF (SELECT status FROM public.call_sessions WHERE id='$CALL_ACCEPT') NOT IN ('active','declined') THEN RAISE EXCEPTION 'accept/decline race lost valid terminal/current state'; END IF; END \$\$;"

"${PSQL[@]}" -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$USER_A',true); SELECT pg_sleep(0.2); SELECT public.end_call_session('$CALL_END',31); COMMIT;" >"$LOG_PREFIX-end-a" 2>&1 &
end_a_pid=$!
"${PSQL[@]}" -c "BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','$USER_B',true); SELECT pg_sleep(0.2); SELECT public.end_call_session('$CALL_END',32); COMMIT;" >"$LOG_PREFIX-end-b" 2>&1 &
end_b_pid=$!
wait "$end_a_pid"
wait "$end_b_pid"
"${PSQL[@]}" -c "
DO \$\$ BEGIN
  IF (SELECT status FROM public.call_sessions WHERE id='$CALL_END')<>'ended' THEN RAISE EXCEPTION 'end race did not reach terminal state'; END IF;
  IF (SELECT duration_seconds FROM public.call_sessions WHERE id='$CALL_END') NOT IN (31,32) THEN RAISE EXCEPTION 'end race wrote an invalid duration'; END IF;
END \$\$;
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','$USER_B',true);
DO \$\$ BEGIN
  IF public.accept_call_session('$CALL_END') OR public.decline_call_session('$CALL_END') THEN RAISE EXCEPTION 'late transition rewrote ended call'; END IF;
END \$\$;
COMMIT;
" >/dev/null

"${PSQL[@]}" -c "DELETE FROM public.conversations WHERE id IN ('$CONV_START','$CONV_ACCEPT','$CONV_END');" >/dev/null
echo 'PASS: serialized start, accept/decline race, concurrent end and terminal fencing.'
