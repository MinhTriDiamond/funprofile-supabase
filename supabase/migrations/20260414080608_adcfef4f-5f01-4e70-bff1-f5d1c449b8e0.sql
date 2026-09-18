
-- ============================================================
-- 1. pplp_v2_events
-- ============================================================
CREATE TABLE public.pplp_v2_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'zoom',
  platform_links JSONB DEFAULT '{}',
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  recording_hash TEXT,
  recording_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  raw_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pplp_v2_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read events"
  ON public.pplp_v2_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "Host can create events"
  ON public.pplp_v2_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = host_user_id);

CREATE POLICY "Host can update own events"
  ON public.pplp_v2_events FOR UPDATE TO authenticated
  USING (auth.uid() = host_user_id);

CREATE TRIGGER update_pplp_v2_events_updated_at
  BEFORE UPDATE ON public.pplp_v2_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. pplp_v2_groups
-- ============================================================
CREATE TABLE public.pplp_v2_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.pplp_v2_events(id) ON DELETE CASCADE,
  leader_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  love_house_id TEXT,
  expected_count INT DEFAULT 0,
  leader_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pplp_v2_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read groups"
  ON public.pplp_v2_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Leader can create groups"
  ON public.pplp_v2_groups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = leader_user_id);

CREATE POLICY "Leader can update own groups"
  ON public.pplp_v2_groups FOR UPDATE TO authenticated
  USING (auth.uid() = leader_user_id);

CREATE TRIGGER update_pplp_v2_groups_updated_at
  BEFORE UPDATE ON public.pplp_v2_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. pplp_v2_attendance
-- ============================================================
CREATE TABLE public.pplp_v2_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.pplp_v2_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  duration_minutes INT,
  confirmation_status TEXT NOT NULL DEFAULT 'pending',
  participation_factor NUMERIC(3,2) DEFAULT 0.00,
  reflection_text TEXT,
  confirmed_by_leader BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE public.pplp_v2_attendance ENABLE ROW LEVEL SECURITY;

-- User sees own attendance
CREATE POLICY "User can read own attendance"
  ON public.pplp_v2_attendance FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Leader sees attendance in their groups
CREATE POLICY "Leader can read group attendance"
  ON public.pplp_v2_attendance FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pplp_v2_groups g
      WHERE g.id = pplp_v2_attendance.group_id
        AND g.leader_user_id = auth.uid()
    )
  );

-- User can check-in (insert own)
CREATE POLICY "User can create own attendance"
  ON public.pplp_v2_attendance FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- User can update own attendance (check-out, reflection)
CREATE POLICY "User can update own attendance"
  ON public.pplp_v2_attendance FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Leader can update attendance in their groups (confirm)
CREATE POLICY "Leader can update group attendance"
  ON public.pplp_v2_attendance FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pplp_v2_groups g
      WHERE g.id = pplp_v2_attendance.group_id
        AND g.leader_user_id = auth.uid()
    )
  );

CREATE TRIGGER update_pplp_v2_attendance_updated_at
  BEFORE UPDATE ON public.pplp_v2_attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4. pplp_v2_balance_ledger
-- ============================================================
CREATE TABLE public.pplp_v2_balance_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,
  amount NUMERIC(30,8) NOT NULL DEFAULT 0,
  reference_table TEXT,
  reference_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pplp_v2_balance_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can read own ledger"
  ON public.pplp_v2_balance_ledger FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Only server (service role) inserts ledger entries - no user insert policy
CREATE INDEX idx_pplp_v2_balance_ledger_user ON public.pplp_v2_balance_ledger(user_id);
CREATE INDEX idx_pplp_v2_balance_ledger_ref ON public.pplp_v2_balance_ledger(reference_table, reference_id);

-- ============================================================
-- 5. pplp_v2_community_reviews
-- ============================================================
CREATE TABLE public.pplp_v2_community_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_id UUID NOT NULL REFERENCES public.pplp_v2_user_actions(id) ON DELETE CASCADE,
  reviewer_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endorse_score NUMERIC(5,2) DEFAULT 0,
  flag_score NUMERIC(5,2) DEFAULT 0,
  review_type TEXT NOT NULL DEFAULT 'endorse',
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (action_id, reviewer_user_id)
);

ALTER TABLE public.pplp_v2_community_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read reviews"
  ON public.pplp_v2_community_reviews FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create reviews"
  ON public.pplp_v2_community_reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reviewer_user_id);

CREATE INDEX idx_pplp_v2_community_reviews_action ON public.pplp_v2_community_reviews(action_id);
