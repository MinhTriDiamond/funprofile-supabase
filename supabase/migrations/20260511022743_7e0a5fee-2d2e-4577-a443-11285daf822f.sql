UPDATE rtmp_stream_configs
   SET rtmps_url = REPLACE(rtmps_url, 'live.cloudflare.com', 'live.fun.rich'),
       updated_at = now()
 WHERE rtmps_url ILIKE '%live.cloudflare.com%';

UPDATE live_sessions
   SET rtmps_url = REPLACE(rtmps_url, 'live.cloudflare.com', 'live.fun.rich'),
       updated_at = now()
 WHERE rtmps_url ILIKE '%live.cloudflare.com%'
   AND mode = 'rtmp_obs';