
-- ============================================================
-- Chat+Call Module: New tables, columns, functions, RLS
-- ============================================================

-- 1. Add new columns to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pinned_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS pinned_by uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type text NOT NULL DEFAULT 'text';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 2. call_sessions table
CREATE TABLE IF NOT EXISTS public.call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  initiator_id UUID NOT NULL,
  call_type TEXT NOT NULL CHECK (call_type IN ('voice', 'video')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ringing', 'active', 'ended', 'missed', 'declined')),
  channel_name TEXT NOT NULL UNIQUE,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. call_participants table
CREATE TABLE IF NOT EXISTS public.call_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  is_muted BOOLEAN DEFAULT false,
  is_video_off BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. user_blocks table
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- 5. reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  reported_user_id uuid,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. sticker_packs table
CREATE TABLE IF NOT EXISTS public.sticker_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  preview_url text NOT NULL,
  is_free boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. stickers table
CREATE TABLE IF NOT EXISTS public.stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.sticker_packs(id) ON DELETE CASCADE,
  name text NOT NULL,
  url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_animated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. red_envelopes table
CREATE TABLE IF NOT EXISTS public.red_envelopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  token text NOT NULL DEFAULT 'CAMLY',
  total_amount numeric NOT NULL CHECK (total_amount > 0),
  total_count int NOT NULL CHECK (total_count > 0),
  remaining_amount numeric NOT NULL,
  remaining_count int NOT NULL,
  greeting text DEFAULT '🧧 Chúc mừng năm mới!',
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. red_envelope_claims table
CREATE TABLE IF NOT EXISTS public.red_envelope_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  envelope_id uuid NOT NULL REFERENCES public.red_envelopes(id) ON DELETE CASCADE,
  claimer_id uuid NOT NULL,
  amount numeric NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(envelope_id, claimer_id)
);

-- 10. crypto_gifts table
CREATE TABLE IF NOT EXISTS public.crypto_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  to_address text NOT NULL,
  token text NOT NULL DEFAULT 'BNB',
  amount_numeric numeric NOT NULL DEFAULT 0,
  tx_hash text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  chain_id int NOT NULL DEFAULT 56,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_call_sessions_conversation ON public.call_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_call_sessions_status ON public.call_sessions(status);
CREATE INDEX IF NOT EXISTS idx_call_sessions_initiator ON public.call_sessions(initiator_id);
CREATE INDEX IF NOT EXISTS idx_call_participants_session ON public.call_participants(call_session_id);
CREATE INDEX IF NOT EXISTS idx_call_participants_user ON public.call_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_from_user_id ON public.crypto_gifts(from_user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_to_user_id ON public.crypto_gifts(to_user_id);
CREATE INDEX IF NOT EXISTS idx_crypto_gifts_conversation_id ON public.crypto_gifts(conversation_id);

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.red_envelopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.red_envelope_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crypto_gifts ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- call_sessions
CREATE POLICY "Users can view call sessions in their conversations"
  ON public.call_sessions FOR SELECT
  USING (is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Users can create call sessions in their conversations"
  ON public.call_sessions FOR INSERT
  WITH CHECK (
    initiator_id = auth.uid() 
    AND is_conversation_participant(conversation_id, auth.uid())
  );

CREATE POLICY "Participants can update call sessions"
  ON public.call_sessions FOR UPDATE
  USING (is_conversation_participant(conversation_id, auth.uid()));

-- call_participants
CREATE POLICY "Users can view call participants"
  ON public.call_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.call_sessions cs
      WHERE cs.id = call_participants.call_session_id
      AND is_conversation_participant(cs.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can join calls"
  ON public.call_participants FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.call_sessions cs
      WHERE cs.id = call_participants.call_session_id
      AND is_conversation_participant(cs.conversation_id, auth.uid())
    )
  );

CREATE POLICY "Users can update their own call participant record"
  ON public.call_participants FOR UPDATE
  USING (user_id = auth.uid());

-- user_blocks
CREATE POLICY "Users can view their own blocks"
  ON public.user_blocks FOR SELECT
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block others"
  ON public.user_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id AND blocker_id != blocked_id);

CREATE POLICY "Users can unblock"
  ON public.user_blocks FOR DELETE
  USING (auth.uid() = blocker_id);

-- reports
CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Users can view own reports"
  ON public.reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- sticker_packs
CREATE POLICY "Anyone can view active sticker packs"
  ON public.sticker_packs FOR SELECT
  USING (is_active = true);

-- stickers
CREATE POLICY "Anyone can view stickers"
  ON public.stickers FOR SELECT
  USING (true);

-- red_envelopes
CREATE POLICY "Participants can view envelopes in their conversations"
  ON public.red_envelopes FOR SELECT
  USING (public.is_conversation_participant(conversation_id, auth.uid()));

CREATE POLICY "Participants can create envelopes"
  ON public.red_envelopes FOR INSERT
  WITH CHECK (auth.uid() = creator_id AND public.is_conversation_participant(conversation_id, auth.uid()));

-- red_envelope_claims
CREATE POLICY "Participants can view claims"
  ON public.red_envelope_claims FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.red_envelopes re
    WHERE re.id = envelope_id
      AND public.is_conversation_participant(re.conversation_id, auth.uid())
  ));

-- crypto_gifts
CREATE POLICY "crypto_gifts_select_own"
  ON public.crypto_gifts FOR SELECT
  TO authenticated
  USING (from_user_id = auth.uid() OR to_user_id = auth.uid());

