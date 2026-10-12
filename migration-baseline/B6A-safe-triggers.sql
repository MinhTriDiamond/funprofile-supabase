-- FUN Profile baseline
-- B6A: safe triggers

\set ON_ERROR_STOP on
BEGIN;

-- account_merge_requests :: update_account_merge_requests_updated_at
CREATE TRIGGER update_account_merge_requests_updated_at BEFORE UPDATE ON account_merge_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- admin_backfill_jobs :: trg_abj_updated_at
CREATE TRIGGER trg_abj_updated_at BEFORE UPDATE ON admin_backfill_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ai_agent_profile :: trg_ai_agent_profile_updated
CREATE TRIGGER trg_ai_agent_profile_updated BEFORE UPDATE ON ai_agent_profile FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- app_secrets :: app_secrets_touch
CREATE TRIGGER app_secrets_touch BEFORE UPDATE ON app_secrets FOR EACH ROW EXECUTE FUNCTION app_secrets_touch_updated_at();

-- btc_aux_address_review_queue :: trg_btc_aux_review_queue_updated
CREATE TRIGGER trg_btc_aux_review_queue_updated BEFORE UPDATE ON btc_aux_address_review_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- btc_ownership_snapshot :: trg_btc_ownership_snapshot_updated_at
CREATE TRIGGER trg_btc_ownership_snapshot_updated_at BEFORE UPDATE ON btc_ownership_snapshot FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- btc_resolver_shadow_log :: trg_btc_shadow_log_classify
CREATE TRIGGER trg_btc_shadow_log_classify BEFORE INSERT ON btc_resolver_shadow_log FOR EACH ROW EXECUTE FUNCTION fn_btc_shadow_log_classify();

-- btc_resolver_shadow_log :: trg_btc_shadow_log_priority_flag
CREATE TRIGGER trg_btc_shadow_log_priority_flag BEFORE INSERT ON btc_resolver_shadow_log FOR EACH ROW EXECUTE FUNCTION fn_btc_shadow_log_priority_flag();

-- btc_resolver_shadow_log :: trg_btc_shadow_log_priority_notify
CREATE TRIGGER trg_btc_shadow_log_priority_notify AFTER INSERT ON btc_resolver_shadow_log FOR EACH ROW EXECUTE FUNCTION fn_btc_shadow_log_priority_notify();

-- btc_review_queue :: trg_btc_review_queue_updated_at
CREATE TRIGGER trg_btc_review_queue_updated_at BEFORE UPDATE ON btc_review_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- btc_tx_semantic :: trg_btc_tx_semantic_updated_at
CREATE TRIGGER trg_btc_tx_semantic_updated_at BEFORE UPDATE ON btc_tx_semantic FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- buddy_circles :: buddy_circles_updated_at
CREATE TRIGGER buddy_circles_updated_at BEFORE UPDATE ON buddy_circles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- chains_registry :: chains_registry_set_updated_at
CREATE TRIGGER chains_registry_set_updated_at BEFORE UPDATE ON chains_registry FOR EACH ROW EXECUTE FUNCTION tg_chains_registry_set_updated_at();

-- chat_settings :: update_chat_settings_updated_at
CREATE TRIGGER update_chat_settings_updated_at BEFORE UPDATE ON chat_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- comments :: enforce_comment_rate_limit
CREATE TRIGGER enforce_comment_rate_limit BEFORE INSERT ON comments FOR EACH ROW EXECUTE FUNCTION check_comment_rate_limit();

-- comments :: notify_on_comment
CREATE TRIGGER notify_on_comment AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION create_notification_on_comment();

-- comments :: trg_comment_rate_limit
CREATE TRIGGER trg_comment_rate_limit BEFORE INSERT ON comments FOR EACH ROW EXECUTE FUNCTION check_comment_rate_limit();

-- comments :: trg_outbox_comment_activity
CREATE TRIGGER trg_outbox_comment_activity AFTER INSERT ON comments FOR EACH ROW EXECUTE FUNCTION trg_emit_comment_activity();

