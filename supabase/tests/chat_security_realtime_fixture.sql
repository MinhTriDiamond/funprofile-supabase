-- Disposable PostgreSQL fixture for chat_security_realtime.sql.
-- This mirrors production public-table columns, constraints, relevant helper
-- functions/triggers, grants, RLS and legacy policies as read on 2026-10-17.
-- The auth.uid() shim and publication are local-only; never run on production.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;

CREATE TABLE public.profiles(id uuid PRIMARY KEY);
CREATE TABLE public.conversations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text NOT NULL DEFAULT 'direct' CHECK(type IN ('direct','group')),
  name text, avatar_url text, created_by uuid, last_message_at timestamptz DEFAULT now(),
  last_message_preview text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.conversation_participants(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, role text DEFAULT 'member' CHECK(role IN ('admin','member')), nickname text,
  joined_at timestamptz DEFAULT now(), left_at timestamptz, muted_until timestamptz, last_read_at timestamptz DEFAULT now(),
  UNIQUE(conversation_id,user_id)
);
CREATE TABLE public.messages(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL, content text, media_urls jsonb DEFAULT '[]'::jsonb,
  reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL, is_deleted boolean DEFAULT false, deleted_at timestamptz,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), pinned_at timestamptz, pinned_by uuid,
  message_type text NOT NULL DEFAULT 'text', metadata jsonb NOT NULL DEFAULT '{}'::jsonb, edited_at timestamptz
);
CREATE TABLE public.message_reads(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, read_at timestamptz DEFAULT now(), UNIQUE(message_id,user_id)
);
CREATE TABLE public.message_reactions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, emoji text NOT NULL, created_at timestamptz DEFAULT now(), UNIQUE(message_id,user_id,emoji)
);
CREATE TABLE public.user_blocks(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), blocker_id uuid NOT NULL, blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(blocker_id,blocked_id)
);
CREATE TABLE public.call_sessions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  initiator_id uuid NOT NULL, call_type text NOT NULL CHECK(call_type IN ('voice','video')),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ringing','active','ended','missed','declined')),
  channel_name text NOT NULL UNIQUE, started_at timestamptz, ended_at timestamptz, duration_seconds integer,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.call_participants(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), call_session_id uuid REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, joined_at timestamptz, left_at timestamptz, is_muted boolean DEFAULT false,
  is_video_off boolean DEFAULT false, created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_call_participants_session ON public.call_participants(call_session_id);
CREATE INDEX idx_call_participants_user ON public.call_participants(user_id);
CREATE INDEX idx_call_sessions_conversation ON public.call_sessions(conversation_id);
CREATE INDEX idx_call_sessions_initiator ON public.call_sessions(initiator_id);
CREATE INDEX idx_call_sessions_status ON public.call_sessions(status);

CREATE FUNCTION public.is_conversation_participant(conv_id uuid,check_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=conv_id AND user_id=check_user_id AND left_at IS NULL)
$$;
CREATE FUNCTION public.is_conversation_admin(conv_id uuid,check_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=conv_id AND user_id=check_user_id AND role='admin' AND left_at IS NULL)
$$;
CREATE FUNCTION public.has_block_between(user_a uuid,user_b uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_blocks WHERE (blocker_id=user_a AND blocked_id=user_b) OR (blocker_id=user_b AND blocked_id=user_a))
$$;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
CREATE FUNCTION public.update_conversation_last_message() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_preview text;
BEGIN
  IF NEW.is_deleted THEN v_preview:='[Deleted]';
  ELSIF NEW.message_type='sticker' THEN v_preview:='[Sticker]';
  ELSIF NEW.message_type='red_envelope' THEN v_preview:='[Red Envelope]';
  ELSIF coalesce(NEW.content,'')<>'' THEN v_preview:=left(NEW.content,100);
  ELSIF NEW.media_urls IS NOT NULL AND jsonb_array_length(NEW.media_urls)>0 THEN v_preview:='[Attachment]';
  ELSE v_preview:=''; END IF;
  UPDATE public.conversations SET last_message_at=NEW.created_at,last_message_preview=v_preview,updated_at=now() WHERE id=NEW.conversation_id;
  RETURN NEW;
END $$;
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER on_message_insert AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.conversations,public.conversation_participants,public.messages,public.message_reads,public.message_reactions,public.user_blocks,public.call_sessions,public.call_participants TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.profiles TO authenticated,service_role;

CREATE POLICY "Users can view conversations they are part of" ON public.conversations FOR SELECT USING
  (created_by=auth.uid() OR EXISTS(SELECT 1 FROM public.conversation_participants WHERE conversation_id=conversation_participants.id AND user_id=auth.uid() AND left_at IS NULL));
CREATE POLICY "Users can view their conversations" ON public.conversations FOR SELECT USING(public.is_conversation_participant(id,auth.uid()));
CREATE POLICY "Users can create conversations" ON public.conversations FOR INSERT WITH CHECK(auth.uid() IS NOT NULL);
CREATE POLICY "Admins can update conversations" ON public.conversations FOR UPDATE USING(public.is_conversation_admin(id,auth.uid()));
CREATE POLICY "Users can view participants of their conversations" ON public.conversation_participants FOR SELECT USING(public.is_conversation_participant(conversation_id,auth.uid()));
CREATE POLICY "Users can add participants to conversations" ON public.conversation_participants FOR INSERT WITH CHECK
  (user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.conversations WHERE id=conversation_id AND created_by=auth.uid()) OR
   EXISTS(SELECT 1 FROM public.conversation_participants p WHERE p.conversation_id=p.conversation_id AND p.user_id=auth.uid() AND p.role='admin' AND p.left_at IS NULL));
