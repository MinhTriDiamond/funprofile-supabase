-- Add UPDATE policy for comments table
-- Allows users to edit their own comments
CREATE POLICY "Users can update their own comments"
ON public.comments
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add UPDATE policy for reactions table
-- Allows users to change their reaction type (e.g., like to love)
CREATE POLICY "Users can update their own reactions"
ON public.reactions
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);