export const POST_DETAIL_SELECT = `
  id, public_id, share_code, content, image_url, video_url, media_urls,
  created_at, updated_at, user_id, visibility, slug, post_type,
  replay_status, replay_ready, playback_provider, processing_message, metadata,
  profiles:public_profiles!posts_user_id_fkey (username, display_name, avatar_url, full_name, public_wallet_address, is_live, current_live_session_id, live_started_at),
  reactions (id, user_id, type),
  comments (id)
`;
