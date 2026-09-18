CREATE OR REPLACE FUNCTION public.get_profile_shared_posts(
  p_user_id uuid,
  p_limit integer DEFAULT 11,
  p_offset integer DEFAULT 0,
  p_cursor timestamptz DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_is_friend boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Mọi dòng shared_posts trả về đều có user_id = p_user_id, nên 2 điều kiện
  -- "chủ sở hữu" và "bạn bè" của chính dòng đó là HẰNG SỐ, tính 1 lần.
  v_is_owner := (v_uid IS NOT NULL AND p_user_id = v_uid);
  v_is_friend := public.is_friend(p_user_id);

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', sp.id,
    'user_id', sp.user_id,
    'original_post_id', sp.original_post_id,
    'created_at', sp.created_at,
    'caption', sp.caption,
    'visibility', sp.visibility,
    'posts', jsonb_build_object(
      'id', p.id,
      'slug', p.slug,
      'public_id', p.public_id,
      'share_code', p.share_code,
      'user_id', p.user_id,
      'content', p.content,
      'image_url', p.image_url,
      'video_url', p.video_url,
      'media_urls', p.media_urls,
      'created_at', p.created_at,
      'visibility', p.visibility,
      'post_type', p.post_type,
      'metadata', p.metadata,
      'replay_status', p.replay_status,
      'replay_ready', p.replay_ready,
      'playback_provider', p.playback_provider,
      'processing_message', p.processing_message,
      'gift_sender_id', p.gift_sender_id,
      'gift_recipient_id', p.gift_recipient_id,
      'gift_token', p.gift_token,
      'gift_amount', p.gift_amount,
      'gift_message', p.gift_message,
      'tx_hash', p.tx_hash,
      'is_highlighted', p.is_highlighted,
      'highlight_expires_at', p.highlight_expires_at,
      'deleted_at', p.deleted_at,
      'public_profiles', CASE WHEN pr.id IS NULL THEN NULL ELSE jsonb_build_object(
        'username', pr.username,
        'display_name', pr.display_name,
        'avatar_url', pr.avatar_url,
        'full_name', pr.full_name,
        'public_wallet_address', pr.public_wallet_address,
        'btc_address', pr.btc_address,
        'is_live', pr.is_live,
        'current_live_session_id', pr.current_live_session_id,
        'live_started_at', pr.live_started_at
      ) END
    )
  )
  FROM public.shared_posts sp
  JOIN public.posts p ON p.id = sp.original_post_id
  LEFT JOIN public.public_profiles pr ON pr.id = p.user_id
  WHERE sp.user_id = p_user_id
    AND (p_cursor IS NULL OR sp.created_at < p_cursor)
    -- nhánh hiển thị của dòng shared_posts (khớp RLS gốc, đã rút gọn hằng số)
    AND (sp.visibility = 'public' OR v_is_owner OR (sp.visibility = 'friends' AND v_is_friend))
    -- nhánh hiển thị của bài gốc (khớp RLS gốc)
    AND p.deleted_at IS NULL
    AND (
      p.visibility = 'public'
      OR (v_uid IS NOT NULL AND p.user_id = v_uid)
      OR (p.visibility = 'friends' AND public.is_friend(p.user_id))
    )
  ORDER BY sp.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 11), 0)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_profile_shared_posts(uuid, integer, integer, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_shared_posts(uuid, integer, integer, timestamptz) TO anon, authenticated, service_role;