
-- 1. EVENT BASE VALUES
CREATE TABLE public.pplp_v25_event_base_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL UNIQUE,
  description text,
  base_min numeric NOT NULL DEFAULT 0,
  base_max numeric NOT NULL DEFAULT 0,
  base_default numeric NOT NULL DEFAULT 0,
  category text NOT NULL CHECK (category IN ('personal','network','legacy')),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pplp_v25_event_base_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_public_read" ON public.pplp_v25_event_base_values FOR SELECT USING (true);
CREATE POLICY "events_admin_write" ON public.pplp_v25_event_base_values FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2. MULTIPLIER RANGES
CREATE TABLE public.pplp_v25_multiplier_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  multiplier_code text NOT NULL,
  multiplier_group text NOT NULL CHECK (multiplier_group IN ('event','personal','network')),
  level_label text NOT NULL,
  range_min numeric NOT NULL DEFAULT 0,
  range_max numeric NOT NULL DEFAULT 1,
  default_value numeric NOT NULL DEFAULT 1,
  condition_description text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(multiplier_code, level_label)
);
ALTER TABLE public.pplp_v25_multiplier_ranges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mult_public_read" ON public.pplp_v25_multiplier_ranges FOR SELECT USING (true);
CREATE POLICY "mult_admin_write" ON public.pplp_v25_multiplier_ranges FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.pplp_v25_validate_multiplier()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.range_max > 5.0 THEN
    RAISE EXCEPTION 'multiplier range_max cannot exceed 5.0 (got %)', NEW.range_max;
  END IF;
  IF NEW.range_min < 0 THEN RAISE EXCEPTION 'range_min cannot be negative'; END IF;
  IF NEW.range_min > NEW.range_max THEN RAISE EXCEPTION 'range_min cannot exceed range_max'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END$$;

CREATE TRIGGER trg_validate_multiplier
  BEFORE INSERT OR UPDATE ON public.pplp_v25_multiplier_ranges
  FOR EACH ROW EXECUTE FUNCTION public.pplp_v25_validate_multiplier();

-- 3. LEGACY PARAMS
CREATE TABLE public.pplp_v25_legacy_params (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  param_code text NOT NULL,
  level_label text NOT NULL,
  range_min numeric NOT NULL DEFAULT 0,
  range_max numeric NOT NULL DEFAULT 1,
  default_value numeric NOT NULL DEFAULT 1,
  formula text,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(param_code, level_label)
);
ALTER TABLE public.pplp_v25_legacy_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legacy_public_read" ON public.pplp_v25_legacy_params FOR SELECT USING (true);
CREATE POLICY "legacy_admin_write" ON public.pplp_v25_legacy_params FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4. PHASE CONFIG
CREATE TABLE public.pplp_v25_phase_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_name text NOT NULL UNIQUE CHECK (phase_name IN ('early','growth','mature')),
  alpha numeric NOT NULL DEFAULT 0.7,
  beta  numeric NOT NULL DEFAULT 0.2,
  gamma numeric NOT NULL DEFAULT 0.1,
  threshold_earn_basic    numeric NOT NULL DEFAULT 10,
  threshold_earn_advanced numeric NOT NULL DEFAULT 100,
  threshold_referral      numeric NOT NULL DEFAULT 50,
  threshold_governance    numeric NOT NULL DEFAULT 200,
  threshold_proposal      numeric NOT NULL DEFAULT 500,
  threshold_validator     numeric NOT NULL DEFAULT 1000,
  min_tc_for_basic numeric NOT NULL DEFAULT 0.8,
  display_formula  text NOT NULL DEFAULT '100*log(1+RawLS)',
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pplp_v25_phase_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phase_public_read" ON public.pplp_v25_phase_config FOR SELECT USING (true);
CREATE POLICY "phase_admin_write" ON public.pplp_v25_phase_config FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5. MINT LINKING CONFIG
CREATE TABLE public.pplp_v25_mint_linking_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_name text NOT NULL UNIQUE CHECK (phase_name IN ('early','growth','mature')),
  mint_base_rate numeric NOT NULL DEFAULT 1.0,
  tc_weight numeric NOT NULL DEFAULT 1.0,
  stability_weight numeric NOT NULL DEFAULT 1.0,
  delta_ls_window_days int NOT NULL DEFAULT 7,
  min_tc_to_mint numeric NOT NULL DEFAULT 0.8,
  max_mint_per_epoch_per_user numeric NOT NULL DEFAULT 1000,
  formula text NOT NULL DEFAULT 'Mint = ΔLS_window × mint_base_rate × TC^tc_weight × SI^stability_weight',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pplp_v25_mint_linking_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mint_link_public_read" ON public.pplp_v25_mint_linking_config FOR SELECT USING (true);
