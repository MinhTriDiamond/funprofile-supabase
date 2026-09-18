-- Add unique constraint on user_id + device_hash for upsert support
ALTER TABLE public.pplp_device_registry 
ADD CONSTRAINT pplp_device_registry_user_device_unique UNIQUE (user_id, device_hash);
