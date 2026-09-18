-- Add column to track if user has accepted the Law of Light
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS law_of_light_accepted BOOLEAN NOT NULL DEFAULT false;

-- Add column for when they accepted
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS law_of_light_accepted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_law_of_light ON public.profiles(law_of_light_accepted);