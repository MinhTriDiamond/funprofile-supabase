# A2 — Kiểm kê hệ thống cho migration (read-only, không đụng dữ liệu)

Snapshot: **2026-08-27 UTC**. Nguồn: truy vấn trực tiếp DB production + repo.

---

## 10. Bảng `public` theo domain — 261 bảng

| Domain | Số bảng |
|---|---:|
| PPLP/Monetary | 60 |
| Core/Platform | 51 |
| Wallet/Finance | 49 |
| Khác (chưa gắn domain) | 32 |
| Pet/Gamification | 31 |
| Identity/Trust | 23 |
| Feed | 15 |
| Live | 15 |
| Chat | 6 |
| **Tổng** | **261** |

### PPLP/Monetary (60)
connector_admin_audit, connector_config, connector_growth_events, connector_links, connector_windows, epoch_config, epoch_metrics, fun_core_proxy_audit, fun_distribution_logs, fun_pool_config, fun_profile_event_outbox, inflation_health_metrics, light_actions, light_reputation, mint_allocations, mint_epochs, pplp_action_caps, pplp_actions, pplp_audits, pplp_daily_action_mint, pplp_device_registry, pplp_epoch_caps, pplp_evidences, pplp_fraud_signals, pplp_mint_requests, pplp_policies, pplp_recovery_runs, pplp_scores, pplp_user_caps, pplp_user_nonces, pplp_user_tiers, pplp_v25_action_overrides, pplp_v25_action_overrides_history, pplp_v25_config, pplp_v25_event_base_values, pplp_v25_impact_metrics, pplp_v25_intent_metrics, pplp_v25_legacy_params, pplp_v25_light_scores, pplp_v25_mint_linking_config, pplp_v25_multiplier_ranges, pplp_v25_param_audit_log, pplp_v25_phase_config, pplp_v25_stability_index, pplp_v25_tier_assignments, pplp_v25_vvu_log, pplp_v2_action_types, pplp_v2_attendance, pplp_v2_balance_ledger, pplp_v2_community_reviews, pplp_v2_event_log, pplp_v2_events, pplp_v2_fraud_signals, pplp_v2_groups, pplp_v2_immutable_rules, pplp_v2_mint_records, pplp_v2_proofs, pplp_v2_review_queue, pplp_v2_user_actions, pplp_v2_validations

### Core/Platform (51)
account_activity_logs, account_merge_requests, admin_backfill_candidates, admin_backfill_jobs, admin_repricing_progress, admin_sql_audit, app_secrets, app_secrets_audit, app_settings, app_stats_cache, audit_logs, blacklisted_ips, blacklisted_wallets, cross_platform_tokens, email_confirm_tokens, email_delivery_logs, email_verification_tokens, export_audit_logs, federation_sync_jobs, federation_sync_logs, friendships, i18n_languages, job_leases, login_ip_logs, notifications, oauth_clients, oauth_codes, otp_codes, password_reset_tokens, pending_claims, pending_provisions, platform_financial_data, platform_user_data, profile_btc_aux_addresses, profiles, profiles_wallet_audit, profiles_wallet_backup_20260601, reports, reserved_usernames, search_history, search_logs, signup_failure_log, stale_account_reminder_log, stale_unaccepted_accounts_log, user_blocks, user_dimension_scores, user_epoch_scores, user_reel_preferences, user_roles, user_watched_wallets, username_history

### Wallet/Finance (49)
btc_address_ownership_history, btc_aux_address_review_queue, btc_aux_cleanup_audit_20260621, btc_aux_misattribution_audit_20260612, btc_donations_wrong_father_backup_20260621, btc_father_aux_full_backup_20260621, btc_father_backfill_audit_20260621, btc_full_reconcile_audit_20260621, btc_history_repair_audit_20260612, btc_ownership_challenges, btc_ownership_snapshot, btc_raw_tx_cache, btc_resolver_shadow_log, btc_review_queue, btc_transactions_orphan_backup_20260621, btc_tx_semantic, btc_wallet_transfers_orphan_backup_20260621, chains_registry, crypto_gifts, custodial_wallets, donation_price_validation_log, donations, donations_spam_backup_20260705, external_tx_filter_log, external_wallet_inclusion_overrides, external_wallet_labels, financial_transactions, m6b_gap_scan_batches, moralis_api_usage, scanner_block_gaps, scanner_watermarks, swap_failures, swap_price_validation_log, swap_transactions, tokens_registry, transactions, transactions_trust_admin_audit, treasury_flows, treasury_vaults, wallet_bulk_update_alerts, wallet_challenges, wallet_custom_tokens, wallet_history, wallet_reconciliation_findings, wallet_reconciliation_runs, wallet_scan_metrics, wallet_security_audit, wallet_transfers, wallet_writer_audit