CREATE POLICY "mint_link_admin_write" ON public.pplp_v25_mint_linking_config FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6. STABILITY INDEX
CREATE TABLE public.pplp_v25_stability_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  ls_volatility_30d numeric NOT NULL DEFAULT 0,
  behavior_consistency numeric NOT NULL DEFAULT 1.0,
  network_stability numeric NOT NULL DEFAULT 1.0,
  stability_index numeric NOT NULL DEFAULT 1.0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);
CREATE INDEX idx_stability_user_date ON public.pplp_v25_stability_index(user_id, snapshot_date DESC);
ALTER TABLE public.pplp_v25_stability_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stability_self_read" ON public.pplp_v25_stability_index FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "stability_admin_write" ON public.pplp_v25_stability_index FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 7. PARAM AUDIT LOG
CREATE TABLE public.pplp_v25_param_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by uuid,
  table_name text NOT NULL,
  row_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_param_audit_table_time ON public.pplp_v25_param_audit_log(table_name, changed_at DESC);
ALTER TABLE public.pplp_v25_param_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_read" ON public.pplp_v25_param_audit_log FOR SELECT
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "audit_admin_insert" ON public.pplp_v25_param_audit_log FOR INSERT
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.pplp_v25_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END$$;

CREATE TRIGGER trg_events_touch BEFORE UPDATE ON public.pplp_v25_event_base_values
  FOR EACH ROW EXECUTE FUNCTION public.pplp_v25_touch_updated_at();
CREATE TRIGGER trg_legacy_touch BEFORE UPDATE ON public.pplp_v25_legacy_params
  FOR EACH ROW EXECUTE FUNCTION public.pplp_v25_touch_updated_at();
CREATE TRIGGER trg_phase_touch BEFORE UPDATE ON public.pplp_v25_phase_config
  FOR EACH ROW EXECUTE FUNCTION public.pplp_v25_touch_updated_at();
CREATE TRIGGER trg_mint_link_touch BEFORE UPDATE ON public.pplp_v25_mint_linking_config
  FOR EACH ROW EXECUTE FUNCTION public.pplp_v25_touch_updated_at();

-- ============== SEED DATA ==============
INSERT INTO public.pplp_v25_event_base_values (event_type, description, base_min, base_max, base_default, category, sort_order) VALUES
('daily_checkin','Điểm danh hàng ngày',0.1,0.3,0.2,'personal',1),
('profile_completion','Hoàn thiện hồ sơ',2,5,3,'personal',2),
('did_verification','Xác thực DID',5,10,7,'personal',3),
('soulbound_mint','Đúc Soulbound NFT',8,15,10,'personal',4),
('content_creation','Tạo nội dung',1,5,2,'personal',5),
('content_used','Nội dung được sử dụng',2,10,5,'network',6),
('learning_completion','Hoàn thành học tập',1,4,2,'personal',7),
('referral_raw','Mời bạn (raw)',0.5,2,1,'network',8),
('referral_activated','Mời bạn (đã kích hoạt)',5,20,10,'network',9),
('transaction_real','Giao dịch thật',0.5,3,1.5,'personal',10),
('contribution_system','Đóng góp hệ thống',3,15,8,'legacy',11),
('governance_participation','Tham gia governance',1,5,2,'network',12),
('successful_proposal','Đề xuất thành công',10,50,25,'legacy',13),
('longterm_value_asset','Tài sản giá trị dài hạn',20,100,50,'legacy',14);

