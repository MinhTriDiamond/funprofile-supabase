UPDATE public.epoch_config
SET soft_ceiling = 50000000,
    updated_at = now()
WHERE config_key = 'default' AND is_active = true;