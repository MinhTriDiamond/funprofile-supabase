
-- Phase 2.9: feature flag + allowlist + audit denied_reason

ALTER TABLE public.fun_core_proxy_audit
  ADD COLUMN IF NOT EXISTS denied_reason text;

-- Cho admin đọc app_settings (đang chỉ service role)
DROP POLICY IF EXISTS "admin read app_settings" ON public.app_settings;
CREATE POLICY "admin read app_settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.app_settings TO authenticated;

-- Seed 2 key (OFF + 1 user pilot)
INSERT INTO public.app_settings(key, value) VALUES
  ('fun_core_pilot_enabled', 'false'),
  ('fun_core_pilot_allowed_user_ids', '["11add0ae-0f26-46f3-88bd-eea81e046b01"]')
ON CONFLICT (key) DO NOTHING;
