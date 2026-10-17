-- Harden conversation membership and repair chat Realtime publication.
-- All multi-row writes derive the actor from the authenticated JWT.

DROP POLICY IF EXISTS "Users can view conversations they are part of" ON public.conversations;
DROP POLICY IF EXISTS "Users can add participants to conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can update their own participant record" ON public.conversation_participants;
DROP POLICY IF EXISTS "Admins can remove participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Admins can update conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can view participants of their conversations" ON public.conversation_participants;

CREATE POLICY "Active members view conversations"
  ON public.conversations FOR SELECT TO authenticated
  USING (public.is_conversation_participant(id, auth.uid()));
CREATE POLICY "Active members view participants"
  ON public.conversation_participants FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.is_conversation_participant(conversation_id, auth.uid()));
CREATE POLICY "Conversation admins update conversation"
  ON public.conversations FOR UPDATE TO authenticated
  USING (public.is_conversation_admin(id, auth.uid()))
  WITH CHECK (public.is_conversation_admin(id, auth.uid()));

REVOKE ALL ON public.conversations, public.conversation_participants, public.user_blocks FROM anon;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.conversations FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.conversation_participants FROM authenticated;
GRANT SELECT, UPDATE ON public.conversations TO authenticated, service_role;
GRANT SELECT ON public.conversation_participants TO authenticated, service_role;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.user_blocks FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can view their own blocks" ON public.user_blocks;
CREATE POLICY "Users view only their block relationships"
  ON public.user_blocks FOR SELECT TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_direct_conversation(p_other_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid := auth.uid(); conv_id uuid; existing_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000'; END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = actor THEN RAISE EXCEPTION 'invalid recipient' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_other_user_id) THEN RAISE EXCEPTION 'recipient not found' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM user_blocks WHERE (blocker_id = actor AND blocked_id = p_other_user_id) OR (blocker_id = p_other_user_id AND blocked_id = actor)) THEN
    RAISE EXCEPTION 'messaging unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(LEAST(actor::text,p_other_user_id::text) || ':' || GREATEST(actor::text,p_other_user_id::text), 0));
  SELECT c.id INTO existing_id FROM conversations c
  WHERE c.type = 'direct'
    AND public.is_conversation_participant(c.id, actor)
    AND public.is_conversation_participant(c.id, p_other_user_id)
    AND (SELECT count(*) FROM conversation_participants cp WHERE cp.conversation_id = c.id AND cp.left_at IS NULL) = 2
  ORDER BY c.created_at DESC LIMIT 1;
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;
  INSERT INTO conversations(type, created_by) VALUES ('direct', actor) RETURNING id INTO conv_id;
  INSERT INTO conversation_participants(conversation_id,user_id,role) VALUES (conv_id,actor,'member'),(conv_id,p_other_user_id,'member');
  RETURN conv_id;
END $$;

CREATE OR REPLACE FUNCTION public.create_group_conversation(p_name text, p_member_ids uuid[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid := auth.uid(); conv_id uuid; member_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000'; END IF;
  IF length(trim(coalesce(p_name,''))) = 0 OR length(trim(p_name)) > 100 THEN RAISE EXCEPTION 'invalid group name' USING ERRCODE = '22023'; END IF;
  IF coalesce(cardinality(p_member_ids),0) < 1 OR cardinality(p_member_ids) > 99 THEN RAISE EXCEPTION 'invalid members' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_member_ids) x WHERE x IS NULL OR x = actor) OR
     (SELECT count(DISTINCT x) FROM unnest(p_member_ids) x) <> cardinality(p_member_ids) OR
     EXISTS (SELECT 1 FROM unnest(p_member_ids) x LEFT JOIN profiles p ON p.id=x WHERE p.id IS NULL) THEN
    RAISE EXCEPTION 'invalid members' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_member_ids) x JOIN user_blocks b ON (b.blocker_id=actor AND b.blocked_id=x) OR (b.blocker_id=x AND b.blocked_id=actor)) THEN RAISE EXCEPTION 'messaging unavailable' USING ERRCODE = '42501'; END IF;
  INSERT INTO conversations(type,name,created_by) VALUES ('group',trim(p_name),actor) RETURNING id INTO conv_id;
  INSERT INTO conversation_participants(conversation_id,user_id,role) VALUES (conv_id,actor,'admin');
  FOREACH member_id IN ARRAY p_member_ids LOOP
    IF EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id=actor AND b.blocked_id=member_id) OR (b.blocker_id=member_id AND b.blocked_id=actor)) THEN RAISE EXCEPTION 'messaging unavailable' USING ERRCODE = '42501'; END IF;
    INSERT INTO conversation_participants(conversation_id,user_id,role) VALUES (conv_id,member_id,'member');
  END LOOP;
  RETURN conv_id;
END $$;

CREATE OR REPLACE FUNCTION public.manage_conversation_member(p_conversation_id uuid,p_user_id uuid,p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid := auth.uid(); affected integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000'; END IF;
  IF p_action NOT IN ('add','remove') OR p_user_id IS NULL THEN RAISE EXCEPTION 'invalid action' USING ERRCODE = '22023'; END IF;
  IF NOT public.is_conversation_admin(p_conversation_id,actor) OR NOT EXISTS (SELECT 1 FROM conversations WHERE id=p_conversation_id AND type='group') THEN RAISE EXCEPTION 'admin required' USING ERRCODE = '42501'; END IF;
  IF p_action='add' THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id=p_user_id) THEN RAISE EXCEPTION 'member not found' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM conversation_participants WHERE conversation_id=p_conversation_id AND user_id=p_user_id AND left_at IS NULL) THEN RETURN true; END IF;
    IF EXISTS (SELECT 1 FROM user_blocks WHERE (blocker_id=actor AND blocked_id=p_user_id) OR (blocker_id=p_user_id AND blocked_id=actor)) THEN RAISE EXCEPTION 'messaging unavailable' USING ERRCODE = '42501'; END IF;
    INSERT INTO conversation_participants(conversation_id,user_id,role,left_at) VALUES(p_conversation_id,p_user_id,'member',NULL)
      ON CONFLICT(conversation_id,user_id) DO UPDATE SET left_at=NULL,joined_at=now(),role='member';
  ELSE
    IF p_user_id=actor THEN RAISE EXCEPTION 'use leave_conversation' USING ERRCODE = '22023'; END IF;
    UPDATE conversation_participants SET left_at=now() WHERE conversation_id=p_conversation_id AND user_id=p_user_id AND left_at IS NULL;
    GET DIAGNOSTICS affected = ROW_COUNT;
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.leave_conversation(p_conversation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000'; END IF;
  UPDATE conversation_participants SET left_at=coalesce(left_at,now()) WHERE conversation_id=p_conversation_id AND user_id=actor;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_block_relationships()
RETURNS TABLE(blocker_id uuid, blocked_id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$ SELECT b.blocker_id,b.blocked_id,b.created_at FROM public.user_blocks b WHERE b.blocker_id=auth.uid() OR b.blocked_id=auth.uid() $$;

REVOKE ALL ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_group_conversation(text,uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manage_conversation_member(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.leave_conversation(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_block_relationships() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text,uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_conversation_member(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_conversation(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_block_relationships() TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['conversations','conversation_participants','messages','message_reads','message_reactions','call_sessions','call_participants'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t); END IF;
  END LOOP;
END $$;