-- connector_links :: trg_connector_links_updated
CREATE TRIGGER trg_connector_links_updated BEFORE UPDATE ON connector_links FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- connector_windows :: trg_connector_windows_updated
CREATE TRIGGER trg_connector_windows_updated BEFORE UPDATE ON connector_windows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- conversations :: update_conversations_updated_at
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- creator_library :: update_creator_library_updated_at
CREATE TRIGGER update_creator_library_updated_at BEFORE UPDATE ON creator_library FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- custodial_wallets :: trg_outbox_wallet_change
CREATE TRIGGER trg_outbox_wallet_change AFTER INSERT OR DELETE OR UPDATE ON custodial_wallets FOR EACH ROW EXECUTE FUNCTION trg_emit_wallet_change();

-- custodial_wallets :: update_custodial_wallets_updated_at
CREATE TRIGGER update_custodial_wallets_updated_at BEFORE UPDATE ON custodial_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- did_registry :: trg_did_updated_at
CREATE TRIGGER trg_did_updated_at BEFORE UPDATE ON did_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- did_registry :: trg_outbox_did_promoted
CREATE TRIGGER trg_outbox_did_promoted AFTER UPDATE ON did_registry FOR EACH ROW EXECUTE FUNCTION trg_emit_did_promoted();

-- donations :: trg_donations_set_usd_default
CREATE TRIGGER trg_donations_set_usd_default BEFORE INSERT OR UPDATE OF amount, token_symbol ON donations FOR EACH ROW EXECUTE FUNCTION donations_set_usd_default();

-- donations :: trg_set_donation_leaderboard_eligibility
CREATE TRIGGER trg_set_donation_leaderboard_eligibility BEFORE INSERT OR UPDATE OF sender_id, recipient_id, is_external ON donations FOR EACH ROW EXECUTE FUNCTION set_donation_leaderboard_eligibility();

-- donations :: trg_sync_donation_to_transactions
CREATE TRIGGER trg_sync_donation_to_transactions AFTER INSERT OR UPDATE OF status, tx_hash ON donations FOR EACH ROW EXECUTE FUNCTION sync_donation_to_transactions();

-- email_delivery_logs :: trg_email_delivery_logs_updated_at
CREATE TRIGGER trg_email_delivery_logs_updated_at BEFORE UPDATE ON email_delivery_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- epoch_config :: trg_epoch_config_updated
CREATE TRIGGER trg_epoch_config_updated BEFORE UPDATE ON epoch_config FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- external_wallet_labels :: trg_normalize_external_wallet_label
CREATE TRIGGER trg_normalize_external_wallet_label BEFORE INSERT OR UPDATE ON external_wallet_labels FOR EACH ROW EXECUTE FUNCTION normalize_external_wallet_label();

-- federation_sync_jobs :: trg_fed_jobs_touch
CREATE TRIGGER trg_fed_jobs_touch BEFORE UPDATE ON federation_sync_jobs FOR EACH ROW EXECUTE FUNCTION fp2a_touch_updated_at();

-- federation_sync_logs :: trg_fed_logs_touch
CREATE TRIGGER trg_fed_logs_touch BEFORE UPDATE ON federation_sync_logs FOR EACH ROW EXECUTE FUNCTION fp2a_touch_updated_at();

-- financial_transactions :: trigger_financial_transaction
CREATE TRIGGER trigger_financial_transaction AFTER INSERT ON financial_transactions FOR EACH ROW EXECUTE FUNCTION update_financial_from_transaction();

-- friendships :: on_friend_accepted
CREATE TRIGGER on_friend_accepted AFTER UPDATE ON friendships FOR EACH ROW EXECUTE FUNCTION create_friend_accepted_notification();

-- friendships :: on_friend_removed
CREATE TRIGGER on_friend_removed AFTER DELETE ON friendships FOR EACH ROW EXECUTE FUNCTION create_friend_removed_notification();

-- friendships :: on_friend_request
CREATE TRIGGER on_friend_request AFTER INSERT ON friendships FOR EACH ROW EXECUTE FUNCTION create_friend_request_notification();

-- friendships :: trg_outbox_follow_activity
CREATE TRIGGER trg_outbox_follow_activity AFTER INSERT ON friendships FOR EACH ROW EXECUTE FUNCTION trg_emit_follow_activity();

-- friendships :: trg_reward_friendship_accepted
CREATE TRIGGER trg_reward_friendship_accepted AFTER INSERT OR UPDATE OF status ON friendships FOR EACH ROW WHEN (new.status = 'accepted'::text) EXECUTE FUNCTION reward_friendship_accepted();

