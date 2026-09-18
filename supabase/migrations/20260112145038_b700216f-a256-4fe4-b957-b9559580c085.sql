-- =============================================
-- FUN CHAT - FULL MESSENGER DATABASE SCHEMA
-- =============================================

-- 1. Conversations table (Direct & Group chats)
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  name TEXT, -- Group name (NULL for direct chat)
  avatar_url TEXT, -- Group avatar
  created_by UUID,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  last_message_preview TEXT, -- Preview of last message for list
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Conversation participants
CREATE TABLE public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  nickname TEXT, -- Nickname in group
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ, -- NULL if still in conversation
  muted_until TIMESTAMPTZ, -- Mute notifications until
  last_read_at TIMESTAMPTZ DEFAULT now(), -- For unread count
  UNIQUE(conversation_id, user_id)
);

-- 3. Messages table
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT, -- Text content
  media_urls JSONB DEFAULT '[]'::jsonb, -- Array of media URLs
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Message reads (for read receipts)
CREATE TABLE public.message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- 5. Message reactions
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- 6. Chat settings (privacy)
CREATE TABLE public.chat_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  who_can_message TEXT DEFAULT 'friends' CHECK (who_can_message IN ('everyone', 'friends', 'nobody')),
  show_read_receipts BOOLEAN DEFAULT true,
  show_typing_indicator BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);
CREATE INDEX idx_conversation_participants_user ON public.conversation_participants(user_id) WHERE left_at IS NULL;
CREATE INDEX idx_conversation_participants_conversation ON public.conversation_participants(conversation_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_reply ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX idx_message_reads_message ON public.message_reads(message_id);
CREATE INDEX idx_message_reads_user ON public.message_reads(user_id);
CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id);

-- =============================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_settings ENABLE ROW LEVEL SECURITY;

-- Helper function: Check if user is participant of conversation
CREATE OR REPLACE FUNCTION public.is_conversation_participant(conv_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conv_id
      AND user_id = check_user_id
      AND left_at IS NULL
  )
$$;

-- Helper function: Check if user is admin of conversation
CREATE OR REPLACE FUNCTION public.is_conversation_admin(conv_id UUID, check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = conv_id
      AND user_id = check_user_id
      AND role = 'admin'
      AND left_at IS NULL
  )
$$;

-- CONVERSATIONS POLICIES
CREATE POLICY "Users can view their conversations"
  ON public.conversations FOR SELECT
  USING (public.is_conversation_participant(id, auth.uid()));

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can update conversations"
  ON public.conversations FOR UPDATE
  USING (public.is_conversation_admin(id, auth.uid()));

-- CONVERSATION_PARTICIPANTS POLICIES
CREATE POLICY "Users can view participants of their conversations"
  ON public.conversation_participants FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can add participants"
  ON public.conversation_participants FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    (
      -- Creator adds themselves or others to new conversation
      user_id = auth.uid() OR
      public.is_conversation_admin(conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can update their own participant record"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admins can remove participants"
  ON public.conversation_participants FOR DELETE
  USING (
    user_id = auth.uid() OR
    public.is_conversation_admin(conversation_id, auth.uid())
  );

-- MESSAGES POLICIES
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can send messages in their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid() AND
    public.is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (sender_id = auth.uid());

CREATE POLICY "Users can delete their own messages"
  ON public.messages FOR DELETE
  USING (sender_id = auth.uid());

-- MESSAGE_READS POLICIES
CREATE POLICY "Users can view read receipts in their conversations"
  ON public.message_reads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can mark messages as read"
  ON public.message_reads FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

-- MESSAGE_REACTIONS POLICIES
CREATE POLICY "Users can view reactions in their conversations"
  ON public.message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can add reactions"
  ON public.message_reactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_id
        AND public.is_conversation_participant(m.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can remove their own reactions"
  ON public.message_reactions FOR DELETE
  USING (user_id = auth.uid());

-- CHAT_SETTINGS POLICIES
CREATE POLICY "Users can view their own chat settings"
  ON public.chat_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create their own chat settings"
  ON public.chat_settings FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own chat settings"
  ON public.chat_settings FOR UPDATE
  USING (user_id = auth.uid());

-- Allow users to check others' settings for permission checking
CREATE POLICY "Users can view others' message permissions"
  ON public.chat_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =============================================
-- TRIGGERS & FUNCTIONS
-- =============================================

-- Update conversation last_message_at when new message is sent
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.conversations
  SET 
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.content, 100),
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_message_insert
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_last_message();

-- Updated_at trigger for conversations
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for messages
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Updated_at trigger for chat_settings
CREATE TRIGGER update_chat_settings_updated_at
  BEFORE UPDATE ON public.chat_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- ENABLE REALTIME
-- =============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;