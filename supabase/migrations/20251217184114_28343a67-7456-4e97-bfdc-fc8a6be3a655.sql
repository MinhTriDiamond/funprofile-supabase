-- Add reward_status column to profiles table for tracking approval state
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS reward_status text NOT NULL DEFAULT 'pending';

-- Add admin_notes column for storing rejection/hold reasons
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS admin_notes text;

-- Create index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_profiles_reward_status ON public.profiles(reward_status);