-- =============================================
-- DONATIONS TABLE - P2P Giving System (Mạnh Thường Quân)
-- =============================================

-- Create donations table
CREATE TABLE public.donations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE SET NULL,
  
  -- Token & amount info
  amount TEXT NOT NULL,  -- String to avoid precision loss
  amount_usd NUMERIC(18,2),  -- USD value at time of donation
  token_symbol TEXT NOT NULL DEFAULT 'FUN',
  token_address TEXT,  -- NULL for native BNB
  chain_id INTEGER NOT NULL DEFAULT 97,
  
  -- Transaction info
  tx_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  block_number BIGINT,
  
  -- Message
  message TEXT,
  message_template TEXT CHECK (message_template IN ('grateful', 'love', 'admire', 'support', 'encourage', 'custom')),
  
  -- Light Score earned by sender
  light_score_earned INTEGER DEFAULT 0,
  light_action_id UUID REFERENCES public.light_actions(id) ON DELETE SET NULL,
  
  -- Chat integration
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  
  -- Card & metadata
  card_viewed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  
  -- Prevent self-donation
  CONSTRAINT no_self_donation CHECK (sender_id != recipient_id)
);

-- Create indexes for performance
CREATE INDEX idx_donations_sender_id ON public.donations(sender_id);
CREATE INDEX idx_donations_recipient_id ON public.donations(recipient_id);
CREATE INDEX idx_donations_post_id ON public.donations(post_id) WHERE post_id IS NOT NULL;
CREATE INDEX idx_donations_tx_hash ON public.donations(tx_hash);
CREATE INDEX idx_donations_status ON public.donations(status);
CREATE INDEX idx_donations_created_at ON public.donations(created_at DESC);
CREATE INDEX idx_donations_token_symbol ON public.donations(token_symbol);

-- Enable RLS
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Everyone can view donations (for leaderboard)
CREATE POLICY "Donations are viewable by everyone"
  ON public.donations FOR SELECT
  USING (true);

-- Authenticated users can create their own donations
CREATE POLICY "Users can create their own donations"
  ON public.donations FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Sender or recipient can update (for marking card_viewed_at)
CREATE POLICY "Sender or recipient can update"
  ON public.donations FOR UPDATE
  USING (auth.uid() IN (sender_id, recipient_id));

-- =============================================
-- RPC FUNCTIONS
-- =============================================

