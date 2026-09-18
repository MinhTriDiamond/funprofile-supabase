-- Drop legacy overloads gây ambiguous trong PostgREST
DROP FUNCTION IF EXISTS public.get_donation_global_stats(text);
DROP FUNCTION IF EXISTS public.get_benefactor_leaderboard(integer, integer, text, text);
DROP FUNCTION IF EXISTS public.get_recipient_leaderboard(integer, integer, text);