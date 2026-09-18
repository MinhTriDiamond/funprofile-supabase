ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'vi';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_preferred_language_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_preferred_language_check
      CHECK (preferred_language IN ('en','vi','zh','ja','ko','th','id','fr','es','de','pt','ru','ar'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_preferred_language ON public.profiles(preferred_language);