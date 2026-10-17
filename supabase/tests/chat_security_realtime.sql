-- Run with psql against a disposable local/staging Supabase database only:
-- psql "$LOCAL_DATABASE_URL" -v chat_user_a=<uuid> -v chat_user_b=<uuid> \
--   -v chat_user_c=<uuid> -f supabase/tests/chat_security_realtime.sql
-- A/B/C must be disposable auth.users with matching public.profiles rows.
-- The entire fixture is rolled back. Never run with the production URL.
\set ON_ERROR_STOP on
\if :{?chat_user_a}
\else
  \echo 'Required -v chat_user_a, chat_user_b and chat_user_c local fixture IDs'
  \quit 3
\endif
\if :{?chat_user_b}
\else
  \echo 'Required -v chat_user_a, chat_user_b and chat_user_c local fixture IDs'
  \quit 3
\endif
\if :{?chat_user_c}
\else
  \echo 'Required -v chat_user_a, chat_user_b and chat_user_c local fixture IDs'
  \quit 3
\endif

BEGIN;
DO $$
BEGIN
  IF has_function_privilege('authenticated','public.create_direct_conversation(uuid)','EXECUTE') IS DISTINCT FROM true
     OR has_function_privilege('service_role','public.create_direct_conversation(uuid)','EXECUTE') IS DISTINCT FROM true
     OR has_function_privilege('anon','public.create_direct_conversation(uuid)','EXECUTE') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'create_direct_conversation grant boundary is wrong';
  END IF;
  IF has_function_privilege('authenticated','public.get_agora_call_token_context(uuid)','EXECUTE') IS DISTINCT FROM true
     OR has_function_privilege('service_role','public.get_agora_call_token_context(uuid)','EXECUTE') IS DISTINCT FROM true
     OR has_function_privilege('anon','public.get_agora_call_token_context(uuid)','EXECUTE') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'call token RPC grant boundary is wrong';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY[
      'public.create_direct_conversation(uuid)','public.create_group_conversation(text,uuid[])',
      'public.manage_conversation_member(uuid,uuid,text)','public.leave_conversation(uuid)',
      'public.get_my_block_relationships()','public.can_message_conversation(uuid)',
      'public.start_call_session(uuid,text)','public.accept_call_session(uuid)',
      'public.decline_call_session(uuid)','public.end_call_session(uuid,integer)',
      'public.mark_call_missed(uuid)','public.update_call_participant(uuid,boolean,boolean)'
    ]) AS f(signature)
    WHERE has_function_privilege('authenticated',f.signature,'EXECUTE') IS DISTINCT FROM true
       OR has_function_privilege('anon',f.signature,'EXECUTE') IS DISTINCT FROM false
       OR (f.signature<>'public.can_message_conversation(uuid)' AND has_function_privilege('service_role',f.signature,'EXECUTE') IS DISTINCT FROM true)) THEN
    RAISE EXCEPTION 'one or more RPC EXECUTE grant boundaries are wrong';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['live_comments','live_messages','live_reactions','live_sessions']) AS expected(tablename)
    WHERE NOT EXISTS (SELECT 1 FROM pg_publication_tables p WHERE p.pubname='supabase_realtime' AND p.schemaname='public' AND p.tablename=expected.tablename)) THEN
    RAISE EXCEPTION 'existing livestream publication members were not preserved';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['conversations','conversation_participants','messages','message_reads','message_reactions','call_sessions','call_participants']) AS expected(tablename)
    WHERE NOT EXISTS (SELECT 1 FROM pg_publication_tables p WHERE p.pubname='supabase_realtime' AND p.schemaname='public' AND p.tablename=expected.tablename)) THEN
    RAISE EXCEPTION 'chat/call tables are missing from supabase_realtime';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(ARRAY['call_sessions','call_participants','conversations','conversation_participants','messages','message_reads','message_reactions','user_blocks']) AS t(tablename)
    WHERE has_table_privilege('anon','public.'||t.tablename,'SELECT')) THEN
    RAISE EXCEPTION 'anon retains direct table SELECT grants';
  END IF;
  IF has_table_privilege('authenticated','public.call_sessions','INSERT') OR has_table_privilege('authenticated','public.call_sessions','UPDATE')
     OR has_table_privilege('authenticated','public.call_participants','INSERT') OR has_table_privilege('authenticated','public.call_participants','UPDATE')
     OR has_table_privilege('authenticated','public.conversation_participants','INSERT') OR has_table_privilege('authenticated','public.conversation_participants','DELETE') THEN
    RAISE EXCEPTION 'authenticated retains direct lifecycle or membership writes';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('create_direct_conversation','create_group_conversation','manage_conversation_member','leave_conversation','get_my_block_relationships','can_message_conversation','start_call_session','get_agora_call_token_context','accept_call_session','decline_call_session','end_call_session','mark_call_missed','update_call_participant')
      AND (NOT p.prosecdef OR NOT coalesce(array_to_string(p.proconfig,','),'') LIKE '%search_path=pg_catalog, public, pg_temp%')) THEN
    RAISE EXCEPTION 'RPC SECURITY DEFINER or hardened search_path is missing';
  END IF;
  IF (SELECT count(*) FROM public.call_participants WHERE call_session_id='20000000-0000-0000-0000-000000000001' AND user_id='10000000-0000-0000-0000-000000000001') NOT IN (0,2) THEN
    RAISE EXCEPTION 'migration modified historical duplicate ended participants';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='call_participants_one_active_user_per_session') THEN
    RAISE EXCEPTION 'active call participant uniqueness guard is missing';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', :'chat_user_a', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_a', 'role', 'authenticated')::text, true);
