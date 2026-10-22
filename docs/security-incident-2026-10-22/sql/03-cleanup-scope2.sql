-- Incident 2026-10-22 cleanup scope 2: every other artifact of account elqs3fz012
-- (mirror transactions rows incl. recipient-side copies, probe posts, probe comment, light actions)
-- All scopes archived in-DB first (RLS on, no API grants), local evidence exported separately.
CREATE TABLE public.security_incident_20261022_transactions AS
SELECT t.*, now() AS archived_at FROM public.transactions t
WHERE t.user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445'
   OR t.tx_hash IN (SELECT tx_hash FROM public.security_incident_20261022_donations WHERE tx_hash IS NOT NULL);
ALTER TABLE public.security_incident_20261022_transactions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.security_incident_20261022_posts AS
SELECT p.*, now() AS archived_at FROM public.posts p
WHERE p.user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445';
ALTER TABLE public.security_incident_20261022_posts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.security_incident_20261022_comments AS
SELECT c.*, now() AS archived_at FROM public.comments c
WHERE c.user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445';
ALTER TABLE public.security_incident_20261022_comments ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.security_incident_20261022_light_actions AS
SELECT l.*, now() AS archived_at FROM public.light_actions l
WHERE l.user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445';
ALTER TABLE public.security_incident_20261022_light_actions ENABLE ROW LEVEL SECURITY;
DELETE FROM public.transactions
WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445'
   OR tx_hash IN (SELECT tx_hash FROM public.security_incident_20261022_donations WHERE tx_hash IS NOT NULL);
DELETE FROM public.posts WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445';
DELETE FROM public.comments WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445';
DELETE FROM public.light_actions WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445';
SELECT (SELECT count(*) FROM public.security_incident_20261022_transactions) AS archived_transactions,
       (SELECT count(*) FROM public.security_incident_20261022_posts) AS archived_posts,
       (SELECT count(*) FROM public.security_incident_20261022_comments) AS archived_comments,
       (SELECT count(*) FROM public.security_incident_20261022_light_actions) AS archived_light_actions,
       (SELECT count(*) FROM public.transactions WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445') AS remaining_own_transactions,
       (SELECT count(*) FROM public.posts WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445') AS remaining_posts,
       (SELECT count(*) FROM public.light_actions WHERE user_id = 'c0adf0c4-6d67-4cae-96ff-2d54b8784445') AS remaining_light_actions;
