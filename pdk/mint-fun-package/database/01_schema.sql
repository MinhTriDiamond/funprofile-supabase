-- =============================================================
-- FUN Money Mint Package — 01_schema.sql
-- 15 tables + GRANT + RLS + POLICIES
-- Chạy 1 lần khi setup LoveHUB Supabase.
-- Yêu cầu: đã có bảng public.profiles (id uuid PK) và bảng
-- public.user_roles + function public.has_role() từ setup auth chuẩn.
-- =============================================================

--
-- PostgreSQL database dump
--

\restrict TDqQQ98scHq4ZumzHiP9WC7O7daSWkPh7vEwRO9W263hOUd15WD25p3EguCacVf

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: backlog_alert_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backlog_alert_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    alert_type text NOT NULL,
    action_name text NOT NULL,
    metric_value numeric NOT NULL,
    threshold_value numeric NOT NULL,
    message text NOT NULL,
    dedupe_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT backlog_alert_events_alert_type_check CHECK ((alert_type = ANY (ARRAY['soft_cap_exceeded'::text, 'eta_threshold_exceeded'::text])))
);


--
-- Name: epoch_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.epoch_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_key text NOT NULL,
    system_stage text DEFAULT 'bootstrap'::text NOT NULL,
    base_rate numeric DEFAULT 500000 NOT NULL,
    alpha numeric DEFAULT 100 NOT NULL,
    beta numeric DEFAULT 80 NOT NULL,
    gamma numeric DEFAULT 60 NOT NULL,
    delta numeric DEFAULT 50 NOT NULL,
    epsilon numeric DEFAULT 40 NOT NULL,
    zeta numeric DEFAULT 30 NOT NULL,
    soft_ceiling numeric DEFAULT 5000000 NOT NULL,
    min_epoch_mint numeric DEFAULT 100000 NOT NULL,
    modulator_min numeric DEFAULT 0.65 NOT NULL,
    modulator_max numeric DEFAULT 1.25 NOT NULL,
    user_pool_pct numeric DEFAULT 0.70 NOT NULL,
    ecosystem_pool_pct numeric DEFAULT 0.12 NOT NULL,
    treasury_pool_pct numeric DEFAULT 0.10 NOT NULL,
    strategic_pool_pct numeric DEFAULT 0.05 NOT NULL,
    resilience_pool_pct numeric DEFAULT 0.03 NOT NULL,
    instant_portion_pct numeric DEFAULT 0.15 NOT NULL,
    locked_portion_pct numeric DEFAULT 0.85 NOT NULL,
    base_vesting_days integer DEFAULT 28 NOT NULL,
    unlock_check_interval_days integer DEFAULT 7 NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    max_share_per_user numeric DEFAULT 0.03
);


--
-- Name: light_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.light_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    action_type text NOT NULL,
    reference_id uuid,
    reference_type text,
    content_preview text,
    base_reward numeric DEFAULT 0 NOT NULL,
    quality_score numeric DEFAULT 1.0 NOT NULL,
    impact_score numeric DEFAULT 1.0 NOT NULL,
    integrity_score numeric DEFAULT 1.0 NOT NULL,
    unity_score numeric DEFAULT 50 NOT NULL,
    unity_multiplier numeric DEFAULT 1.0 NOT NULL,
    light_score numeric DEFAULT 0 NOT NULL,
    is_eligible boolean DEFAULT false NOT NULL,
    mint_status text DEFAULT 'pending'::text NOT NULL,
    mint_amount numeric DEFAULT 0,
    tx_hash text,
    angel_evaluation jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    evaluated_at timestamp with time zone,
    minted_at timestamp with time zone,
    mint_request_id uuid,
    actor_id uuid,
    consistency_multiplier numeric DEFAULT 1.0,
    sequence_multiplier numeric DEFAULT 1.0,
    integrity_penalty numeric DEFAULT 1.0,
    streak_days integer DEFAULT 0,
    CONSTRAINT light_actions_action_type_check CHECK ((action_type = ANY (ARRAY['post'::text, 'comment'::text, 'reaction'::text, 'share'::text, 'friend'::text, 'livestream'::text, 'new_user_bonus'::text, 'question_ask'::text, 'feedback_give'::text, 'vision_create'::text, 'post_create'::text, 'content_create'::text, 'comment_create'::text, 'journal_write'::text, 'gratitude_practice'::text, 'help_community'::text, 'share_content'::text, 'idea_submit'::text, 'donate_support'::text, 'QUEST_REWARD'::text, 'INNER_WORK'::text, 'CHANNELING'::text, 'GIVING'::text, 'HELPING'::text, 'GRATITUDE'::text, 'SERVICE'::text]))),
    CONSTRAINT light_actions_impact_score_check CHECK (((impact_score >= 0.5) AND (impact_score <= 5.0))),
    CONSTRAINT light_actions_integrity_score_check CHECK (((integrity_score >= (0)::numeric) AND (integrity_score <= 1.0))),
    CONSTRAINT light_actions_mint_status_check CHECK ((mint_status = ANY (ARRAY['pending'::text, 'approved'::text, 'pending_sig'::text, 'minted'::text, 'rejected'::text, 'expired'::text, 'confirmed'::text, 'revoked'::text]))),
    CONSTRAINT light_actions_quality_score_check CHECK (((quality_score >= 0.5) AND (quality_score <= 3.0))),
    CONSTRAINT light_actions_unity_multiplier_check CHECK (((unity_multiplier >= 0.5) AND (unity_multiplier <= 2.5))),
    CONSTRAINT light_actions_unity_score_check CHECK (((unity_score >= (0)::numeric) AND (unity_score <= (100)::numeric)))
);


