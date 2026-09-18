-- =============================================
-- Phase 2A: SSO Ecosystem Database Schema
-- =============================================

-- 1. Table oauth_codes - Temporary authorization codes
CREATE TABLE public.oauth_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  scope TEXT[] NOT NULL DEFAULT '{}',
  code_challenge TEXT, -- PKCE support
  code_challenge_method TEXT, -- 'S256' or 'plain'
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  is_used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_oauth_codes_code ON public.oauth_codes(code) WHERE NOT is_used;
CREATE INDEX idx_oauth_codes_expires ON public.oauth_codes(expires_at) WHERE NOT is_used;

-- Enable RLS
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;

-- RLS: Only service role can manage oauth codes (edge functions)
CREATE POLICY "Service role can manage oauth codes"
  ON public.oauth_codes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. Table cross_platform_tokens - Access & Refresh tokens
CREATE TABLE public.cross_platform_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES public.oauth_clients(client_id) ON DELETE CASCADE,
  access_token TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL UNIQUE,
  scope TEXT[] NOT NULL DEFAULT '{}',
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  device_info JSONB, -- Optional: store device/platform info
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_id) -- Each user has 1 active token set per platform
);

-- Indexes for token lookups
CREATE INDEX idx_cross_platform_tokens_access ON public.cross_platform_tokens(access_token) WHERE NOT is_revoked;
CREATE INDEX idx_cross_platform_tokens_refresh ON public.cross_platform_tokens(refresh_token) WHERE NOT is_revoked;
CREATE INDEX idx_cross_platform_tokens_user ON public.cross_platform_tokens(user_id);

-- Enable RLS
ALTER TABLE public.cross_platform_tokens ENABLE ROW LEVEL SECURITY;

-- RLS: Service role can manage all tokens
CREATE POLICY "Service role can manage tokens"
  ON public.cross_platform_tokens
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- RLS: Users can view their own tokens
CREATE POLICY "Users can view own tokens"
  ON public.cross_platform_tokens
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: Users can revoke their own tokens
CREATE POLICY "Users can revoke own tokens"
  ON public.cross_platform_tokens
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND is_revoked = true);

-- 3. Function to cleanup expired codes and tokens
CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Delete expired unused codes
  DELETE FROM public.oauth_codes
  WHERE expires_at < now() OR is_used = true;
  
  -- Mark expired tokens as revoked (keep for audit)
  UPDATE public.cross_platform_tokens
  SET is_revoked = true
  WHERE refresh_token_expires_at < now() AND is_revoked = false;
END;
$$;

-- 4. Function to generate secure random tokens
CREATE OR REPLACE FUNCTION public.generate_secure_token(length integer DEFAULT 64)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;