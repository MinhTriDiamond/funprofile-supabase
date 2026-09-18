DROP POLICY IF EXISTS "Admins can insert review queue" ON public.pplp_v2_review_queue;

CREATE POLICY "Admins can insert review queue"
ON public.pplp_v2_review_queue
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));