--
-- Name: TABLE light_actions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.light_actions IS 'Individual light score actions';


--
-- Name: mint_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mint_allocations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    epoch_id uuid NOT NULL,
    user_id uuid NOT NULL,
    light_score_total numeric DEFAULT 0 NOT NULL,
    share_percent numeric DEFAULT 0 NOT NULL,
    allocation_amount numeric DEFAULT 0 NOT NULL,
    allocation_amount_capped numeric DEFAULT 0 NOT NULL,
    is_eligible boolean DEFAULT true NOT NULL,
    reason_codes text[] DEFAULT '{}'::text[],
    status text DEFAULT 'pending'::text NOT NULL,
    mint_request_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    instant_amount numeric DEFAULT 0,
    locked_amount numeric DEFAULT 0,
    trust_band text DEFAULT 'standard'::text,
    vesting_schedule_id uuid,
    consistency_factor numeric DEFAULT 1.0,
    utility_factor numeric DEFAULT 1.0,
    CONSTRAINT mint_allocations_min_amount_when_pending CHECK (((status <> 'pending'::text) OR (allocation_amount_capped >= (100)::numeric) OR (allocation_amount_capped = (0)::numeric)))
);


--
-- Name: TABLE mint_allocations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mint_allocations IS 'Daily mint allocation targets';


--
-- Name: mint_epochs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mint_epochs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    epoch_date date NOT NULL,
    total_minted numeric DEFAULT 0 NOT NULL,
    total_cap numeric DEFAULT 10000000 NOT NULL,
    total_actions integer DEFAULT 0 NOT NULL,
    unique_users integer DEFAULT 0 NOT NULL,
    platform_pool jsonb DEFAULT '{"fun_profile": 0}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    epoch_month text,
    mint_pool numeric DEFAULT 100000,
    total_light_score numeric DEFAULT 0,
    eligible_users integer DEFAULT 0,
    status text DEFAULT 'open'::text,
    rules_version text DEFAULT 'LS-Math-v1.0'::text,
    snapshot_at timestamp with time zone,
    base_expansion numeric DEFAULT 0,
    contribution_expansion numeric DEFAULT 0,
    ecosystem_expansion numeric DEFAULT 0,
    discipline_modulator numeric DEFAULT 1.0,
    final_mint numeric DEFAULT 0,
    system_stage text DEFAULT 'bootstrap'::text,
    soft_ceiling numeric DEFAULT 5000000,
    verified_light_score numeric DEFAULT 0,
    verified_contribution_value numeric DEFAULT 0,
    ecosystem_usage_index numeric DEFAULT 0,
    active_quality_users integer DEFAULT 0,
    allocation_breakdown jsonb DEFAULT '{}'::jsonb
);


--
-- Name: TABLE mint_epochs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.mint_epochs IS 'Daily mint epoch summaries';


--
-- Name: pending_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    amount bigint NOT NULL,
    wallet_address text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_id uuid,
    admin_note text,
    tx_hash text,
    bscscan_url text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE pending_claims; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pending_claims IS 'In-progress reward claims';


--
-- Name: pplp_mint_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pplp_mint_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    recipient_address text NOT NULL,
    amount_wei text NOT NULL,
    amount_display numeric NOT NULL,
    evidence_hash text NOT NULL,
    action_types text[] DEFAULT '{}'::text[] NOT NULL,
    nonce bigint NOT NULL,
    deadline bigint,
    status text DEFAULT 'pending_sig'::text NOT NULL,
    signature text,
    signed_at timestamp with time zone,
    signed_by text,
    tx_hash text,
    submitted_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    block_number bigint,
    error_message text,
    retry_count integer DEFAULT 0 NOT NULL,
    action_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    action_name text DEFAULT 'light_action'::text NOT NULL,
    action_hash text,
    multisig_signatures jsonb DEFAULT '{}'::jsonb,
    multisig_required_groups text[] DEFAULT ARRAY['will'::text, 'wisdom'::text, 'love'::text],
    multisig_completed_groups text[] DEFAULT '{}'::text[],
    parent_request_id uuid
);


--
-- Name: TABLE pplp_mint_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pplp_mint_requests IS 'PPLP token mint requests';


--
-- Name: COLUMN pplp_mint_requests.action_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pplp_mint_requests.action_name IS 'Action name string passed to lockWithPPLP (e.g., light_action)';


--
-- Name: COLUMN pplp_mint_requests.action_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pplp_mint_requests.action_hash IS 'keccak256(bytes(action_name)) - must match contract PPLP_TYPEHASH';


