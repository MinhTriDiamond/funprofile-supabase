-- RTMP/OBS persistent stream configs.
-- A config is the long-lived RTMP credential set. A live_session is one live event.

CREATE TABLE IF NOT EXISTS public.rtmp_stream_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_persistent boolean NOT NULL DEFAULT true,
  cloudflare_live_input_id text NOT NULL,
  rtmps_url text,
  stream_key_encrypted text,
  stream_key_last_reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.live_sessions
  ADD COLUMN IF NOT EXISTS rtmp_config_id uuid REFERENCES public.rtmp_stream_configs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_persistent_stream boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rtmp_stream_configs_one_persistent_per_user
  ON public.rtmp_stream_configs(user_id)
  WHERE is_persistent = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rtmp_stream_configs_live_input
  ON public.rtmp_stream_configs(cloudflare_live_input_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_config
  ON public.live_sessions(rtmp_config_id, created_at DESC)
  WHERE rtmp_config_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_live_sessions_rtmp_active_owner
  ON public.live_sessions(owner_id, mode, status, updated_at DESC)
  WHERE mode = 'rtmp_obs'
    AND deleted_at IS NULL
    AND status IN ('waiting_for_obs', 'source_connected', 'ready_to_go_live', 'live');

DROP TRIGGER IF EXISTS update_rtmp_stream_configs_updated_at ON public.rtmp_stream_configs;
CREATE TRIGGER update_rtmp_stream_configs_updated_at
BEFORE UPDATE ON public.rtmp_stream_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rtmp_stream_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner can read own rtmp stream configs" ON public.rtmp_stream_configs;
CREATE POLICY "owner can read own rtmp stream configs"
  ON public.rtmp_stream_configs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner can insert own rtmp stream configs" ON public.rtmp_stream_configs;
CREATE POLICY "owner can insert own rtmp stream configs"
  ON public.rtmp_stream_configs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "owner can update own rtmp stream configs" ON public.rtmp_stream_configs;
CREATE POLICY "owner can update own rtmp stream configs"
  ON public.rtmp_stream_configs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.rtmp_stream_configs IS 'Long-lived or reusable RTMP/OBS stream credential configs. Stream keys are encrypted and only returned by owner-only Edge Functions.';
COMMENT ON COLUMN public.live_sessions.rtmp_config_id IS 'RTMP config used by this one live session.';
COMMENT ON COLUMN public.live_sessions.is_persistent_stream IS 'True when this live session uses the owner persistent RTMP config.';
