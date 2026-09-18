
-- Phase 1B: SQL Comments for all 93 tables + 5 views

-- === CORE USER ===
COMMENT ON TABLE public.profiles IS 'User profiles — core identity + wallet + rewards + finance';
COMMENT ON TABLE public.user_roles IS 'RBAC roles (admin, moderator, user). Dùng với has_role()';

-- === SOCIAL ===
COMMENT ON TABLE public.posts IS 'User posts — content chính của feed';
COMMENT ON TABLE public.comments IS 'Comments trên posts, hỗ trợ nested (parent_comment_id)';
COMMENT ON TABLE public.reactions IS 'Reactions (like, love, etc.) trên posts';
COMMENT ON TABLE public.shared_posts IS 'Share/repost tracking';
COMMENT ON TABLE public.friendships IS 'Friend requests + accepted friendships';
COMMENT ON TABLE public.notifications IS 'User notifications — all types';
COMMENT ON TABLE public.post_tags IS 'Tags/hashtags cho posts';
COMMENT ON TABLE public.reports IS 'User reports (content moderation)';
COMMENT ON TABLE public.user_blocks IS 'User block list';

-- === MESSAGING ===
COMMENT ON TABLE public.conversations IS 'Chat conversations (direct + group)';
COMMENT ON TABLE public.conversation_participants IS 'Participants trong mỗi conversation';
COMMENT ON TABLE public.messages IS 'Chat messages trong conversations';
COMMENT ON TABLE public.message_reactions IS 'Emoji reactions trên chat messages';
COMMENT ON TABLE public.message_reads IS 'Read receipts cho chat messages';
COMMENT ON TABLE public.chat_settings IS 'Per-user chat preferences';
COMMENT ON TABLE public.sticker_packs IS 'Available sticker packs';
COMMENT ON TABLE public.stickers IS 'Individual stickers trong packs';

-- === LIVE STREAMING ===
COMMENT ON TABLE public.live_sessions IS 'Canonical live streaming sessions (Agora)';
COMMENT ON TABLE public.live_messages IS 'Canonical live chat messages';
COMMENT ON TABLE public.live_reactions IS 'Emoji reactions trong live sessions';
COMMENT ON TABLE public.live_co_hosts IS 'Co-host invitations cho live sessions';
COMMENT ON TABLE public.live_comments IS 'Legacy/unused — candidate for removal';
COMMENT ON TABLE public.live_recordings IS 'Agora cloud recording metadata';
COMMENT ON TABLE public.livestreams IS 'Legacy — dependency của get_user_rewards_v2';
COMMENT ON TABLE public.streams IS 'Legacy stream table';

-- === RECORDING ===
COMMENT ON TABLE public.chunked_recordings IS 'Browser-based chunked recording sessions';
COMMENT ON TABLE public.chunked_recording_chunks IS 'Individual chunks của recordings';

-- === LIGHT SCORE / REPUTATION ===
COMMENT ON TABLE public.light_actions IS 'Individual light score actions';
COMMENT ON TABLE public.light_reputation IS 'Aggregated light score per user — canonical SoT';
COMMENT ON TABLE public.user_dimension_scores IS '5-pillar dimension scores';

-- === REWARDS / FINANCIAL ===
COMMENT ON TABLE public.reward_claims IS 'Completed reward claims history';
COMMENT ON TABLE public.pending_claims IS 'In-progress reward claims';
COMMENT ON TABLE public.reward_approvals IS 'Admin approval/rejection records';
COMMENT ON TABLE public.reward_adjustments IS 'Manual reward adjustments';
COMMENT ON TABLE public.financial_transactions IS 'Raw financial transaction log';
COMMENT ON TABLE public.platform_financial_data IS 'Aggregated financial data per user per platform';
COMMENT ON TABLE public.fun_distribution_logs IS 'FUN token distribution tracking';
COMMENT ON TABLE public.fun_pool_config IS 'FUN token pool configuration';
COMMENT ON TABLE public.mint_allocations IS 'Daily mint allocation targets';
COMMENT ON TABLE public.mint_epochs IS 'Daily mint epoch summaries';
COMMENT ON TABLE public.reconciliation_logs IS 'Financial reconciliation audit trail';
COMMENT ON TABLE public.transactions IS 'Generic transaction log';
COMMENT ON TABLE public.platform_user_data IS 'Cross-platform user data';