--
-- Name: pplp_user_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pplp_user_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tier integer DEFAULT 0,
    trust_score numeric DEFAULT 50,
    cap_multiplier numeric DEFAULT 1.0,
    total_actions_scored integer DEFAULT 0,
    passed_actions integer DEFAULT 0,
    failed_actions integer DEFAULT 0,
    fraud_flags integer DEFAULT 0,
    last_device_hash text,
    known_device_hashes text[] DEFAULT '{}'::text[],
    last_tier_change timestamp with time zone,
    tier_change_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE pplp_user_tiers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pplp_user_tiers IS 'PPLP user tier assignments';


--
-- Name: pplp_v25_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pplp_v25_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_key text DEFAULT 'default'::text NOT NULL,
    alpha numeric DEFAULT 0.4 NOT NULL,
    beta numeric DEFAULT 0.3 NOT NULL,
    gamma numeric DEFAULT 0.3 NOT NULL,
    tier_thresholds jsonb DEFAULT '{"Pure Light": 100, "Seed Light": 0, "Cosmic Light": 50000, "Legacy Light": 10000, "Guiding Light": 500, "Radiant Light": 2000}'::jsonb NOT NULL,
    tier_multipliers jsonb DEFAULT '{"Pure Light": 1.0, "Seed Light": 0.5, "Cosmic Light": 5.0, "Legacy Light": 3.0, "Guiding Light": 1.5, "Radiant Light": 2.0}'::jsonb NOT NULL,
    iis_min numeric DEFAULT 0.0 NOT NULL,
    iis_max numeric DEFAULT 1.5 NOT NULL,
    im_min numeric DEFAULT 0.0 NOT NULL,
    im_max numeric DEFAULT 3.0 NOT NULL,
    display_compression text DEFAULT 'log'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pplp_v25_impact_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pplp_v25_impact_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_table text,
    source_id uuid,
    helped_users_count integer DEFAULT 0 NOT NULL,
    retention_lift numeric DEFAULT 0.0 NOT NULL,
    knowledge_value numeric DEFAULT 0.0 NOT NULL,
    referral_quality numeric DEFAULT 0.0 NOT NULL,
    im_value numeric DEFAULT 1.0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pplp_v25_impact_metrics_im_value_check CHECK (((im_value >= (0)::numeric) AND (im_value <= 3.0)))
);


--
-- Name: pplp_v25_intent_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pplp_v25_intent_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    consistency_score numeric DEFAULT 1.0 NOT NULL,
    farm_ratio numeric DEFAULT 0.0 NOT NULL,
    manipulation_score numeric DEFAULT 0.0 NOT NULL,
    purity_bonus numeric DEFAULT 0.0 NOT NULL,
    iis_value numeric DEFAULT 1.0 NOT NULL,
    computed_window_days integer DEFAULT 30 NOT NULL,
    last_computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pplp_v25_intent_metrics_iis_value_check CHECK (((iis_value >= (0)::numeric) AND (iis_value <= 1.5)))
);


