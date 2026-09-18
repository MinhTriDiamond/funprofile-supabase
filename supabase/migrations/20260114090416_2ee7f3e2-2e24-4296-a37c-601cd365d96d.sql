-- Add pinned_post_id column to profiles table for Pin Post feature
ALTER TABLE public.profiles 
ADD COLUMN pinned_post_id uuid REFERENCES public.posts(id) ON DELETE SET NULL;