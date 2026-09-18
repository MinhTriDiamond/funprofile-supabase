
-- Step 1b: Clean up ghost sessions (keep only the latest per user)
UPDATE public.live_sessions
SET status = 'ended', ended_at = now(), updated_at = now()
WHERE status = 'live'
  AND id NOT IN (
    SELECT DISTINCT ON (host_user_id) id
    FROM public.live_sessions
    WHERE status = 'live'
    ORDER BY host_user_id, started_at DESC
  );

-- Step 1a: Unique partial index - only 1 active live per user
CREATE UNIQUE INDEX IF NOT EXISTS one_active_live_per_user
ON public.live_sessions(host_user_id)
WHERE status = 'live';

-- Step 1c: Add device_id column for tracking
ALTER TABLE public.live_sessions
ADD COLUMN IF NOT EXISTS device_id text;