--
-- Name: pplp_v25_light_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pplp_v25_light_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    epoch_label text,
    pls numeric DEFAULT 0 NOT NULL,
    nls numeric DEFAULT 0 NOT NULL,
    lls numeric DEFAULT 0 NOT NULL,
    tls numeric DEFAULT 0 NOT NULL,
    raw_ls numeric DEFAULT 0 NOT NULL,
    display_ls numeric DEFAULT 0 NOT NULL,
    consistency_multiplier numeric DEFAULT 1.0 NOT NULL,
    reliability_multiplier numeric DEFAULT 1.0 NOT NULL,
    alpha numeric DEFAULT 0.4 NOT NULL,
    beta numeric DEFAULT 0.3 NOT NULL,
    gamma numeric DEFAULT 0.3 NOT NULL,
    snapshot_at timestamp with time zone DEFAULT now() NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pplp_v25_stability_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pplp_v25_stability_index (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    snapshot_date date DEFAULT CURRENT_DATE NOT NULL,
    ls_volatility_30d numeric DEFAULT 0 NOT NULL,
    behavior_consistency numeric DEFAULT 1.0 NOT NULL,
    network_stability numeric DEFAULT 1.0 NOT NULL,
    stability_index numeric DEFAULT 1.0 NOT NULL,
    computed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pplp_v25_tier_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pplp_v25_tier_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tier_name text NOT NULL,
    tier_level integer DEFAULT 0 NOT NULL,
    tier_multiplier numeric DEFAULT 0.5 NOT NULL,
    raw_ls_at_assignment numeric DEFAULT 0 NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pplp_v25_vvu_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pplp_v25_vvu_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_table text NOT NULL,
    source_id uuid NOT NULL,
    vvu_type text DEFAULT 'personal'::text NOT NULL,
    base_value numeric DEFAULT 0 NOT NULL,
    quality_score numeric DEFAULT 1.0 NOT NULL,
    trust_context numeric DEFAULT 1.0 NOT NULL,
    iis_value numeric DEFAULT 1.0 NOT NULL,
    im_value numeric DEFAULT 1.0 NOT NULL,
    anti_abuse_factor numeric DEFAULT 1.0 NOT NULL,
    erp_factor numeric DEFAULT 1.0 NOT NULL,
    vvu_value numeric DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    computed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: backlog_alert_events backlog_alert_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backlog_alert_events
    ADD CONSTRAINT backlog_alert_events_pkey PRIMARY KEY (id);


--
-- Name: epoch_config epoch_config_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epoch_config
    ADD CONSTRAINT epoch_config_config_key_key UNIQUE (config_key);


--
-- Name: epoch_config epoch_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.epoch_config
    ADD CONSTRAINT epoch_config_pkey PRIMARY KEY (id);


--
-- Name: light_actions light_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.light_actions
    ADD CONSTRAINT light_actions_pkey PRIMARY KEY (id);


--
-- Name: mint_allocations mint_allocations_epoch_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mint_allocations
    ADD CONSTRAINT mint_allocations_epoch_id_user_id_key UNIQUE (epoch_id, user_id);


--
-- Name: mint_allocations mint_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mint_allocations
    ADD CONSTRAINT mint_allocations_pkey PRIMARY KEY (id);


--
-- Name: mint_epochs mint_epochs_epoch_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mint_epochs
    ADD CONSTRAINT mint_epochs_epoch_date_key UNIQUE (epoch_date);


--
-- Name: mint_epochs mint_epochs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mint_epochs
    ADD CONSTRAINT mint_epochs_pkey PRIMARY KEY (id);


--
-- Name: pending_claims pending_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_claims
    ADD CONSTRAINT pending_claims_pkey PRIMARY KEY (id);


--
-- Name: pplp_mint_requests pplp_mint_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_mint_requests
    ADD CONSTRAINT pplp_mint_requests_pkey PRIMARY KEY (id);


--
-- Name: pplp_user_tiers pplp_user_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_user_tiers
    ADD CONSTRAINT pplp_user_tiers_pkey PRIMARY KEY (id);


--
-- Name: pplp_user_tiers pplp_user_tiers_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_user_tiers
    ADD CONSTRAINT pplp_user_tiers_user_id_key UNIQUE (user_id);


--
-- Name: pplp_v25_config pplp_v25_config_config_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_v25_config
    ADD CONSTRAINT pplp_v25_config_config_key_key UNIQUE (config_key);


--
-- Name: pplp_v25_config pplp_v25_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_v25_config
    ADD CONSTRAINT pplp_v25_config_pkey PRIMARY KEY (id);


--
-- Name: pplp_v25_impact_metrics pplp_v25_impact_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_v25_impact_metrics
    ADD CONSTRAINT pplp_v25_impact_metrics_pkey PRIMARY KEY (id);


--
-- Name: pplp_v25_intent_metrics pplp_v25_intent_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_v25_intent_metrics
    ADD CONSTRAINT pplp_v25_intent_metrics_pkey PRIMARY KEY (id);


--
-- Name: pplp_v25_intent_metrics pplp_v25_intent_metrics_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_v25_intent_metrics
    ADD CONSTRAINT pplp_v25_intent_metrics_user_id_key UNIQUE (user_id);


--
-- Name: pplp_v25_light_scores pplp_v25_light_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_v25_light_scores
    ADD CONSTRAINT pplp_v25_light_scores_pkey PRIMARY KEY (id);


--
-- Name: pplp_v25_stability_index pplp_v25_stability_index_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_v25_stability_index
    ADD CONSTRAINT pplp_v25_stability_index_pkey PRIMARY KEY (id);


--
-- Name: pplp_v25_stability_index pplp_v25_stability_index_user_id_snapshot_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_v25_stability_index
    ADD CONSTRAINT pplp_v25_stability_index_user_id_snapshot_date_key UNIQUE (user_id, snapshot_date);


--
-- Name: pplp_v25_tier_assignments pplp_v25_tier_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_v25_tier_assignments
    ADD CONSTRAINT pplp_v25_tier_assignments_pkey PRIMARY KEY (id);


--
-- Name: pplp_v25_vvu_log pplp_v25_vvu_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_v25_vvu_log
    ADD CONSTRAINT pplp_v25_vvu_log_pkey PRIMARY KEY (id);


--
-- Name: idx_backlog_alert_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_backlog_alert_created_at ON public.backlog_alert_events USING btree (created_at DESC);


--
-- Name: idx_backlog_alert_dedupe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_backlog_alert_dedupe ON public.backlog_alert_events USING btree (dedupe_key);


--
-- Name: idx_light_actions_action_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_light_actions_action_type ON public.light_actions USING btree (action_type);


--
-- Name: idx_light_actions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_light_actions_created_at ON public.light_actions USING btree (created_at DESC);


--
-- Name: idx_light_actions_mint_request; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_light_actions_mint_request ON public.light_actions USING btree (mint_request_id);


--
-- Name: idx_light_actions_mint_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_light_actions_mint_status ON public.light_actions USING btree (mint_status);


--
-- Name: idx_light_actions_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_light_actions_reference ON public.light_actions USING btree (reference_type, reference_id);


--
-- Name: idx_light_actions_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_light_actions_user_created ON public.light_actions USING btree (user_id, created_at DESC);


--
-- Name: idx_light_actions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_light_actions_user_id ON public.light_actions USING btree (user_id);


--
-- Name: idx_light_actions_user_type_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_light_actions_user_type_day ON public.light_actions USING btree (user_id, action_type, created_at DESC);


--
-- Name: idx_mint_epochs_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mint_epochs_date ON public.mint_epochs USING btree (epoch_date DESC);


--
-- Name: idx_one_active_mint_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_active_mint_per_user ON public.pplp_mint_requests USING btree (user_id) WHERE (status = ANY (ARRAY['pending_sig'::text, 'signing'::text, 'signed'::text, 'submitted'::text]));


--
-- Name: idx_pending_claims_one_active_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pending_claims_one_active_per_user ON public.pending_claims USING btree (user_id) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_pplp_mint_requests_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pplp_mint_requests_created ON public.pplp_mint_requests USING btree (created_at DESC);


--
-- Name: idx_pplp_mint_requests_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pplp_mint_requests_parent ON public.pplp_mint_requests USING btree (parent_request_id) WHERE (parent_request_id IS NOT NULL);


--
-- Name: idx_pplp_mint_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pplp_mint_requests_status ON public.pplp_mint_requests USING btree (status);


--
-- Name: idx_pplp_mint_requests_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pplp_mint_requests_user ON public.pplp_mint_requests USING btree (user_id);


--
-- Name: idx_stability_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stability_user_date ON public.pplp_v25_stability_index USING btree (user_id, snapshot_date DESC);


--
-- Name: idx_v25_impact_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_v25_impact_source ON public.pplp_v25_impact_metrics USING btree (source_table, source_id);


--
-- Name: idx_v25_impact_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_v25_impact_user ON public.pplp_v25_impact_metrics USING btree (user_id);


--
-- Name: idx_v25_intent_iis; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_v25_intent_iis ON public.pplp_v25_intent_metrics USING btree (iis_value DESC);


--
-- Name: idx_v25_ls_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_v25_ls_current ON public.pplp_v25_light_scores USING btree (user_id, is_current) WHERE (is_current = true);


--
-- Name: idx_v25_ls_tls; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_v25_ls_tls ON public.pplp_v25_light_scores USING btree (tls DESC) WHERE (is_current = true);


--
-- Name: idx_v25_ls_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_v25_ls_user ON public.pplp_v25_light_scores USING btree (user_id);


--
-- Name: idx_v25_tier_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_v25_tier_user ON public.pplp_v25_tier_assignments USING btree (user_id);


--
-- Name: idx_v25_vvu_computed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_v25_vvu_computed ON public.pplp_v25_vvu_log USING btree (computed_at DESC);


--
-- Name: idx_v25_vvu_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_v25_vvu_source ON public.pplp_v25_vvu_log USING btree (source_table, source_id);


--
-- Name: idx_v25_vvu_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_v25_vvu_user ON public.pplp_v25_vvu_log USING btree (user_id);


--
-- Name: light_actions_actor_ref_type_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX light_actions_actor_ref_type_unique ON public.light_actions USING btree (actor_id, reference_id, action_type) WHERE ((actor_id IS NOT NULL) AND (reference_id IS NOT NULL));


--
-- Name: uq_v25_ls_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_v25_ls_current ON public.pplp_v25_light_scores USING btree (user_id) WHERE (is_current = true);


--
-- Name: uq_v25_tier_current; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_v25_tier_current ON public.pplp_v25_tier_assignments USING btree (user_id) WHERE (is_current = true);


--
-- Name: uq_v25_vvu_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_v25_vvu_source ON public.pplp_v25_vvu_log USING btree (source_table, source_id, vvu_type);


--
-- Name: pplp_mint_requests pplp_mint_notify_user_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pplp_mint_notify_user_trigger AFTER UPDATE OF status ON public.pplp_mint_requests FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.pplp_mint_notify_user();


--
-- Name: pplp_mint_requests trg_enforce_monthly_mint_cap; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_monthly_mint_cap BEFORE INSERT OR UPDATE OF amount_display, status ON public.pplp_mint_requests FOR EACH ROW EXECUTE FUNCTION public.enforce_monthly_mint_cap();


--
-- Name: epoch_config trg_epoch_config_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_epoch_config_updated BEFORE UPDATE ON public.epoch_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pplp_v25_config trg_v25_config_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_v25_config_updated BEFORE UPDATE ON public.pplp_v25_config FOR EACH ROW EXECUTE FUNCTION public.update_v25_updated_at();


--
-- Name: pplp_v25_intent_metrics trg_v25_intent_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_v25_intent_updated BEFORE UPDATE ON public.pplp_v25_intent_metrics FOR EACH ROW EXECUTE FUNCTION public.update_v25_updated_at();


--
-- Name: light_actions trg_v25_vvu_light_actions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_v25_vvu_light_actions AFTER INSERT OR UPDATE OF is_eligible ON public.light_actions FOR EACH ROW EXECUTE FUNCTION public.trigger_pplp_v25_vvu_calc();


--
-- Name: pplp_mint_requests trigger_pplp_mint_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_pplp_mint_requests_updated_at BEFORE UPDATE ON public.pplp_mint_requests FOR EACH ROW EXECUTE FUNCTION public.update_pplp_mint_requests_updated_at();


--
-- Name: light_actions trigger_update_epoch_on_mint; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_epoch_on_mint AFTER UPDATE ON public.light_actions FOR EACH ROW EXECUTE FUNCTION public.update_epoch_on_mint();


--
-- Name: light_actions trigger_update_reputation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_reputation AFTER INSERT ON public.light_actions FOR EACH ROW EXECUTE FUNCTION public.update_reputation_on_action();


--
-- Name: backlog_alert_events backlog_alert_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backlog_alert_events
    ADD CONSTRAINT backlog_alert_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: light_actions light_actions_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.light_actions
    ADD CONSTRAINT light_actions_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id);


