
DO $$ BEGIN CREATE TYPE public.box_tier AS ENUM ('common','rare','epic','legendary','cosmic');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.box_source AS ENUM ('daily_login','quest_complete','streak_7d','streak_30d','gift_sent','invite_t1','premium_purchase','event');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.box_reward_type AS ENUM ('ls','camly','pet_xp','pet_skin','cosmetic','sbt_trigger','box_upgrade');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.mystery_box_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name_vi TEXT NOT NULL,
  name_en TEXT NOT NULL,
  tier public.box_tier NOT NULL,
  source_type public.box_source NOT NULL,
  cost_camly BIGINT,
  drop_table JSONB NOT NULL DEFAULT '[]'::jsonb,
  icon TEXT,
  pity_threshold INT NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mystery_box_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mb_def_read" ON public.mystery_box_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "mb_def_admin" ON public.mystery_box_definitions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.mystery_box_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  type public.box_reward_type NOT NULL,
  value_int BIGINT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  rarity TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.mystery_box_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mb_rew_read" ON public.mystery_box_rewards FOR SELECT TO authenticated USING (true);
CREATE POLICY "mb_rew_admin" ON public.mystery_box_rewards FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.mystery_box_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  box_def_id UUID NOT NULL REFERENCES public.mystery_box_definitions(id) ON DELETE RESTRICT,
  source_event public.box_source NOT NULL,
  source_ref_id TEXT,
  opened_at TIMESTAMPTZ,
  reward_jsonb JSONB,
  pity_counter INT NOT NULL DEFAULT 0,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mb_inv_user ON public.mystery_box_inventory(user_id, opened_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mb_inv_idem ON public.mystery_box_inventory(user_id, source_event, source_ref_id) WHERE source_ref_id IS NOT NULL;
ALTER TABLE public.mystery_box_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mb_inv_read" ON public.mystery_box_inventory FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "mb_inv_admin" ON public.mystery_box_inventory FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.mystery_box_open_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  inventory_id UUID NOT NULL REFERENCES public.mystery_box_inventory(id) ON DELETE CASCADE,
  box_def_id UUID NOT NULL REFERENCES public.mystery_box_definitions(id),
  reward_id UUID REFERENCES public.mystery_box_rewards(id),
  rng_seed TEXT NOT NULL,
  reward_jsonb JSONB NOT NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mb_log_user ON public.mystery_box_open_log(user_id, opened_at DESC);
ALTER TABLE public.mystery_box_open_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mb_log_read" ON public.mystery_box_open_log FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "mb_log_admin" ON public.mystery_box_open_log FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
