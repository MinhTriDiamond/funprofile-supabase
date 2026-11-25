-- Return only a boolean instead of exporting every row to an Edge Function.
CREATE FUNCTION public.has_post_video_stream_references(p_stream_uid text,p_excluded_job_id uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public SET statement_timeout='30s' AS $$
DECLARE pattern text;
BEGIN
 IF p_stream_uid IS NULL OR p_stream_uid !~ '^[a-f0-9]{32}$' OR p_excluded_job_id IS NULL THEN RAISE EXCEPTION 'Invalid Stream reference probe' USING ERRCODE='22023'; END IF;
 pattern:='%'||p_stream_uid||'%';
 RETURN EXISTS(SELECT 1 FROM public.live_replays WHERE stream_uid::text LIKE pattern OR cloudflare_video_uid::text LIKE pattern OR playback_hls LIKE pattern OR playback_dash LIKE pattern OR playback_mp4 LIKE pattern OR cloudflare_playback_url LIKE pattern)
 OR EXISTS(SELECT 1 FROM public.live_sessions WHERE cloudflare_video_uid::text LIKE pattern OR hls_url LIKE pattern OR playback_url LIKE pattern)
 OR EXISTS(SELECT 1 FROM public.posts WHERE video_url LIKE pattern OR media_urls::text LIKE pattern OR metadata::text LIKE pattern)
 OR EXISTS(SELECT 1 FROM public.post_attachments WHERE file_url LIKE pattern)
 OR EXISTS(SELECT 1 FROM public.comments WHERE video_url LIKE pattern)
 OR EXISTS(SELECT 1 FROM public.profiles WHERE cover_url LIKE pattern)
 OR EXISTS(SELECT 1 FROM public.post_video_processing_jobs WHERE id<>p_excluded_job_id AND stream_uid LIKE pattern);
END $$;
REVOKE ALL ON FUNCTION public.has_post_video_stream_references(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.has_post_video_stream_references(text,uuid) TO service_role;