--
-- Name: light_actions light_actions_mint_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.light_actions
    ADD CONSTRAINT light_actions_mint_request_id_fkey FOREIGN KEY (mint_request_id) REFERENCES public.pplp_mint_requests(id);


--
-- Name: light_actions light_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.light_actions
    ADD CONSTRAINT light_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: mint_allocations mint_allocations_epoch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mint_allocations
    ADD CONSTRAINT mint_allocations_epoch_id_fkey FOREIGN KEY (epoch_id) REFERENCES public.mint_epochs(id);


--
-- Name: mint_allocations mint_allocations_mint_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mint_allocations
    ADD CONSTRAINT mint_allocations_mint_request_id_fkey FOREIGN KEY (mint_request_id) REFERENCES public.pplp_mint_requests(id);


--
-- Name: pending_claims pending_claims_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_claims
    ADD CONSTRAINT pending_claims_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id);


--
-- Name: pending_claims pending_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_claims
    ADD CONSTRAINT pending_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pplp_mint_requests pplp_mint_requests_parent_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pplp_mint_requests
    ADD CONSTRAINT pplp_mint_requests_parent_request_id_fkey FOREIGN KEY (parent_request_id) REFERENCES public.pplp_mint_requests(id);


--
-- Name: mint_allocations Admins can manage allocations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage allocations" ON public.mint_allocations TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: epoch_config Admins can manage epoch config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage epoch config" ON public.epoch_config TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: mint_allocations Admins can read all allocations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can read all allocations" ON public.mint_allocations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pending_claims Admins can update claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update claims" ON public.pending_claims FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pplp_mint_requests Admins can update mint requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can update mint requests" ON public.pplp_mint_requests FOR UPDATE USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pending_claims Admins can view all claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all claims" ON public.pending_claims FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pplp_mint_requests Admins can view all mint requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all mint requests" ON public.pplp_mint_requests FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pplp_user_tiers Admins can view all tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all tiers" ON public.pplp_user_tiers FOR SELECT USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: backlog_alert_events Admins insert backlog alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins insert backlog alerts" ON public.backlog_alert_events FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: backlog_alert_events Admins read backlog alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins read backlog alerts" ON public.backlog_alert_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: epoch_config Anyone can view active epoch config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active epoch config" ON public.epoch_config FOR SELECT TO authenticated USING ((is_active = true));