INSERT INTO public.pplp_v25_multiplier_ranges (multiplier_code, multiplier_group, level_label, range_min, range_max, default_value, condition_description, sort_order) VALUES
('Q','event','low',0.3,0.7,0.5,'Chất lượng thấp',1),
('Q','event','medium',0.7,1.2,1.0,'Chất lượng trung bình',2),
('Q','event','high',1.2,1.8,1.5,'Chất lượng cao',3),
('TC','event','low_trust',0.5,0.8,0.7,'Trust thấp',1),
('TC','event','medium_trust',0.8,1.1,1.0,'Trust trung bình',2),
('TC','event','high_trust',1.1,1.5,1.3,'Trust cao',3),
('IIS','event','suspicious',0.0,0.5,0.3,'Intent đáng ngờ',1),
('IIS','event','neutral',0.5,1.0,0.8,'Intent trung lập',2),
('IIS','event','genuine',1.0,1.5,1.2,'Intent chân thật',3),
('IM','event','low_impact',0.5,1.0,0.8,'Tác động thấp',1),
('IM','event','medium_impact',1.0,2.0,1.5,'Tác động trung bình',2),
('IM','event','high_impact',2.0,3.0,2.5,'Tác động cao',3),
('AAF','event','flagged',0.0,0.3,0.1,'Bị cờ chống lạm dụng',1),
('AAF','event','clean',0.7,1.0,1.0,'Không có cờ',2),
('ERP','event','low_retention',0.5,0.7,0.6,'Retention thấp',1),
('ERP','event','high_retention',0.7,1.0,0.9,'Retention cao',2),
('C','personal','streak_1_3',0.95,1.0,0.97,'Streak 1-3 ngày',1),
('C','personal','streak_4_7',1.0,1.05,1.02,'Streak 4-7 ngày',2),
('C','personal','streak_8_30',1.05,1.15,1.10,'Streak 8-30 ngày',3),
('C','personal','streak_30_90',1.15,1.20,1.18,'Streak 30-90 ngày',4),
('C','personal','streak_90_plus',1.20,1.25,1.25,'Streak 90+ ngày',5),
('R','personal','low_reliability',0.6,0.8,0.7,'Reliability thấp',1),
('R','personal','medium_reliability',0.8,1.0,0.9,'Reliability trung bình',2),
('R','personal','high_reliability',1.0,1.2,1.1,'Reliability cao',3),
('QN','network','low',0.2,0.6,0.4,'Network quality thấp',1),
('QN','network','medium',0.6,1.0,0.8,'Network quality trung bình',2),
('QN','network','high',1.0,1.5,1.3,'Network quality cao',3),
('TN','network','low',0.5,0.8,0.7,'Network trust thấp',1),
('TN','network','medium',0.8,1.1,1.0,'Network trust trung bình',2),
('TN','network','high',1.1,1.3,1.2,'Network trust cao',3),
('DN','network','low',0.8,0.95,0.9,'Network diversity thấp',1),
('DN','network','high',0.95,1.2,1.1,'Network diversity cao',2);

INSERT INTO public.pplp_v25_legacy_params (param_code, level_label, range_min, range_max, default_value, formula, notes, sort_order) VALUES
('PV','tier_1',1,5,3,NULL,'Permanent Value tier 1',1),
('PV','tier_2',5,20,12,NULL,'Permanent Value tier 2',2),
('PV','tier_3',20,50,35,NULL,'Permanent Value tier 3',3),
('PV','tier_4',50,100,75,NULL,'Permanent Value tier 4',4),
('AD','low',0.5,0.8,0.6,NULL,'Authentic Depth thấp',1),
('AD','medium',0.8,1.0,0.9,NULL,'Authentic Depth trung bình',2),
('AD','high',1.0,1.2,1.1,NULL,'Authentic Depth cao',3),
('AD','exceptional',1.2,1.5,1.4,NULL,'Authentic Depth xuất sắc',4),
('LO','7d',1,1,1,'log(1+days_active)','Longevity 7 ngày',1),
('LO','30d',1.5,1.5,1.5,'log(1+days_active)','Longevity 30 ngày',2),
('LO','90d',2,2,2,'log(1+days_active)','Longevity 90 ngày',3),
('LO','1y',3,3,3,'log(1+days_active)','Longevity 1 năm',4),
('PU','low',0.5,0.7,0.6,NULL,'Public Utility thấp',1),
('PU','medium',1.0,1.0,1.0,NULL,'Public Utility trung bình',2),
('PU','high',1.2,1.2,1.2,NULL,'Public Utility cao',3),
('PU','exceptional',1.5,1.5,1.5,NULL,'Public Utility xuất sắc',4);

INSERT INTO public.pplp_v25_phase_config (phase_name, alpha, beta, gamma, is_active, notes) VALUES
('early',0.7,0.2,0.1,true,'Phase khởi đầu — ưu tiên Personal Light Score'),
('growth',0.5,0.3,0.2,false,'Phase tăng trưởng — cân bằng Personal/Network/Legacy'),
('mature',0.4,0.3,0.3,false,'Phase trưởng thành — ưu tiên Legacy');

INSERT INTO public.pplp_v25_mint_linking_config (phase_name, mint_base_rate, tc_weight, stability_weight, delta_ls_window_days, min_tc_to_mint, max_mint_per_epoch_per_user) VALUES
('early',1.0,1.0,0.8,7,0.8,500),
('growth',0.8,1.2,1.0,7,0.85,1000),
('mature',0.6,1.3,1.2,7,0.9,2000);
