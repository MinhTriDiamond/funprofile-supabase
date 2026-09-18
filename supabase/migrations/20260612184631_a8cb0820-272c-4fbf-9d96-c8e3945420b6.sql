
-- Backfill: hard-finalize 109 stuck agora_webcam sessions (5 live + 104 ending)
WITH stuck AS (
  SELECT id, post_id, host_user_id, owner_id, status, started_at
  FROM live_sessions
  WHERE mode='agora_webcam'
    AND ended_at IS NULL
    AND status IN ('live','ending')
)
UPDATE live_sessions ls
SET status='ended',
    ended_at=COALESCE(ls.ended_at, now()),
    end_reason=COALESCE(ls.end_reason, CASE WHEN ls.status='live' THEN 'host_disconnected_timeout_backfill' ELSE 'orphan_ending_backfill' END),
    host_connection_status='offline',
    recording_status=COALESCE(NULLIF(ls.recording_status,''), 'failed'),
    archive_status='unrecoverable',
    archive_next_retry_at=NULL,
    archive_error=COALESCE(ls.archive_error,'backfilled_stuck_session'),
    updated_at=now()
FROM stuck s
WHERE ls.id = s.id;

-- Log events
INSERT INTO live_session_events (live_session_id, from_status, to_status, source, reason, payload)
SELECT id, status, 'ended', 'stuck-promoter-backfill-2026-06-12',
       CASE WHEN status='live' THEN 'host_disconnected_timeout_backfill' ELSE 'orphan_ending_backfill' END,
       jsonb_build_object('live_session_id', id, 'host_user_id', host_user_id, 'backfill', true, 'previous_status', status, 'timestamp', now())
FROM live_sessions
WHERE mode='agora_webcam'
  AND status='ended'
  AND end_reason IN ('host_disconnected_timeout_backfill','orphan_ending_backfill')
  AND updated_at >= now() - interval '1 minute';

-- Re-sync orphan posts to live_replay
WITH backfilled AS (
  SELECT id, post_id, mode
  FROM live_sessions
  WHERE mode='agora_webcam'
    AND end_reason IN ('host_disconnected_timeout_backfill','orphan_ending_backfill')
    AND updated_at >= now() - interval '1 minute'
    AND post_id IS NOT NULL
)
UPDATE posts p
SET post_type='live_replay',
    video_url=NULL,
    replay_status='failed_no_recording',
    replay_ready=false,
    processing_message='Khong luu duoc video replay cho phien live nay.',
    metadata = COALESCE(p.metadata,'{}'::jsonb) || jsonb_build_object(
      'live_status','ended',
      'live_mode', b.mode,
      'live_session_id', b.id,
      'ended_at', now(),
      'end_reason','backfill_stuck',
      'replay_status','failed_no_recording',
      'replay_ready', false,
      'processing_message','Khong luu duoc video replay cho phien live nay.'
    ),
    updated_at=now()
FROM backfilled b
WHERE p.id = b.post_id
  AND (p.post_type = 'live' OR (p.metadata->>'live_status') = 'live');
