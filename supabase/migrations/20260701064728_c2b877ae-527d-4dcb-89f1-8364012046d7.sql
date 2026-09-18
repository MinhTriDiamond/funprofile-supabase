-- M5-UX6c: drop legacy 12-param overload để PostgREST không còn ambiguous.
DROP FUNCTION IF EXISTS public.get_unified_transactions(
  uuid, text, text, text, text, text, timestamptz, timestamptz, text, integer, integer, boolean
);
