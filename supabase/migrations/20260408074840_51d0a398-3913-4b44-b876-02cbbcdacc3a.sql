UPDATE pplp_mint_requests 
SET action_name = 'FUN_REWARD',
    action_hash = '0x5e3f5d85c3b19dec3cb99e820ff8de9220a9d8acc56fbe91910df6a4d16981a6'
WHERE action_name != 'FUN_REWARD' OR action_name IS NULL;