-- === WALLET / CRYPTO ===
COMMENT ON TABLE public.custodial_wallets IS 'Server-managed wallets (encrypted private keys)';
COMMENT ON TABLE public.donations IS 'On-chain donations between users';
COMMENT ON TABLE public.crypto_gifts IS 'Crypto gift transfers trong chat';
COMMENT ON TABLE public.blacklisted_wallets IS 'Banned wallet addresses';
COMMENT ON TABLE public.soul_nfts IS 'Soul-bound NFT metadata per user';
COMMENT ON TABLE public.wallet_challenges IS 'Wallet ownership verification challenges';
COMMENT ON TABLE public.wallet_history IS 'Wallet connection/change history';
COMMENT ON TABLE public.red_envelopes IS 'Red envelope (lì xì) crypto gifts';
COMMENT ON TABLE public.red_envelope_claims IS 'Red envelope claim records';

-- === AUTH / SECURITY ===
COMMENT ON TABLE public.login_ip_logs IS 'IP logging cho mỗi login event';
COMMENT ON TABLE public.blacklisted_ips IS 'Banned IP addresses';
COMMENT ON TABLE public.email_verification_tokens IS 'Email verification tokens';
COMMENT ON TABLE public.account_activity_logs IS 'User account activity audit trail';
COMMENT ON TABLE public.audit_logs IS 'Admin action audit trail';
COMMENT ON TABLE public.account_merge_requests IS 'Cross-platform account merge requests';
COMMENT ON TABLE public.otp_codes IS 'One-time password codes';
COMMENT ON TABLE public.reserved_usernames IS 'Reserved/blocked usernames';
COMMENT ON TABLE public.rate_limit_state IS 'Server-side rate limiting state';
COMMENT ON TABLE public.username_history IS 'Username change history';
COMMENT ON TABLE public.pending_provisions IS 'Pending account provisions';
COMMENT ON TABLE public.slug_history IS 'Content slug change history';

-- === OAUTH / SSO ===
COMMENT ON TABLE public.oauth_clients IS 'Registered OAuth client applications';
COMMENT ON TABLE public.oauth_codes IS 'OAuth authorization codes (short-lived)';
COMMENT ON TABLE public.cross_platform_tokens IS 'OAuth access/refresh tokens';

-- === SEARCH ===
COMMENT ON TABLE public.search_history IS 'User search history (cloud-synced)';
COMMENT ON TABLE public.search_logs IS 'Legacy search logs — merge candidate';

-- === CONTENT / REELS ===
COMMENT ON TABLE public.reels IS 'Short-form video content';
COMMENT ON TABLE public.reel_comments IS 'Comments on reels';
COMMENT ON TABLE public.reel_likes IS 'Likes on reels';
COMMENT ON TABLE public.reel_shares IS 'Shares of reels';
COMMENT ON TABLE public.reel_views IS 'View tracking for reels';
COMMENT ON TABLE public.reel_bookmarks IS 'Bookmarked reels';
COMMENT ON TABLE public.reel_comment_likes IS 'Likes on reel comments';
COMMENT ON TABLE public.user_reel_preferences IS 'User reel algorithm preferences';

-- === SYSTEM ===
COMMENT ON TABLE public.system_config IS 'System-wide configuration';
COMMENT ON TABLE public.call_sessions IS 'Video/audio call sessions';
COMMENT ON TABLE public.call_participants IS 'Call participants tracking';

-- === PPLP ===
COMMENT ON TABLE public.pplp_mint_requests IS 'PPLP token mint requests';
COMMENT ON TABLE public.pplp_actions IS 'PPLP protocol actions';
COMMENT ON TABLE public.pplp_action_caps IS 'PPLP action rate limits';
COMMENT ON TABLE public.pplp_audits IS 'PPLP audit trail';
COMMENT ON TABLE public.pplp_device_registry IS 'PPLP device fingerprints';
COMMENT ON TABLE public.pplp_epoch_caps IS 'PPLP epoch mint caps';
COMMENT ON TABLE public.pplp_evidences IS 'PPLP action evidences';
COMMENT ON TABLE public.pplp_fraud_signals IS 'PPLP fraud detection signals';
COMMENT ON TABLE public.pplp_policies IS 'PPLP protocol policies';
COMMENT ON TABLE public.pplp_scores IS 'PPLP user scores';
COMMENT ON TABLE public.pplp_user_caps IS 'PPLP per-user caps';
COMMENT ON TABLE public.pplp_user_nonces IS 'PPLP replay protection nonces';
COMMENT ON TABLE public.pplp_user_tiers IS 'PPLP user tier assignments';

-- === VIEWS ===
COMMENT ON VIEW public.public_profiles IS 'Safe public projection — excludes admin/wallet/finance fields';
COMMENT ON VIEW public.public_light_reputation IS 'Public light reputation data';
COMMENT ON VIEW public.public_live_sessions IS 'Public live sessions — excludes agora internals';
COMMENT ON VIEW public.public_system_config IS 'Public system config — excludes treasury keys';
COMMENT ON VIEW public.user_custodial_wallets IS 'User wallet view — filtered by auth.uid()';
