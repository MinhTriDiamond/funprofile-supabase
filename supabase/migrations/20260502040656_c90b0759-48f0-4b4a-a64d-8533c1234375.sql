
-- ===== 1. connector_config =====
CREATE TABLE public.connector_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.connector_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read connector config"
ON public.connector_config FOR SELECT
USING (true);

CREATE POLICY "Admins manage connector config"
ON public.connector_config FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed config
INSERT INTO public.connector_config (key, value, description) VALUES
('window_hours', '48'::jsonb, 'Số giờ mở window kể từ khi tạo account'),
('min_tc', '0.15'::jsonb, 'Trust Confidence tối thiểu để được làm Connector'),
('base_score', '10'::jsonb, 'Light Score base khi xác nhận Connector'),
('min_amounts', '{"FUN":9,"USDT":1,"CAMLY":1000,"BNB":0.001,"BTC":0.00001}'::jsonb, 'Mức tối thiểu cho từng token'),
('whitelist_tokens', '["FUN","USDT","CAMLY","BNB","BTC"]'::jsonb, 'Token được tính Connector'),
('growth_bonus', '{"profile_complete":2,"first_contribution":5,"level_1":10,"active_30d":20}'::jsonb, 'Bonus growth khi user mới đạt mốc'),
('antisybil_recent_account_days', '7'::jsonb, 'Connector mới đăng ký < N ngày sẽ bị giám sát'),
('enabled', 'true'::jsonb, 'Bật/tắt toàn hệ thống Connector');

-- ===== 2. connector_windows =====
CREATE TABLE public.connector_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open',
  matched_link_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connector_windows_status_check CHECK (status IN ('open','matched','expired'))
);

CREATE INDEX idx_connector_windows_status_expires ON public.connector_windows(status, expires_at);
CREATE INDEX idx_connector_windows_user ON public.connector_windows(user_id);

ALTER TABLE public.connector_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own window"
ON public.connector_windows FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage windows"
ON public.connector_windows FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== 3. connector_links =====
CREATE TABLE public.connector_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  new_user_id uuid NOT NULL UNIQUE,
  connector_user_id uuid NOT NULL,
  tx_hash text NOT NULL,
  chain text NOT NULL,
  token_symbol text NOT NULL,
  amount numeric NOT NULL,
  amount_usd numeric,
  block_number bigint NOT NULL DEFAULT 0,
  tx_index integer NOT NULL DEFAULT 0,
  log_index integer NOT NULL DEFAULT 0,
  matched_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'confirmed',
  revert_reason text,
  reverted_by uuid,
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connector_links_no_self CHECK (connector_user_id <> new_user_id),
  CONSTRAINT connector_links_status_check CHECK (status IN ('confirmed','reverted'))
);

CREATE UNIQUE INDEX idx_connector_links_tx_dedupe ON public.connector_links(tx_hash, log_index);
CREATE INDEX idx_connector_links_connector ON public.connector_links(connector_user_id);
CREATE INDEX idx_connector_links_new_user ON public.connector_links(new_user_id);
CREATE INDEX idx_connector_links_status ON public.connector_links(status);

ALTER TABLE public.connector_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view confirmed links"
ON public.connector_links FOR SELECT
USING (status = 'confirmed' OR auth.uid() = new_user_id OR auth.uid() = connector_user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage links"
ON public.connector_links FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== 4. connector_growth_events =====
CREATE TABLE public.connector_growth_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.connector_links(id) ON DELETE CASCADE,
  milestone text NOT NULL,
  score_delta integer NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT connector_growth_milestone_check CHECK (milestone IN ('profile_complete','first_contribution','level_1','active_30d'))
);

CREATE UNIQUE INDEX idx_connector_growth_unique ON public.connector_growth_events(link_id, milestone);
CREATE INDEX idx_connector_growth_link ON public.connector_growth_events(link_id);

ALTER TABLE public.connector_growth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View growth events of own links"
ON public.connector_growth_events FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.connector_links cl
    WHERE cl.id = link_id
      AND (cl.connector_user_id = auth.uid() OR cl.new_user_id = auth.uid())
  )
);

CREATE POLICY "Admins manage growth events"
ON public.connector_growth_events FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== 5. updated_at triggers =====
CREATE TRIGGER trg_connector_windows_updated
BEFORE UPDATE ON public.connector_windows
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_connector_links_updated
BEFORE UPDATE ON public.connector_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== 6. Auto-open window khi profile có wallet =====
CREATE OR REPLACE FUNCTION public.connector_open_window_on_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours integer;
  v_enabled boolean;
BEGIN
  -- Đọc config
  SELECT (value)::text::integer INTO v_hours FROM public.connector_config WHERE key='window_hours';
  SELECT (value)::text::boolean INTO v_enabled FROM public.connector_config WHERE key='enabled';
  IF NOT COALESCE(v_enabled, true) THEN
    RETURN NEW;
  END IF;
  v_hours := COALESCE(v_hours, 48);

  -- Chỉ mở window nếu user có ít nhất 1 ví hợp lệ
  IF NEW.custodial_wallet_address IS NOT NULL OR NEW.wallet_address IS NOT NULL THEN
    INSERT INTO public.connector_windows (user_id, opened_at, expires_at)
    VALUES (NEW.id, now(), now() + make_interval(hours => v_hours))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_connector_open_window_insert
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.connector_open_window_on_profile();

CREATE TRIGGER trg_connector_open_window_update
AFTER UPDATE OF custodial_wallet_address, wallet_address ON public.profiles
FOR EACH ROW
WHEN (
  (OLD.custodial_wallet_address IS NULL AND NEW.custodial_wallet_address IS NOT NULL)
  OR (OLD.wallet_address IS NULL AND NEW.wallet_address IS NOT NULL)
)
EXECUTE FUNCTION public.connector_open_window_on_profile();

-- ===== 7. Backfill window cho user hiện tại chưa có (within 48h kể từ created_at) =====
INSERT INTO public.connector_windows (user_id, opened_at, expires_at, status)
SELECT
  p.id,
  p.created_at,
  p.created_at + interval '48 hours',
  CASE WHEN p.created_at + interval '48 hours' > now() THEN 'open' ELSE 'expired' END
FROM public.profiles p
WHERE (p.custodial_wallet_address IS NOT NULL OR p.wallet_address IS NOT NULL)
ON CONFLICT (user_id) DO NOTHING;

-- ===== 8. Cron expire window =====
SELECT cron.schedule(
  'connector-window-expire-hourly',
  '0 * * * *',
  $$
    UPDATE public.connector_windows
    SET status = 'expired', updated_at = now()
    WHERE status = 'open' AND expires_at < now();
  $$
);
