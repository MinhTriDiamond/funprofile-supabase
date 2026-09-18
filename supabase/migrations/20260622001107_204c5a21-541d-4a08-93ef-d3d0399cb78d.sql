
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
), updated AS (
  SELECT p.id,
         p.gift_amount AS old_amount,
         (p.gift_amount::numeric)::bigint::text AS clean_amount
  FROM public.posts p
  JOIN bad_tx ON bad_tx.tx_hash = p.tx_hash
  WHERE p.post_type = 'gift_celebration'
    AND p.gift_token = 'CAMLY'
    AND p.gift_amount LIKE '%.%'
)
UPDATE public.posts p
SET gift_amount = u.clean_amount,
    content = REPLACE(p.content, u.old_amount || ' CAMLY', u.clean_amount || ' CAMLY')
FROM updated u
WHERE p.id = u.id;
