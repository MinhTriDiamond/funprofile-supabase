
-- Task 10: Server-side aggregation function for post stats
CREATE OR REPLACE FUNCTION public.get_post_stats(p_post_ids uuid[])
RETURNS TABLE(
  post_id uuid,
  reaction_count bigint,
  comment_count bigint,
  share_count bigint,
  reactions jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS post_id,
    COALESCE(r_agg.cnt, 0) AS reaction_count,
    COALESCE(c_agg.cnt, 0) AS comment_count,
    COALESCE(s_agg.cnt, 0) AS share_count,
    COALESCE(r_agg.details, '[]'::jsonb) AS reactions
  FROM unnest(p_post_ids) AS p(id)
  LEFT JOIN (
    SELECT r.post_id, COUNT(*) AS cnt,
      jsonb_agg(jsonb_build_object('id', r.id, 'user_id', r.user_id, 'type', r.type)) AS details
    FROM reactions r
    WHERE r.post_id = ANY(p_post_ids) AND r.comment_id IS NULL
    GROUP BY r.post_id
  ) r_agg ON r_agg.post_id = p.id
  LEFT JOIN (
    SELECT c.post_id, COUNT(*) AS cnt
    FROM comments c
    WHERE c.post_id = ANY(p_post_ids)
    GROUP BY c.post_id
  ) c_agg ON c_agg.post_id = p.id
  LEFT JOIN (
    SELECT sp.original_post_id AS post_id, COUNT(*) AS cnt
    FROM shared_posts sp
    WHERE sp.original_post_id = ANY(p_post_ids)
    GROUP BY sp.original_post_id
  ) s_agg ON s_agg.post_id = p.id;
END;
$$;

-- Task 12: Rate limit trigger for comments
CREATE OR REPLACE FUNCTION public.check_comment_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM comments
  WHERE user_id = NEW.user_id
    AND created_at > now() - interval '1 hour';
  
  IF v_count >= 50 THEN
    RAISE EXCEPTION 'Comment rate limit exceeded (50/hour)';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_rate_limit ON comments;
CREATE TRIGGER trg_comment_rate_limit
  BEFORE INSERT ON comments
  FOR EACH ROW
  EXECUTE FUNCTION check_comment_rate_limit();

-- Rate limit trigger for reactions
CREATE OR REPLACE FUNCTION public.check_reaction_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM reactions
  WHERE user_id = NEW.user_id
    AND created_at > now() - interval '1 minute';
  
  IF v_count >= 30 THEN
    RAISE EXCEPTION 'Reaction rate limit exceeded (30/minute)';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reaction_rate_limit ON reactions;
CREATE TRIGGER trg_reaction_rate_limit
  BEFORE INSERT ON reactions
  FOR EACH ROW
  EXECUTE FUNCTION check_reaction_rate_limit();
