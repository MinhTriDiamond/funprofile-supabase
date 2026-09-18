-- Cleanup stale RTMP preview mapping cho session đang chờ OBS — chống "ghost preview" reuse VOD/replay cũ
UPDATE public.live_sessions
SET source_connected = false,
    preview_ready = false,
    preview_url = NULL,
    cloudflare_video_uid = NULL,
    hls_url = NULL,
    playback_url = NULL,
    connection_status = 'waiting',
    live_input_status = 'waiting',
    disconnected_at = NULL,
    last_disconnected_at = NULL,
    source_connected_at = NULL,
    connected_at = NULL,
    updated_at = now()
WHERE mode = 'rtmp_obs'
  AND status IN ('waiting_for_obs','source_connected','ready_to_go_live','failed')
  AND ended_at IS NULL;