SELECT set_config('test.chat.user_a', :'chat_user_a', true);
SELECT set_config('test.chat.user_b', :'chat_user_b', true);
SELECT set_config('test.chat.user_c', :'chat_user_c', true);
SELECT public.create_group_conversation('Isolation A', ARRAY[:'chat_user_c'::uuid]) AS group_a \gset
SELECT set_config('test.chat.group_a', :'group_a', true);
RESET ROLE;
INSERT INTO public.call_sessions(id,conversation_id,initiator_id,call_type,status,channel_name,created_at)
VALUES ('20000000-0000-0000-0000-000000000002', :'group_a'::uuid, :'chat_user_a'::uuid, 'voice', 'ringing', 'stale-ring-group-a', now()-interval '1 minute');
SET LOCAL ROLE authenticated;
SELECT set_config('test.chat.expired_call_id','20000000-0000-0000-0000-000000000002',true);
SELECT (public.start_call_session(:'group_a'::uuid,'voice')).id AS call_id \gset
SELECT set_config('test.chat.call_id', :'call_id', true);
DO $$
DECLARE first_uid integer; second_uid integer; channel_value text; duplicate_open integer;
BEGIN
  SELECT agora_uid,channel_name INTO first_uid,channel_value FROM public.get_agora_call_token_context(current_setting('test.chat.call_id')::uuid);
  SELECT agora_uid INTO second_uid FROM public.get_agora_call_token_context(current_setting('test.chat.call_id')::uuid);
  IF first_uid IS NULL OR first_uid<>second_uid OR channel_value !~ '^call_' THEN RAISE EXCEPTION 'call token identity was not stable/server-derived'; END IF;
  IF (SELECT status FROM public.call_sessions WHERE id=current_setting('test.chat.expired_call_id')::uuid)<>'missed' THEN RAISE EXCEPTION 'stale ringing call was not finalized as missed'; END IF;
  BEGIN
    PERFORM public.start_call_session(current_setting('test.chat.group_a')::uuid,'video');
    RAISE EXCEPTION 'second open call unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  SELECT count(*) INTO duplicate_open FROM public.call_participants WHERE call_session_id=current_setting('test.chat.call_id')::uuid AND user_id=auth.uid() AND left_at IS NULL;
  IF duplicate_open<>1 THEN RAISE EXCEPTION 'token retries created duplicate active participants'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', :'chat_user_b', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_b', 'role', 'authenticated')::text, true);
SELECT public.create_group_conversation('Isolation B', ARRAY[:'chat_user_c'::uuid]) AS group_b \gset
SELECT set_config('test.chat.group_b', :'group_b', true);
SELECT set_config('request.jwt.claim.sub', :'chat_user_a', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_a', 'role', 'authenticated')::text, true);
DO $$ BEGIN
  BEGIN
    PERFORM public.manage_conversation_member(current_setting('test.chat.group_b')::uuid,current_setting('test.chat.user_c')::uuid,'remove');
    RAISE EXCEPTION 'admin of another group managed this group';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', :'chat_user_b', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_b', 'role', 'authenticated')::text, true);
SELECT public.manage_conversation_member(:'group_b'::uuid, :'chat_user_c'::uuid, 'add');
SELECT public.manage_conversation_member(:'group_b'::uuid, :'chat_user_c'::uuid, 'add');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.conversation_participants WHERE conversation_id=current_setting('test.chat.group_b')::uuid AND user_id=current_setting('test.chat.user_c')::uuid AND left_at IS NULL)<>1 THEN
    RAISE EXCEPTION 'repeated add created duplicate active group membership';
  END IF;
