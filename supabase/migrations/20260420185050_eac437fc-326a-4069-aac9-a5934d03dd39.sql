-- ─────────────────────────────────────────────────────────────────────────
-- 0) Mở rộng CHECK constraint type cho notifications
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
CHECK (type = ANY (ARRAY[
  'like','love','care','wow','haha','pray','sad','angry',
  'comment','comment_like','comment_reply','share',
  'friend_request','friend_accept','friend_accepted','friend_removed',
  'reward_approved','reward_rejected','account_banned','account_unbanned',
  'donation','claim_reward',
  'admin_shared_device','admin_email_farm','admin_blacklisted_ip','admin_fraud_daily',
  'live_started','reward_adjustment','epoch_claim_ready',
  'epoch_reset_info'
]::text[]));

-- ─────────────────────────────────────────────────────────────────────────
-- 1) Hủy mint requests tháng 4/2026 chưa lên blockchain
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.pplp_mint_requests
SET 
  status = 'rejected',
  error_message = 'epoch_april_reset_premature_snapshot: Hủy do snapshot tháng 4 chưa đến hạn. Phân bổ chính thức sẽ mở vào 01/05/2026.',
  updated_at = now()
WHERE created_at >= '2026-04-01'
  AND created_at < '2026-05-01'
  AND status IN ('pending_sig', 'signing', 'signed', 'failed');

-- ─────────────────────────────────────────────────────────────────────────
-- 2) Xoá allocation pending còn sót cho epoch tháng 4
-- ─────────────────────────────────────────────────────────────────────────
DELETE FROM public.mint_allocations a
USING public.mint_epochs e
WHERE a.epoch_id = e.id
  AND e.epoch_month = '2026-04'
  AND a.status = 'pending';

-- ─────────────────────────────────────────────────────────────────────────
-- 3) Đảm bảo epoch tháng 4 về open, snapshot_at = NULL
-- ─────────────────────────────────────────────────────────────────────────
UPDATE public.mint_epochs
SET status = 'open',
    snapshot_at = NULL,
    updated_at = now()
WHERE epoch_month = '2026-04';

-- ─────────────────────────────────────────────────────────────────────────
-- 4) Insert notification dễ thương cho user bị ảnh hưởng
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.notifications (user_id, actor_id, type, read, metadata, created_at)
SELECT 
  affected.user_id,
  affected.user_id,
  'epoch_reset_info',
  false,
  jsonb_build_object(
    'epoch_month', '2026-04',
    'open_at', '2026-05-01',
    'title', '🌸 Phân bổ FUN tháng 4 sẽ chờ hết chu kỳ nhé bạn ơi',
    'message', 'Để đảm bảo công bằng cho tất cả thành viên trong gia đình FUN, phân bổ FUN Money của tháng 4/2026 sẽ chính thức mở vào ngày 01/05/2026 — sau khi chu kỳ kết thúc trọn vẹn. Mọi điểm sáng (Light Score) bạn tích lũy đến cuối tháng đều được tính đầy đủ nha! 💛 Hẹn gặp lại vào đầu tháng 5 với phần quà xứng đáng nhất.',
    'cta_text', 'Xem ví của tôi',
    'cta_url', '/wallet'
  ),
  now()
FROM (
  SELECT DISTINCT user_id
  FROM public.pplp_mint_requests
  WHERE created_at >= '2026-04-01'
    AND created_at < '2026-05-01'
    AND error_message LIKE 'epoch_april_reset_premature_snapshot%'
) affected;