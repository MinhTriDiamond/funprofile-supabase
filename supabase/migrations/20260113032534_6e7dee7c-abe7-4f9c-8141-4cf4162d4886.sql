-- Fix RLS policies for creating direct conversations

-- 1. Drop existing SELECT policy on conversations and create new one
-- that allows users to see conversations they created OR are participants of
DROP POLICY IF EXISTS "Users can view conversations they are part of" ON public.conversations;

CREATE POLICY "Users can view conversations they are part of" 
ON public.conversations 
FOR SELECT 
USING (
  created_by = auth.uid() 
  OR 
  EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = id 
    AND user_id = auth.uid() 
    AND left_at IS NULL
  )
);

-- 2. Drop existing INSERT policy on conversation_participants and create new one
-- that allows conversation creators to add participants
DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants;

CREATE POLICY "Users can add participants to conversations" 
ON public.conversation_participants 
FOR INSERT 
WITH CHECK (
  -- User can add themselves
  user_id = auth.uid()
  OR
  -- Or user is the conversation creator (for initial setup of direct/group chats)
  EXISTS (
    SELECT 1 FROM public.conversations 
    WHERE id = conversation_id 
    AND created_by = auth.uid()
  )
  OR
  -- Or user is an admin of the conversation
  EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = conversation_participants.conversation_id 
    AND user_id = auth.uid() 
    AND role = 'admin' 
    AND left_at IS NULL
  )
);