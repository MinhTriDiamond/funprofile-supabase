-- ============ PHẦN 1: DROP 6 index 0 scan (đã xác nhận lại ngay trước khi xoá) ============
-- 638 MB, idx_scan = 0 (giữ idx_live_session_events_session_created — 22 scan, admin-replay-debug dùng)
DROP INDEX IF EXISTS public.idx_live_session_events_reason_created;
-- trùng hoàn toàn idx_notifications_user_read (4.291.059 scan)
DROP INDEX IF EXISTS public.idx_notifications_read;
-- trùng hoàn toàn idx_posts_user_created (712.117 scan)
DROP INDEX IF EXISTS public.ix_posts_user_created;
-- trùng constraint index live_sessions_channel_name_key (unique, giữ lại)
DROP INDEX IF EXISTS public.idx_live_sessions_channel_name_unique;
-- tiền tố của uq_v25_vvu_source (source_table, source_id, vvu_type) — giữ unique
DROP INDEX IF EXISTS public.idx_v25_vvu_source;
-- tiền tố của chunked_recording_chunks_recording_id_seq_key (recording_id, seq) — giữ unique
DROP INDEX IF EXISTS public.idx_chunked_recording_chunks_recording;

-- ============ PHẦN 2: migration tài liệu — live_co_hosts (idempotent, không đổi gì) ============
CREATE TABLE IF NOT EXISTS public.live_co_hosts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by UUID NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE,
  left_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

GRANT SELECT ON public.live_co_hosts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_co_hosts TO authenticated;
GRANT ALL ON public.live_co_hosts TO service_role;

ALTER TABLE public.live_co_hosts ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_co_hosts_active
  ON public.live_co_hosts (session_id, user_id)
  WHERE status = ANY (ARRAY['pending'::text, 'accepted'::text]);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='live_co_hosts' AND policyname='Anyone can view co-hosts') THEN
    CREATE POLICY "Anyone can view co-hosts" ON public.live_co_hosts FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='live_co_hosts' AND policyname='Host can invite') THEN
    CREATE POLICY "Host can invite" ON public.live_co_hosts FOR INSERT WITH CHECK (invited_by = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='live_co_hosts' AND policyname='User can update own status') THEN
    CREATE POLICY "User can update own status" ON public.live_co_hosts FOR UPDATE USING (user_id = auth.uid());
  END IF;
END $$;

-- ============ PHẦN 3: migration tài liệu — reward_claims (idempotent, không đổi gì) ============
CREATE TABLE IF NOT EXISTS public.reward_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  amount BIGINT NOT NULL,
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reward_claims TO authenticated;
GRANT ALL ON public.reward_claims TO service_role;

ALTER TABLE public.reward_claims ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_reward_claims_user_id ON public.reward_claims (user_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reward_claims' AND policyname='Users can view their own claims') THEN
    CREATE POLICY "Users can view their own claims" ON public.reward_claims FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reward_claims' AND policyname='Admins can view all reward claims') THEN
    CREATE POLICY "Admins can view all reward claims" ON public.reward_claims FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reward_claims' AND policyname='Users can create their own claims') THEN
    CREATE POLICY "Users can create their own claims" ON public.reward_claims FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;