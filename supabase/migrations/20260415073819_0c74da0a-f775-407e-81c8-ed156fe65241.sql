
-- 1. Review Queue table (Pseudocode §10)
CREATE TABLE public.pplp_v2_review_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action_id UUID NOT NULL REFERENCES public.pplp_v2_user_actions(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_to UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  resolution_note TEXT,
  resolution_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(action_id)
);

ALTER TABLE public.pplp_v2_review_queue ENABLE ROW LEVEL SECURITY;

-- Only admins can manage the review queue
CREATE POLICY "Admins can view review queue"
  ON public.pplp_v2_review_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert review queue"
  ON public.pplp_v2_review_queue FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update review queue"
  ON public.pplp_v2_review_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Add per-pillar scores to community_reviews (PRD §7)
ALTER TABLE public.pplp_v2_community_reviews
  ADD COLUMN IF NOT EXISTS pillar_serving_life NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pillar_transparent_truth NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pillar_healing_love NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pillar_long_term_value NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pillar_unity_over_separation NUMERIC DEFAULT 0;

-- 3. Add 6 attendance signal tracking columns (PRD §9.5)
ALTER TABLE public.pplp_v2_attendance
  ADD COLUMN IF NOT EXISTS app_check_in_signal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS app_check_out_signal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS host_confirmed_signal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS response_submitted_signal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS duration_met_signal BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS optional_presence_signal_value BOOLEAN DEFAULT false;

-- Trigger for updated_at on review_queue
CREATE TRIGGER update_pplp_v2_review_queue_updated_at
  BEFORE UPDATE ON public.pplp_v2_review_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
