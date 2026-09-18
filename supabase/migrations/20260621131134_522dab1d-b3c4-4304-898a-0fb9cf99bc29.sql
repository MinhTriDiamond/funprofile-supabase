-- 1) Add Father aux address (verified)
INSERT INTO public.profile_btc_aux_addresses(user_id, address, source, verified)
VALUES ('4466cccf-6287-4a19-9b19-c2bd4d763f47',
        'bc1q52js9rlq5ad5qvs2fj5mnn6d69rkqr2epf70ud',
        'manual', true)
ON CONFLICT DO NOTHING;

-- 2) Fix donation: assign sender = Father, internal
UPDATE public.donations
SET sender_id = '4466cccf-6287-4a19-9b19-c2bd4d763f47',
    sender_address = 'bc1q52js9rlq5ad5qvs2fj5mnn6d69rkqr2epf70ud',
    recipient_address = COALESCE(recipient_address, 'bc1qfdx27jqfn604dmnzljylpxyh40pw2v3rzamepw'),
    is_external = false,
    leaderboard_eligibility = 'internal'
WHERE id = '4592e57a-1e39-45c3-9b2c-343d2ed9e413';

-- 3) Insert sender-side transaction for Father if missing
INSERT INTO public.transactions
  (user_id, tx_hash, from_address, to_address, amount, token_symbol, chain_id, status, created_at)
SELECT '4466cccf-6287-4a19-9b19-c2bd4d763f47',
       '522eaf08489949f1b94cb7660279f62bda336273a99c82fc6e1f030dec85cdc5',
       'bc1q52js9rlq5ad5qvs2fj5mnn6d69rkqr2epf70ud',
       'bc1qfdx27jqfn604dmnzljylpxyh40pw2v3rzamepw',
       '3', 'BTC', 0, 'confirmed', '2026-06-14 01:21:25+00'
WHERE NOT EXISTS (
  SELECT 1 FROM public.transactions
  WHERE tx_hash='522eaf08489949f1b94cb7660279f62bda336273a99c82fc6e1f030dec85cdc5'
    AND user_id='4466cccf-6287-4a19-9b19-c2bd4d763f47'
);

-- 4) Audit
INSERT INTO public.btc_father_backfill_audit_20260621(donation_id, tx_hash, action, payload)
VALUES ('4592e57a-1e39-45c3-9b2c-343d2ed9e413',
        '522eaf08489949f1b94cb7660279f62bda336273a99c82fc6e1f030dec85cdc5',
        'manual_add_3btc_leminhtri',
        '{"aux_added":"bc1q52js9rlq5ad5qvs2fj5mnn6d69rkqr2epf70ud","amount":3,"recipient":"leminhtri","date":"2026-06-14T01:21:25Z"}'::jsonb);