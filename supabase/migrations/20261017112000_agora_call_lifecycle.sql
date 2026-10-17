-- Store stable RTC identities per call participant and move call transitions into RPCs.
ALTER TABLE public.call_participants ADD COLUMN IF NOT EXISTS agora_uid integer;
CREATE UNIQUE INDEX IF NOT EXISTS call_participants_session_agora_uid_key
  ON public.call_participants(call_session_id, agora_uid) WHERE agora_uid IS NOT NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.call_participants WHERE left_at IS NULL GROUP BY call_session_id,user_id HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Cannot add active call-participant guard while duplicate active participants exist';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS call_participants_one_active_user_per_session
  ON public.call_participants(call_session_id,user_id) WHERE left_at IS NULL;
CREATE OR REPLACE FUNCTION public.start_call_session(p_conversation_id uuid,p_call_type text)
RETURNS public.call_sessions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid:=auth.uid(); result public.call_sessions; peer uuid; session_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  IF p_call_type NOT IN ('voice','video') THEN RAISE EXCEPTION 'invalid call type' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_conversation_id::text, 7));
  IF NOT public.is_conversation_participant(p_conversation_id,actor) THEN RAISE EXCEPTION 'active member required' USING ERRCODE='42501'; END IF;
  -- The client times out ringing after 45 seconds. Recover orphaned ringing
  -- rows under the same conversation lock before deciding a call is occupied.
  UPDATE public.call_sessions SET status='missed',ended_at=coalesce(ended_at,now())
  WHERE conversation_id=p_conversation_id AND status='ringing' AND created_at<=now()-interval '45 seconds';
  IF EXISTS (SELECT 1 FROM public.call_sessions WHERE conversation_id=p_conversation_id AND status IN ('pending','ringing','active')) THEN
    RAISE EXCEPTION 'an open call already exists' USING ERRCODE='23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.conversation_participants cp
    WHERE cp.conversation_id=p_conversation_id AND cp.left_at IS NULL AND cp.user_id<>actor
      AND public.has_block_between(actor,cp.user_id)
  ) THEN RAISE EXCEPTION 'call unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO public.call_sessions(conversation_id,initiator_id,call_type,status,channel_name)
  VALUES(p_conversation_id,actor,p_call_type,'ringing','call_'||gen_random_uuid()::text)
  RETURNING * INTO result;
  session_id:=result.id;
  INSERT INTO public.call_participants(call_session_id,user_id,joined_at,agora_uid,is_video_off)
  VALUES(session_id,actor,now(),(1+mod(abs(hashtextextended(session_id::text||':'||actor::text,0)),2147483000))::integer,p_call_type='voice');
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.get_agora_call_token_context(p_call_session_id uuid)
RETURNS TABLE(channel_name text,agora_uid integer,call_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid:=auth.uid(); cs public.call_sessions; uid_value integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO cs FROM public.call_sessions WHERE id=p_call_session_id;
  IF NOT FOUND OR cs.status NOT IN ('ringing','active') OR NOT public.is_conversation_participant(cs.conversation_id,actor) THEN RETURN; END IF;
  IF actor<>cs.initiator_id AND NOT EXISTS (SELECT 1 FROM public.call_participants cp WHERE cp.call_session_id=cs.id AND cp.user_id=actor) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id=cs.conversation_id AND cp.left_at IS NULL AND cp.user_id<>actor AND public.has_block_between(actor,cp.user_id)) THEN RAISE EXCEPTION 'call unavailable' USING ERRCODE='42501'; END IF;
  uid_value:=(1+mod(abs(hashtextextended(cs.id::text||':'||actor::text,0)),2147483000))::integer;
  INSERT INTO public.call_participants(call_session_id,user_id,agora_uid)
  VALUES(cs.id,actor,uid_value)
  ON CONFLICT(call_session_id,user_id) WHERE left_at IS NULL DO UPDATE SET joined_at=coalesce(public.call_participants.joined_at,now()),left_at=NULL,agora_uid=coalesce(public.call_participants.agora_uid,EXCLUDED.agora_uid);
  RETURN QUERY SELECT cs.channel_name,uid_value,cs.status;
END $$;