### Identity/Trust (23)
ai_agent_profile, attestation_log, dib_profile, did_registry, identity_audit_logs, identity_disputes, identity_epoch_snapshots, identity_events, identity_guardians, identity_kyc_metrics, identity_levels, identity_links, identity_recovery_log, identity_verification_events, identity_verifications, impersonation_alerts, kyc_test_users, org_members, org_profile, sbt_issuance_rules, sbt_registry, trust_profile, validator_profile

### Pet/Gamification (31)
buddy_circles, buddy_daily_progress, buddy_daily_quests, buddy_members, mystery_box_definitions, mystery_box_grant_audit, mystery_box_inventory, mystery_box_open_log, mystery_box_orders, mystery_box_premium_grants, mystery_box_rewards, mystery_box_risk_log, mystery_box_shop_config, mystery_box_stats_daily, pet_battle_leaderboard, pet_battle_seasons, pet_battles, pet_cheers, pet_cosmetics_catalog, pet_cosmetics_owned, pet_interactions, pet_risk_appeals, pet_risk_scores, pet_risk_signals, pet_shop_config, pet_shop_orders, pet_states, pet_voice_lines, quest_definitions, quest_streaks, quest_user_progress

### Feed (15)
comments, creator_library, link_preview_cache, post_attachments, post_edit_after_score_log, post_tags, posts, reactions, reel_bookmarks, reel_comment_likes, reel_comments, reel_likes, reel_shares, reel_views, reels

### Live (15)
call_participants, call_sessions, chunked_recording_chunks, chunked_recordings, live_co_hosts, live_comments, live_messages, live_reactions, live_recording_chunks, live_recordings, live_replays, live_session_events, live_sessions, livestreams, streams

### Chat (6)
chat_settings, conversation_participants, conversations, message_reactions, message_reads, messages

### Khác — cần gắn domain thủ công (32)
_backup_btc_p0_fix_20260713, backlog_alert_events, founder_admin_audit, provider_registry, provider_request_log, rate_limit_state, reconciliation_logs, red_envelope_claims, red_envelopes, registry_drift_alerts, registry_validate_log, reward_adjustments, reward_approvals, reward_claims, reward_vesting_schedules, rtmp_stream_configs, shared_posts, slug_history, soul_nfts, sticker_packs, stickers, suspicious_wallet_events, sybil_clusters, system_config, token_ingest_filters, token_price_fetch_failures, token_price_history, tx_perf_samples, tx_shadow_diffs, tx_validation_snapshots, video_downloads, video_upload_sessions

Bảng lớn nhất (est_rows): `chunked_recording_chunks` ~1,23 tr · `light_actions` ~346 k ·
`identity_epoch_snapshots` ~101 k · `comments` ~57 k · `external_tx_filter_log` ~51 k ·
`friendships` ~49 k · `donations` ~32 k.

---

## 11. Edge functions — 282 (repo `supabase/functions`, đã trừ `_shared*`)

Gom theo domain để deploy theo batch:

