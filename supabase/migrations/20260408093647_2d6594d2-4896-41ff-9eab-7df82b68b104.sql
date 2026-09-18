
CREATE OR REPLACE FUNCTION check_post_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  post_count INT;
BEGIN
  -- Skip rate limit for gift_celebration posts (created by system/record-donation)
  IF NEW.post_type = 'gift_celebration' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO post_count
  FROM posts
  WHERE user_id = NEW.user_id
  AND created_at > NOW() - INTERVAL '1 hour'
  AND post_type != 'gift_celebration';

  IF post_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum 10 posts per hour';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