-- Get benefactor leaderboard (top donors)
CREATE OR REPLACE FUNCTION public.get_benefactor_leaderboard(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_time_range TEXT DEFAULT 'all', -- 'day', 'week', 'month', 'all'
  p_token_symbol TEXT DEFAULT NULL -- NULL = all tokens
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  full_name TEXT,
  total_donated NUMERIC,
  total_donations INTEGER,
  total_light_score INTEGER,
  rank INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_time_filter TIMESTAMPTZ;
BEGIN
  -- Calculate time filter
  v_time_filter := CASE p_time_range
    WHEN 'day' THEN now() - INTERVAL '1 day'
    WHEN 'week' THEN now() - INTERVAL '7 days'
    WHEN 'month' THEN now() - INTERVAL '30 days'
    ELSE '1970-01-01'::TIMESTAMPTZ
  END;
  
  RETURN QUERY
  WITH donor_stats AS (
    SELECT 
      d.sender_id,
      SUM(d.amount::NUMERIC) AS total_donated,
      COUNT(*) AS total_donations,
      SUM(COALESCE(d.light_score_earned, 0)) AS total_light_score
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.created_at >= v_time_filter
      AND (p_token_symbol IS NULL OR d.token_symbol = p_token_symbol)
    GROUP BY d.sender_id
  )
  SELECT 
    p.id AS user_id,
    p.username,
    p.avatar_url,
    p.full_name,
    ds.total_donated,
    ds.total_donations::INTEGER,
    ds.total_light_score::INTEGER,
    ROW_NUMBER() OVER (ORDER BY ds.total_donated DESC)::INTEGER AS rank
  FROM donor_stats ds
  JOIN profiles p ON p.id = ds.sender_id
  ORDER BY ds.total_donated DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Get recipient leaderboard (most received)
CREATE OR REPLACE FUNCTION public.get_recipient_leaderboard(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_time_range TEXT DEFAULT 'all'
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  full_name TEXT,
  total_received NUMERIC,
  total_donations INTEGER,
  rank INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_time_filter TIMESTAMPTZ;
BEGIN
  v_time_filter := CASE p_time_range
    WHEN 'day' THEN now() - INTERVAL '1 day'
    WHEN 'week' THEN now() - INTERVAL '7 days'
    WHEN 'month' THEN now() - INTERVAL '30 days'
    ELSE '1970-01-01'::TIMESTAMPTZ
  END;
  
  RETURN QUERY
  WITH recipient_stats AS (
    SELECT 
      d.recipient_id,
      SUM(d.amount::NUMERIC) AS total_received,
      COUNT(*) AS total_donations
    FROM donations d
    WHERE d.status = 'confirmed'
      AND d.created_at >= v_time_filter
    GROUP BY d.recipient_id
  )
  SELECT 
    p.id AS user_id,
    p.username,
    p.avatar_url,
    p.full_name,
    rs.total_received,
    rs.total_donations::INTEGER,
    ROW_NUMBER() OVER (ORDER BY rs.total_received DESC)::INTEGER AS rank
  FROM recipient_stats rs
  JOIN profiles p ON p.id = rs.recipient_id
  ORDER BY rs.total_received DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Get user donation stats
CREATE OR REPLACE FUNCTION public.get_user_donation_stats(p_user_id UUID)
RETURNS TABLE (
  total_sent NUMERIC,
  total_received NUMERIC,
  donations_sent INTEGER,
  donations_received INTEGER,
  light_score_from_donations INTEGER,
  unique_recipients INTEGER,
  unique_donors INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE((
      SELECT SUM(amount::NUMERIC) FROM donations 
      WHERE sender_id = p_user_id AND status = 'confirmed'
    ), 0) AS total_sent,
    COALESCE((
      SELECT SUM(amount::NUMERIC) FROM donations 
      WHERE recipient_id = p_user_id AND status = 'confirmed'
    ), 0) AS total_received,
    COALESCE((
      SELECT COUNT(*)::INTEGER FROM donations 
      WHERE sender_id = p_user_id AND status = 'confirmed'
    ), 0) AS donations_sent,
    COALESCE((
      SELECT COUNT(*)::INTEGER FROM donations 
      WHERE recipient_id = p_user_id AND status = 'confirmed'
    ), 0) AS donations_received,
    COALESCE((
      SELECT SUM(light_score_earned)::INTEGER FROM donations 
      WHERE sender_id = p_user_id AND status = 'confirmed'
    ), 0) AS light_score_from_donations,
    COALESCE((
      SELECT COUNT(DISTINCT recipient_id)::INTEGER FROM donations 
      WHERE sender_id = p_user_id AND status = 'confirmed'
    ), 0) AS unique_recipients,
    COALESCE((
      SELECT COUNT(DISTINCT sender_id)::INTEGER FROM donations 
      WHERE recipient_id = p_user_id AND status = 'confirmed'
    ), 0) AS unique_donors;
END;
$$;

-- Get donation history with pagination
CREATE OR REPLACE FUNCTION public.get_donation_history(
  p_user_id UUID,
  p_type TEXT DEFAULT 'all', -- 'sent', 'received', 'all'
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  sender_id UUID,
  sender_username TEXT,
  sender_avatar_url TEXT,
  recipient_id UUID,
  recipient_username TEXT,
  recipient_avatar_url TEXT,
  post_id UUID,
  amount TEXT,
  amount_usd NUMERIC,
  token_symbol TEXT,
  tx_hash TEXT,
  message TEXT,
  message_template TEXT,
  light_score_earned INTEGER,
  status TEXT,
  created_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.sender_id,
    ps.username AS sender_username,
    ps.avatar_url AS sender_avatar_url,
    d.recipient_id,
    pr.username AS recipient_username,
    pr.avatar_url AS recipient_avatar_url,
    d.post_id,
    d.amount,
    d.amount_usd,
    d.token_symbol,
    d.tx_hash,
    d.message,
    d.message_template,
    d.light_score_earned,
    d.status,
    d.created_at,
    d.confirmed_at
  FROM donations d
  JOIN profiles ps ON ps.id = d.sender_id
  JOIN profiles pr ON pr.id = d.recipient_id
  WHERE 
    CASE p_type
      WHEN 'sent' THEN d.sender_id = p_user_id
      WHEN 'received' THEN d.recipient_id = p_user_id
      ELSE d.sender_id = p_user_id OR d.recipient_id = p_user_id
    END
  ORDER BY d.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Enable realtime for donations
ALTER PUBLICATION supabase_realtime ADD TABLE public.donations;