END $$;
SELECT public.manage_conversation_member(:'group_b'::uuid, :'chat_user_c'::uuid, 'remove');
SELECT set_config('request.jwt.claim.sub', :'chat_user_a', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_a', 'role', 'authenticated')::text, true);
SELECT public.create_direct_conversation(:'chat_user_b'::uuid) AS direct_id \gset
SELECT set_config('test.chat.direct_id', :'direct_id', true);
DO $$ BEGIN
  IF public.create_direct_conversation(current_setting('test.chat.user_b')::uuid)<>current_setting('test.chat.direct_id')::uuid THEN
    RAISE EXCEPTION 'DM retry created a duplicate conversation';
  END IF;
END $$;
WITH inserted AS (
  INSERT INTO public.messages(conversation_id,sender_id,content)
  VALUES (:'direct_id'::uuid, :'chat_user_a'::uuid, 'direct fixture') RETURNING id
) SELECT set_config('test.chat.direct_message_id', id::text, true) FROM inserted;
WITH inserted AS (
  INSERT INTO public.messages(conversation_id,sender_id,content)
  VALUES (:'group_a'::uuid, :'chat_user_a'::uuid, 'group A reply target') RETURNING id
) SELECT set_config('test.chat.cross_reply_id', id::text, true) FROM inserted;

-- B cannot see A's separate group and cannot self-join/manage membership.
SELECT set_config('request.jwt.claim.sub', :'chat_user_b', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_b', 'role', 'authenticated')::text, true);
DO $$
DECLARE visible_count integer; call_count integer; token_count integer; affected integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.conversations WHERE id=current_setting('test.chat.group_a')::uuid;
  IF visible_count<>0 THEN RAISE EXCEPTION 'cross-group conversation was visible'; END IF;
  BEGIN
    PERFORM public.manage_conversation_member(current_setting('test.chat.group_a')::uuid,auth.uid(),'add');
    RAISE EXCEPTION 'non-admin self-join unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.manage_conversation_member(current_setting('test.chat.group_a')::uuid,current_setting('test.chat.user_c')::uuid,'remove');
    RAISE EXCEPTION 'non-admin member management unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO call_count FROM public.call_sessions WHERE id=current_setting('test.chat.call_id')::uuid;
  SELECT count(*) INTO token_count FROM public.get_agora_call_token_context(current_setting('test.chat.call_id')::uuid);
  IF call_count<>0 OR token_count<>0 THEN RAISE EXCEPTION 'outsider read or received token for call'; END IF;
  BEGIN
    UPDATE public.call_sessions SET status='ended' WHERE id=current_setting('test.chat.call_id')::uuid;
    GET DIAGNOSTICS affected=ROW_COUNT;
    IF affected<>0 THEN RAISE EXCEPTION 'outsider updated another conversation call'; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.call_sessions(conversation_id,initiator_id,call_type,status,channel_name)
    VALUES(current_setting('test.chat.group_a')::uuid,auth.uid(),'voice','ringing','forbidden-client-call');
    RAISE EXCEPTION 'direct call insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- A valid receiver joins; token retry keeps the same UID. A later terminal
-- transition is not overwritten by a delayed decline.
SELECT set_config('request.jwt.claim.sub', :'chat_user_c', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_c', 'role', 'authenticated')::text, true);
SELECT public.accept_call_session(current_setting('test.chat.call_id')::uuid);
DO $$
DECLARE first_uid integer; second_uid integer; participant_count integer;
BEGIN
  SELECT agora_uid INTO first_uid FROM public.get_agora_call_token_context(current_setting('test.chat.call_id')::uuid);
  SELECT agora_uid INTO second_uid FROM public.get_agora_call_token_context(current_setting('test.chat.call_id')::uuid);
  SELECT count(*) INTO participant_count FROM public.call_participants WHERE call_session_id=current_setting('test.chat.call_id')::uuid AND user_id=auth.uid() AND left_at IS NULL;
  IF first_uid IS NULL OR first_uid<>second_uid OR participant_count<>1 THEN RAISE EXCEPTION 'receiver token retry was not idempotent'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', :'chat_user_a', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_a', 'role', 'authenticated')::text, true);
SELECT public.end_call_session(current_setting('test.chat.call_id')::uuid,12);
SELECT set_config('request.jwt.claim.sub', :'chat_user_c', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_c', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  IF public.decline_call_session(current_setting('test.chat.call_id')::uuid) THEN RAISE EXCEPTION 'late decline overwrote terminal call'; END IF;
  IF (SELECT status FROM public.call_sessions WHERE id=current_setting('test.chat.call_id')::uuid)<>'ended' THEN RAISE EXCEPTION 'terminal call status changed'; END IF;
END $$;

-- A block is enforced by group creation before any conversation/member row is
-- committed; a failed multi-member request leaves no partial group behind.
SELECT set_config('request.jwt.claim.sub', :'chat_user_a', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_a', 'role', 'authenticated')::text, true);
INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES (:'chat_user_a'::uuid,:'chat_user_b'::uuid);
DO $$
DECLARE before_count integer; after_count integer;
BEGIN
  SELECT count(*) INTO before_count FROM public.conversations;
  BEGIN
    PERFORM public.create_group_conversation('atomic blocked group',ARRAY[current_setting('test.chat.user_c')::uuid,current_setting('test.chat.user_b')::uuid]);
    RAISE EXCEPTION 'blocked group creation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO after_count FROM public.conversations;
  IF after_count<>before_count THEN RAISE EXCEPTION 'failed group creation left a partial conversation'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', :'chat_user_b', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_b', 'role', 'authenticated')::text, true);

-- A user cannot reply across conversations or directly insert a participant.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.messages(conversation_id,sender_id,content,reply_to_id)
    VALUES(current_setting('test.chat.group_b')::uuid,auth.uid(),'cross conversation reply',current_setting('test.chat.cross_reply_id')::uuid);
    RAISE EXCEPTION 'cross-conversation reply unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.conversation_participants(conversation_id,user_id,role)
    VALUES(current_setting('test.chat.group_a')::uuid,auth.uid(),'member');
    RAISE EXCEPTION 'direct participant self-join unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- B can write while active, then cannot edit after leaving.
WITH inserted AS (
  INSERT INTO public.messages(conversation_id,sender_id,content)
  VALUES(current_setting('test.chat.group_b')::uuid,auth.uid(),'B own message') RETURNING id
) SELECT set_config('test.chat.user_b_message_id', id::text, true) FROM inserted;
SELECT public.leave_conversation(current_setting('test.chat.group_b')::uuid);
DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM public.messages WHERE id=current_setting('test.chat.user_b_message_id')::uuid)<>0 THEN RAISE EXCEPTION 'left member can still read old messages'; END IF;
  UPDATE public.messages SET content='should remain unchanged' WHERE id=current_setting('test.chat.user_b_message_id')::uuid;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'left member edited message'; END IF;
  BEGIN
    INSERT INTO public.messages(conversation_id,sender_id,content)
    VALUES(current_setting('test.chat.group_b')::uuid,auth.uid(),'left member message');
    RAISE EXCEPTION 'left member sent a new message';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