CREATE POLICY "Users can add participants" ON public.conversation_participants FOR INSERT WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users can update their own participant record" ON public.conversation_participants FOR UPDATE USING(user_id=auth.uid());
CREATE POLICY "Admins can remove participants" ON public.conversation_participants FOR DELETE USING(user_id=auth.uid() OR public.is_conversation_admin(conversation_id,auth.uid()));
CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT USING(public.is_conversation_participant(conversation_id,auth.uid()));
CREATE POLICY "Users can send messages in their conversations" ON public.messages FOR INSERT WITH CHECK(sender_id=auth.uid() AND public.is_conversation_participant(conversation_id,auth.uid()));
CREATE POLICY "Users can update their own messages" ON public.messages FOR UPDATE USING(sender_id=auth.uid());
CREATE POLICY "Users can delete their own messages" ON public.messages FOR DELETE USING(sender_id=auth.uid());
CREATE POLICY "Users can view read receipts in their conversations" ON public.message_reads FOR SELECT USING(EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.is_conversation_participant(m.conversation_id,auth.uid())));
CREATE POLICY "Users can mark messages as read" ON public.message_reads FOR INSERT WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.is_conversation_participant(m.conversation_id,auth.uid())));
CREATE POLICY "Users can view reactions in their conversations" ON public.message_reactions FOR SELECT USING(EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.is_conversation_participant(m.conversation_id,auth.uid())));
CREATE POLICY "Users can add reactions" ON public.message_reactions FOR INSERT WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.messages m WHERE m.id=message_id AND public.is_conversation_participant(m.conversation_id,auth.uid())));
CREATE POLICY "Users can remove their own reactions" ON public.message_reactions FOR DELETE USING(user_id=auth.uid());
CREATE POLICY "Users can view their own blocks" ON public.user_blocks FOR SELECT USING(blocker_id=auth.uid());
CREATE POLICY "Users can block others" ON public.user_blocks FOR INSERT WITH CHECK(blocker_id=auth.uid() AND blocker_id<>blocked_id);
CREATE POLICY "Users can unblock" ON public.user_blocks FOR DELETE USING(blocker_id=auth.uid());
CREATE POLICY "Users can view call sessions in their conversations" ON public.call_sessions FOR SELECT USING(public.is_conversation_participant(conversation_id,auth.uid()));
CREATE POLICY "Users can create call sessions in their conversations" ON public.call_sessions FOR INSERT WITH CHECK(initiator_id=auth.uid() AND public.is_conversation_participant(conversation_id,auth.uid()));
CREATE POLICY "Participants can update call sessions" ON public.call_sessions FOR UPDATE USING(public.is_conversation_participant(conversation_id,auth.uid()));
CREATE POLICY "Users can view call participants" ON public.call_participants FOR SELECT USING(EXISTS(SELECT 1 FROM public.call_sessions cs WHERE cs.id=call_session_id AND public.is_conversation_participant(cs.conversation_id,auth.uid())));
CREATE POLICY "Users can join calls" ON public.call_participants FOR INSERT WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.call_sessions cs WHERE cs.id=call_session_id AND public.is_conversation_participant(cs.conversation_id,auth.uid())));
CREATE POLICY "Users can update their own call participant record" ON public.call_participants FOR UPDATE USING(user_id=auth.uid());

CREATE TABLE public.live_comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.live_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.live_reactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.live_sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE PUBLICATION supabase_realtime FOR TABLE public.live_comments,public.live_messages,public.live_reactions,public.live_sessions;

INSERT INTO public.profiles(id) VALUES
  ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003');
-- Production has one historical duplicate pair on an ended call; preserve it
-- while proving the new uniqueness guard only applies to active memberships.
INSERT INTO public.call_sessions(id,initiator_id,call_type,status,channel_name)
VALUES ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','voice','ended','legacy-ended-call');
INSERT INTO public.call_participants(call_session_id,user_id,left_at) VALUES
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',now()),
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',now());
-- Mirror the production preflight finding: three conversations contain
-- multiple open call rows (3 active and 9 ringing total). These are not auto-fixed.
INSERT INTO public.conversations(id,type,created_by) VALUES
  ('40000000-0000-0000-0000-000000000001','group','10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000002','group','10000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000003','group','10000000-0000-0000-0000-000000000001');
INSERT INTO public.call_sessions(conversation_id,initiator_id,call_type,status,channel_name)
SELECT CASE WHEN n<=4 THEN '40000000-0000-0000-0000-000000000001'::uuid
            WHEN n<=8 THEN '40000000-0000-0000-0000-000000000002'::uuid
            ELSE '40000000-0000-0000-0000-000000000003'::uuid END,
       '10000000-0000-0000-0000-000000000001','voice',
       CASE WHEN n IN (1,5,9) THEN 'active' ELSE 'ringing' END,'legacy-open-'||n
FROM generate_series(1,12) n;
