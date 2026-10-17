DO $$
DECLARE
  n_after_insert integer;
  n_after_replay integer;
BEGIN
  INSERT INTO donations (id, sender_id, recipient_id, post_id, amount, amount_usd, token_symbol, token_address, chain_id, tx_hash, status, block_number, message, message_template, light_score_earned, light_action_id, conversation_id, message_id, card_viewed_at, metadata, created_at, confirmed_at, card_theme, card_background, card_sound, sender_address, is_external, chain_family, fee, confirmations, block_height, price_usd_at_donation, price_source, recipient_address, leaderboard_eligibility, integrity_status, integrity_reason, integrity_flagged_at, vout_index, classifier_version, tags, superseded_by, filter_status, pending_verification_since)
  SELECT '99999999-8888-7777-6666-555555555555'::uuid, sender_id, recipient_id, post_id, amount, amount_usd, token_symbol, token_address, chain_id, '0xtestmechanics20261017', status, block_number, message, message_template, light_score_earned, light_action_id, conversation_id, message_id, card_viewed_at, metadata, now(), now(), card_theme, card_background, card_sound, sender_address, is_external, chain_family, fee, confirmations, block_height, price_usd_at_donation, price_source, recipient_address, leaderboard_eligibility, integrity_status, integrity_reason, integrity_flagged_at, vout_index, classifier_version, tags, superseded_by, filter_status, pending_verification_since
    FROM donations WHERE id = '7f145989-7e12-4dee-9b29-bbbba3c4f3b8';
  SELECT count(*) INTO n_after_insert FROM unified_transactions_snapshot WHERE source_id = '99999999-8888-7777-6666-555555555555';
  PERFORM append_donation_to_snapshot('99999999-8888-7777-6666-555555555555'::uuid);
  SELECT count(*) INTO n_after_replay FROM unified_transactions_snapshot WHERE source_id = '99999999-8888-7777-6666-555555555555';
  RAISE EXCEPTION 'MECHANICS TEST rows_after_insert=% rows_after_replay=%', n_after_insert, n_after_replay;
END $$;