-- friendships :: update_friendships_updated_at
CREATE TRIGGER update_friendships_updated_at BEFORE UPDATE ON friendships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- fun_profile_event_outbox :: trg_outbox_touch
CREATE TRIGGER trg_outbox_touch BEFORE UPDATE ON fun_profile_event_outbox FOR EACH ROW EXECUTE FUNCTION fp2a_touch_updated_at();

-- i18n_languages :: trg_i18n_languages_updated_at
CREATE TRIGGER trg_i18n_languages_updated_at BEFORE UPDATE ON i18n_languages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- identity_disputes :: trg_disputes_updated_at
CREATE TRIGGER trg_disputes_updated_at BEFORE UPDATE ON identity_disputes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- identity_guardians :: trg_guardian_limit
CREATE TRIGGER trg_guardian_limit BEFORE INSERT OR UPDATE ON identity_guardians FOR EACH ROW EXECUTE FUNCTION check_guardian_limit();

-- identity_kyc_metrics :: trg_identity_kyc_metrics_updated_at
CREATE TRIGGER trg_identity_kyc_metrics_updated_at BEFORE UPDATE ON identity_kyc_metrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- identity_verifications :: trg_identity_verifications_updated_at
CREATE TRIGGER trg_identity_verifications_updated_at BEFORE UPDATE ON identity_verifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- impersonation_alerts :: trg_impersonation_alerts_updated_at
CREATE TRIGGER trg_impersonation_alerts_updated_at BEFORE UPDATE ON impersonation_alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- junk_token_contracts :: trg_junk_token_contracts_updated_at
CREATE TRIGGER trg_junk_token_contracts_updated_at BEFORE UPDATE ON junk_token_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- kyc_test_users :: trg_kyc_test_users_updated_at
CREATE TRIGGER trg_kyc_test_users_updated_at BEFORE UPDATE ON kyc_test_users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- light_actions :: trigger_update_epoch_on_mint
CREATE TRIGGER trigger_update_epoch_on_mint AFTER UPDATE ON light_actions FOR EACH ROW EXECUTE FUNCTION update_epoch_on_mint();

-- light_actions :: trigger_update_reputation
CREATE TRIGGER trigger_update_reputation AFTER INSERT ON light_actions FOR EACH ROW EXECUTE FUNCTION update_reputation_on_action();

-- live_replays :: trg_enforce_archive_failure_context
CREATE TRIGGER trg_enforce_archive_failure_context BEFORE INSERT OR UPDATE OF archive_status, archive_error, error_message ON live_replays FOR EACH ROW EXECUTE FUNCTION enforce_archive_failure_context();

-- live_replays :: trg_finalize_replay_r2_ready
CREATE TRIGGER trg_finalize_replay_r2_ready BEFORE INSERT OR UPDATE OF archive_status, replay_post_id, r2_video_url ON live_replays FOR EACH ROW EXECUTE FUNCTION finalize_replay_r2_ready();

-- live_replays :: trg_live_replays_updated_at
CREATE TRIGGER trg_live_replays_updated_at BEFORE UPDATE ON live_replays FOR EACH ROW EXECUTE FUNCTION update_live_replays_updated_at();

-- live_sessions :: track_live_slug_change
CREATE TRIGGER track_live_slug_change BEFORE UPDATE OF slug ON live_sessions FOR EACH ROW EXECUTE FUNCTION track_slug_change('live');

-- live_sessions :: trg_enforce_archive_failure_context
CREATE TRIGGER trg_enforce_archive_failure_context BEFORE INSERT OR UPDATE OF archive_status, archive_error ON live_sessions FOR EACH ROW EXECUTE FUNCTION enforce_archive_failure_context();

-- live_sessions :: trg_live_session_visibility_sync
CREATE TRIGGER trg_live_session_visibility_sync AFTER INSERT OR DELETE OR UPDATE OF status, ended_at, started_at, host_user_id, owner_id, user_id ON live_sessions FOR EACH ROW EXECUTE FUNCTION handle_live_session_visibility_sync();

-- live_sessions :: trg_live_sessions_state_guard
CREATE TRIGGER trg_live_sessions_state_guard BEFORE UPDATE ON live_sessions FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION live_sessions_state_guard();

