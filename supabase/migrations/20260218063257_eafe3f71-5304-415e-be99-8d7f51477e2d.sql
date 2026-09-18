
-- Tạo bảng blacklisted_ips để monitor IP đáng ngờ
CREATE TABLE IF NOT EXISTS public.blacklisted_ips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_address TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  flagged_by UUID NULL,
  associated_usernames TEXT[] NULL,
  alert_on_login BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL
);

ALTER TABLE public.blacklisted_ips ENABLE ROW LEVEL SECURITY;

-- Chỉ admin mới đọc được
CREATE POLICY "Admins can manage blacklisted_ips"
ON public.blacklisted_ips
FOR ALL
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);
