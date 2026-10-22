-- Incident 2026-10-22 containment for account elqs3fz012 (c0adf0c4-6d67-4cae-96ff-2d54b8784445)
-- Approved by Tri 2026-10-22: not a team test - lock the account and isolate the 40 fake rows immediately.
-- 1) In-DB forensic archive of the 40 fake rows (RLS on, no API grants - locked by design)
CREATE TABLE public.security_incident_20261022_donations AS
SELECT d.*, now() AS archived_at
FROM public.donations d
WHERE d.sender_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445';
ALTER TABLE public.security_incident_20261022_donations ENABLE ROW LEVEL SECURITY;
-- 2) Ban the account for 100 years and kill every live session + refresh token
UPDATE auth.users
SET banned_until = now() + interval '100 years', updated_at = now()
WHERE id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445';
DELETE FROM auth.refresh_tokens
WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445');
DELETE FROM auth.sessions WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445';
-- 3) Remove the fake rows from donations (full copies live in the archive table + local evidence files)
DELETE FROM public.donations WHERE sender_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445';
-- Summary (surfaced as the last result set)
SELECT (SELECT count(*) FROM public.security_incident_20261022_donations) AS archived_rows,
       (SELECT count(*) FROM public.donations WHERE sender_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445') AS remaining_donations,
       (SELECT count(*) FROM auth.sessions WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445') AS remaining_sessions,
       (SELECT banned_until FROM auth.users WHERE id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445') AS banned_until;