CREATE POLICY "crypto_gifts_insert_sender"
  ON public.crypto_gifts FOR INSERT
  TO authenticated
  WITH CHECK (from_user_id = auth.uid());

CREATE POLICY "crypto_gifts_update_sender"
  ON public.crypto_gifts FOR UPDATE
  TO authenticated
  USING (from_user_id = auth.uid());

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- pin_message
CREATE OR REPLACE FUNCTION public.pin_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  IF NOT is_conversation_participant(v_conv_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;
  UPDATE messages SET pinned_at = now(), pinned_by = auth.uid() WHERE id = p_message_id;
END;
$$;

-- unpin_message
CREATE OR REPLACE FUNCTION public.unpin_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
BEGIN
  SELECT conversation_id INTO v_conv_id FROM messages WHERE id = p_message_id;
  IF NOT is_conversation_participant(v_conv_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;
  UPDATE messages SET pinned_at = NULL, pinned_by = NULL WHERE id = p_message_id;
END;
$$;

-- claim_red_envelope
CREATE OR REPLACE FUNCTION public.claim_red_envelope(p_envelope_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_envelope red_envelopes%ROWTYPE;
  v_amount numeric;
BEGIN
  SELECT * INTO v_envelope FROM red_envelopes WHERE id = p_envelope_id FOR UPDATE;
  IF v_envelope IS NULL THEN RAISE EXCEPTION 'Envelope not found'; END IF;
  IF v_envelope.status != 'active' THEN RAISE EXCEPTION 'Envelope is no longer active'; END IF;
  IF v_envelope.expires_at < now() THEN
    UPDATE red_envelopes SET status = 'expired' WHERE id = p_envelope_id;
    RAISE EXCEPTION 'Envelope has expired';
  END IF;
  IF NOT is_conversation_participant(v_envelope.conversation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not a participant';
  END IF;
  IF EXISTS (SELECT 1 FROM red_envelope_claims WHERE envelope_id = p_envelope_id AND claimer_id = auth.uid()) THEN
    RAISE EXCEPTION 'Already claimed';
  END IF;
  IF v_envelope.remaining_count <= 0 THEN RAISE EXCEPTION 'No more envelopes left'; END IF;
  
  IF v_envelope.remaining_count = 1 THEN
    v_amount := v_envelope.remaining_amount;
  ELSE
    v_amount := ROUND((random() * v_envelope.remaining_amount * 2 / v_envelope.remaining_count)::numeric, 2);
    IF v_amount < 0.01 THEN v_amount := 0.01; END IF;
    IF v_amount > v_envelope.remaining_amount - (v_envelope.remaining_count - 1) * 0.01 THEN
      v_amount := v_envelope.remaining_amount - (v_envelope.remaining_count - 1) * 0.01;
    END IF;
  END IF;
  
  INSERT INTO red_envelope_claims (envelope_id, claimer_id, amount) VALUES (p_envelope_id, auth.uid(), v_amount);
  UPDATE red_envelopes
  SET remaining_amount = remaining_amount - v_amount,
      remaining_count = remaining_count - 1,
      status = CASE WHEN remaining_count - 1 = 0 THEN 'completed' ELSE 'active' END
  WHERE id = p_envelope_id;
  
  RETURN v_amount;
END;
$$;

-- has_block_between
CREATE OR REPLACE FUNCTION public.has_block_between(user_a uuid, user_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = user_a AND blocked_id = user_b)
       OR (blocker_id = user_b AND blocked_id = user_a)
  );
$$;

-- Update conversation preview for non-text messages
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_preview text;
BEGIN
  IF NEW.is_deleted = true THEN
    v_preview := '[Deleted]';
  ELSIF COALESCE(NEW.message_type, 'text') = 'sticker' THEN
    v_preview := '[Sticker]';
  ELSIF COALESCE(NEW.message_type, 'text') = 'red_envelope' THEN
    v_preview := '[Red Envelope]';
  ELSIF COALESCE(NEW.content, '') <> '' THEN
    v_preview := LEFT(NEW.content, 100);
  ELSIF (NEW.media_urls IS NOT NULL AND jsonb_array_length(NEW.media_urls) > 0) THEN
    v_preview := '[Attachment]';
  ELSE
    v_preview := '';
  END IF;

  UPDATE public.conversations
  SET last_message_at = NEW.created_at, last_message_preview = v_preview, updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- ============================================================
-- ENABLE REALTIME for new tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_blocks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.red_envelopes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.red_envelope_claims;

-- ============================================================
-- SEED: Default sticker pack
-- ============================================================
INSERT INTO public.sticker_packs (id, name, description, preview_url, is_free, sort_order)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Fun Emotions', 'Bộ sticker cảm xúc vui nhộn', '/stickers/preview.svg', true, 1)
ON CONFLICT DO NOTHING;

INSERT INTO public.stickers (pack_id, name, url, sort_order) VALUES
('a0000000-0000-0000-0000-000000000001', 'Hello', '/stickers/hello.svg', 1),
('a0000000-0000-0000-0000-000000000001', 'Love', '/stickers/love.svg', 2),
('a0000000-0000-0000-0000-000000000001', 'LOL', '/stickers/lol.svg', 3),
('a0000000-0000-0000-0000-000000000001', 'Wow', '/stickers/wow.svg', 4),
('a0000000-0000-0000-0000-000000000001', 'Sad', '/stickers/sad.svg', 5),
('a0000000-0000-0000-0000-000000000001', 'Angry', '/stickers/angry.svg', 6)
ON CONFLICT DO NOTHING;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION public.pin_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpin_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_red_envelope(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_block_between(uuid, uuid) TO authenticated;
