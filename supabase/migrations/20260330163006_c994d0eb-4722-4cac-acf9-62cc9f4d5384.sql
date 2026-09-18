CREATE OR REPLACE FUNCTION public.get_user_donation_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
   WITH user_created AS (
     SELECT created_at FROM profiles WHERE id = p_user_id LIMIT 1
   ),
   donation_received AS (
     SELECT d.token_symbol, SUM(d.amount::numeric) as total_amount, COUNT(*) as total_count
     FROM donations d, user_created uc
     WHERE d.recipient_id = p_user_id AND d.status = 'confirmed' AND d.created_at >= uc.created_at
     GROUP BY d.token_symbol
   ),
   donation_sent AS (
     SELECT d.token_symbol, SUM(d.amount::numeric) as total_amount, COUNT(*) as total_count
     FROM donations d, user_created uc
     WHERE d.sender_id = p_user_id AND d.status = 'confirmed' AND d.created_at >= uc.created_at
     GROUP BY d.token_symbol
   ),
   donation_tx_hashes AS (
     SELECT DISTINCT tx_hash FROM donations
     WHERE (recipient_id = p_user_id OR sender_id = p_user_id) AND status = 'confirmed'
   ),
   swap_tx_hashes AS (
     SELECT DISTINCT tx_hash FROM swap_transactions
     WHERE user_id = p_user_id AND status = 'confirmed'
   ),
   swap_in AS (
     SELECT s.to_symbol as token_symbol, SUM(s.to_amount) as total_amount, COUNT(*) as total_count
     FROM swap_transactions s, user_created uc
     WHERE s.user_id = p_user_id AND s.status = 'confirmed' AND s.created_at >= uc.created_at
     GROUP BY s.to_symbol
   ),
   swap_out AS (
     SELECT s.from_symbol as token_symbol, SUM(s.from_amount) as total_amount, COUNT(*) as total_count
     FROM swap_transactions s, user_created uc
     WHERE s.user_id = p_user_id AND s.status = 'confirmed' AND s.created_at >= uc.created_at
     GROUP BY s.from_symbol
   ),
   transfer_in AS (
     SELECT t.token_symbol, SUM(t.amount::numeric) as total_amount, COUNT(*) as total_count
     FROM wallet_transfers t, user_created uc
     WHERE t.user_id = p_user_id AND t.direction = 'in' AND t.status = 'confirmed' AND t.created_at >= uc.created_at
       AND t.tx_hash NOT IN (SELECT tx_hash FROM donation_tx_hashes)
       AND t.tx_hash NOT IN (SELECT tx_hash FROM swap_tx_hashes)
     GROUP BY t.token_symbol
   ),
   transfer_out AS (
     SELECT t.token_symbol, SUM(t.amount::numeric) as total_amount, COUNT(*) as total_count
     FROM wallet_transfers t, user_created uc
     WHERE t.user_id = p_user_id AND t.direction = 'out' AND t.status = 'confirmed' AND t.created_at >= uc.created_at
       AND t.tx_hash NOT IN (SELECT tx_hash FROM donation_tx_hashes)
       AND t.tx_hash NOT IN (SELECT tx_hash FROM swap_tx_hashes)
     GROUP BY t.token_symbol
   ),
   all_received AS (
     SELECT token_symbol, SUM(total_amount) as total_amount, SUM(total_count) as total_count
     FROM (
       SELECT * FROM donation_received
       UNION ALL
       SELECT * FROM swap_in
       UNION ALL
       SELECT * FROM transfer_in
     ) combined
     GROUP BY token_symbol
   ),
   all_sent AS (
     SELECT token_symbol, SUM(total_amount) as total_amount, SUM(total_count) as total_count
     FROM (
       SELECT * FROM donation_sent
       UNION ALL
       SELECT * FROM swap_out
       UNION ALL
       SELECT * FROM transfer_out
     ) combined
     GROUP BY token_symbol
   )
   SELECT jsonb_build_object(
     'received', COALESCE((
       SELECT jsonb_object_agg(token_symbol, jsonb_build_object('amount', total_amount, 'count', total_count))
       FROM all_received
     ), '{}'::jsonb),
     'sent', COALESCE((
       SELECT jsonb_object_agg(token_symbol, jsonb_build_object('amount', total_amount, 'count', total_count))
       FROM all_sent
     ), '{}'::jsonb)
   )
  );
END;
$$;