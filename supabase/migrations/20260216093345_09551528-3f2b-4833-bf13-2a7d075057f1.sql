
-- Add personal info fields to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS workplace text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS education text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS relationship_status text;
