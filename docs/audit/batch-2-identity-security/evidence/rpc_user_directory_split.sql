-- Snapshot bằng chứng — Việc 2 (2026-08-16)
-- Nguồn usdt_received: CHỈ SUM từ public.donations (token_symbol IN ('USDT','BTCB'), recipient_id)
--   ⇒ không gộp reward/swap/wallet_transfers ⇒ giữ CÔNG KHAI (23 cột).
--
-- ACL thực tế sau migration (pg_proc.proacl), cả 2 function:
--   postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres
--   ⇒ KHÔNG có PUBLIC, KHÔNG có anon.
--
-- Gọi thật bằng publishable key (anon):
--   POST /rest/v1/rpc/get_user_directory_summary → 42501 permission denied for function get_user_directory_summary
--   POST /rest/v1/rpc/get_user_directory_admin   → 42501 permission denied for function get_user_directory_admin

-- A. Bản công khai — 23 cột, yêu cầu đăng nhập
-- RETURNS TABLE(id, username, full_name, avatar_url, wallet_address, created_at, is_banned,
--   posts_count, comments_count, reactions_on_posts, friends_count, shares_count, livestreams_count,
--   total_light_score, tier, total_minted, camly_calculated, camly_claimed, usdt_received,
--   internal_sent, internal_received, web3_sent, web3_received)
-- Guard:
--   IF auth.uid() IS NULL THEN
--     RAISE EXCEPTION 'permission denied: authentication required';
--   END IF;
REVOKE ALL ON FUNCTION public.get_user_directory_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_directory_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_directory_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_directory_summary() TO service_role;

-- B. Bản admin — đủ 28 cột (kể cả email, pending_reward, approved_reward, reward_status, camly_today)
-- Guard:
--   IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
--     RAISE EXCEPTION 'permission denied: admin role required';
--   END IF;
REVOKE ALL ON FUNCTION public.get_user_directory_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_directory_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_directory_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_directory_admin() TO service_role;