-- live_sessions :: trg_outbox_live_activity
CREATE TRIGGER trg_outbox_live_activity AFTER INSERT OR UPDATE ON live_sessions FOR EACH ROW EXECUTE FUNCTION trg_emit_live_activity();

-- live_sessions :: trigger_auto_generate_live_slug
CREATE TRIGGER trigger_auto_generate_live_slug BEFORE INSERT ON live_sessions FOR EACH ROW EXECUTE FUNCTION auto_generate_live_slug();

-- live_sessions :: update_live_sessions_updated_at
CREATE TRIGGER update_live_sessions_updated_at BEFORE UPDATE ON live_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- m6b_gap_scan_batches :: trg_m6b_gap_batches_updated_at
CREATE TRIGGER trg_m6b_gap_batches_updated_at BEFORE UPDATE ON m6b_gap_scan_batches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- messages :: on_message_insert
CREATE TRIGGER on_message_insert AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- messages :: update_messages_updated_at
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- mystery_box_inventory :: trg_mb_inv_expiry
CREATE TRIGGER trg_mb_inv_expiry BEFORE INSERT ON mystery_box_inventory FOR EACH ROW EXECUTE FUNCTION mystery_box_set_expiry();

-- mystery_box_open_log :: pet_award_after_box_open_trg
CREATE TRIGGER pet_award_after_box_open_trg AFTER INSERT ON mystery_box_open_log FOR EACH ROW EXECUTE FUNCTION pet_award_after_box_open();

-- oauth_clients :: update_oauth_clients_updated_at
CREATE TRIGGER update_oauth_clients_updated_at BEFORE UPDATE ON oauth_clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- org_members :: trg_org_member_count
CREATE TRIGGER trg_org_member_count AFTER INSERT OR DELETE OR UPDATE ON org_members FOR EACH ROW EXECUTE FUNCTION sync_org_member_count();

-- org_profile :: trg_org_profile_updated
CREATE TRIGGER trg_org_profile_updated BEFORE UPDATE ON org_profile FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- pet_states :: pet_states_updated_at
CREATE TRIGGER pet_states_updated_at BEFORE UPDATE ON pet_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- pet_states :: trg_pet_states_freeze_system_columns
CREATE TRIGGER trg_pet_states_freeze_system_columns BEFORE UPDATE ON pet_states FOR EACH ROW EXECUTE FUNCTION pet_states_freeze_system_columns();

-- platform_financial_data :: trigger_update_grand_totals
CREATE TRIGGER trigger_update_grand_totals AFTER INSERT OR UPDATE ON platform_financial_data FOR EACH ROW EXECUTE FUNCTION update_profile_grand_totals();

-- platform_financial_data :: update_platform_financial_data_updated_at
CREATE TRIGGER update_platform_financial_data_updated_at BEFORE UPDATE ON platform_financial_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- platform_user_data :: update_platform_user_data_updated_at
CREATE TRIGGER update_platform_user_data_updated_at BEFORE UPDATE ON platform_user_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- posts :: enforce_post_rate_limit
CREATE TRIGGER enforce_post_rate_limit BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION check_post_rate_limit();

-- posts :: track_post_slug_change
CREATE TRIGGER track_post_slug_change BEFORE UPDATE OF slug ON posts FOR EACH ROW EXECUTE FUNCTION track_slug_change('post');

-- posts :: trg_outbox_post_activity
CREATE TRIGGER trg_outbox_post_activity AFTER INSERT OR DELETE OR UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION trg_emit_post_activity();

-- posts :: trg_posts_assign_public_codes
CREATE TRIGGER trg_posts_assign_public_codes BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION posts_assign_public_codes();

-- posts :: trg_posts_freeze_system_columns
CREATE TRIGGER trg_posts_freeze_system_columns BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION posts_freeze_system_columns();

-- posts :: trg_posts_lock_score_on_edit
CREATE TRIGGER trg_posts_lock_score_on_edit BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION posts_lock_score_on_edit();

-- posts :: trg_posts_sanitize_system_columns_on_insert
CREATE TRIGGER trg_posts_sanitize_system_columns_on_insert BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION posts_sanitize_system_columns_on_insert();

-- posts :: trigger_auto_generate_post_slug
CREATE TRIGGER trigger_auto_generate_post_slug BEFORE INSERT ON posts FOR EACH ROW EXECUTE FUNCTION auto_generate_post_slug();

