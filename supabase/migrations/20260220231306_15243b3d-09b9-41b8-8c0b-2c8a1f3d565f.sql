-- Thêm 3 cột multisig vào bảng pplp_mint_requests
ALTER TABLE pplp_mint_requests
  ADD COLUMN IF NOT EXISTS multisig_signatures JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS multisig_required_groups TEXT[] DEFAULT ARRAY['will','wisdom','love'],
  ADD COLUMN IF NOT EXISTS multisig_completed_groups TEXT[] DEFAULT '{}';

-- Cập nhật status constraint nếu tồn tại (thêm 'signing')
-- Không cần ALTER constraint vì Supabase/Postgres không có strict enum check ở đây
-- Status 'signing' sẽ hoạt động tốt với cột text hiện tại

-- Comment: backward compatible - các request cũ vẫn có status pending_sig/signed bình thường
-- Các request mới sẽ đi qua: pending_sig → signing → signed → submitted → confirmed