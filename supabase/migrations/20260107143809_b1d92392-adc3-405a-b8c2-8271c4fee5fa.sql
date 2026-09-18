-- Tạo bảng platform_user_data để tách biệt dữ liệu giữa các platform
CREATE TABLE public.platform_user_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  client_id TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  sync_count INTEGER NOT NULL DEFAULT 0,
  last_sync_mode TEXT,
  client_timestamp TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Mỗi user chỉ có 1 record per platform
  UNIQUE(user_id, client_id)
);

-- Index để tối ưu query
CREATE INDEX idx_platform_user_data_user_id ON platform_user_data(user_id);
CREATE INDEX idx_platform_user_data_client_id ON platform_user_data(client_id);
CREATE INDEX idx_platform_user_data_synced_at ON platform_user_data(synced_at);

-- Enable RLS
ALTER TABLE platform_user_data ENABLE ROW LEVEL SECURITY;

-- Policy 1: User chỉ có thể xem data của chính mình
CREATE POLICY "Users can view their own platform data"
ON platform_user_data FOR SELECT
USING (auth.uid() = user_id);

-- Policy 2: Service role có full access (cho edge functions)
CREATE POLICY "Service role can manage all platform data"
ON platform_user_data FOR ALL
USING (true)
WITH CHECK (true);

-- Trigger update updated_at
CREATE TRIGGER update_platform_user_data_updated_at
BEFORE UPDATE ON platform_user_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Thêm metadata columns cho oauth_clients
ALTER TABLE oauth_clients 
ADD COLUMN IF NOT EXISTS platform_name TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Update thông tin cho các clients
UPDATE oauth_clients SET 
  platform_name = 'Fun Farm',
  description = 'Trồng trọt, thu hoạch và xây dựng nông trại trong Fun Ecosystem',
  website_url = 'https://farm.fun.rich'
WHERE client_id = 'fun_farm_client';

UPDATE oauth_clients SET 
  platform_name = 'Fun Play',
  description = 'Chơi game và giải trí trong Fun Ecosystem',
  website_url = 'https://play.fun.rich'
WHERE client_id = 'fun_play_client';

UPDATE oauth_clients SET 
  platform_name = 'Fun Planet',
  description = 'Mạng xã hội và kết nối trong Fun Ecosystem',
  website_url = 'https://planet.fun.rich'
WHERE client_id = 'fun_planet_client';

-- Thêm scope platform_data cho tất cả clients
UPDATE oauth_clients 
SET allowed_scopes = array_append(allowed_scopes, 'platform_data')
WHERE NOT ('platform_data' = ANY(allowed_scopes));

-- Migrate data cũ từ profiles.cross_platform_data sang platform_user_data (nếu có)
INSERT INTO platform_user_data (user_id, client_id, data, synced_at)
SELECT 
  p.id as user_id,
  key as client_id,
  COALESCE((value->>'data')::jsonb, value) as data,
  COALESCE((value->>'synced_at')::timestamptz, now()) as synced_at
FROM profiles p,
LATERAL jsonb_each(p.cross_platform_data) AS x(key, value)
WHERE p.cross_platform_data IS NOT NULL 
  AND p.cross_platform_data != '{}'::jsonb
ON CONFLICT (user_id, client_id) DO NOTHING;