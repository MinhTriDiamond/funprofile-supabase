
UPDATE donations d SET post_id = p.id
FROM posts p 
WHERE p.tx_hash = d.tx_hash AND p.post_type = 'gift_celebration' AND d.post_id IS NULL
AND d.tx_hash IN (
  '0xc4cb6834f4f04fd853682a11df9854cafbfb8aaa575e6752114cb8f8a2427735',
  '78a9cf4153698d27653656b9db77d4ff49d49e06d7f66ba8669e064a7c6e3385',
  '0xe90bb5c26c5347782db17443888602b535c3e45081cceccfaaa89d30039e56e2',
  '0x5c1d719c95fed7ffbf81b054c78d8ebb54978667b6401468f99d48dd4aa4c2c9'
);
