
CREATE TABLE IF NOT EXISTS public.rtmp_stream_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  is_persistent boolean NOT NULL DEFAULT true,
  cloudflare_live_input_id text NOT NULL,
  rtmps_url text NOT NULL,
  stream_key_encrypted text NOT NULL,
  stream_key_last_reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rtmp_stream_configs_user ON public.rtmp_stream_configs(user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rtmp_stream_configs_persistent_per_user
  ON public.rtmp_stream_configs(user_id) WHERE is_persistent = true AND deleted_at IS NULL;

ALTER TABLE public.rtmp_stream_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can select own rtmp configs" ON public.rtmp_stream_configs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Owner can insert own rtmp configs" ON public.rtmp_stream_configs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner can update own rtmp configs" ON public.rtmp_stream_configs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Owner can delete own rtmp configs" ON public.rtmp_stream_configs
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_rtmp_stream_configs_updated_at
  BEFORE UPDATE ON public.rtmp_stream_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS rtmp_config_id uuid REFERENCES public.rtmp_stream_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_persistent_stream boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_config_id ON public.live_sessions(rtmp_config_id);
