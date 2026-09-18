
CREATE OR REPLACE FUNCTION public.get_user_donation_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'received', COALESCE((
      SELECT jsonb_object_agg(token_symbol, jsonb_build_object(
        'amount', total_amount,
        'count', total_count
      ))
      FROM (
        SELECT token_symbol, SUM(amount::numeric) as total_amount, COUNT(*) as total_count
        FROM donations
        WHERE recipient_id = p_user_id AND status = 'confirmed'
        GROUP BY token_symbol
      ) r
    ), '{}'::jsonb),
    'sent', COALESCE((
      SELECT jsonb_object_agg(token_symbol, jsonb_build_object(
        'amount', total_amount,
        'count', total_count
      ))
      FROM (
        SELECT token_symbol, SUM(amount::numeric) as total_amount, COUNT(*) as total_count
        FROM donations
        WHERE sender_id = p_user_id AND status = 'confirmed'
        GROUP BY token_symbol
      ) s
    ), '{}'::jsonb)
  );
$$;
