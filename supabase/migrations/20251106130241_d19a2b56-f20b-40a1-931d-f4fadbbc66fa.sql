-- Add rate limiting functions and triggers

-- Function to check post rate limit (10 posts per hour)
CREATE OR REPLACE FUNCTION check_post_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  post_count INT;
BEGIN
  SELECT COUNT(*) INTO post_count
  FROM posts
  WHERE user_id = NEW.user_id
  AND created_at > NOW() - INTERVAL '1 hour';
  
  IF post_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum 10 posts per hour';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to check comment rate limit (50 comments per hour)
CREATE OR REPLACE FUNCTION check_comment_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  comment_count INT;
BEGIN
  SELECT COUNT(*) INTO comment_count
  FROM comments
  WHERE user_id = NEW.user_id
  AND created_at > NOW() - INTERVAL '1 hour';
  
  IF comment_count >= 50 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum 50 comments per hour';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers
CREATE TRIGGER enforce_post_rate_limit
BEFORE INSERT ON posts
FOR EACH ROW EXECUTE FUNCTION check_post_rate_limit();

CREATE TRIGGER enforce_comment_rate_limit
BEFORE INSERT ON comments
FOR EACH ROW EXECUTE FUNCTION check_comment_rate_limit();

-- Add content length constraints
ALTER TABLE public.profiles 
  ADD CONSTRAINT bio_length CHECK (length(bio) <= 120);

ALTER TABLE public.posts 
  ADD CONSTRAINT content_length CHECK (length(content) <= 5000);

ALTER TABLE public.comments 
  ADD CONSTRAINT content_length CHECK (length(content) <= 1000);