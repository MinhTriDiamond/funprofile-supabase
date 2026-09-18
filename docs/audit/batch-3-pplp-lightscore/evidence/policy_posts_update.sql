POLICY Admins can update post moderation cmd=UPDATE roles=authenticated
USING: has_role(auth.uid(), 'admin'::app_role)
WITH CHECK: has_role(auth.uid(), 'admin'::app_role)
POLICY Users can update their own posts cmd=UPDATE roles=authenticated
USING: (auth.uid() = user_id)
WITH CHECK: (auth.uid() = user_id)