- **Wallet/Scanner/BTC (~45):** auto-backfill-donations, auto-scan-donations, backfill-donations, backfill-donations-to-transactions, backfill-outgoing-donations, backfill-swap-transactions, backfill-treasury-txs-once, backfill-tx-donations, backfill-wallet-transfers, batch-backfill-transfers, btc-discovery-v2, btc-history-repair, btc-ownership-reverify, btc-ownership-verify, btc-parser-v2, btc-raw-sat-guard, btc-wallet-audit, check-transaction, connect-external-wallet, detect-incoming-transfers, disconnect-external-wallet, donations-repricing-backfill, fast-scan-donations, fetch-wallet-history, list-all-transactions, m6b-gap-scan, manual-create-donation, moralis-webhook, recover-donations-from-chain, record-donation, record-swap, scan-btc-transactions, scan-my-incoming, scan-treasury-camly, scan-treasury-outgoing, scan-wallet-recover, scanner-rpc-tick, scheduled-reconciliation, setup-moralis-stream, swap-quote, token-limits-status, token-price-at-time, token-prices, tokens-registry-drift-alert, wallet-reconciliation-cron, log-swap-failure, tx-perf-beacon, tx-shadow-report, tx-snapshot-compare
- **Treasury (6):** treasury-balance, treasury-health-cron, treasury-minigame-history, treasury-overview, treasury-record-outflow, treasury-recycle
- **PPLP/Mint (~50):** pplp-* (attester-sign, authorize-mint, auto-submit, backlog-*, batch-processor, burst-detector, compute-dimensions, connector-*, detect-fraud, epoch-snapshot, evaluate, get-score, ingest-actions, micro-preview, mint-fun, rebalance-throttled-action, recovery-run, remint-stale, resplit-orphan-parents, score-action, split-*, submit-action, v2-*, v25-*, validation-window, vesting-release), inflation-health-job, recalculate-fun-amounts, migrate-stuck-epoch-april, cascade-consistency-check, registry-validate-report
- **Identity/Trust/KYC (~22):** identity-* (ai-agent-register, attestation-submit, did-auto-promote, did-resolve, dispute-*, epoch-snapshot, impersonation-*, link-manage, org-*, recovery-*, sbt-issue, trust-engine, validator-register), auto-sbt-evaluator, kyc-access-check, sumsub-create-applicant, sumsub-get-access-token, sumsub-get-status, sumsub-webhook, federation-backfill-identity, federation-backfill-smoke, mint-soul-nft
- **Live/Media (~60):** live-* (48), agora/rtmp phụ trợ (create-rtmp-live-session, disarm-rtmp-live-session, end-rtmp-live-session, go-live-rtmp-session, get-rtmp-live-session-*, reset-rtmp-stream-key, rtmp-repair-missing-live-inputs, update-rtmp-live-details), concat-replay-webm, recording-finalize, auto-finalize-recordings, recover-orphan-livestreams, stream-video, stream-webhook, stream-webhook-register, stream-orphan-cleanup, replay-download, r2-signed-chunk-url, r2-diagnostic, migrate-to-r2, migrate-stream-to-r2, upload-to-r2, upload-to-cf-images, multipart-upload, get-upload-url, generate-presigned-url, delete-from-r2, cleanup-orphan-videos, cleanup-supabase-storage, optimize-storage, image-transform, media-guard
- **Feed/Social (~10):** create-post, delete-post-archive, analyze-reel, get-reel-recommendations, fetch-link-preview, light-language-backfill-user, backfill-missing-gift-posts, backfill-autoscan-messages, notify-gift-ready, notify-live-started, notify-link-wallet-reminder, seo-render, sitemap
- **Auth/SSO/Account (~30):** sso-* (18), auth-check-login-method, auth-email-hook, auth-signup-confirm, auth-signup-send-confirm, password-reset-request, password-reset-confirm, check-email-exists, verify-email-link, send-email-link-verification, log-login-ip, delete-user-account, batch-ban-users, batch-delete-banned-users, stale-account-cleanup, stale-account-reminder-send
- **Pet/Gamification/Box (~12):** pet-event-hook, pet-risk-cron, pet-shop-confirm, pet-tick, mystery-box-* (6), quest-evaluate, quest-evaluate-batch, quest-sbt-trigger, quest-streak-cron
- **Admin/Ops (~15):** admin-* (11), analyze-fraud-patterns, daily-fraud-scan, approve-claim, claim-reward, backfill-reward-claims, connector-admin-revert, connector-backfill-7d, fun-core-proxy, fun-profile-outbox-publisher, angel-chat, angel-inline, backfill-love-house, sync-treasury-profile

Danh sách thô đầy đủ: `ls supabase/functions | grep -v '^_'`.

---

## 12. Secrets / API keys đang dùng — 92 tên biến (chỉ tên, không giá trị)

**Agora/Live:** AGORA_APP_ID, AGORA_APP_CERTIFICATE, AGORA_CUSTOMER_ID, AGORA_CUSTOMER_SECRET,
AGORA_REST_KEY, AGORA_REST_SECRET, AGORA_CLOUD_RECORDING_MAX_ACTIVE, AGORA_MAX_SESSION_HOURS,
AGORA_RECORDING_MAX_IDLE_TIME, AGORA_RECORDING_STORAGE_ENDPOINT, AGORA_RECORDING_STORAGE_REGION,
AGORA_RECORDING_STORAGE_VENDOR, ENABLE_BROWSER_RECORDER_FALLBACK, OBS_RECONNECT_TIMEOUT_SECONDS,
RTMP_ARMING_TIMEOUT_MINUTES, RTMP_DISCONNECT_GRACE_SECONDS, RTMP_INPUT_ARMING_ENABLED,
RTMP_MAX_SESSION_HOURS, RTMP_STALE_NULL_MINUTES, STREAM_KEY_ENCRYPTION_SECRET

**Cloudflare / R2:** CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCESS_KEY_ID,
CLOUDFLARE_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME, CLOUDFLARE_R2_PUBLIC_URL,
CLOUDFLARE_STREAM_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN, CLOUDFLARE_STREAM_CUSTOMER_CODE,
CLOUDFLARE_STREAM_INGEST_HOST, CLOUDFLARE_STREAM_TOKEN, CLOUDFLARE_STREAM_WEBHOOK_SECRET,
CLOUDFLARE_VOD_BACKFILL_ENABLED, CLOUDFLARE_WEBHOOK_SECRET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ARCHIVE_BUCKET, R2_ENDPOINT, R2_REGION,
R2_PUBLIC_BASE_URL, R2_PUBLIC_DOMAIN, R2_TEMP_ACCESS_KEY_ID, R2_TEMP_SECRET_ACCESS_KEY,
R2_TEMP_BUCKET, R2_TEMP_ENDPOINT, R2_TEMP_PUBLIC_BASE_URL, R2_TEMP_PUBLIC_DOMAIN

