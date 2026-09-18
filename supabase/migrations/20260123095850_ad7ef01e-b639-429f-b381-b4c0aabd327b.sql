-- Create rate limiting table for persistent state
CREATE TABLE IF NOT EXISTS public.rate_limit_state (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_expires ON public.rate_limit_state(expires_at);

-- Enable RLS (only edge functions via service role should access this)
ALTER TABLE public.rate_limit_state ENABLE ROW LEVEL SECURITY;

-- No RLS policies - only service role can access (edge functions)

-- Function to atomically check and increment rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_limit INT,
  p_window_ms INT DEFAULT 60000
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_window_start TIMESTAMPTZ := v_now - (p_window_ms || ' milliseconds')::INTERVAL;
  v_expires_at TIMESTAMPTZ := v_now + (p_window_ms || ' milliseconds')::INTERVAL;
  v_current_count INT;
  v_allowed BOOLEAN;
BEGIN
  -- Clean up expired entries (limit to prevent long locks)
  DELETE FROM rate_limit_state 
  WHERE expires_at < v_now 
  AND key IN (SELECT key FROM rate_limit_state WHERE expires_at < v_now LIMIT 100);
  
  -- Try to insert new entry or update existing
  INSERT INTO rate_limit_state (key, count, window_start, expires_at)
  VALUES (p_key, 1, v_now, v_expires_at)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE 
      WHEN rate_limit_state.window_start < v_window_start THEN 1
      ELSE rate_limit_state.count + 1
    END,
    window_start = CASE 
      WHEN rate_limit_state.window_start < v_window_start THEN v_now
      ELSE rate_limit_state.window_start
    END,
    expires_at = CASE 
      WHEN rate_limit_state.window_start < v_window_start THEN v_expires_at
      ELSE rate_limit_state.expires_at
    END
  RETURNING count INTO v_current_count;
  
  v_allowed := v_current_count <= p_limit;
  
  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'current', v_current_count,
    'limit', p_limit,
    'remaining', GREATEST(0, p_limit - v_current_count)
  );
END;
$$;