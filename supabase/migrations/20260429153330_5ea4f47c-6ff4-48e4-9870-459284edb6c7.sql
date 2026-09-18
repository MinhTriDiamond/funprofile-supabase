-- =========================================
-- PPLP v2.5 Rebalance — Action Overrides + Daily Caps
-- =========================================

-- 1. Bảng override multiplier per action_type (DB-driven, hot-reload)
CREATE TABLE IF NOT EXISTS public.pplp_v25_action_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL UNIQUE,
  base_multiplier numeric NOT NULL DEFAULT 1.0,    -- nhân vào base_value
  quality_bonus numeric NOT NULL DEFAULT 0.0,      -- cộng vào quality_score
  daily_cap integer,                                -- null = không cap
  over_cap_multiplier numeric NOT NULL DEFAULT 0.3,-- nhân vào VVU sau khi vượt cap
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pplp_v25_action_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overrides_select_all" ON public.pplp_v25_action_overrides FOR SELECT USING (true);
CREATE POLICY "overrides_admin_write" ON public.pplp_v25_action_overrides
  FOR ALL USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_overrides_updated_at BEFORE UPDATE ON public.pplp_v25_action_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. History snapshot để rollback
CREATE TABLE IF NOT EXISTS public.pplp_v25_action_overrides_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  snapshot_by uuid,
  payload jsonb NOT NULL,
  reason text
);
ALTER TABLE public.pplp_v25_action_overrides_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "history_admin_read" ON public.pplp_v25_action_overrides_history
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Seed values theo plan rebalance
INSERT INTO public.pplp_v25_action_overrides (action_type, base_multiplier, quality_bonus, daily_cap, notes) VALUES
  ('post',               0.40, 0.0,  5,   'Giảm 60% — chống lệ thuộc post'),
  ('post_create',        0.60, 0.0,  5,   'Giảm 40% — encourage quality'),
  ('donate_support',     2.50, 0.3,  NULL,'Boost x2.5 — ưu tiên Trao Tặng'),
  ('gratitude_practice', 2.00, 0.2,  NULL,'Boost x2 — Biết Ơn'),
  ('livestream',         2.00, 0.2,  NULL,'Boost x2 — Phụng Sự realtime'),
  ('journal_write',      1.70, 0.0,  NULL,'Boost x1.7 — Sám Hối nội tâm'),
  ('reaction',           0.60, 0.0,  50,  'Giảm spam react'),
  ('comment',            1.50, 0.0,  30,  'Tăng nhẹ — quality comment'),
  ('share',              1.00, 0.0,  10,  'Cap chống spam share'),
  ('friend',             1.00, 0.0,  20,  'Cap kết bạn 20/ngày'),
  ('question_ask',       1.20, 0.0,  10,  'Khuyến khích hỏi chất'),
  ('comment_create',     1.50, 0.0,  20,  'Quality comment v2'),
  ('vision_create',      1.50, 0.0,  3,   'Tầm nhìn — chất hơn lượng'),
  ('new_user_bonus',     1.00, 0.0,  1,   'One-time bonus')
ON CONFLICT (action_type) DO UPDATE SET
  base_multiplier = EXCLUDED.base_multiplier,
  quality_bonus = EXCLUDED.quality_bonus,
  daily_cap = EXCLUDED.daily_cap,
  notes = EXCLUDED.notes,
  updated_at = now();

-- 4. Snapshot lần đầu vào history
INSERT INTO public.pplp_v25_action_overrides_history (payload, reason)
SELECT jsonb_agg(to_jsonb(o.*)), 'Initial rebalance v1 — 29/04/2026'
FROM public.pplp_v25_action_overrides o;

-- 5. Index hỗ trợ daily cap query
CREATE INDEX IF NOT EXISTS idx_light_actions_user_type_day
  ON public.light_actions(user_id, action_type, created_at DESC);

-- 6. Bảng helper: theo dõi farming flag
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspected_farming boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS farming_score numeric;

CREATE INDEX IF NOT EXISTS idx_profiles_suspected_farming ON public.profiles(suspected_farming) WHERE suspected_farming = true;