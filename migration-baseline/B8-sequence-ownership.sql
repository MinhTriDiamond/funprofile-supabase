\set ON_ERROR_STOP on
BEGIN;

ALTER SEQUENCE public.live_messages_id_seq
  OWNED BY public.live_messages.id;

ALTER SEQUENCE public.live_reactions_id_seq
  OWNED BY public.live_reactions.id;

ALTER SEQUENCE public.live_session_events_id_seq
  OWNED BY public.live_session_events.id;

ALTER SEQUENCE public.pet_interactions_id_seq
  OWNED BY public.pet_interactions.id;

ALTER SEQUENCE public.profiles_wallet_audit_id_seq
  OWNED BY public.profiles_wallet_audit.id;

COMMIT;