-- posts :: update_posts_updated_at
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- pplp_daily_action_mint :: trg_pplp_daily_action_mint_touch
CREATE TRIGGER trg_pplp_daily_action_mint_touch BEFORE UPDATE ON pplp_daily_action_mint FOR EACH ROW EXECUTE FUNCTION pplp_daily_action_mint_touch();

-- pplp_mint_requests :: pplp_mint_notify_user_trigger
CREATE TRIGGER pplp_mint_notify_user_trigger AFTER UPDATE OF status ON pplp_mint_requests FOR EACH ROW WHEN (old.status IS DISTINCT FROM new.status) EXECUTE FUNCTION pplp_mint_notify_user();

-- pplp_mint_requests :: trg_enforce_monthly_mint_cap
CREATE TRIGGER trg_enforce_monthly_mint_cap BEFORE INSERT OR UPDATE OF amount_display, status ON pplp_mint_requests FOR EACH ROW EXECUTE FUNCTION enforce_monthly_mint_cap();

-- pplp_mint_requests :: trigger_pplp_mint_requests_updated_at
CREATE TRIGGER trigger_pplp_mint_requests_updated_at BEFORE UPDATE ON pplp_mint_requests FOR EACH ROW EXECUTE FUNCTION update_pplp_mint_requests_updated_at();

-- pplp_recovery_runs :: trg_pplp_recovery_runs_updated
CREATE TRIGGER trg_pplp_recovery_runs_updated BEFORE UPDATE ON pplp_recovery_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- pplp_v25_action_overrides :: trg_overrides_updated_at
CREATE TRIGGER trg_overrides_updated_at BEFORE UPDATE ON pplp_v25_action_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- pplp_v25_config :: trg_v25_config_updated
CREATE TRIGGER trg_v25_config_updated BEFORE UPDATE ON pplp_v25_config FOR EACH ROW EXECUTE FUNCTION update_v25_updated_at();

-- pplp_v25_event_base_values :: trg_events_touch
CREATE TRIGGER trg_events_touch BEFORE UPDATE ON pplp_v25_event_base_values FOR EACH ROW EXECUTE FUNCTION pplp_v25_touch_updated_at();

-- pplp_v25_intent_metrics :: trg_v25_intent_updated
CREATE TRIGGER trg_v25_intent_updated BEFORE UPDATE ON pplp_v25_intent_metrics FOR EACH ROW EXECUTE FUNCTION update_v25_updated_at();

-- pplp_v25_legacy_params :: trg_legacy_touch
CREATE TRIGGER trg_legacy_touch BEFORE UPDATE ON pplp_v25_legacy_params FOR EACH ROW EXECUTE FUNCTION pplp_v25_touch_updated_at();

-- pplp_v25_mint_linking_config :: trg_mint_link_touch
CREATE TRIGGER trg_mint_link_touch BEFORE UPDATE ON pplp_v25_mint_linking_config FOR EACH ROW EXECUTE FUNCTION pplp_v25_touch_updated_at();

-- pplp_v25_multiplier_ranges :: trg_validate_multiplier
CREATE TRIGGER trg_validate_multiplier BEFORE INSERT OR UPDATE ON pplp_v25_multiplier_ranges FOR EACH ROW EXECUTE FUNCTION pplp_v25_validate_multiplier();

-- pplp_v25_phase_config :: trg_phase_touch
CREATE TRIGGER trg_phase_touch BEFORE UPDATE ON pplp_v25_phase_config FOR EACH ROW EXECUTE FUNCTION pplp_v25_touch_updated_at();

-- pplp_v2_action_types :: trg_pplp_v2_action_types_updated
CREATE TRIGGER trg_pplp_v2_action_types_updated BEFORE UPDATE ON pplp_v2_action_types FOR EACH ROW EXECUTE FUNCTION pplp_v2_update_updated_at();

-- pplp_v2_attendance :: update_pplp_v2_attendance_updated_at
CREATE TRIGGER update_pplp_v2_attendance_updated_at BEFORE UPDATE ON pplp_v2_attendance FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- pplp_v2_balance_ledger :: trg_mystery_box_premium_check
CREATE TRIGGER trg_mystery_box_premium_check AFTER INSERT ON pplp_v2_balance_ledger FOR EACH ROW EXECUTE FUNCTION mystery_box_check_premium_grant();