--
-- Name: mint_epochs Anyone can view mint epochs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view mint epochs" ON public.mint_epochs FOR SELECT USING (true);


--
-- Name: pplp_mint_requests Attesters can sign pending and signing requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Attesters can sign pending and signing requests" ON public.pplp_mint_requests FOR UPDATE TO authenticated USING ((public.is_gov_attester(auth.uid()) AND (status = ANY (ARRAY['pending_sig'::text, 'signing'::text])))) WITH CHECK ((public.is_gov_attester(auth.uid()) AND (status = ANY (ARRAY['pending_sig'::text, 'signing'::text, 'signed'::text]))));


--
-- Name: pplp_mint_requests Attesters can view all pending and signing requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Attesters can view all pending and signing requests" ON public.pplp_mint_requests FOR SELECT TO authenticated USING ((public.is_gov_attester(auth.uid()) AND (status = ANY (ARRAY['pending_sig'::text, 'signing'::text, 'signed'::text]))));


--
-- Name: pplp_mint_requests Service role can insert mint requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert mint requests" ON public.pplp_mint_requests FOR INSERT WITH CHECK (true);


--
-- Name: pplp_mint_requests Service role can update mint requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update mint requests" ON public.pplp_mint_requests FOR UPDATE USING ((auth.role() = 'service_role'::text));


--
-- Name: pplp_user_tiers Service role manages tiers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages tiers" ON public.pplp_user_tiers USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: light_actions System can insert light actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert light actions" ON public.light_actions FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: light_actions System can update light actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can update light actions" ON public.light_actions FOR UPDATE USING ((auth.uid() = user_id));


--
-- Name: mint_allocations Users can claim own allocations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can claim own allocations" ON public.mint_allocations FOR UPDATE TO authenticated USING (((auth.uid() = user_id) AND (status = 'pending'::text))) WITH CHECK (((auth.uid() = user_id) AND (status = 'claimed'::text)));


--
-- Name: pending_claims Users can insert own claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own claims" ON public.pending_claims FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: mint_allocations Users can read own allocations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own allocations" ON public.mint_allocations FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: pending_claims Users can view own claims; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own claims" ON public.pending_claims FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: pplp_user_tiers Users can view own tier; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own tier" ON public.pplp_user_tiers FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: light_actions Users can view their own light actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own light actions" ON public.light_actions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: pplp_mint_requests Users can view their own mint requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own mint requests" ON public.pplp_mint_requests FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: backlog_alert_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backlog_alert_events ENABLE ROW LEVEL SECURITY;

