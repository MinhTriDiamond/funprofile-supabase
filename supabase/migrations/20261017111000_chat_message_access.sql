-- Message access is bound to active membership in the specific conversation.
CREATE OR REPLACE FUNCTION public.can_message_conversation(p_conversation_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.conversation_participants cp WHERE cp.conversation_id=p_conversation_id AND cp.user_id=auth.uid() AND cp.left_at IS NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.conversation_participants other_member ON other_member.conversation_id=c.id AND other_member.user_id<>auth.uid() AND other_member.left_at IS NULL
      WHERE c.id=p_conversation_id AND c.type='direct' AND public.has_block_between(auth.uid(),other_member.user_id)
    );
$$;
REVOKE ALL ON FUNCTION public.can_message_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_message_conversation(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can delete their own messages" ON public.messages;
CREATE POLICY "Active members view messages" ON public.messages FOR SELECT TO authenticated
  USING (public.can_message_conversation(conversation_id));
CREATE POLICY "Members send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id=auth.uid() AND public.can_message_conversation(conversation_id) AND
    (reply_to_id IS NULL OR EXISTS (SELECT 1 FROM public.messages parent WHERE parent.id=reply_to_id AND parent.conversation_id=messages.conversation_id))
  );
CREATE POLICY "Active senders update messages" ON public.messages FOR UPDATE TO authenticated
  USING (sender_id=auth.uid() AND public.can_message_conversation(conversation_id))
  WITH CHECK (sender_id=auth.uid() AND public.can_message_conversation(conversation_id));
CREATE POLICY "Active senders delete messages" ON public.messages FOR DELETE TO authenticated
  USING (sender_id=auth.uid() AND public.can_message_conversation(conversation_id));

DROP POLICY IF EXISTS "Users can view read receipts in their conversations" ON public.message_reads;
DROP POLICY IF EXISTS "Users can mark messages as read" ON public.message_reads;
CREATE POLICY "Members view message receipts" ON public.message_reads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.can_message_conversation(m.conversation_id)));
CREATE POLICY "Members write own receipts" ON public.message_reads FOR INSERT TO authenticated
  WITH CHECK (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.can_message_conversation(m.conversation_id)));
CREATE POLICY "Members update own receipts" ON public.message_reads FOR UPDATE TO authenticated
  USING (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.can_message_conversation(m.conversation_id)))
  WITH CHECK (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.can_message_conversation(m.conversation_id)));

DROP POLICY IF EXISTS "Users can view reactions in their conversations" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can add reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can remove their own reactions" ON public.message_reactions;
CREATE POLICY "Members view reactions" ON public.message_reactions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.can_message_conversation(m.conversation_id)));
CREATE POLICY "Members add own reactions" ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.can_message_conversation(m.conversation_id)));
CREATE POLICY "Members update own reactions" ON public.message_reactions FOR UPDATE TO authenticated
  USING (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.can_message_conversation(m.conversation_id)))
  WITH CHECK (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.can_message_conversation(m.conversation_id)));
CREATE POLICY "Members delete own reactions" ON public.message_reactions FOR DELETE TO authenticated
  USING (user_id=auth.uid() AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.can_message_conversation(m.conversation_id)));

REVOKE ALL ON public.messages, public.message_reads, public.message_reactions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.message_reads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;

CREATE OR REPLACE FUNCTION public.pin_message(p_message_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE conv_id uuid;
BEGIN
  SELECT conversation_id INTO conv_id FROM public.messages WHERE id=p_message_id;
  IF conv_id IS NULL OR NOT public.can_message_conversation(conv_id) THEN RAISE EXCEPTION 'active member required' USING ERRCODE='42501'; END IF;
  UPDATE public.messages SET pinned_at=now(),pinned_by=auth.uid() WHERE id=p_message_id;
END $$;
CREATE OR REPLACE FUNCTION public.unpin_message(p_message_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $$
DECLARE conv_id uuid;
BEGIN
  SELECT conversation_id INTO conv_id FROM public.messages WHERE id=p_message_id;
  IF conv_id IS NULL OR NOT public.can_message_conversation(conv_id) THEN RAISE EXCEPTION 'active member required' USING ERRCODE='42501'; END IF;
  UPDATE public.messages SET pinned_at=NULL,pinned_by=NULL WHERE id=p_message_id;
END $$;
