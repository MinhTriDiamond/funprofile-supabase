-- Migration: enable Supabase Realtime (postgres_changes) for live tables
-- Date: 2026-10-17
--
-- Problem found during a live test on production (project tljfqavndndfsvtazibe):
-- chat messages were inserted into public.live_messages but never appeared on
-- other viewers' screens. Root cause: publication "supabase_realtime" contained
-- no tables at all, so postgres_changes emitted no events for any table.
-- The client hooks useLiveMessages / useLiveReactions / useLiveComments
-- subscribe to postgres_changes on these tables, so live chat, reactions and
-- comments were all silently broken in realtime.
--
-- This change was applied directly to production on 2026-10-17 and verified:
-- a retest live session showed messages from two different accounts appearing
-- instantly on the other side. This migration records the change in version
-- control so fresh environments get the same setup. It is idempotent and can
-- be re-run safely.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_reactions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_comments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_sessions;
  END IF;
END $$;
