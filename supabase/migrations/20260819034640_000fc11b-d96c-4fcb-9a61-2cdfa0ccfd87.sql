DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'posts','post_attachments','post_tags','comments','reactions','shared_posts','reports','search_history',
    'conversations','conversation_participants','messages','message_reactions','message_reads','chat_settings',
    'stickers','sticker_packs','user_blocks',
    'reels','reel_comments','reel_comment_likes','reel_likes','reel_views','reel_shares','reel_bookmarks','user_reel_preferences',
    'live_sessions','live_replays','live_comments','live_messages','live_reactions','live_co_hosts','live_recordings',
    'live_recording_chunks','live_session_events','livestreams','streams','rtmp_stream_configs',
    'chunked_recordings','chunked_recording_chunks','call_sessions','call_participants','creator_library','video_upload_sessions',
    'pet_states','pet_cheers','pet_interactions','pet_cosmetics_catalog','pet_cosmetics_owned','pet_shop_config','pet_shop_orders',
    'pet_voice_lines','pet_battles','pet_battle_seasons','pet_battle_leaderboard','pet_risk_scores','pet_risk_signals','pet_risk_appeals',
    'mystery_box_definitions','mystery_box_inventory','mystery_box_open_log','mystery_box_orders','mystery_box_premium_grants',
    'mystery_box_rewards','mystery_box_risk_log','mystery_box_shop_config','mystery_box_stats_daily','mystery_box_grant_audit'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
  END LOOP;

  -- Ngoại lệ có chủ đích: khách chưa đăng nhập vẫn ghi được 1 dòng log tải video công khai
  EXECUTE 'REVOKE UPDATE, DELETE ON public.video_downloads FROM anon';
END $$;