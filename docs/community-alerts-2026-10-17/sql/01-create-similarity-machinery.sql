-- Community similarity alerts for FUN Profile (2026-10-17)
-- Detect look-alike usernames; alert the whole community (transparency model, no blocking).

CREATE OR REPLACE FUNCTION public.username_norm(p_username text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(coalesce(p_username, '')), '[^a-z0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.username_skeleton(p_norm text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text;
BEGIN
  SELECT string_agg(ch, '' ORDER BY ch) INTO v
  FROM regexp_split_to_table(coalesce(p_norm, ''), '') AS ch;
  RETURN coalesce(v, '');
END $$;

CREATE OR REPLACE FUNCTION public.username_dl1(p_a text, p_b text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  a text := p_a; b text := p_b;
  la int; lb int; i int; j int; d1 int; d2 int; tmp text;
BEGIN
  IF a = b THEN RETURN false; END IF;
  la := length(a); lb := length(b);
  IF abs(la - lb) > 1 THEN RETURN false; END IF;
  IF la = lb THEN
    d1 := 0; d2 := 0;
    FOR i IN 1..la LOOP
      IF substr(a, i, 1) <> substr(b, i, 1) THEN
        IF d1 = 0 THEN d1 := i; ELSIF d2 = 0 THEN d2 := i; ELSE RETURN false; END IF;
      END IF;
    END LOOP;
    IF d2 = 0 THEN RETURN true; END IF;  -- single substitution
    -- adjacent transposition
    RETURN d2 = d1 + 1
       AND substr(a, d1, 1) = substr(b, d2, 1)
       AND substr(a, d2, 1) = substr(b, d1, 1);
  END IF;
  -- length differs by 1: one deletion in the longer string must make them equal
  IF la > lb THEN tmp := a; a := b; b := tmp; la := length(a); lb := length(b); END IF;
  i := 1;
  WHILE i <= la AND substr(a, i, 1) = substr(b, i, 1) LOOP i := i + 1; END LOOP;
  RETURN substr(a, i) = substr(b, i + 1);
END $$;

-- Returns the similarity rule between two raw usernames, or NULL when not similar.
CREATE OR REPLACE FUNCTION public.usernames_similar(p_a text, p_b text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE na text := public.username_norm(p_a); nb text := public.username_norm(p_b);
BEGIN
  IF na = '' OR nb = '' THEN RETURN NULL; END IF;
  IF na = nb THEN RETURN 'normalized'; END IF;
  IF public.username_skeleton(na) = public.username_skeleton(nb) THEN RETURN 'skeleton'; END IF;
  IF public.username_dl1(na, nb) THEN RETURN 'edit1'; END IF;
  RETURN NULL;
END $$;

-- Registry of detected pairs (one row per unordered pair, ever).
CREATE TABLE IF NOT EXISTS public.username_similarity_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rule text NOT NULL,
  detected_via text NOT NULL DEFAULT 'trigger',
  alerted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT username_similarity_alerts_pair_unique UNIQUE (user_a, user_b),
  CONSTRAINT username_similarity_alerts_ordered CHECK (user_a < user_b)
);
ALTER TABLE public.username_similarity_alerts ENABLE ROW LEVEL SECURITY;

-- Broadcast one similarity alert to every user. Idempotent via the registry.
-- p_similar = the newer/appearing account; p_existing = the pre-existing one.
CREATE OR REPLACE FUNCTION public.broadcast_username_similarity_alert(
  p_similar uuid, p_existing uuid, p_rule text, p_note text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_a uuid := least(p_similar, p_existing);
  v_b uuid := greatest(p_similar, p_existing);
  v_reg_id uuid;
  v_meta jsonb;
  v_count integer;
  s record; e record;
BEGIN
  INSERT INTO public.username_similarity_alerts (user_a, user_b, rule)
  VALUES (v_a, v_b, p_rule)
  ON CONFLICT (user_a, user_b) DO NOTHING
  RETURNING id INTO v_reg_id;
  IF v_reg_id IS NULL THEN
    SELECT alerted_at IS NOT NULL INTO v_count FROM public.username_similarity_alerts
     WHERE user_a = v_a AND user_b = v_b;
    IF v_count THEN RETURN 0; END IF;  -- already broadcast before
    SELECT id INTO v_reg_id FROM public.username_similarity_alerts WHERE user_a = v_a AND user_b = v_b;
  END IF;
  SELECT id, username, created_at INTO s FROM public.profiles WHERE id = p_similar;
  SELECT id, username, created_at INTO e FROM public.profiles WHERE id = p_existing;
  v_meta := jsonb_build_object(
    'mode', 'single',
    'rule', p_rule,
    'note', p_note,
    'similar', jsonb_build_object('id', s.id, 'username', s.username, 'created_at', s.created_at),
    'existing', jsonb_build_object('id', e.id, 'username', e.username, 'created_at', e.created_at)
  );
  INSERT INTO public.notifications (user_id, actor_id, type, metadata)
  SELECT p.id, p_similar, 'username_similarity_alert', v_meta FROM public.profiles p;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.username_similarity_alerts SET alerted_at = now() WHERE id = v_reg_id;
  RETURN v_count;
END $$;

-- Detection used by the trigger: find look-alikes of one profile and alert for new pairs.
CREATE OR REPLACE FUNCTION public.detect_and_alert_username_similarity(p_profile_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me record; other record; v_rule text; v_total integer := 0; v_n integer;
BEGIN
  SELECT id, username INTO me FROM public.profiles WHERE id = p_profile_id;
  IF me.username IS NULL OR me.username = '' THEN RETURN 0; END IF;
  FOR other IN SELECT id, username FROM public.profiles WHERE id <> p_profile_id LOOP
    v_rule := public.usernames_similar(me.username, other.username);
    IF v_rule IS NOT NULL THEN
      v_n := public.broadcast_username_similarity_alert(me.id, other.id, v_rule, NULL);
      v_total := v_total + v_n;
    END IF;
  END LOOP;
  RETURN v_total;
END $$;

CREATE OR REPLACE FUNCTION public.trg_profiles_username_similarity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    PERFORM public.detect_and_alert_username_similarity(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'username similarity detection failed for %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_username_similarity ON public.profiles;
CREATE TRIGGER trg_profiles_username_similarity
  AFTER INSERT OR UPDATE OF username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_profiles_username_similarity();