CREATE OR REPLACE FUNCTION public.accept_call_session(p_call_session_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid:=auth.uid(); cs public.call_sessions; changed integer; uid_value integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO cs FROM public.call_sessions WHERE id=p_call_session_id FOR UPDATE;
  IF NOT FOUND OR cs.initiator_id=actor OR NOT public.is_conversation_participant(cs.conversation_id,actor) OR EXISTS (
    SELECT 1 FROM public.conversation_participants peer WHERE peer.conversation_id=cs.conversation_id AND peer.left_at IS NULL AND peer.user_id<>actor AND public.has_block_between(actor,peer.user_id)
  ) THEN RETURN false; END IF;
  IF cs.status='active' THEN RETURN EXISTS (SELECT 1 FROM public.call_participants cp WHERE cp.call_session_id=cs.id AND cp.user_id=actor); END IF;
  IF cs.status<>'ringing' THEN RETURN false; END IF;
  uid_value:=(1+mod(abs(hashtextextended(cs.id::text||':'||actor::text,0)),2147483000))::integer;
  INSERT INTO public.call_participants(call_session_id,user_id,joined_at,agora_uid,is_video_off) VALUES(cs.id,actor,now(),uid_value,cs.call_type='voice')
  ON CONFLICT(call_session_id,user_id) WHERE left_at IS NULL DO UPDATE SET joined_at=now(),left_at=NULL,agora_uid=coalesce(public.call_participants.agora_uid,EXCLUDED.agora_uid);
  UPDATE public.call_sessions SET status='active',started_at=coalesce(started_at,now()) WHERE id=cs.id AND status='ringing';
  GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.decline_call_session(p_call_session_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid:=auth.uid(); changed integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  UPDATE public.call_sessions cs SET status='declined',ended_at=now() WHERE cs.id=p_call_session_id AND cs.status='ringing' AND cs.initiator_id<>actor AND public.is_conversation_participant(cs.conversation_id,actor);
  GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.end_call_session(p_call_session_id uuid,p_duration_seconds integer DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid:=auth.uid(); cs public.call_sessions; changed integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  SELECT * INTO cs FROM public.call_sessions WHERE id=p_call_session_id FOR UPDATE;
  IF NOT FOUND OR cs.status NOT IN ('pending','ringing','active') OR NOT EXISTS (SELECT 1 FROM public.call_participants cp WHERE cp.call_session_id=cs.id AND cp.user_id=actor) THEN RETURN false; END IF;
  UPDATE public.call_sessions SET status='ended',ended_at=now(),duration_seconds=greatest(coalesce(p_duration_seconds,0),0) WHERE id=cs.id AND status IN ('pending','ringing','active');
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed=1 THEN UPDATE public.call_participants SET left_at=coalesce(left_at,now()) WHERE call_session_id=cs.id AND user_id=actor; END IF;
  RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.mark_call_missed(p_call_session_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid:=auth.uid(); changed integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  UPDATE public.call_sessions cs SET status='missed',ended_at=now() WHERE cs.id=p_call_session_id AND cs.status='ringing' AND cs.initiator_id=actor;
  GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed=1;
END $$;

CREATE OR REPLACE FUNCTION public.update_call_participant(p_call_session_id uuid,p_is_muted boolean,p_is_video_off boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid:=auth.uid(); changed integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='28000'; END IF;
  UPDATE public.call_participants cp SET is_muted=coalesce(p_is_muted,cp.is_muted),is_video_off=coalesce(p_is_video_off,cp.is_video_off)
  FROM public.call_sessions cs WHERE cp.call_session_id=p_call_session_id AND cp.user_id=actor AND cs.id=cp.call_session_id AND cs.status='active';
  GET DIAGNOSTICS changed=ROW_COUNT; RETURN changed=1;
END $$;

DROP POLICY IF EXISTS "Users can create call sessions in their conversations" ON public.call_sessions;
DROP POLICY IF EXISTS "Participants can update call sessions" ON public.call_sessions;
DROP POLICY IF EXISTS "Users can join calls" ON public.call_participants;
DROP POLICY IF EXISTS "Users can update their own call participant record" ON public.call_participants;
REVOKE ALL ON public.call_sessions,public.call_participants FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.call_sessions,public.call_participants FROM authenticated;
GRANT SELECT ON public.call_sessions,public.call_participants TO authenticated,service_role;

REVOKE ALL ON FUNCTION public.start_call_session(uuid,text),public.get_agora_call_token_context(uuid),public.accept_call_session(uuid),public.decline_call_session(uuid),public.end_call_session(uuid,integer),public.mark_call_missed(uuid),public.update_call_participant(uuid,boolean,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_call_session(uuid,text),public.get_agora_call_token_context(uuid),public.accept_call_session(uuid),public.decline_call_session(uuid),public.end_call_session(uuid,integer),public.mark_call_missed(uuid),public.update_call_participant(uuid,boolean,boolean) TO authenticated,service_role;
