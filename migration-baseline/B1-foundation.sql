-- AUTO-GENERATED FUN Profile baseline
-- B1: foundation
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE TYPE public."app_role" AS ENUM ('admin', 'user');
CREATE TYPE public."attestation_type" AS ENUM ('peer_endorsement', 'mentor', 'recovery_guardian', 'witness');
CREATE TYPE public."box_reward_type" AS ENUM ('ls', 'camly', 'pet_xp', 'pet_skin', 'cosmetic', 'sbt_trigger', 'box_upgrade');
CREATE TYPE public."box_source" AS ENUM ('daily_login', 'quest_complete', 'streak_7d', 'streak_30d', 'gift_sent', 'invite_t1', 'premium_purchase', 'event');
CREATE TYPE public."box_tier" AS ENUM ('common', 'rare', 'epic', 'legendary', 'cosmic');
CREATE TYPE public."chain_status" AS ENUM ('active', 'maintenance', 'deprecated', 'disabled');
CREATE TYPE public."did_entity_type" AS ENUM ('human', 'organization', 'ai_agent', 'validator', 'merchant');
CREATE TYPE public."did_level" AS ENUM ('L0', 'L1', 'L2', 'L3', 'L4');
CREATE TYPE public."did_status" AS ENUM ('pending', 'basic', 'verified', 'trusted', 'restricted', 'suspended');
CREATE TYPE public."dispute_status" AS ENUM ('pending', 'under_review', 'accepted', 'rejected', 'withdrawn');
CREATE TYPE public."dispute_type" AS ENUM ('sbt_revoke', 'sbt_freeze', 'sybil_flag', 'trust_penalty', 'did_demotion');
CREATE TYPE public."identity_link_type" AS ENUM ('wallet', 'social', 'device', 'organization', 'email', 'phone');
CREATE TYPE public."link_verification_state" AS ENUM ('unverified', 'verified', 'revoked');
CREATE TYPE public."live_replay_status" AS ENUM ('uploading', 'queued', 'processing', 'ready', 'failed', 'skipped_legacy', 'awaiting_chunks', 'normalizing', 'expired');
CREATE TYPE public."pet_event_type" AS ENUM ('quest_completed', 'daily_streak_extended', 'streak_break', 'donation_sent', 'reaction_added', 'inactive_24h', 'midnight_utc', 'level_up', 'evolution', 'login', 'box_reward_xp', 'box_opened');
CREATE TYPE public."pet_mood" AS ENUM ('happy', 'calm', 'sad', 'excited', 'sleepy', 'hungry');
CREATE TYPE public."provider_health" AS ENUM ('healthy', 'degraded', 'dead', 'unknown');
CREATE TYPE public."provider_kind" AS ENUM ('rpc', 'indexer', 'explorer', 'webhook', 'utxo', 'price');
CREATE TYPE public."provider_mode" AS ENUM ('primary', 'secondary', 'backup', 'disabled');
CREATE TYPE public."quest_frequency" AS ENUM ('daily', 'weekly', 'once', 'per_event');
CREATE TYPE public."sbt_category" AS ENUM ('identity', 'trust', 'contribution', 'credential', 'milestone', 'legacy');
CREATE TYPE public."sbt_issuance_mode" AS ENUM ('auto', 'semi_auto', 'governance');
CREATE TYPE public."sbt_privacy" AS ENUM ('public', 'permissioned', 'private');
CREATE TYPE public."sbt_status" AS ENUM ('active', 'frozen', 'revoked', 'archived');
CREATE TYPE public."sybil_risk_level" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public."trust_tier" AS ENUM ('T0', 'T1', 'T2', 'T3', 'T4');

CREATE SEQUENCE public."live_messages_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;
CREATE SEQUENCE public."live_reactions_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;
CREATE SEQUENCE public."live_session_events_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;
CREATE SEQUENCE public."pet_interactions_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;
CREATE SEQUENCE public."posts_public_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;
CREATE SEQUENCE public."profiles_wallet_audit_id_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 NO CYCLE;

CREATE OR REPLACE FUNCTION public.gen_post_share_code()
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  code text := '';
  i int;
  bytes bytea;
BEGIN
  bytes := extensions.gen_random_bytes(10);
  FOR i IN 0..9 LOOP
    code := code || substr(alphabet, (get_byte(bytes, i) % 62) + 1, 1);
  END LOOP;
  RETURN code;
END;
$function$;

COMMIT;
