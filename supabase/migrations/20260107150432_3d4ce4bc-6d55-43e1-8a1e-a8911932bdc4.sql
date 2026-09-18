-- Bảng quản lý yêu cầu merge user giữa các platform
CREATE TABLE public.account_merge_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Thông tin user gửi yêu cầu
  email TEXT NOT NULL,
  source_platform TEXT NOT NULL, -- 'fun_farm' hoặc 'fun_profile'
  source_user_id TEXT, -- ID từ platform gốc (có thể là UUID hoặc string)
  source_username TEXT,
  
  -- Thông tin target platform
  target_platform TEXT NOT NULL DEFAULT 'fun_profile',
  target_user_id UUID, -- Fun Profile user ID (nếu đã có)
  
  -- Data từ platform gốc cần import
  platform_data JSONB DEFAULT '{}',
  
  -- Trạng thái
  status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, completed
  merge_type TEXT NOT NULL, -- 'both_exist', 'profile_only', 'farm_only'
  
  -- Admin review
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  admin_note TEXT,
  
  -- Webhook info
  webhook_sent BOOLEAN DEFAULT false,
  webhook_sent_at TIMESTAMPTZ,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger update updated_at
CREATE TRIGGER update_account_merge_requests_updated_at
  BEFORE UPDATE ON public.account_merge_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.account_merge_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users có thể xem request của mình (dựa trên email)
CREATE POLICY "Users can view their own merge requests"
ON public.account_merge_requests FOR SELECT
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Policy: Admins có thể xem tất cả
CREATE POLICY "Admins can view all merge requests"
ON public.account_merge_requests FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Admins có thể update (approve/reject)
CREATE POLICY "Admins can update merge requests"
ON public.account_merge_requests FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Policy: Edge functions có thể insert (service role)
CREATE POLICY "Service role can insert merge requests"
ON public.account_merge_requests FOR INSERT
WITH CHECK (true);

-- Policy: Service role can update
CREATE POLICY "Service role can update merge requests"
ON public.account_merge_requests FOR UPDATE
USING (true);

-- Indexes
CREATE INDEX idx_merge_requests_email ON public.account_merge_requests(email);
CREATE INDEX idx_merge_requests_status ON public.account_merge_requests(status);
CREATE INDEX idx_merge_requests_source_platform ON public.account_merge_requests(source_platform);
CREATE INDEX idx_merge_requests_created_at ON public.account_merge_requests(created_at DESC);

-- Thêm cột webhook_url vào oauth_clients
ALTER TABLE public.oauth_clients ADD COLUMN IF NOT EXISTS webhook_url TEXT;