--
-- Name: epoch_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.epoch_config ENABLE ROW LEVEL SECURITY;

--
-- Name: light_actions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.light_actions ENABLE ROW LEVEL SECURITY;

--
-- Name: mint_allocations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mint_allocations ENABLE ROW LEVEL SECURITY;

--
-- Name: mint_epochs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mint_epochs ENABLE ROW LEVEL SECURITY;

--
-- Name: pending_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pending_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: pplp_mint_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pplp_mint_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: pplp_user_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pplp_user_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: pplp_v25_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pplp_v25_config ENABLE ROW LEVEL SECURITY;

--
-- Name: pplp_v25_impact_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pplp_v25_impact_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: pplp_v25_intent_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pplp_v25_intent_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: pplp_v25_light_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pplp_v25_light_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: pplp_v25_stability_index; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pplp_v25_stability_index ENABLE ROW LEVEL SECURITY;

--
-- Name: pplp_v25_tier_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pplp_v25_tier_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: pplp_v25_vvu_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pplp_v25_vvu_log ENABLE ROW LEVEL SECURITY;

--
-- Name: light_actions service_role can update light_actions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "service_role can update light_actions" ON public.light_actions FOR UPDATE TO service_role USING (true) WITH CHECK (true);


--
-- Name: pplp_v25_stability_index stability_admin_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stability_admin_write ON public.pplp_v25_stability_index USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pplp_v25_stability_index stability_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY stability_self_read ON public.pplp_v25_stability_index FOR SELECT USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: pplp_v25_config v25_cfg_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_cfg_admin ON public.pplp_v25_config USING (public.has_role(auth.uid(), 'admin'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));


--
-- Name: pplp_v25_config v25_cfg_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_cfg_read ON public.pplp_v25_config FOR SELECT USING (true);