-- pplp_v2_events :: update_pplp_v2_events_updated_at
CREATE TRIGGER update_pplp_v2_events_updated_at BEFORE UPDATE ON pplp_v2_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- pplp_v2_groups :: update_pplp_v2_groups_updated_at
CREATE TRIGGER update_pplp_v2_groups_updated_at BEFORE UPDATE ON pplp_v2_groups FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- pplp_v2_immutable_rules :: trg_prevent_immutable_rules_delete
CREATE TRIGGER trg_prevent_immutable_rules_delete BEFORE DELETE ON pplp_v2_immutable_rules FOR EACH ROW EXECUTE FUNCTION prevent_immutable_rules_modification();

-- pplp_v2_immutable_rules :: trg_prevent_immutable_rules_update
CREATE TRIGGER trg_prevent_immutable_rules_update BEFORE UPDATE ON pplp_v2_immutable_rules FOR EACH ROW EXECUTE FUNCTION prevent_immutable_rules_modification();

-- pplp_v2_review_queue :: update_pplp_v2_review_queue_updated_at
CREATE TRIGGER update_pplp_v2_review_queue_updated_at BEFORE UPDATE ON pplp_v2_review_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- pplp_v2_user_actions :: trg_pplp_v2_user_actions_updated
CREATE TRIGGER trg_pplp_v2_user_actions_updated BEFORE UPDATE ON pplp_v2_user_actions FOR EACH ROW EXECUTE FUNCTION pplp_v2_update_updated_at();

-- pplp_v2_validations :: trg_pplp_v2_validations_updated
CREATE TRIGGER trg_pplp_v2_validations_updated BEFORE UPDATE ON pplp_v2_validations FOR EACH ROW EXECUTE FUNCTION pplp_v2_update_updated_at();

-- profile_btc_aux_addresses :: trg_guard_btc_aux_no_overlap
CREATE TRIGGER trg_guard_btc_aux_no_overlap BEFORE INSERT OR UPDATE OF address ON profile_btc_aux_addresses FOR EACH ROW EXECUTE FUNCTION guard_btc_aux_no_overlap();

-- profiles :: check_reserved_username_trigger
CREATE TRIGGER check_reserved_username_trigger BEFORE INSERT OR UPDATE OF username ON profiles FOR EACH ROW EXECUTE FUNCTION check_reserved_username();

-- profiles :: check_username_format
CREATE TRIGGER check_username_format BEFORE INSERT OR UPDATE OF username ON profiles FOR EACH ROW EXECUTE FUNCTION validate_username_format();

-- profiles :: cleanup_profile_files_trigger
CREATE TRIGGER cleanup_profile_files_trigger BEFORE DELETE OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION cleanup_profile_files();

-- profiles :: track_username_change
CREATE TRIGGER track_username_change AFTER UPDATE OF username ON profiles FOR EACH ROW EXECUTE FUNCTION track_username_change();

-- profiles :: trg_audit_wallet_changes
CREATE TRIGGER trg_audit_wallet_changes AFTER UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION audit_wallet_changes();

-- profiles :: trg_btc_address_lock
CREATE TRIGGER trg_btc_address_lock BEFORE UPDATE OF btc_address ON profiles FOR EACH ROW EXECUTE FUNCTION enforce_btc_address_lock();

-- profiles :: trg_connector_open_window_insert
CREATE TRIGGER trg_connector_open_window_insert AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION connector_open_window_on_profile();

-- profiles :: trg_connector_open_window_update
CREATE TRIGGER trg_connector_open_window_update AFTER UPDATE OF custodial_wallet_address, wallet_address ON profiles FOR EACH ROW WHEN (old.custodial_wallet_address IS NULL AND new.custodial_wallet_address IS NOT NULL OR old.wallet_address IS NULL AND new.wallet_address IS NOT NULL) EXECUTE FUNCTION connector_open_window_on_profile();

-- profiles :: trg_create_pet_for_new_user
CREATE TRIGGER trg_create_pet_for_new_user AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION create_pet_for_new_user();

-- profiles :: trg_normalize_wallet_addresses
CREATE TRIGGER trg_normalize_wallet_addresses BEFORE INSERT OR UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION normalize_wallet_addresses();

