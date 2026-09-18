
-- Danh sách 9 tx_hash CAMLY bị ghi nhầm USDT do bug wallet-reconciliation-cron (22/06/2026)
WITH bad_tx(tx_hash) AS (VALUES
  ('0x42066072e6c628cbe7ca88e70bebc389fbccbfd1e1eee3768a3b9d27cd459f28'),
  ('0xc377b323a702c2adc4ad6680d6a59f8fb643f8abe7ff14701f230ef4474fffd2'),
  ('0xbeb1835d0ec5f3097daa11bd26554babe6eefb5555a4b8b3e6fee2eddcc1a6a0'),
  ('0xfedbcfe41ee3f4c7974c078d2879b4666a2f5b87b0b2160f992f5e735a7f2ed1'),
  ('0xd9a1d12e857293eb16f6a993176300c4e8c3d925e3a3bbc34e255b352704000d'),
  ('0x91755ec6ba6472522ce560953634b8b4bfad53af78e92c5926f5576123c148ee'),
  ('0x96e5e0d3e1ddc7c7cad8634a30dc22773f8cc0e051f2a5480030916c51164e60'),
  ('0xdf279c00b094e52d3c5e581be8e9bd2a6db990dd4f1cf649f0fc90d6d40c4224'),
  ('0xb261d240037e6154fab1e8cee18d1dce8a620648f3aebaef1bc97f58e59eed99')
)
UPDATE public.transactions t
SET token_symbol  = 'CAMLY',
    token_address = '0x0910320181889fefde0bb1ca63962b0a8882e413',
    amount        = ((t.amount::numeric) / 1000)::text
FROM bad_tx
WHERE t.tx_hash = bad_tx.tx_hash
  AND t.token_symbol = 'USDT'
  AND lower(coalesce(t.token_address,'')) = '0x55d398326f99059ff775485246999027b3197955';

WITH bad_tx(tx_hash) AS (VALUES
  ('0x42066072e6c628cbe7ca88e70bebc389fbccbfd1e1eee3768a3b9d27cd459f28'),
  ('0xc377b323a702c2adc4ad6680d6a59f8fb643f8abe7ff14701f230ef4474fffd2'),
  ('0xbeb1835d0ec5f3097daa11bd26554babe6eefb5555a4b8b3e6fee2eddcc1a6a0'),
  ('0xfedbcfe41ee3f4c7974c078d2879b4666a2f5b87b0b2160f992f5e735a7f2ed1'),
  ('0xd9a1d12e857293eb16f6a993176300c4e8c3d925e3a3bbc34e255b352704000d'),
  ('0x91755ec6ba6472522ce560953634b8b4bfad53af78e92c5926f5576123c148ee'),
  ('0x96e5e0d3e1ddc7c7cad8634a30dc22773f8cc0e051f2a5480030916c51164e60'),
  ('0xdf279c00b094e52d3c5e581be8e9bd2a6db990dd4f1cf649f0fc90d6d40c4224'),
  ('0xb261d240037e6154fab1e8cee18d1dce8a620648f3aebaef1bc97f58e59eed99')
)
UPDATE public.donations d
SET token_symbol  = 'CAMLY',
    token_address = '0x0910320181889fefde0bb1ca63962b0a8882e413',
    amount        = ((d.amount::numeric) / 1000)::text,
    metadata      = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object('token_reclassified_2026_06_22', true, 'previous_token_symbol', 'USDT')
FROM bad_tx
WHERE d.tx_hash = bad_tx.tx_hash
  AND d.token_symbol = 'USDT'
  AND d.metadata->>'source' = 'wallet-reconciliation-cron';

WITH bad_tx(tx_hash) AS (VALUES
  ('0x42066072e6c628cbe7ca88e70bebc389fbccbfd1e1eee3768a3b9d27cd459f28'),
  ('0xc377b323a702c2adc4ad6680d6a59f8fb643f8abe7ff14701f230ef4474fffd2'),
  ('0xbeb1835d0ec5f3097daa11bd26554babe6eefb5555a4b8b3e6fee2eddcc1a6a0'),
  ('0xfedbcfe41ee3f4c7974c078d2879b4666a2f5b87b0b2160f992f5e735a7f2ed1'),
  ('0xd9a1d12e857293eb16f6a993176300c4e8c3d925e3a3bbc34e255b352704000d'),
  ('0x91755ec6ba6472522ce560953634b8b4bfad53af78e92c5926f5576123c148ee'),
  ('0x96e5e0d3e1ddc7c7cad8634a30dc22773f8cc0e051f2a5480030916c51164e60'),
  ('0xdf279c00b094e52d3c5e581be8e9bd2a6db990dd4f1cf649f0fc90d6d40c4224'),
  ('0xb261d240037e6154fab1e8cee18d1dce8a620648f3aebaef1bc97f58e59eed99')
)
UPDATE public.posts p
SET content     = REPLACE(p.content, p.gift_amount || ' USDT', (((p.gift_amount::numeric) / 1000)::text) || ' CAMLY'),
    gift_token  = 'CAMLY',
    gift_amount = (((p.gift_amount::numeric) / 1000))::text,
    metadata    = COALESCE(p.metadata, '{}'::jsonb) || jsonb_build_object('token_reclassified_2026_06_22', true, 'previous_token_symbol', 'USDT')
FROM bad_tx
WHERE p.tx_hash = bad_tx.tx_hash
  AND p.post_type = 'gift_celebration'
  AND p.gift_token = 'USDT';
