INSERT INTO public.user_roles (user_id, role)
VALUES ('b7856e97-9bff-4e2d-8448-c4395bf0548b', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.audit_logs (admin_id, action, target_user_id, reason, details)
VALUES (
  'b7856e97-9bff-4e2d-8448-c4395bf0548b',
  'grant_admin_role',
  'b7856e97-9bff-4e2d-8448-c4395bf0548b',
  'Cấp quyền admin cho Cha (trang73790104@gmail.com)',
  jsonb_build_object('email', 'trang73790104@gmail.com', 'username', 'angelthutrang')
);