
-- Add moderation_status column to posts table
ALTER TABLE public.posts ADD COLUMN moderation_status text NOT NULL DEFAULT 'approved';

-- Create index for pending reviews (partial index for performance)
CREATE INDEX idx_posts_moderation_pending ON public.posts(moderation_status) WHERE moderation_status = 'pending_review';

-- Allow admins to update post moderation status
CREATE POLICY "Admins can update post moderation"
ON public.posts FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