-- profiles :: trg_outbox_profile_completed
CREATE TRIGGER trg_outbox_profile_completed AFTER UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION trg_emit_profile_completed();

-- profiles :: trg_outbox_profile_updated
CREATE TRIGGER trg_outbox_profile_updated AFTER UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION trg_emit_profile_updated();

-- profiles :: trg_prevent_wallet_hijack
CREATE TRIGGER trg_prevent_wallet_hijack BEFORE INSERT OR UPDATE OF public_wallet_address, external_wallet_address, wallet_address, custodial_wallet_address ON profiles FOR EACH ROW EXECUTE FUNCTION prevent_wallet_hijack();

-- profiles :: trg_sync_reward_on_ban
CREATE TRIGGER trg_sync_reward_on_ban BEFORE UPDATE ON profiles FOR EACH ROW WHEN (old.is_banned IS DISTINCT FROM new.is_banned) EXECUTE FUNCTION sync_reward_status_on_ban();

-- profiles :: trg_wallet_kill_switch
CREATE TRIGGER trg_wallet_kill_switch BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION enforce_wallet_kill_switch();

-- profiles :: trg_wallet_writer_guard
CREATE TRIGGER trg_wallet_writer_guard BEFORE UPDATE OF wallet_address, public_wallet_address, external_wallet_address, btc_address ON profiles FOR EACH ROW EXECUTE FUNCTION fn_wallet_writer_guard();

-- profiles :: trigger_create_soul_nft
CREATE TRIGGER trigger_create_soul_nft AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION create_soul_nft_for_new_user();

-- profiles :: trigger_generate_fun_id
CREATE TRIGGER trigger_generate_fun_id BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION generate_fun_id();

-- profiles :: update_profiles_updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- provider_registry :: provider_registry_set_updated_at
CREATE TRIGGER provider_registry_set_updated_at BEFORE UPDATE ON provider_registry FOR EACH ROW EXECUTE FUNCTION tg_provider_registry_set_updated_at();

-- quest_definitions :: quest_def_updated
CREATE TRIGGER quest_def_updated BEFORE UPDATE ON quest_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- quest_user_progress :: quest_progress_updated
CREATE TRIGGER quest_progress_updated BEFORE UPDATE ON quest_user_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- reactions :: comment_like_notification_trigger
CREATE TRIGGER comment_like_notification_trigger AFTER INSERT ON reactions FOR EACH ROW WHEN (new.comment_id IS NOT NULL) EXECUTE FUNCTION create_notification_on_comment_like();

-- reactions :: notify_on_like
CREATE TRIGGER notify_on_like AFTER INSERT ON reactions FOR EACH ROW EXECUTE FUNCTION create_notification_on_like();

-- reactions :: trg_outbox_reaction_activity
CREATE TRIGGER trg_outbox_reaction_activity AFTER INSERT ON reactions FOR EACH ROW EXECUTE FUNCTION trg_emit_reaction_activity();

-- reactions :: trg_reaction_rate_limit
CREATE TRIGGER trg_reaction_rate_limit BEFORE INSERT ON reactions FOR EACH ROW EXECUTE FUNCTION check_reaction_rate_limit();

-- reels :: track_reel_slug_change
CREATE TRIGGER track_reel_slug_change BEFORE UPDATE OF slug ON reels FOR EACH ROW EXECUTE FUNCTION track_slug_change('reel');

-- reels :: trigger_auto_generate_reel_slug
CREATE TRIGGER trigger_auto_generate_reel_slug BEFORE INSERT ON reels FOR EACH ROW EXECUTE FUNCTION auto_generate_reel_slug();

-- reels :: update_reels_updated_at
CREATE TRIGGER update_reels_updated_at BEFORE UPDATE ON reels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- reward_vesting_schedules :: trg_vesting_updated
CREATE TRIGGER trg_vesting_updated BEFORE UPDATE ON reward_vesting_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- rtmp_stream_configs :: trg_rtmp_stream_configs_updated_at
CREATE TRIGGER trg_rtmp_stream_configs_updated_at BEFORE UPDATE ON rtmp_stream_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- sbt_registry :: trg_outbox_sbt_change
CREATE TRIGGER trg_outbox_sbt_change AFTER INSERT OR DELETE OR UPDATE ON sbt_registry FOR EACH ROW EXECUTE FUNCTION trg_emit_sbt_change();