--
-- Name: pplp_v25_impact_metrics v25_impact_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_impact_select ON public.pplp_v25_impact_metrics FOR SELECT USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: pplp_v25_impact_metrics v25_impact_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_impact_service ON public.pplp_v25_impact_metrics USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: pplp_v25_intent_metrics v25_intent_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_intent_select ON public.pplp_v25_intent_metrics FOR SELECT USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: pplp_v25_intent_metrics v25_intent_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_intent_service ON public.pplp_v25_intent_metrics USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: pplp_v25_light_scores v25_ls_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_ls_select ON public.pplp_v25_light_scores FOR SELECT USING (((is_current = true) OR (auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: pplp_v25_light_scores v25_ls_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_ls_service ON public.pplp_v25_light_scores USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: pplp_v25_tier_assignments v25_tier_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_tier_select ON public.pplp_v25_tier_assignments FOR SELECT USING (((is_current = true) OR (auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: pplp_v25_tier_assignments v25_tier_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_tier_service ON public.pplp_v25_tier_assignments USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: pplp_v25_vvu_log v25_vvu_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_vvu_select ON public.pplp_v25_vvu_log FOR SELECT USING (((auth.uid() = user_id) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: pplp_v25_vvu_log v25_vvu_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY v25_vvu_service ON public.pplp_v25_vvu_log USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- PostgreSQL database dump complete
--

\unrestrict TDqQQ98scHq4ZumzHiP9WC7O7daSWkPh7vEwRO9W263hOUd15WD25p3EguCacVf


-- =============================================================
-- GRANTS (bắt buộc trên Supabase Data API)
-- =============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.light_actions TO authenticated;
GRANT ALL ON public.light_actions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mint_epochs TO authenticated;
GRANT ALL ON public.mint_epochs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mint_allocations TO authenticated;
GRANT ALL ON public.mint_allocations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pplp_mint_requests TO authenticated;
GRANT ALL ON public.pplp_mint_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_claims TO authenticated;
GRANT ALL ON public.pending_claims TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.epoch_config TO authenticated;
GRANT ALL ON public.epoch_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backlog_alert_events TO authenticated;
GRANT ALL ON public.backlog_alert_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pplp_user_tiers TO authenticated;
GRANT ALL ON public.pplp_user_tiers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pplp_v25_vvu_log TO authenticated;
GRANT ALL ON public.pplp_v25_vvu_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pplp_v25_intent_metrics TO authenticated;
GRANT ALL ON public.pplp_v25_intent_metrics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pplp_v25_impact_metrics TO authenticated;
GRANT ALL ON public.pplp_v25_impact_metrics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pplp_v25_light_scores TO authenticated;
GRANT ALL ON public.pplp_v25_light_scores TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pplp_v25_tier_assignments TO authenticated;
GRANT ALL ON public.pplp_v25_tier_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pplp_v25_stability_index TO authenticated;
GRANT ALL ON public.pplp_v25_stability_index TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pplp_v25_config TO authenticated;
GRANT ALL ON public.pplp_v25_config TO service_role;

-- Enable RLS
ALTER TABLE public.backlog_alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.epoch_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.light_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mint_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mint_epochs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_mint_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_user_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_v25_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_v25_impact_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_v25_intent_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_v25_light_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_v25_stability_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_v25_tier_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pplp_v25_vvu_log ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins insert backlog alerts" ON public.backlog_alert_events
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins read backlog alerts" ON public.backlog_alert_events
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "Admins can manage epoch config" ON public.epoch_config
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view active epoch config" ON public.epoch_config
  FOR SELECT
  TO authenticated
  USING ((is_active = true))
  WITH CHECK (true);
CREATE POLICY "System can insert light actions" ON public.light_actions
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "System can update light actions" ON public.light_actions
  FOR UPDATE
  TO public
  USING ((auth.uid() = user_id))
  WITH CHECK (true);
CREATE POLICY "Users can view their own light actions" ON public.light_actions
  FOR SELECT
  TO public
  USING ((auth.uid() = user_id))
  WITH CHECK (true);
CREATE POLICY "service_role can update light_actions" ON public.light_actions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Admins can manage allocations" ON public.mint_allocations
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can read all allocations" ON public.mint_allocations
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "Users can claim own allocations" ON public.mint_allocations
  FOR UPDATE
  TO authenticated
  USING (((auth.uid() = user_id) AND (status = 'pending'::text)))
  WITH CHECK (((auth.uid() = user_id) AND (status = 'claimed'::text)));
CREATE POLICY "Users can read own allocations" ON public.mint_allocations
  FOR SELECT
  TO authenticated
  USING ((auth.uid() = user_id))
  WITH CHECK (true);
CREATE POLICY "Anyone can view mint epochs" ON public.mint_epochs
  FOR SELECT
  TO public
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Admins can update claims" ON public.pending_claims
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "Admins can view all claims" ON public.pending_claims
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "Users can insert own claims" ON public.pending_claims
  FOR INSERT
  TO authenticated
  USING (true)
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can view own claims" ON public.pending_claims
  FOR SELECT
  TO authenticated
  USING ((user_id = auth.uid()))
  WITH CHECK (true);
CREATE POLICY "Admins can update mint requests" ON public.pplp_mint_requests
  FOR UPDATE
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "Admins can view all mint requests" ON public.pplp_mint_requests
  FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "Attesters can sign pending and signing requests" ON public.pplp_mint_requests
  FOR UPDATE
  TO authenticated
  USING ((is_gov_attester(auth.uid()) AND (status = ANY (ARRAY['pending_sig'::text, 'signing'::text]))))
  WITH CHECK ((is_gov_attester(auth.uid()) AND (status = ANY (ARRAY['pending_sig'::text, 'signing'::text, 'signed'::text]))));
CREATE POLICY "Attesters can view all pending and signing requests" ON public.pplp_mint_requests
  FOR SELECT
  TO authenticated
  USING ((is_gov_attester(auth.uid()) AND (status = ANY (ARRAY['pending_sig'::text, 'signing'::text, 'signed'::text]))))
  WITH CHECK (true);
CREATE POLICY "Service role can insert mint requests" ON public.pplp_mint_requests
  FOR INSERT
  TO public
  USING (true)
  WITH CHECK (true);
CREATE POLICY "Service role can update mint requests" ON public.pplp_mint_requests
  FOR UPDATE
  TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK (true);
CREATE POLICY "Users can view their own mint requests" ON public.pplp_mint_requests
  FOR SELECT
  TO public
  USING ((auth.uid() = user_id))
  WITH CHECK (true);
CREATE POLICY "Admins can view all tiers" ON public.pplp_user_tiers
  FOR SELECT
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (true);
CREATE POLICY "Service role manages tiers" ON public.pplp_user_tiers
  FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Users can view own tier" ON public.pplp_user_tiers
  FOR SELECT
  TO public
  USING ((auth.uid() = user_id))
  WITH CHECK (true);
CREATE POLICY v25_cfg_admin ON public.pplp_v25_config
  FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY v25_cfg_read ON public.pplp_v25_config
  FOR SELECT
  TO public
  USING (true)
  WITH CHECK (true);
CREATE POLICY v25_impact_select ON public.pplp_v25_impact_metrics
  FOR SELECT
  TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (true);
CREATE POLICY v25_impact_service ON public.pplp_v25_impact_metrics
  FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY v25_intent_select ON public.pplp_v25_intent_metrics
  FOR SELECT
  TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (true);
CREATE POLICY v25_intent_service ON public.pplp_v25_intent_metrics
  FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY v25_ls_select ON public.pplp_v25_light_scores
  FOR SELECT
  TO public
  USING (((is_current = true) OR (auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (true);
CREATE POLICY v25_ls_service ON public.pplp_v25_light_scores
  FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY stability_admin_write ON public.pplp_v25_stability_index
  FOR ALL
  TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY stability_self_read ON public.pplp_v25_stability_index
  FOR SELECT
  TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (true);
CREATE POLICY v25_tier_select ON public.pplp_v25_tier_assignments
  FOR SELECT
  TO public
  USING (((is_current = true) OR (auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (true);
CREATE POLICY v25_tier_service ON public.pplp_v25_tier_assignments
  FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY v25_vvu_select ON public.pplp_v25_vvu_log
  FOR SELECT
  TO public
  USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (true);
CREATE POLICY v25_vvu_service ON public.pplp_v25_vvu_log
  FOR ALL
  TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
