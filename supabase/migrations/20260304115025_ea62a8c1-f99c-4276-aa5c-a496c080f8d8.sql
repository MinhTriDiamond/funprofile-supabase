
-- Fix security definer views by setting security_invoker = true
ALTER VIEW public.public_live_sessions SET (security_invoker = true);
ALTER VIEW public.public_system_config SET (security_invoker = true);