-- sbt_registry :: trg_sbt_non_transferable
CREATE TRIGGER trg_sbt_non_transferable BEFORE UPDATE ON sbt_registry FOR EACH ROW EXECUTE FUNCTION sbt_enforce_non_transferable();

-- scanner_block_gaps :: scanner_block_gaps_updated_at
CREATE TRIGGER scanner_block_gaps_updated_at BEFORE UPDATE ON scanner_block_gaps FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- scanner_watermarks :: scanner_watermarks_updated_at
CREATE TRIGGER scanner_watermarks_updated_at BEFORE UPDATE ON scanner_watermarks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- search_logs :: check_search_rate_limit_trigger
CREATE TRIGGER check_search_rate_limit_trigger BEFORE INSERT ON search_logs FOR EACH ROW EXECUTE FUNCTION check_search_rate_limit();

-- shared_posts :: trg_outbox_share_activity
CREATE TRIGGER trg_outbox_share_activity AFTER INSERT ON shared_posts FOR EACH ROW EXECUTE FUNCTION trg_emit_share_activity();

-- soul_nfts :: update_soul_nfts_updated_at
CREATE TRIGGER update_soul_nfts_updated_at BEFORE UPDATE ON soul_nfts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- stale_account_reminder_log :: trg_stale_reminder_updated_at
CREATE TRIGGER trg_stale_reminder_updated_at BEFORE UPDATE ON stale_account_reminder_log FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- swap_failures :: update_swap_failures_updated_at
CREATE TRIGGER update_swap_failures_updated_at BEFORE UPDATE ON swap_failures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- swap_transactions :: trg_swap_price_validation_logonly
CREATE TRIGGER trg_swap_price_validation_logonly AFTER INSERT ON swap_transactions FOR EACH ROW EXECUTE FUNCTION swap_price_validation_logonly();

-- token_price_current :: trg_token_price_current_touch
CREATE TRIGGER trg_token_price_current_touch BEFORE UPDATE ON token_price_current FOR EACH ROW EXECUTE FUNCTION token_price_current_touch();

-- tokens_registry :: tokens_registry_touch_trg
CREATE TRIGGER tokens_registry_touch_trg BEFORE UPDATE ON tokens_registry FOR EACH ROW EXECUTE FUNCTION tokens_registry_touch();

-- transactions :: trg_guard_transactions_amount_scale
CREATE TRIGGER trg_guard_transactions_amount_scale BEFORE INSERT ON transactions FOR EACH ROW EXECUTE FUNCTION guard_transactions_amount_scale();

-- treasury_vaults :: trg_treasury_vaults_updated
CREATE TRIGGER trg_treasury_vaults_updated BEFORE UPDATE ON treasury_vaults FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- trust_profile :: trg_outbox_trust_updated
CREATE TRIGGER trg_outbox_trust_updated AFTER INSERT OR UPDATE ON trust_profile FOR EACH ROW EXECUTE FUNCTION trg_emit_trust_updated();

-- user_watched_wallets :: trg_normalize_user_watched_wallet
CREATE TRIGGER trg_normalize_user_watched_wallet BEFORE INSERT OR UPDATE ON user_watched_wallets FOR EACH ROW EXECUTE FUNCTION normalize_user_watched_wallet();

-- validator_profile :: trg_validator_profile_updated
CREATE TRIGGER trg_validator_profile_updated BEFORE UPDATE ON validator_profile FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- validator_profile :: trg_validator_slash_event
CREATE TRIGGER trg_validator_slash_event AFTER UPDATE ON validator_profile FOR EACH ROW EXECUTE FUNCTION log_validator_slash();

-- video_upload_sessions :: trg_vus_updated_at
CREATE TRIGGER trg_vus_updated_at BEFORE UPDATE ON video_upload_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- wallet_custom_tokens :: update_wallet_custom_tokens_updated_at
CREATE TRIGGER update_wallet_custom_tokens_updated_at BEFORE UPDATE ON wallet_custom_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- wallet_transfers :: trg_sync_wallet_transfer_to_transactions
CREATE TRIGGER trg_sync_wallet_transfer_to_transactions AFTER INSERT OR UPDATE OF tx_hash, status ON wallet_transfers FOR EACH ROW EXECUTE FUNCTION sync_wallet_transfer_to_transactions();

COMMIT;
