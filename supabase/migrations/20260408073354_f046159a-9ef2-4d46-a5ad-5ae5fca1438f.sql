UPDATE pplp_mint_requests 
SET action_hash = '0x19c3d952adea3b19570fa3e0adf26695e38f60a9b00044fb60ac49eb355f0df9'
WHERE action_hash IS NULL AND action_name = 'POST_CREATE';