-- B sees only its block relationship; unrelated C cannot enumerate A/B blocks.
SELECT set_config('request.jwt.claim.sub', :'chat_user_a', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_a', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  IF public.can_message_conversation(current_setting('test.chat.direct_id')::uuid) THEN RAISE EXCEPTION 'blocked direct-message path remained enabled'; END IF;
  BEGIN
    INSERT INTO public.messages(conversation_id,sender_id,content)
    VALUES(current_setting('test.chat.direct_id')::uuid,auth.uid(),'blocked message');
    RAISE EXCEPTION 'blocked user sent a DM';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.create_direct_conversation(current_setting('test.chat.user_b')::uuid);
    RAISE EXCEPTION 'blocked direct conversation creation unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.start_call_session(current_setting('test.chat.direct_id')::uuid,'voice');
    RAISE EXCEPTION 'blocked direct call unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', :'chat_user_b', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_b', 'role', 'authenticated')::text, true);
DO $$
BEGIN
  IF public.can_message_conversation(current_setting('test.chat.direct_id')::uuid) THEN RAISE EXCEPTION 'block is not enforced for the blocked user'; END IF;
  BEGIN
    PERFORM public.create_direct_conversation(current_setting('test.chat.user_a')::uuid);
    RAISE EXCEPTION 'blocked user created direct conversation in reverse direction';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', :'chat_user_c', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', :'chat_user_c', 'role', 'authenticated')::text, true);
DO $$
DECLARE block_count integer;
BEGIN
  SELECT count(*) INTO block_count FROM public.get_my_block_relationships() WHERE blocker_id=current_setting('test.chat.user_a')::uuid OR blocked_id=current_setting('test.chat.user_b')::uuid;
  IF block_count<>0 THEN RAISE EXCEPTION 'unrelated user enumerated block relationship'; END IF;
END $$;

ROLLBACK;
