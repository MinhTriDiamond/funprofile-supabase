
-- Add gift celebration columns to posts table
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS gift_sender_id UUID;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS gift_recipient_id UUID;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS gift_token TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS gift_amount TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS gift_message TEXT;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_highlighted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS highlight_expires_at TIMESTAMPTZ;

-- Index for efficient highlighted posts query
CREATE INDEX IF NOT EXISTS idx_posts_highlighted ON public.posts (is_highlighted, highlight_expires_at DESC) WHERE is_highlighted = true;

-- Index for post_type filtering
CREATE INDEX IF NOT EXISTS idx_posts_post_type ON public.posts (post_type);
