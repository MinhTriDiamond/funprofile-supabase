
-- Add fingerprint_version column to pplp_device_registry
ALTER TABLE public.pplp_device_registry 
ADD COLUMN IF NOT EXISTS fingerprint_version integer NOT NULL DEFAULT 1;