**Blockchain/Wallet:** MORALIS_API_KEY, MORALIS_API_KEY_2, MORALIS_API_KEY_3, MORALIS_STREAM_SECRET,
BSCSCAN_API_KEY, ZEROX_API_KEY, MINTER_PRIVATE_KEY, PPLP_HOT_WALLET_PRIVATE_KEY,
TREASURY_PRIVATE_KEY, TREASURY_WALLET_ADDRESS, FUN_MINTER_V2_ADDRESS, BTC_HD_INPUT_BACK_ENABLED

**Identity/KYC:** SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY, SUMSUB_BASE_URL, SUMSUB_ENVIRONMENT,
SUMSUB_LEVEL_NAME, SUMSUB_WEBHOOK_SECRET

**Email:** RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_FROM_NAME

**Hệ sinh thái / nội bộ:** ANGEL_AI_API_KEY, ANGEL_AI_INGEST_KEY, ANGEL_BOT_USER_ID,
FUN_CORE_API_BASE_URL, FUN_CORE_API_BASE_URL_PROD, FUN_CORE_API_KEY_FOR_FUN_PROFILE,
FUN_PROFILE_ORIGIN, FUN_PROFILE_SERVICE_IDENTITY, FUN_PROFILE_SERVICE_SECRET,
PPLP_EXTERNAL_SYSTEM_USER_ID, APP_SECRETS_MASTER_KEY, APP_URL, LOVABLE_API_KEY,
MAX_VIDEO_UPLOAD_BYTES, CRON_SECRET, CRON_SHARED_SECRET, DONATIONS_REPRICING_CRON_TOKEN

**Backend tự sinh:** SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PUBLISHABLE_KEY,
SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY

> **Không có Stripe/Paddle** — dự án chưa dùng payment provider. JWT secret do backend quản lý
> (không đọc được từ code), token SSO ký bằng `FUN_PROFILE_SERVICE_SECRET`.

---

## 13. `cron.job` — 77 job active (bản dự phòng)

Nguyên trạng `jobname | schedule | active` lưu tại `evidence/cron-job-snapshot.txt`.

---

## 14. OAuth

- **Provider auth của Lovable Cloud:** chỉ **Google** được dùng trong code
  (`src/components/auth/SocialLogin.tsx`, `signInWithOAuth({ provider: 'google' })`),
  `redirectTo = ${window.location.origin}/`. `supabase/config.toml` không chứa block `[auth]`
  (Lovable Cloud quản lý), nên khi migrate phải khai lại provider Google + redirect URL
  `https://fun.rich/` và `https://funprofile.lovable.app/`.
- **FUN Profile là OAuth server cho hệ sinh thái** — `public.oauth_clients` (4 client active):

| client_id | tên | redirect_uris |
|---|---|---|
| angel_ai_client | Angel AI | https://angel.fun.rich/auth/callback · https://angel999.lovable.app/auth/callback |
| fun_farm_client | Fun Farm | https://farm.fun.rich/auth/callback · https://funfarm.life/auth/callback · https://onhznjyccagjoefavbaq.lovableproject.com/auth/callback · http://localhost:3000/auth/callback |
| fun_planet_client | Fun Planet | https://planet.fun.rich/auth/callback · http://localhost:3002/auth/callback |
| fun_play_client | Fun Play | https://play.fun.rich/auth/callback · http://localhost:3001/auth/callback |

---

## 15. Storage buckets

| Bucket | Public | Số object | Dung lượng |
|---|---|---:|---:|
| live-thumbnails | true | 152 | 6,3 MB |
| avatars | true | 0 | 0 |
| comment-media | true | 0 | 0 |
| live-recordings | true | 0 | 0 |
| posts | true | 0 | 0 |
| videos | true | 0 | 0 |

⇒ **Supabase Storage gần như trống (~6 MB)**. Toàn bộ media Feed/Reels/avatar/replay đã nằm ở
**Cloudflare R2 + Cloudflare Stream/Images** — khi migrate, khối lượng dữ liệu media KHÔNG nằm ở
Storage mà ở R2 (bucket theo `R2_BUCKET_NAME`, `R2_ARCHIVE_BUCKET`, `R2_TEMP_BUCKET`).
