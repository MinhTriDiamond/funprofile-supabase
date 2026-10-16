export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      account_activity_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      account_merge_requests: {
        Row: {
          admin_note: string | null
          auto_provisioned: boolean | null
          created_at: string
          email: string
          id: string
          merge_type: string
          platform_data: Json | null
          provision_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_platform: string
          source_user_id: string | null
          source_username: string | null
          status: string
          target_platform: string
          target_user_id: string | null
          updated_at: string
          webhook_sent: boolean | null
          webhook_sent_at: string | null
        }
        Insert: {
          admin_note?: string | null
          auto_provisioned?: boolean | null
          created_at?: string
          email: string
          id?: string
          merge_type: string
          platform_data?: Json | null
          provision_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_platform: string
          source_user_id?: string | null
          source_username?: string | null
          status?: string
          target_platform?: string
          target_user_id?: string | null
          updated_at?: string
          webhook_sent?: boolean | null
          webhook_sent_at?: string | null
        }
        Update: {
          admin_note?: string | null
          auto_provisioned?: boolean | null
          created_at?: string
          email?: string
          id?: string
          merge_type?: string
          platform_data?: Json | null
          provision_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_platform?: string
          source_user_id?: string | null
          source_username?: string | null
          status?: string
          target_platform?: string
          target_user_id?: string | null
          updated_at?: string
          webhook_sent?: boolean | null
          webhook_sent_at?: string | null
        }
        Relationships: []
      }
      admin_backfill_candidates: {
        Row: {
          amount_display: string
          amount_raw: string
          block_number: number
          classification: string
          created_at: string
          from_address: string
          id: string
          job_id: string
          log_index: number
          matched_user_id: string | null
          selected: boolean
          skip_reason: string | null
          to_address: string
          token_address: string | null
          token_symbol: string
          tx_hash: string
          usd_value: number | null
          written: boolean
          written_at: string | null
        }
        Insert: {
          amount_display: string
          amount_raw: string
          block_number: number
          classification: string
          created_at?: string
          from_address: string
          id?: string
          job_id: string
          log_index?: number
          matched_user_id?: string | null
          selected?: boolean
          skip_reason?: string | null
          to_address: string
          token_address?: string | null
          token_symbol: string
          tx_hash: string
          usd_value?: number | null
          written?: boolean
          written_at?: string | null
        }
        Update: {
          amount_display?: string
          amount_raw?: string
          block_number?: number
          classification?: string
          created_at?: string
          from_address?: string
          id?: string
          job_id?: string
          log_index?: number
          matched_user_id?: string | null
          selected?: boolean
          skip_reason?: string | null
          to_address?: string
          token_address?: string | null
          token_symbol?: string
          tx_hash?: string
          usd_value?: number | null
          written?: boolean
          written_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_backfill_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "admin_backfill_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_backfill_jobs: {
        Row: {
          created_at: string
          created_by: string
          cursor_block: number | null
          error: string | null
          from_block: number | null
          from_ts: string | null
          id: string
          progress_pct: number
          scope: string
          stats: Json
          status: string
          to_block: number | null
          to_ts: string | null
          updated_at: string
          wallets: string[]
        }
        Insert: {
          created_at?: string
          created_by: string
          cursor_block?: number | null
          error?: string | null
          from_block?: number | null
          from_ts?: string | null
          id?: string
          progress_pct?: number
          scope: string
          stats?: Json
          status?: string
          to_block?: number | null
          to_ts?: string | null
          updated_at?: string
          wallets?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string
          cursor_block?: number | null
          error?: string | null
          from_block?: number | null
          from_ts?: string | null
          id?: string
          progress_pct?: number
          scope?: string
          stats?: Json
          status?: string
          to_block?: number | null
          to_ts?: string | null
          updated_at?: string
          wallets?: string[]
        }
        Relationships: []
      }
      admin_repricing_progress: {
        Row: {
          batches_run: number
          cumulative_stats: Json
          job_key: string
          last_batch_at: string
          remaining: number
          started_at: string
          status: string
          total_initial: number
          total_processed: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          batches_run?: number
          cumulative_stats?: Json
          job_key: string
          last_batch_at?: string
          remaining?: number
          started_at?: string
          status?: string
          total_initial?: number
          total_processed?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          batches_run?: number
          cumulative_stats?: Json
          job_key?: string
          last_batch_at?: string
          remaining?: number
          started_at?: string
          status?: string
          total_initial?: number
          total_processed?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      admin_sql_audit: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          ip: string | null
          mode: string
          row_count: number | null
          sql_hash: string
          sql_preview: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          ip?: string | null
          mode: string
          row_count?: number | null
          sql_hash: string
          sql_preview: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          ip?: string | null
          mode?: string
          row_count?: number | null
          sql_hash?: string
          sql_preview?: string
        }
        Relationships: []
      }
      ai_agent_profile: {
        Row: {
          api_endpoint: string | null
          audit_log_url: string | null
          autonomy_level: string
          capabilities: Json
          created_at: string
          description: string | null
          did_id: string
          display_name: string
          last_action_at: string | null
          metadata: Json
          model_name: string | null
          model_version: string | null
          operator_did_id: string
          organization_did_id: string | null
          status: string
          total_actions: number
          updated_at: string
        }
        Insert: {
          api_endpoint?: string | null
          audit_log_url?: string | null
          autonomy_level?: string
          capabilities?: Json
          created_at?: string
          description?: string | null
          did_id: string
          display_name: string
          last_action_at?: string | null
          metadata?: Json
          model_name?: string | null
          model_version?: string | null
          operator_did_id: string
          organization_did_id?: string | null
          status?: string
          total_actions?: number
          updated_at?: string
        }
        Update: {
          api_endpoint?: string | null
          audit_log_url?: string | null
          autonomy_level?: string
          capabilities?: Json
          created_at?: string
          description?: string | null
          did_id?: string
          display_name?: string
          last_action_at?: string | null
          metadata?: Json
          model_name?: string | null
          model_version?: string | null
          operator_did_id?: string
          organization_did_id?: string | null
          status?: string
          total_actions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_profile_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: true
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
          {
            foreignKeyName: "ai_agent_profile_operator_did_id_fkey"
            columns: ["operator_did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
          {
            foreignKeyName: "ai_agent_profile_organization_did_id_fkey"
            columns: ["organization_did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      app_secrets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          encrypted_value: string
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          encrypted_value: string
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          encrypted_value?: string
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_secrets_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          secret_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          secret_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          secret_name?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      app_stats_cache: {
        Row: {
          id: number
          received_token_totals: Json
          refreshed_at: string
          sent_token_totals: Json
          total_camly_claimed: number
          total_livestreams: number
          total_photos: number
          total_posts: number
          total_rewards: number
          total_users: number
          total_videos: number
          total_videos_combined: number
          treasury_camly_received: number
        }
        Insert: {
          id?: number
          received_token_totals?: Json
          refreshed_at?: string
          sent_token_totals?: Json
          total_camly_claimed?: number
          total_livestreams?: number
          total_photos?: number
          total_posts?: number
          total_rewards?: number
          total_users?: number
          total_videos?: number
          total_videos_combined?: number
          treasury_camly_received?: number
        }
        Update: {
          id?: number
          received_token_totals?: Json
          refreshed_at?: string
          sent_token_totals?: Json
          total_camly_claimed?: number
          total_livestreams?: number
          total_photos?: number
          total_posts?: number
          total_rewards?: number
          total_users?: number
          total_videos?: number
          total_videos_combined?: number
          treasury_camly_received?: number
        }
        Relationships: []
      }
      attestation_log: {
        Row: {
          attestation_type: Database["public"]["Enums"]["attestation_type"]
          created_at: string
          evidence_ref: string | null
          from_did: string
          id: string
          metadata: Json
          status: string
          to_did: string
          weight: number
        }
        Insert: {
          attestation_type: Database["public"]["Enums"]["attestation_type"]
          created_at?: string
          evidence_ref?: string | null
          from_did: string
          id?: string
          metadata?: Json
          status?: string
          to_did: string
          weight?: number
        }
        Update: {
          attestation_type?: Database["public"]["Enums"]["attestation_type"]
          created_at?: string
          evidence_ref?: string | null
          from_did?: string
          id?: string
          metadata?: Json
          status?: string
          to_did?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "attestation_log_from_did_fkey"
            columns: ["from_did"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
          {
            foreignKeyName: "attestation_log_to_did_fkey"
            columns: ["to_did"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          details: Json | null
          id: string
          reason: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          details?: Json | null
          id?: string
          reason?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          reason?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      backlog_alert_events: {
        Row: {
          action_name: string
          alert_type: string
          created_at: string
          created_by: string | null
          dedupe_key: string
          id: string
          message: string
          metric_value: number
          threshold_value: number
        }
        Insert: {
          action_name: string
          alert_type: string
          created_at?: string
          created_by?: string | null
          dedupe_key: string
          id?: string
          message: string
          metric_value: number
          threshold_value: number
        }
        Update: {
          action_name?: string
          alert_type?: string
          created_at?: string
          created_by?: string | null
          dedupe_key?: string
          id?: string
          message?: string
          metric_value?: number
          threshold_value?: number
        }
        Relationships: []
      }
      blacklisted_ips: {
        Row: {
          alert_on_login: boolean
          associated_usernames: string[] | null
          flagged_at: string
          flagged_by: string | null
          id: string
          ip_address: string
          is_active: boolean
          notes: string | null
          reason: string
        }
        Insert: {
          alert_on_login?: boolean
          associated_usernames?: string[] | null
          flagged_at?: string
          flagged_by?: string | null
          id?: string
          ip_address: string
          is_active?: boolean
          notes?: string | null
          reason: string
        }
        Update: {
          alert_on_login?: boolean
          associated_usernames?: string[] | null
          flagged_at?: string
          flagged_by?: string | null
          id?: string
          ip_address?: string
          is_active?: boolean
          notes?: string | null
          reason?: string
        }
        Relationships: []
      }
      blacklisted_wallets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_permanent: boolean
          reason: string
          user_id: string | null
          wallet_address: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_permanent?: boolean
          reason?: string
          user_id?: string | null
          wallet_address: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_permanent?: boolean
          reason?: string
          user_id?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      btc_address_ownership_history: {
        Row: {
          address: string
          created_at: string
          created_by: string
          evidence_ref: string | null
          id: string
          request_id: string | null
          user_id: string
          valid_from: string
          valid_to: string | null
          verification_method: string
          verified_at: string
        }
        Insert: {
          address: string
          created_at?: string
          created_by: string
          evidence_ref?: string | null
          id?: string
          request_id?: string | null
          user_id: string
          valid_from?: string
          valid_to?: string | null
          verification_method: string
          verified_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          created_by?: string
          evidence_ref?: string | null
          id?: string
          request_id?: string | null
          user_id?: string
          valid_from?: string
          valid_to?: string | null
          verification_method?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "btc_address_ownership_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "btc_address_ownership_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "btc_address_ownership_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "btc_address_ownership_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      btc_aux_address_review_queue: {
        Row: {
          acted_at: string | null
          address: string
          aux_id: string | null
          broad_don_btc: number | null
          broad_don_count: number | null
          classification: string
          created_at: string
          funded_btc: number | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          source: string | null
          tx_count: number | null
          updated_at: string
          user_id: string | null
          username: string | null
          verdict: string
          verdict_reason: string | null
        }
        Insert: {
          acted_at?: string | null
          address: string
          aux_id?: string | null
          broad_don_btc?: number | null
          broad_don_count?: number | null
          classification: string
          created_at?: string
          funded_btc?: number | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          tx_count?: number | null
          updated_at?: string
          user_id?: string | null
          username?: string | null
          verdict?: string
          verdict_reason?: string | null
        }
        Update: {
          acted_at?: string | null
          address?: string
          aux_id?: string | null
          broad_don_btc?: number | null
          broad_don_count?: number | null
          classification?: string
          created_at?: string
          funded_btc?: number | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string | null
          tx_count?: number | null
          updated_at?: string
          user_id?: string | null
          username?: string | null
          verdict?: string
          verdict_reason?: string | null
        }
        Relationships: []
      }
      btc_history_repair_audit_20260612: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string
          donation_id: string | null
          id: string
          reason: string | null
          tx_hash: string
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          donation_id?: string | null
          id?: string
          reason?: string | null
          tx_hash: string
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          donation_id?: string | null
          id?: string
          reason?: string | null
          tx_hash?: string
        }
        Relationships: []
      }
      btc_ownership_challenges: {
        Row: {
          address: string
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          message: string
          nonce: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: string | null
          message: string
          nonce: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          message?: string
          nonce?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      btc_ownership_snapshot: {
        Row: {
          address: string
          confidence: number
          created_at: string
          funded_btc_at_verify: number | null
          id: string
          integrity_status: string
          notes: string | null
          source: string
          tx_count_at_verify: number | null
          updated_at: string
          user_id: string
          verified_at: string
          verified_by: string | null
        }
        Insert: {
          address: string
          confidence?: number
          created_at?: string
          funded_btc_at_verify?: number | null
          id?: string
          integrity_status?: string
          notes?: string | null
          source: string
          tx_count_at_verify?: number | null
          updated_at?: string
          user_id: string
          verified_at?: string
          verified_by?: string | null
        }
        Update: {
          address?: string
          confidence?: number
          created_at?: string
          funded_btc_at_verify?: number | null
          id?: string
          integrity_status?: string
          notes?: string | null
          source?: string
          tx_count_at_verify?: number | null
          updated_at?: string
          user_id?: string
          verified_at?: string
          verified_by?: string | null
        }
        Relationships: []
      }
      btc_raw_tx_cache: {
        Row: {
          block_height: number | null
          block_time: string | null
          fetched_at: string
          raw_json: Json
          raw_sha256: string | null
          size_bytes: number | null
          source: string
          tx_hash: string
        }
        Insert: {
          block_height?: number | null
          block_time?: string | null
          fetched_at?: string
          raw_json: Json
          raw_sha256?: string | null
          size_bytes?: number | null
          source?: string
          tx_hash: string
        }
        Update: {
          block_height?: number | null
          block_time?: string | null
          fetched_at?: string
          raw_json?: Json
          raw_sha256?: string | null
          size_bytes?: number | null
          source?: string
          tx_hash?: string
        }
        Relationships: []
      }
      btc_resolver_shadow_log: {
        Row: {
          address: string
          call_site: string
          created_at: string
          created_by: string
          event_at: string
          id: string
          idempotency_key: string
          is_match: boolean
          legacy_source: string
          legacy_user_id: string | null
          observed_at: string
          priority_account_flag: boolean
          raw_address_legacy_side: string | null
          request_id: string | null
          resolver_user_id: string | null
          suspected_legacy_format_mismatch: boolean
          tx_hash: string | null
        }
        Insert: {
          address: string
          call_site: string
          created_at?: string
          created_by: string
          event_at: string
          id?: string
          idempotency_key: string
          is_match: boolean
          legacy_source: string
          legacy_user_id?: string | null
          observed_at?: string
          priority_account_flag?: boolean
          raw_address_legacy_side?: string | null
          request_id?: string | null
          resolver_user_id?: string | null
          suspected_legacy_format_mismatch?: boolean
          tx_hash?: string | null
        }
        Update: {
          address?: string
          call_site?: string
          created_at?: string
          created_by?: string
          event_at?: string
          id?: string
          idempotency_key?: string
          is_match?: boolean
          legacy_source?: string
          legacy_user_id?: string | null
          observed_at?: string
          priority_account_flag?: boolean
          raw_address_legacy_side?: string | null
          request_id?: string | null
          resolver_user_id?: string | null
          suspected_legacy_format_mismatch?: boolean
          tx_hash?: string | null
        }
        Relationships: []
      }
      btc_review_queue: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          reason: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_verdict: Json | null
          severity: string
          status: string
          suggested_verdict: Json | null
          tx_hash: string
          updated_at: string
          vout_index: number | null
        }
        Insert: {
          created_at?: string
          evidence?: Json
          id?: string
          reason: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_verdict?: Json | null
          severity?: string
          status?: string
          suggested_verdict?: Json | null
          tx_hash: string
          updated_at?: string
          vout_index?: number | null
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          reason?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_verdict?: Json | null
          severity?: string
          status?: string
          suggested_verdict?: Json | null
          tx_hash?: string
          updated_at?: string
          vout_index?: number | null
        }
        Relationships: []
      }
      btc_tx_semantic: {
        Row: {
          amount_sat: number
          block_height: number | null
          block_time: string | null
          chain_family: string
          classified_at: string
          classifier_version: string
          created_at: string
          flow_type: string
          id: string
          is_change: boolean
          is_coinjoin: boolean
          is_self_transfer: boolean
          is_treasury: boolean
          raw_tx_cached_at: string | null
          recipient_address: string
          recipient_user: string | null
          review_queue_id: string | null
          sender_address: string | null
          sender_user: string | null
          tags: string[]
          tx_hash: string
          updated_at: string
          vout_index: number
        }
        Insert: {
          amount_sat: number
          block_height?: number | null
          block_time?: string | null
          chain_family?: string
          classified_at?: string
          classifier_version: string
          created_at?: string
          flow_type: string
          id?: string
          is_change?: boolean
          is_coinjoin?: boolean
          is_self_transfer?: boolean
          is_treasury?: boolean
          raw_tx_cached_at?: string | null
          recipient_address: string
          recipient_user?: string | null
          review_queue_id?: string | null
          sender_address?: string | null
          sender_user?: string | null
          tags?: string[]
          tx_hash: string
          updated_at?: string
          vout_index: number
        }
        Update: {
          amount_sat?: number
          block_height?: number | null
          block_time?: string | null
          chain_family?: string
          classified_at?: string
          classifier_version?: string
          created_at?: string
          flow_type?: string
          id?: string
          is_change?: boolean
          is_coinjoin?: boolean
          is_self_transfer?: boolean
          is_treasury?: boolean
          raw_tx_cached_at?: string | null
          recipient_address?: string
          recipient_user?: string | null
          review_queue_id?: string | null
          sender_address?: string | null
          sender_user?: string | null
          tags?: string[]
          tx_hash?: string
          updated_at?: string
          vout_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "btc_tx_semantic_review_queue_fk"
            columns: ["review_queue_id"]
            isOneToOne: false
            referencedRelation: "btc_review_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      btc_verification_audit_20261015: {
        Row: {
          checked_at: string
          donation_id: string
          matched_vout_index: number | null
          onchain_recipient_address: string | null
          reasons: string | null
          sender_in_inputs: boolean | null
          tx_hash: string | null
          verdict: string
        }
        Insert: {
          checked_at?: string
          donation_id: string
          matched_vout_index?: number | null
          onchain_recipient_address?: string | null
          reasons?: string | null
          sender_in_inputs?: boolean | null
          tx_hash?: string | null
          verdict: string
        }
        Update: {
          checked_at?: string
          donation_id?: string
          matched_vout_index?: number | null
          onchain_recipient_address?: string | null
          reasons?: string | null
          sender_in_inputs?: boolean | null
          tx_hash?: string | null
          verdict?: string
        }
        Relationships: []
      }
      btc_verification_audit_r2_20261015: {
        Row: {
          checked_at: string
          cluster_note: string | null
          donation_id: string
          matched_vout_index: number | null
          onchain_recipient_address: string | null
          reasons: string | null
          sender_in_inputs: boolean | null
          tx_hash: string | null
          verdict: string
        }
        Insert: {
          checked_at?: string
          cluster_note?: string | null
          donation_id: string
          matched_vout_index?: number | null
          onchain_recipient_address?: string | null
          reasons?: string | null
          sender_in_inputs?: boolean | null
          tx_hash?: string | null
          verdict: string
        }
        Update: {
          checked_at?: string
          cluster_note?: string | null
          donation_id?: string
          matched_vout_index?: number | null
          onchain_recipient_address?: string | null
          reasons?: string | null
          sender_in_inputs?: boolean | null
          tx_hash?: string | null
          verdict?: string
        }
        Relationships: []
      }
      btc_verification_audit_r3_20261015: {
        Row: {
          checked_at: string
          cluster_note: string | null
          donation_id: string
          matched_vout_index: number | null
          onchain_recipient_address: string | null
          reasons: string | null
          sender_in_inputs: boolean | null
          tx_hash: string | null
          verdict: string
        }
        Insert: {
          checked_at?: string
          cluster_note?: string | null
          donation_id: string
          matched_vout_index?: number | null
          onchain_recipient_address?: string | null
          reasons?: string | null
          sender_in_inputs?: boolean | null
          tx_hash?: string | null
          verdict: string
        }
        Update: {
          checked_at?: string
          cluster_note?: string | null
          donation_id?: string
          matched_vout_index?: number | null
          onchain_recipient_address?: string | null
          reasons?: string | null
          sender_in_inputs?: boolean | null
          tx_hash?: string | null
          verdict?: string
        }
        Relationships: []
      }
      buddy_circles: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          max_members: number
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code: string
          max_members?: number
          name: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          max_members?: number
          name?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      buddy_daily_progress: {
        Row: {
          circle_id: string
          completed_at: string
          id: string
          quest_id: string
          user_id: string
          utc_date: string
        }
        Insert: {
          circle_id: string
          completed_at?: string
          id?: string
          quest_id: string
          user_id: string
          utc_date?: string
        }
        Update: {
          circle_id?: string
          completed_at?: string
          id?: string
          quest_id?: string
          user_id?: string
          utc_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "buddy_daily_progress_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "buddy_circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "buddy_daily_progress_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "buddy_daily_quests"
            referencedColumns: ["id"]
          },
        ]
      }
      buddy_daily_quests: {
        Row: {
          created_at: string
          description: string
          display_order: number
          id: string
          mood_boost: boolean
          title: string
          xp_reward: number
        }
        Insert: {
          created_at?: string
          description: string
          display_order?: number
          id: string
          mood_boost?: boolean
          title: string
          xp_reward?: number
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          mood_boost?: boolean
          title?: string
          xp_reward?: number
        }
        Relationships: []
      }
      buddy_members: {
        Row: {
          circle_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          circle_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          circle_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buddy_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "buddy_circles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_participants: {
        Row: {
          call_session_id: string | null
          created_at: string | null
          id: string
          is_muted: boolean | null
          is_video_off: boolean | null
          joined_at: string | null
          left_at: string | null
          user_id: string
        }
        Insert: {
          call_session_id?: string | null
          created_at?: string | null
          id?: string
          is_muted?: boolean | null
          is_video_off?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          user_id: string
        }
        Update: {
          call_session_id?: string | null
          created_at?: string | null
          id?: string
          is_muted?: boolean | null
          is_video_off?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_participants_call_session_id_fkey"
            columns: ["call_session_id"]
            isOneToOne: false
            referencedRelation: "call_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      call_sessions: {
        Row: {
          call_type: string
          channel_name: string
          conversation_id: string | null
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          id: string
          initiator_id: string
          started_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          call_type: string
          channel_name: string
          conversation_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          initiator_id: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          call_type?: string
          channel_name?: string
          conversation_id?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          initiator_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chains_registry: {
        Row: {
          chain_family: string
          chain_key: string
          chain_name: string
          created_at: string
          created_by: string | null
          enabled: boolean
          evm_chain_id: number | null
          explorer_address_path: string | null
          explorer_enabled: boolean
          explorer_tx_path: string | null
          explorer_url: string | null
          id: string
          native_decimals: number
          native_icon_url: string | null
          native_name: string
          native_symbol: string
          notes: string | null
          required_confirmations: number
          scan_enabled: boolean
          status: Database["public"]["Enums"]["chain_status"]
          updated_at: string
          updated_by: string | null
          webhook_enabled: boolean
        }
        Insert: {
          chain_family: string
          chain_key: string
          chain_name: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          evm_chain_id?: number | null
          explorer_address_path?: string | null
          explorer_enabled?: boolean
          explorer_tx_path?: string | null
          explorer_url?: string | null
          id?: string
          native_decimals?: number
          native_icon_url?: string | null
          native_name: string
          native_symbol: string
          notes?: string | null
          required_confirmations?: number
          scan_enabled?: boolean
          status?: Database["public"]["Enums"]["chain_status"]
          updated_at?: string
          updated_by?: string | null
          webhook_enabled?: boolean
        }
        Update: {
          chain_family?: string
          chain_key?: string
          chain_name?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          evm_chain_id?: number | null
          explorer_address_path?: string | null
          explorer_enabled?: boolean
          explorer_tx_path?: string | null
          explorer_url?: string | null
          id?: string
          native_decimals?: number
          native_icon_url?: string | null
          native_name?: string
          native_symbol?: string
          notes?: string | null
          required_confirmations?: number
          scan_enabled?: boolean
          status?: Database["public"]["Enums"]["chain_status"]
          updated_at?: string
          updated_by?: string | null
          webhook_enabled?: boolean
        }
        Relationships: []
      }
      chat_settings: {
        Row: {
          created_at: string | null
          id: string
          show_read_receipts: boolean | null
          show_typing_indicator: boolean | null
          updated_at: string | null
          user_id: string
          who_can_message: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          show_read_receipts?: boolean | null
          show_typing_indicator?: boolean | null
          updated_at?: string | null
          user_id: string
          who_can_message?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          show_read_receipts?: boolean | null
          show_typing_indicator?: boolean | null
          updated_at?: string | null
          user_id?: string
          who_can_message?: string | null
        }
        Relationships: []
      }
      chunked_recording_chunks: {
        Row: {
          bytes: number | null
          created_at: string
          duration_ms: number | null
          id: string
          object_key: string | null
          recording_id: string
          seq: number
          status: string
          uploaded_at: string | null
        }
        Insert: {
          bytes?: number | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          object_key?: string | null
          recording_id: string
          seq: number
          status?: string
          uploaded_at?: string | null
        }
        Update: {
          bytes?: number | null
          created_at?: string
          duration_ms?: number | null
          id?: string
          object_key?: string | null
          recording_id?: string
          seq?: number
          status?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chunked_recording_chunks_recording_id_fkey"
            columns: ["recording_id"]
            isOneToOne: false
            referencedRelation: "chunked_recordings"
            referencedColumns: ["id"]
          },
        ]
      }
      chunked_recordings: {
        Row: {
          channel_name: string | null
          codec: string | null
          created_at: string
          ended_at: string | null
          error_message: string | null
          height: number | null
          id: string
          last_seq_uploaded: number | null
          live_session_id: string | null
          mime_type: string | null
          output_object_key: string | null
          output_url: string | null
          started_at: string | null
          status: string
          total_chunks: number | null
          user_id: string
          width: number | null
        }
        Insert: {
          channel_name?: string | null
          codec?: string | null
          created_at?: string
          ended_at?: string | null
          error_message?: string | null
          height?: number | null
          id?: string
          last_seq_uploaded?: number | null
          live_session_id?: string | null
          mime_type?: string | null
          output_object_key?: string | null
          output_url?: string | null
          started_at?: string | null
          status?: string
          total_chunks?: number | null
          user_id: string
          width?: number | null
        }
        Update: {
          channel_name?: string | null
          codec?: string | null
          created_at?: string
          ended_at?: string | null
          error_message?: string | null
          height?: number | null
          id?: string
          last_seq_uploaded?: number | null
          live_session_id?: string | null
          mime_type?: string | null
          output_object_key?: string | null
          output_url?: string | null
          started_at?: string | null
          status?: string
          total_chunks?: number | null
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chunked_recordings_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunked_recordings_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          parent_comment_id: string | null
          post_id: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          parent_comment_id?: string | null
          post_id: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          parent_comment_id?: string | null
          post_id?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_admin_audit: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          metadata: Json
          reason: string | null
          target_link_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_link_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          reason?: string | null
          target_link_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connector_admin_audit_target_link_id_fkey"
            columns: ["target_link_id"]
            isOneToOne: false
            referencedRelation: "connector_links"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      connector_growth_events: {
        Row: {
          awarded_at: string
          id: string
          link_id: string
          milestone: string
          score_delta: number
        }
        Insert: {
          awarded_at?: string
          id?: string
          link_id: string
          milestone: string
          score_delta: number
        }
        Update: {
          awarded_at?: string
          id?: string
          link_id?: string
          milestone?: string
          score_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "connector_growth_events_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "connector_links"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_links: {
        Row: {
          amount: number
          amount_usd: number | null
          block_number: number
          chain: string
          connector_user_id: string
          created_at: string
          id: string
          log_index: number
          matched_at: string
          new_user_id: string
          revert_reason: string | null
          reverted_at: string | null
          reverted_by: string | null
          status: string
          token_symbol: string
          tx_hash: string
          tx_index: number
          updated_at: string
        }
        Insert: {
          amount: number
          amount_usd?: number | null
          block_number?: number
          chain: string
          connector_user_id: string
          created_at?: string
          id?: string
          log_index?: number
          matched_at?: string
          new_user_id: string
          revert_reason?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          status?: string
          token_symbol: string
          tx_hash: string
          tx_index?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          amount_usd?: number | null
          block_number?: number
          chain?: string
          connector_user_id?: string
          created_at?: string
          id?: string
          log_index?: number
          matched_at?: string
          new_user_id?: string
          revert_reason?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          status?: string
          token_symbol?: string
          tx_hash?: string
          tx_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      connector_windows: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          matched_link_id: string | null
          opened_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          matched_link_id?: string | null
          opened_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          matched_link_id?: string | null
          opened_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string | null
          last_read_at: string | null
          left_at: string | null
          muted_until: string | null
          nickname: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          left_at?: string | null
          muted_until?: string | null
          nickname?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          left_at?: string | null
          muted_until?: string | null
          nickname?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          name: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          name?: string | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          name?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      creator_library: {
        Row: {
          archived_at: string | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          id: string
          live_replay_id: string | null
          live_session_id: string | null
          media_type: string
          playback_provider: string
          post_id: string | null
          posted_at: string | null
          r2_bucket: string | null
          r2_object_key: string | null
          r2_video_url: string | null
          storage_provider: string
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          id?: string
          live_replay_id?: string | null
          live_session_id?: string | null
          media_type?: string
          playback_provider?: string
          post_id?: string | null
          posted_at?: string | null
          r2_bucket?: string | null
          r2_object_key?: string | null
          r2_video_url?: string | null
          storage_provider?: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          id?: string
          live_replay_id?: string | null
          live_session_id?: string | null
          media_type?: string
          playback_provider?: string
          post_id?: string | null
          posted_at?: string | null
          r2_bucket?: string | null
          r2_object_key?: string | null
          r2_video_url?: string | null
          storage_provider?: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_library_live_replay_id_fkey"
            columns: ["live_replay_id"]
            isOneToOne: true
            referencedRelation: "live_replays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_library_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_library_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_library_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_library_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_library_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_library_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_library_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_platform_tokens: {
        Row: {
          access_token: string
          access_token_expires_at: string
          client_id: string
          created_at: string
          device_info: Json | null
          id: string
          is_revoked: boolean
          last_used_at: string | null
          refresh_token: string
          refresh_token_expires_at: string
          scope: string[]
          user_id: string
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          client_id: string
          created_at?: string
          device_info?: Json | null
          id?: string
          is_revoked?: boolean
          last_used_at?: string | null
          refresh_token: string
          refresh_token_expires_at: string
          scope?: string[]
          user_id: string
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          client_id?: string
          created_at?: string
          device_info?: Json | null
          id?: string
          is_revoked?: boolean
          last_used_at?: string | null
          refresh_token?: string
          refresh_token_expires_at?: string
          scope?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cross_platform_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "cross_platform_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_platform_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_platform_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_platform_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crypto_gifts: {
        Row: {
          amount_numeric: number
          chain_id: number
          conversation_id: string | null
          created_at: string
          error: string | null
          from_user_id: string
          id: string
          message_id: string | null
          status: string
          to_address: string
          to_user_id: string
          token: string
          tx_hash: string | null
          updated_at: string
        }
        Insert: {
          amount_numeric?: number
          chain_id?: number
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          from_user_id: string
          id?: string
          message_id?: string | null
          status?: string
          to_address: string
          to_user_id: string
          token?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Update: {
          amount_numeric?: number
          chain_id?: number
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          from_user_id?: string
          id?: string
          message_id?: string | null
          status?: string
          to_address?: string
          to_user_id?: string
          token?: string
          tx_hash?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crypto_gifts_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crypto_gifts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      custodial_wallets_archive_20261015: {
        Row: {
          chain_id: number | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          updated_at: string | null
          user_id: string | null
          wallet_address: string | null
        }
        Insert: {
          chain_id?: number | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          wallet_address?: string | null
        }
        Update: {
          chain_id?: number | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          updated_at?: string | null
          user_id?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      dib_profile: {
        Row: {
          contribution_vault_hash: string | null
          credential_vault_hash: string | null
          did_id: string
          economic_access_hash: string | null
          governance_vault_hash: string | null
          identity_vault_hash: string | null
          last_snapshot_at: string | null
          reputation_vault_hash: string | null
          snapshot_epoch: string | null
          trust_vault_hash: string | null
        }
        Insert: {
          contribution_vault_hash?: string | null
          credential_vault_hash?: string | null
          did_id: string
          economic_access_hash?: string | null
          governance_vault_hash?: string | null
          identity_vault_hash?: string | null
          last_snapshot_at?: string | null
          reputation_vault_hash?: string | null
          snapshot_epoch?: string | null
          trust_vault_hash?: string | null
        }
        Update: {
          contribution_vault_hash?: string | null
          credential_vault_hash?: string | null
          did_id?: string
          economic_access_hash?: string | null
          governance_vault_hash?: string | null
          identity_vault_hash?: string | null
          last_snapshot_at?: string | null
          reputation_vault_hash?: string | null
          snapshot_epoch?: string | null
          trust_vault_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dib_profile_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: true
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      did_registry: {
        Row: {
          created_at: string
          did_id: string
          did_level: Database["public"]["Enums"]["did_level"]
          entity_type: Database["public"]["Enums"]["did_entity_type"]
          metadata: Json
          owner_user_id: string
          status: Database["public"]["Enums"]["did_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          did_id: string
          did_level?: Database["public"]["Enums"]["did_level"]
          entity_type?: Database["public"]["Enums"]["did_entity_type"]
          metadata?: Json
          owner_user_id: string
          status?: Database["public"]["Enums"]["did_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          did_id?: string
          did_level?: Database["public"]["Enums"]["did_level"]
          entity_type?: Database["public"]["Enums"]["did_entity_type"]
          metadata?: Json
          owner_user_id?: string
          status?: Database["public"]["Enums"]["did_status"]
          updated_at?: string
        }
        Relationships: []
      }
      donation_board_base: {
        Row: {
          amount_num: number | null
          amount_usd: number
          chain_id: number | null
          created_at: string | null
          light_score_earned: number
          recipient_excluded: boolean
          recipient_id: string
          registry_eligible: boolean
          registry_max_single_usd: number | null
          sender_excluded: boolean
          sender_id: string
          status: string | null
          token_symbol: string | null
          tx_hash: string | null
        }
        Insert: {
          amount_num?: number | null
          amount_usd?: number
          chain_id?: number | null
          created_at?: string | null
          light_score_earned?: number
          recipient_excluded?: boolean
          recipient_id: string
          registry_eligible?: boolean
          registry_max_single_usd?: number | null
          sender_excluded?: boolean
          sender_id: string
          status?: string | null
          token_symbol?: string | null
          tx_hash?: string | null
        }
        Update: {
          amount_num?: number | null
          amount_usd?: number
          chain_id?: number | null
          created_at?: string | null
          light_score_earned?: number
          recipient_excluded?: boolean
          recipient_id?: string
          registry_eligible?: boolean
          registry_max_single_usd?: number | null
          sender_excluded?: boolean
          sender_id?: string
          status?: string | null
          token_symbol?: string | null
          tx_hash?: string | null
        }
        Relationships: []
      }
      donation_price_validation_log: {
        Row: {
          amount: number | null
          code_amount_usd: number | null
          code_price_usd: number | null
          created_at: string
          diff_pct: number | null
          donation_date: string | null
          donation_id: string | null
          history_price_usd: number | null
          id: string
          phase: string
          token_symbol: string
          verdict: string
        }
        Insert: {
          amount?: number | null
          code_amount_usd?: number | null
          code_price_usd?: number | null
          created_at?: string
          diff_pct?: number | null
          donation_date?: string | null
          donation_id?: string | null
          history_price_usd?: number | null
          id?: string
          phase?: string
          token_symbol: string
          verdict: string
        }
        Update: {
          amount?: number | null
          code_amount_usd?: number | null
          code_price_usd?: number | null
          created_at?: string
          diff_pct?: number | null
          donation_date?: string | null
          donation_id?: string | null
          history_price_usd?: number | null
          id?: string
          phase?: string
          token_symbol?: string
          verdict?: string
        }
        Relationships: []
      }
      donations: {
        Row: {
          amount: string
          amount_usd: number | null
          block_height: number | null
          block_number: number | null
          card_background: string | null
          card_sound: string | null
          card_theme: string | null
          card_viewed_at: string | null
          chain_family: string
          chain_id: number
          classifier_version: string | null
          confirmations: number | null
          confirmed_at: string | null
          conversation_id: string | null
          created_at: string
          fee: string | null
          filter_status: string | null
          id: string
          integrity_flagged_at: string | null
          integrity_reason: string | null
          integrity_status: string
          is_external: boolean | null
          leaderboard_eligibility: string | null
          light_action_id: string | null
          light_score_earned: number | null
          message: string | null
          message_id: string | null
          message_template: string | null
          metadata: Json | null
          pending_verification_since: string | null
          post_id: string | null
          price_source: string | null
          price_usd_at_donation: number | null
          recipient_address: string | null
          recipient_id: string | null
          sender_address: string | null
          sender_id: string | null
          status: string
          superseded_by: string | null
          tags: string[]
          token_address: string | null
          token_symbol: string
          tx_hash: string
          vout_index: number | null
        }
        Insert: {
          amount: string
          amount_usd?: number | null
          block_height?: number | null
          block_number?: number | null
          card_background?: string | null
          card_sound?: string | null
          card_theme?: string | null
          card_viewed_at?: string | null
          chain_family?: string
          chain_id?: number
          classifier_version?: string | null
          confirmations?: number | null
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          fee?: string | null
          filter_status?: string | null
          id?: string
          integrity_flagged_at?: string | null
          integrity_reason?: string | null
          integrity_status?: string
          is_external?: boolean | null
          leaderboard_eligibility?: string | null
          light_action_id?: string | null
          light_score_earned?: number | null
          message?: string | null
          message_id?: string | null
          message_template?: string | null
          metadata?: Json | null
          pending_verification_since?: string | null
          post_id?: string | null
          price_source?: string | null
          price_usd_at_donation?: number | null
          recipient_address?: string | null
          recipient_id?: string | null
          sender_address?: string | null
          sender_id?: string | null
          status?: string
          superseded_by?: string | null
          tags?: string[]
          token_address?: string | null
          token_symbol?: string
          tx_hash: string
          vout_index?: number | null
        }
        Update: {
          amount?: string
          amount_usd?: number | null
          block_height?: number | null
          block_number?: number | null
          card_background?: string | null
          card_sound?: string | null
          card_theme?: string | null
          card_viewed_at?: string | null
          chain_family?: string
          chain_id?: number
          classifier_version?: string | null
          confirmations?: number | null
          confirmed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          fee?: string | null
          filter_status?: string | null
          id?: string
          integrity_flagged_at?: string | null
          integrity_reason?: string | null
          integrity_status?: string
          is_external?: boolean | null
          leaderboard_eligibility?: string | null
          light_action_id?: string | null
          light_score_earned?: number | null
          message?: string | null
          message_id?: string | null
          message_template?: string | null
          metadata?: Json | null
          pending_verification_since?: string | null
          post_id?: string | null
          price_source?: string | null
          price_usd_at_donation?: number | null
          recipient_address?: string | null
          recipient_id?: string | null
          sender_address?: string | null
          sender_id?: string | null
          status?: string
          superseded_by?: string | null
          tags?: string[]
          token_address?: string | null
          token_symbol?: string
          tx_hash?: string
          vout_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "donations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_light_action_id_fkey"
            columns: ["light_action_id"]
            isOneToOne: false
            referencedRelation: "light_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_superseded_by_fk"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "btc_tx_semantic"
            referencedColumns: ["id"]
          },
        ]
      }
      email_confirm_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          request_ip: string | null
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          request_ip?: string | null
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          request_ip?: string | null
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      email_delivery_logs: {
        Row: {
          created_at: string
          email_type: string
          error_code: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          provider: string
          recipient_domain: string | null
          recipient_masked: string
          redirect_to: string | null
          resend_message_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_type: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          recipient_domain?: string | null
          recipient_masked: string
          redirect_to?: string | null
          resend_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_type?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          recipient_domain?: string | null
          recipient_masked?: string
          redirect_to?: string | null
          resend_message_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_verification_tokens: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          is_used: boolean | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          is_used?: boolean | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      epoch_config: {
        Row: {
          alpha: number
          base_rate: number
          base_vesting_days: number
          beta: number
          config_key: string
          created_at: string | null
          delta: number
          ecosystem_pool_pct: number
          epsilon: number
          gamma: number
          id: string
          instant_portion_pct: number
          is_active: boolean | null
          locked_portion_pct: number
          max_share_per_user: number | null
          min_epoch_mint: number
          modulator_max: number
          modulator_min: number
          resilience_pool_pct: number
          soft_ceiling: number
          strategic_pool_pct: number
          system_stage: string
          treasury_pool_pct: number
          unlock_check_interval_days: number
          updated_at: string | null
          user_pool_pct: number
          zeta: number
        }
        Insert: {
          alpha?: number
          base_rate?: number
          base_vesting_days?: number
          beta?: number
          config_key: string
          created_at?: string | null
          delta?: number
          ecosystem_pool_pct?: number
          epsilon?: number
          gamma?: number
          id?: string
          instant_portion_pct?: number
          is_active?: boolean | null
          locked_portion_pct?: number
          max_share_per_user?: number | null
          min_epoch_mint?: number
          modulator_max?: number
          modulator_min?: number
          resilience_pool_pct?: number
          soft_ceiling?: number
          strategic_pool_pct?: number
          system_stage?: string
          treasury_pool_pct?: number
          unlock_check_interval_days?: number
          updated_at?: string | null
          user_pool_pct?: number
          zeta?: number
        }
        Update: {
          alpha?: number
          base_rate?: number
          base_vesting_days?: number
          beta?: number
          config_key?: string
          created_at?: string | null
          delta?: number
          ecosystem_pool_pct?: number
          epsilon?: number
          gamma?: number
          id?: string
          instant_portion_pct?: number
          is_active?: boolean | null
          locked_portion_pct?: number
          max_share_per_user?: number | null
          min_epoch_mint?: number
          modulator_max?: number
          modulator_min?: number
          resilience_pool_pct?: number
          soft_ceiling?: number
          strategic_pool_pct?: number
          system_stage?: string
          treasury_pool_pct?: number
          unlock_check_interval_days?: number
          updated_at?: string | null
          user_pool_pct?: number
          zeta?: number
        }
        Relationships: []
      }
      epoch_metrics: {
        Row: {
          active_quality_users: number | null
          adjusted_mint: number | null
          claim_efficiency_index: number | null
          computed_at: string | null
          ecosystem_usage_index: number | null
          epoch_id: string | null
          epoch_label: string
          final_mint: number | null
          fraud_pressure_index: number | null
          id: string
          liquidity_discipline_index: number | null
          raw_total_mint: number | null
          service_impact_score: number | null
          utility_diversity_index: number | null
          utility_retention_index: number | null
          verified_contribution_value: number | null
          verified_light_score: number | null
        }
        Insert: {
          active_quality_users?: number | null
          adjusted_mint?: number | null
          claim_efficiency_index?: number | null
          computed_at?: string | null
          ecosystem_usage_index?: number | null
          epoch_id?: string | null
          epoch_label: string
          final_mint?: number | null
          fraud_pressure_index?: number | null
          id?: string
          liquidity_discipline_index?: number | null
          raw_total_mint?: number | null
          service_impact_score?: number | null
          utility_diversity_index?: number | null
          utility_retention_index?: number | null
          verified_contribution_value?: number | null
          verified_light_score?: number | null
        }
        Update: {
          active_quality_users?: number | null
          adjusted_mint?: number | null
          claim_efficiency_index?: number | null
          computed_at?: string | null
          ecosystem_usage_index?: number | null
          epoch_id?: string | null
          epoch_label?: string
          final_mint?: number | null
          fraud_pressure_index?: number | null
          id?: string
          liquidity_discipline_index?: number | null
          raw_total_mint?: number | null
          service_impact_score?: number | null
          utility_diversity_index?: number | null
          utility_retention_index?: number | null
          verified_contribution_value?: number | null
          verified_light_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "epoch_metrics_epoch_id_fkey"
            columns: ["epoch_id"]
            isOneToOne: false
            referencedRelation: "mint_epochs"
            referencedColumns: ["id"]
          },
        ]
      }
      export_audit_logs: {
        Row: {
          created_at: string
          error_message: string | null
          export_type: string
          filter_params: Json
          id: string
          role: string
          row_count: number
          status: string
          surface: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          export_type: string
          filter_params?: Json
          id?: string
          role?: string
          row_count?: number
          status?: string
          surface: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          export_type?: string
          filter_params?: Json
          id?: string
          role?: string
          row_count?: number
          status?: string
          surface?: string
          user_id?: string
        }
        Relationships: []
      }
      external_tx_filter_log: {
        Row: {
          amount: number | null
          chain: string | null
          created_at: string
          id: string
          reason: string
          recipient_address: string | null
          sender_address: string | null
          source: string | null
          token_symbol: string | null
          tx_hash: string | null
        }
        Insert: {
          amount?: number | null
          chain?: string | null
          created_at?: string
          id?: string
          reason: string
          recipient_address?: string | null
          sender_address?: string | null
          source?: string | null
          token_symbol?: string | null
          tx_hash?: string | null
        }
        Update: {
          amount?: number | null
          chain?: string | null
          created_at?: string
          id?: string
          reason?: string
          recipient_address?: string | null
          sender_address?: string | null
          source?: string | null
          token_symbol?: string | null
          tx_hash?: string | null
        }
        Relationships: []
      }
      external_wallet_inclusion_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_wallet_inclusion_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_wallet_inclusion_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_wallet_inclusion_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_wallet_inclusion_overrides_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_wallet_labels: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string
          updated_at: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          updated_at?: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      federation_sync_jobs: {
        Row: {
          batch_size: number
          created_at: string
          created_by: string | null
          failed_count: number
          filters: Json
          finished_at: string | null
          id: string
          last_error: string | null
          mode: string
          processed_count: number
          scope: string
          skipped_count: number
          started_at: string | null
          status: string
          succeeded_count: number
          total_count: number
          updated_at: string
        }
        Insert: {
          batch_size?: number
          created_at?: string
          created_by?: string | null
          failed_count?: number
          filters?: Json
          finished_at?: string | null
          id?: string
          last_error?: string | null
          mode: string
          processed_count?: number
          scope?: string
          skipped_count?: number
          started_at?: string | null
          status?: string
          succeeded_count?: number
          total_count?: number
          updated_at?: string
        }
        Update: {
          batch_size?: number
          created_at?: string
          created_by?: string | null
          failed_count?: number
          filters?: Json
          finished_at?: string | null
          id?: string
          last_error?: string | null
          mode?: string
          processed_count?: number
          scope?: string
          skipped_count?: number
          started_at?: string | null
          status?: string
          succeeded_count?: number
          total_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      federation_sync_logs: {
        Row: {
          attempts: number
          created_at: string
          ecosystem_identity_id: string | null
          endpoint: string
          http_method: string
          http_status: number | null
          id: string
          idempotency_key: string
          job_id: string
          last_error: string | null
          platform: string
          platform_user_id: string
          request_sample: Json | null
          response_sample: Json | null
          status: string
          target_user_id: string | null
          trace_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          ecosystem_identity_id?: string | null
          endpoint: string
          http_method?: string
          http_status?: number | null
          id?: string
          idempotency_key: string
          job_id: string
          last_error?: string | null
          platform?: string
          platform_user_id: string
          request_sample?: Json | null
          response_sample?: Json | null
          status?: string
          target_user_id?: string | null
          trace_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          ecosystem_identity_id?: string | null
          endpoint?: string
          http_method?: string
          http_status?: number | null
          id?: string
          idempotency_key?: string
          job_id?: string
          last_error?: string | null
          platform?: string
          platform_user_id?: string
          request_sample?: Json | null
          response_sample?: Json | null
          status?: string
          target_user_id?: string | null
          trace_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "federation_sync_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "federation_sync_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          action: string
          amount: number
          client_id: string
          created_at: string
          currency: string
          id: string
          metadata: Json | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          action: string
          amount: number
          client_id: string
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          transaction_id: string
          user_id: string
        }
        Update: {
          action?: string
          amount?: number
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: []
      }
      founder_admin_audit: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          payload: Json
          target_kind: string | null
          target_ref: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          payload?: Json
          target_kind?: string | null
          target_ref?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          payload?: Json
          target_kind?: string | null
          target_ref?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          friend_id: string
          id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fun_core_proxy_audit: {
        Row: {
          actor_id: string
          created_at: string
          denied_reason: string | null
          duration_ms: number | null
          endpoint: string
          error_code: string | null
          id: string
          success: boolean
          target_user_id: string
          trace_id: string | null
          upstream_status: number | null
        }
        Insert: {
          actor_id: string
          created_at?: string
          denied_reason?: string | null
          duration_ms?: number | null
          endpoint: string
          error_code?: string | null
          id?: string
          success: boolean
          target_user_id: string
          trace_id?: string | null
          upstream_status?: number | null
        }
        Update: {
          actor_id?: string
          created_at?: string
          denied_reason?: string | null
          duration_ms?: number | null
          endpoint?: string
          error_code?: string | null
          id?: string
          success?: boolean
          target_user_id?: string
          trace_id?: string | null
          upstream_status?: number | null
        }
        Relationships: []
      }
      fun_distribution_logs: {
        Row: {
          action_id: string
          actor_id: string
          created_at: string | null
          fund_processed_at: string | null
          fund_processing_status: string | null
          fund_tx_hashes: Json | null
          genesis_amount: number | null
          genesis_percentage: number | null
          id: string
          mint_request_id: string | null
          partners_amount: number | null
          partners_percentage: number | null
          platform_amount: number | null
          platform_percentage: number | null
          total_reward: number
          user_amount: number
          user_percentage: number
        }
        Insert: {
          action_id: string
          actor_id: string
          created_at?: string | null
          fund_processed_at?: string | null
          fund_processing_status?: string | null
          fund_tx_hashes?: Json | null
          genesis_amount?: number | null
          genesis_percentage?: number | null
          id?: string
          mint_request_id?: string | null
          partners_amount?: number | null
          partners_percentage?: number | null
          platform_amount?: number | null
          platform_percentage?: number | null
          total_reward?: number
          user_amount?: number
          user_percentage?: number
        }
        Update: {
          action_id?: string
          actor_id?: string
          created_at?: string | null
          fund_processed_at?: string | null
          fund_processing_status?: string | null
          fund_tx_hashes?: Json | null
          genesis_amount?: number | null
          genesis_percentage?: number | null
          id?: string
          mint_request_id?: string | null
          partners_amount?: number | null
          partners_percentage?: number | null
          platform_amount?: number | null
          platform_percentage?: number | null
          total_reward?: number
          user_amount?: number
          user_percentage?: number
        }
        Relationships: []
      }
      fun_pool_config: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          pool_label: string
          pool_name: string
          retention_rate: number | null
          tier_order: number | null
          updated_at: string | null
          wallet_address: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          pool_label: string
          pool_name: string
          retention_rate?: number | null
          tier_order?: number | null
          updated_at?: string | null
          wallet_address?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          pool_label?: string
          pool_name?: string
          retention_rate?: number | null
          tier_order?: number | null
          updated_at?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      fun_profile_event_outbox: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          sent_at: string | null
          status: string
          trace_id: string | null
          updated_at: string
        }
        Insert: {
          aggregate_id: string
          aggregate_type?: string
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          trace_id?: string | null
          updated_at?: string
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          sent_at?: string | null
          status?: string
          trace_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      gift_breakdown_cache: {
        Row: {
          direction: string
          refreshed_at: string
          source: string
          token_symbol: string
          total_amount: number
          tx_count: number
        }
        Insert: {
          direction: string
          refreshed_at?: string
          source: string
          token_symbol: string
          total_amount: number
          tx_count: number
        }
        Update: {
          direction?: string
          refreshed_at?: string
          source?: string
          token_symbol?: string
          total_amount?: number
          tx_count?: number
        }
        Relationships: []
      }
      i18n_languages: {
        Row: {
          code: string
          coverage_percent: number
          created_at: string
          direction: string
          flag_url: string | null
          is_active: boolean
          name: string
          native_name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          coverage_percent?: number
          created_at?: string
          direction?: string
          flag_url?: string | null
          is_active?: boolean
          name: string
          native_name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          coverage_percent?: number
          created_at?: string
          direction?: string
          flag_url?: string | null
          is_active?: boolean
          name?: string
          native_name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      identity_audit_logs: {
        Row: {
          action: string
          actor_type: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          new_status: string | null
          old_status: string | null
          source: string
          subject_user_id: string
        }
        Insert: {
          action: string
          actor_type: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          old_status?: string | null
          source: string
          subject_user_id: string
        }
        Update: {
          action?: string
          actor_type?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          new_status?: string | null
          old_status?: string | null
          source?: string
          subject_user_id?: string
        }
        Relationships: []
      }
      identity_disputes: {
        Row: {
          created_at: string
          did_id: string
          dispute_type: Database["public"]["Enums"]["dispute_type"]
          evidence: Json
          id: string
          reason: string
          resolution_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["dispute_status"]
          target_ref: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          did_id: string
          dispute_type: Database["public"]["Enums"]["dispute_type"]
          evidence?: Json
          id?: string
          reason: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          target_ref: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          did_id?: string
          dispute_type?: Database["public"]["Enums"]["dispute_type"]
          evidence?: Json
          id?: string
          reason?: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["dispute_status"]
          target_ref?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_disputes_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      identity_epoch_snapshots: {
        Row: {
          active_sbt_count: number
          created_at: string
          dib_state_root_hash: string | null
          did_id: string
          did_level: Database["public"]["Enums"]["did_level"]
          epoch_id: string
          id: string
          sybil_risk: Database["public"]["Enums"]["sybil_risk_level"]
          tc: number
          trust_tier: Database["public"]["Enums"]["trust_tier"]
        }
        Insert: {
          active_sbt_count?: number
          created_at?: string
          dib_state_root_hash?: string | null
          did_id: string
          did_level: Database["public"]["Enums"]["did_level"]
          epoch_id: string
          id?: string
          sybil_risk: Database["public"]["Enums"]["sybil_risk_level"]
          tc: number
          trust_tier: Database["public"]["Enums"]["trust_tier"]
        }
        Update: {
          active_sbt_count?: number
          created_at?: string
          dib_state_root_hash?: string | null
          did_id?: string
          did_level?: Database["public"]["Enums"]["did_level"]
          epoch_id?: string
          id?: string
          sybil_risk?: Database["public"]["Enums"]["sybil_risk_level"]
          tc?: number
          trust_tier?: Database["public"]["Enums"]["trust_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "identity_epoch_snapshots_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      identity_events: {
        Row: {
          created_at: string
          did_id: string
          event_ref: string | null
          event_type: string
          id: string
          metadata: Json
          risk_delta: number
          source: string | null
          tc_delta: number
        }
        Insert: {
          created_at?: string
          did_id: string
          event_ref?: string | null
          event_type: string
          id?: string
          metadata?: Json
          risk_delta?: number
          source?: string | null
          tc_delta?: number
        }
        Update: {
          created_at?: string
          did_id?: string
          event_ref?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          risk_delta?: number
          source?: string | null
          tc_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "identity_events_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      identity_guardians: {
        Row: {
          accepted_at: string | null
          did_id: string
          guardian_did_id: string
          id: string
          invited_at: string
          relationship: string
          revoked_at: string | null
          status: string
        }
        Insert: {
          accepted_at?: string | null
          did_id: string
          guardian_did_id: string
          id?: string
          invited_at?: string
          relationship?: string
          revoked_at?: string | null
          status?: string
        }
        Update: {
          accepted_at?: string | null
          did_id?: string
          guardian_did_id?: string
          id?: string
          invited_at?: string
          relationship?: string
          revoked_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_guardians_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
          {
            foreignKeyName: "identity_guardians_guardian_did_id_fkey"
            columns: ["guardian_did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      identity_kyc_metrics: {
        Row: {
          approved: number
          created_at: string
          duplicate_webhooks: number
          expired: number
          frozen_skipped: number
          id: string
          in_review: number
          invalid_signatures: number
          metric_date: string
          pending: number
          provider: string
          rejected: number
          total_applicants: number
          updated_at: string
        }
        Insert: {
          approved?: number
          created_at?: string
          duplicate_webhooks?: number
          expired?: number
          frozen_skipped?: number
          id?: string
          in_review?: number
          invalid_signatures?: number
          metric_date?: string
          pending?: number
          provider?: string
          rejected?: number
          total_applicants?: number
          updated_at?: string
        }
        Update: {
          approved?: number
          created_at?: string
          duplicate_webhooks?: number
          expired?: number
          frozen_skipped?: number
          id?: string
          in_review?: number
          invalid_signatures?: number
          metric_date?: string
          pending?: number
          provider?: string
          rejected?: number
          total_applicants?: number
          updated_at?: string
        }
        Relationships: []
      }
      identity_levels: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          enabled: boolean
          id: string
          level_name: string
          provider: string
          tier_hint: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          enabled?: boolean
          id?: string
          level_name: string
          provider?: string
          tier_hint?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          enabled?: boolean
          id?: string
          level_name?: string
          provider?: string
          tier_hint?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      identity_links: {
        Row: {
          did_id: string
          id: string
          link_type: Database["public"]["Enums"]["identity_link_type"]
          link_value: string
          linked_at: string
          metadata: Json
          verification_state: Database["public"]["Enums"]["link_verification_state"]
          verified_at: string | null
        }
        Insert: {
          did_id: string
          id?: string
          link_type: Database["public"]["Enums"]["identity_link_type"]
          link_value: string
          linked_at?: string
          metadata?: Json
          verification_state?: Database["public"]["Enums"]["link_verification_state"]
          verified_at?: string | null
        }
        Update: {
          did_id?: string
          id?: string
          link_type?: Database["public"]["Enums"]["identity_link_type"]
          link_value?: string
          linked_at?: string
          metadata?: Json
          verification_state?: Database["public"]["Enums"]["link_verification_state"]
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "identity_links_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      identity_recovery_log: {
        Row: {
          cooldown_until: string | null
          created_at: string
          did_id: string
          freeze_mint_until: string | null
          id: string
          metadata: Json
          method: string
          status: string
        }
        Insert: {
          cooldown_until?: string | null
          created_at?: string
          did_id: string
          freeze_mint_until?: string | null
          id?: string
          metadata?: Json
          method: string
          status?: string
        }
        Update: {
          cooldown_until?: string | null
          created_at?: string
          did_id?: string
          freeze_mint_until?: string | null
          id?: string
          metadata?: Json
          method?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_recovery_log_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      identity_verification_events: {
        Row: {
          error_message: string | null
          event_type: string | null
          external_user_id: string | null
          id: string
          identity_verification_id: string | null
          metadata_summary: Json | null
          processed_at: string | null
          processing_status: string
          provider: string
          provider_applicant_id: string | null
          provider_event_id: string | null
          received_at: string
          review_status: string | null
          signature_valid: boolean
          source_platform: string
          status: string | null
          trace_id: string | null
          user_id: string | null
          webhook_event_hash: string
        }
        Insert: {
          error_message?: string | null
          event_type?: string | null
          external_user_id?: string | null
          id?: string
          identity_verification_id?: string | null
          metadata_summary?: Json | null
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_applicant_id?: string | null
          provider_event_id?: string | null
          received_at?: string
          review_status?: string | null
          signature_valid?: boolean
          source_platform?: string
          status?: string | null
          trace_id?: string | null
          user_id?: string | null
          webhook_event_hash: string
        }
        Update: {
          error_message?: string | null
          event_type?: string | null
          external_user_id?: string | null
          id?: string
          identity_verification_id?: string | null
          metadata_summary?: Json | null
          processed_at?: string | null
          processing_status?: string
          provider?: string
          provider_applicant_id?: string | null
          provider_event_id?: string | null
          received_at?: string
          review_status?: string | null
          signature_valid?: boolean
          source_platform?: string
          status?: string | null
          trace_id?: string | null
          user_id?: string | null
          webhook_event_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_verification_events_identity_verification_id_fkey"
            columns: ["identity_verification_id"]
            isOneToOne: false
            referencedRelation: "identity_verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_verifications: {
        Row: {
          actual_document_type: string | null
          actual_issuing_country: string | null
          country: string | null
          created_at: string
          doc_mismatch: boolean
          external_user_id: string
          future_core_identity_id: string | null
          id: string
          is_test_verification: boolean
          kyc_risk_flag: string | null
          level_name: string | null
          migrated_to_core: boolean
          provider: string
          provider_applicant_id: string | null
          rejected_reason: string | null
          review_result_summary: Json | null
          selected_country: string | null
          selected_document_type: string | null
          source_platform: string
          status: string
          sync_status: string
          updated_at: string
          user_id: string
          verification_environment: string
          verified_at: string | null
        }
        Insert: {
          actual_document_type?: string | null
          actual_issuing_country?: string | null
          country?: string | null
          created_at?: string
          doc_mismatch?: boolean
          external_user_id: string
          future_core_identity_id?: string | null
          id?: string
          is_test_verification?: boolean
          kyc_risk_flag?: string | null
          level_name?: string | null
          migrated_to_core?: boolean
          provider?: string
          provider_applicant_id?: string | null
          rejected_reason?: string | null
          review_result_summary?: Json | null
          selected_country?: string | null
          selected_document_type?: string | null
          source_platform?: string
          status?: string
          sync_status?: string
          updated_at?: string
          user_id: string
          verification_environment?: string
          verified_at?: string | null
        }
        Update: {
          actual_document_type?: string | null
          actual_issuing_country?: string | null
          country?: string | null
          created_at?: string
          doc_mismatch?: boolean
          external_user_id?: string
          future_core_identity_id?: string | null
          id?: string
          is_test_verification?: boolean
          kyc_risk_flag?: string | null
          level_name?: string | null
          migrated_to_core?: boolean
          provider?: string
          provider_applicant_id?: string | null
          rejected_reason?: string | null
          review_result_summary?: Json | null
          selected_country?: string | null
          selected_document_type?: string | null
          source_platform?: string
          status?: string
          sync_status?: string
          updated_at?: string
          user_id?: string
          verification_environment?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      impersonation_alerts: {
        Row: {
          admin_action: string | null
          admin_id: string | null
          admin_note: string | null
          avatar_similarity: number
          created_at: string
          details: Json
          id: string
          name_similarity: number
          overall_score: number
          status: string
          suspect_user_id: string
          updated_at: string
          victim_response_at: string | null
          victim_user_id: string
        }
        Insert: {
          admin_action?: string | null
          admin_id?: string | null
          admin_note?: string | null
          avatar_similarity?: number
          created_at?: string
          details?: Json
          id?: string
          name_similarity?: number
          overall_score?: number
          status?: string
          suspect_user_id: string
          updated_at?: string
          victim_response_at?: string | null
          victim_user_id: string
        }
        Update: {
          admin_action?: string | null
          admin_id?: string | null
          admin_note?: string | null
          avatar_similarity?: number
          created_at?: string
          details?: Json
          id?: string
          name_similarity?: number
          overall_score?: number
          status?: string
          suspect_user_id?: string
          updated_at?: string
          victim_response_at?: string | null
          victim_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_alerts_suspect_user_id_fkey"
            columns: ["suspect_user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_alerts_suspect_user_id_fkey"
            columns: ["suspect_user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_alerts_suspect_user_id_fkey"
            columns: ["suspect_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_alerts_suspect_user_id_fkey"
            columns: ["suspect_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_alerts_victim_user_id_fkey"
            columns: ["victim_user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_alerts_victim_user_id_fkey"
            columns: ["victim_user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_alerts_victim_user_id_fkey"
            columns: ["victim_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_alerts_victim_user_id_fkey"
            columns: ["victim_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inflation_health_metrics: {
        Row: {
          alerts: Json | null
          circulating_supply: number | null
          fraud_pressure_ratio: number | null
          id: string
          locked_stability_ratio: number | null
          locked_supply: number | null
          measured_at: string
          notes: string | null
          retention_quality_ratio: number | null
          safe_mode: string | null
          total_supply: number | null
          utility_absorption_ratio: number | null
          value_expansion_ratio: number | null
        }
        Insert: {
          alerts?: Json | null
          circulating_supply?: number | null
          fraud_pressure_ratio?: number | null
          id?: string
          locked_stability_ratio?: number | null
          locked_supply?: number | null
          measured_at?: string
          notes?: string | null
          retention_quality_ratio?: number | null
          safe_mode?: string | null
          total_supply?: number | null
          utility_absorption_ratio?: number | null
          value_expansion_ratio?: number | null
        }
        Update: {
          alerts?: Json | null
          circulating_supply?: number | null
          fraud_pressure_ratio?: number | null
          id?: string
          locked_stability_ratio?: number | null
          locked_supply?: number | null
          measured_at?: string
          notes?: string | null
          retention_quality_ratio?: number | null
          safe_mode?: string | null
          total_supply?: number | null
          utility_absorption_ratio?: number | null
          value_expansion_ratio?: number | null
        }
        Relationships: []
      }
      job_leases: {
        Row: {
          acquired_at: string
          expires_at: string
          job_name: string
          owner_token: string
          updated_at: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          job_name: string
          owner_token: string
          updated_at?: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          job_name?: string
          owner_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      junk_token_contracts: {
        Row: {
          chain_id: number
          contract_address: string
          created_at: string
          enabled: boolean
          id: string
          reason: string | null
          token_symbol: string | null
          updated_at: string
        }
        Insert: {
          chain_id: number
          contract_address: string
          created_at?: string
          enabled?: boolean
          id?: string
          reason?: string | null
          token_symbol?: string | null
          updated_at?: string
        }
        Update: {
          chain_id?: number
          contract_address?: string
          created_at?: string
          enabled?: boolean
          id?: string
          reason?: string | null
          token_symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kyc_test_users: {
        Row: {
          added_by: string | null
          created_at: string
          email: string | null
          enabled: boolean
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email?: string | null
          enabled?: boolean
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string | null
          enabled?: boolean
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      light_actions: {
        Row: {
          action_type: string
          actor_id: string | null
          angel_evaluation: Json | null
          base_reward: number
          consistency_multiplier: number | null
          content_preview: string | null
          created_at: string
          evaluated_at: string | null
          id: string
          impact_score: number
          integrity_penalty: number | null
          integrity_score: number
          is_eligible: boolean
          light_score: number
          mint_amount: number | null
          mint_request_id: string | null
          mint_status: string
          minted_at: string | null
          quality_score: number
          reference_id: string | null
          reference_type: string | null
          sequence_multiplier: number | null
          streak_days: number | null
          tx_hash: string | null
          unity_multiplier: number
          unity_score: number
          user_id: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          angel_evaluation?: Json | null
          base_reward?: number
          consistency_multiplier?: number | null
          content_preview?: string | null
          created_at?: string
          evaluated_at?: string | null
          id?: string
          impact_score?: number
          integrity_penalty?: number | null
          integrity_score?: number
          is_eligible?: boolean
          light_score?: number
          mint_amount?: number | null
          mint_request_id?: string | null
          mint_status?: string
          minted_at?: string | null
          quality_score?: number
          reference_id?: string | null
          reference_type?: string | null
          sequence_multiplier?: number | null
          streak_days?: number | null
          tx_hash?: string | null
          unity_multiplier?: number
          unity_score?: number
          user_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          angel_evaluation?: Json | null
          base_reward?: number
          consistency_multiplier?: number | null
          content_preview?: string | null
          created_at?: string
          evaluated_at?: string | null
          id?: string
          impact_score?: number
          integrity_penalty?: number | null
          integrity_score?: number
          is_eligible?: boolean
          light_score?: number
          mint_amount?: number | null
          mint_request_id?: string | null
          mint_status?: string
          minted_at?: string | null
          quality_score?: number
          reference_id?: string | null
          reference_type?: string | null
          sequence_multiplier?: number | null
          streak_days?: number | null
          tx_hash?: string | null
          unity_multiplier?: number
          unity_score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "light_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_actions_mint_request_id_fkey"
            columns: ["mint_request_id"]
            isOneToOne: false
            referencedRelation: "pplp_mint_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      light_reputation: {
        Row: {
          actions_count: number
          avg_impact: number
          avg_integrity: number
          avg_quality: number
          avg_unity: number
          consistency_streak: number | null
          created_at: string
          daily_mint_cap: number
          last_action_at: string | null
          last_active_date: string | null
          last_mint_at: string | null
          pillar_healing: number
          pillar_service: number
          pillar_truth: number
          pillar_unity: number
          pillar_value: number
          sequence_bonus: number | null
          tier: number
          today_date: string
          today_minted: number
          total_light_score: number
          total_minted: number
          updated_at: string
          user_id: string
        }
        Insert: {
          actions_count?: number
          avg_impact?: number
          avg_integrity?: number
          avg_quality?: number
          avg_unity?: number
          consistency_streak?: number | null
          created_at?: string
          daily_mint_cap?: number
          last_action_at?: string | null
          last_active_date?: string | null
          last_mint_at?: string | null
          pillar_healing?: number
          pillar_service?: number
          pillar_truth?: number
          pillar_unity?: number
          pillar_value?: number
          sequence_bonus?: number | null
          tier?: number
          today_date?: string
          today_minted?: number
          total_light_score?: number
          total_minted?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          actions_count?: number
          avg_impact?: number
          avg_integrity?: number
          avg_quality?: number
          avg_unity?: number
          consistency_streak?: number | null
          created_at?: string
          daily_mint_cap?: number
          last_action_at?: string | null
          last_active_date?: string | null
          last_mint_at?: string | null
          pillar_healing?: number
          pillar_service?: number
          pillar_truth?: number
          pillar_unity?: number
          pillar_value?: number
          sequence_bonus?: number | null
          tier?: number
          today_date?: string
          today_minted?: number
          total_light_score?: number
          total_minted?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "light_reputation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_reputation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_reputation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_reputation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      link_preview_cache: {
        Row: {
          data: Json
          fetched_at: string
          url: string
        }
        Insert: {
          data?: Json
          fetched_at?: string
          url: string
        }
        Update: {
          data?: Json
          fetched_at?: string
          url?: string
        }
        Relationships: []
      }
      live_co_hosts: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string
          joined_at: string | null
          left_at: string | null
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by: string
          joined_at?: string | null
          left_at?: string | null
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string
          joined_at?: string | null
          left_at?: string | null
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_co_hosts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_co_hosts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_comments: {
        Row: {
          created_at: string
          id: string
          live_session_id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          live_session_id: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          live_session_id?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_comments_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_comments_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_messages: {
        Row: {
          content: string
          created_at: string
          id: number
          session_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: number
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: number
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: number
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: number
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: number
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_reactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_reactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_recording_chunks: {
        Row: {
          chunk_index: number
          created_at: string | null
          duration_ms: number | null
          error_message: string | null
          id: string
          live_session_id: string
          mime_type: string | null
          post_id: string | null
          provider: string
          r2_bucket: string
          r2_key: string
          size_bytes: number | null
          status: string | null
          uploaded_at: string | null
        }
        Insert: {
          chunk_index: number
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          live_session_id: string
          mime_type?: string | null
          post_id?: string | null
          provider?: string
          r2_bucket: string
          r2_key: string
          size_bytes?: number | null
          status?: string | null
          uploaded_at?: string | null
        }
        Update: {
          chunk_index?: number
          created_at?: string | null
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          live_session_id?: string
          mime_type?: string | null
          post_id?: string | null
          provider?: string
          r2_bucket?: string
          r2_key?: string
          size_bytes?: number | null
          status?: string | null
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_recording_chunks_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recording_chunks_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recording_chunks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      live_recordings: {
        Row: {
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          file_list_json: Json
          id: string
          live_id: string
          media_url: string | null
          mode: string | null
          raw_response: Json | null
          recorder_uid: string | null
          resource_id: string | null
          sid: string | null
          status: string
          stopped_at: string | null
          storage_region: number | null
          storage_vendor: number | null
          thumbnail_url: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_list_json?: Json
          id?: string
          live_id: string
          media_url?: string | null
          mode?: string | null
          raw_response?: Json | null
          recorder_uid?: string | null
          resource_id?: string | null
          sid?: string | null
          status?: string
          stopped_at?: string | null
          storage_region?: number | null
          storage_vendor?: number | null
          thumbnail_url?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          file_list_json?: Json
          id?: string
          live_id?: string
          media_url?: string | null
          mode?: string | null
          raw_response?: Json | null
          recorder_uid?: string | null
          resource_id?: string | null
          sid?: string | null
          status?: string
          stopped_at?: string | null
          storage_region?: number | null
          storage_vendor?: number | null
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_recordings_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_recordings_live_id_fkey"
            columns: ["live_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_replays: {
        Row: {
          archive_attempts: number
          archive_bucket: string | null
          archive_completed_at: string | null
          archive_error: string | null
          archive_file_size: number | null
          archive_lease_until: string | null
          archive_mp4_key: string | null
          archive_mp4_url: string | null
          archive_next_retry_at: string | null
          archive_phase: string | null
          archive_started_at: string | null
          archive_status: string
          archived_at: string | null
          auto_posted_at: string | null
          chunked_recording_id: string
          chunks_deleted_at: string | null
          chunks_stable_since: string | null
          cleanup_attempts: number
          cleanup_completed_at: string | null
          cleanup_next_retry_at: string | null
          cleanup_started_at: string | null
          cleanup_status: string
          cloudflare_deleted_at: string | null
          cloudflare_mp4_download_url: string | null
          cloudflare_playback_url: string | null
          cloudflare_video_uid: string | null
          cloudflare_vod_enabled: boolean
          concat_completed_at: string | null
          concat_completed_parts: Json | null
          concat_next_part: number | null
          concat_plan: Json | null
          concat_started_at: string | null
          concat_upload_id: string | null
          created_at: string
          delete_stream_error: string | null
          deleted_at: string | null
          duration_seconds: number | null
          error_message: string | null
          expires_at: string | null
          expiry_notified_at: string | null
          filesize_bytes: number | null
          hls_ready_at: string | null
          id: string
          ingest_attempts: number
          last_cf_response: Json | null
          last_cf_status: string | null
          last_error_at: string | null
          last_failed_at: string | null
          last_ingest_at: string | null
          last_webhook_event: string | null
          live_session_id: string
          mp4_export_started_at: string | null
          mp4_ready_at: string | null
          mp4_total_bytes: number | null
          multipart_bytes_done: number | null
          multipart_part_size: number | null
          multipart_parts_done: Json | null
          multipart_total_parts: number | null
          multipart_upload_id: string | null
          next_chunk_seq: number
          normalized_object_key: string | null
          playback_dash: string | null
          playback_hls: string | null
          playback_mp4: string | null
          playback_provider: string
          playback_type: string | null
          posted_at: string | null
          processing_started_at: string | null
          r2_bucket: string | null
          r2_object_key: string | null
          r2_verified_at: string | null
          r2_video_url: string | null
          replay_post_id: string | null
          replay_ready_at: string | null
          replay_status: string
          retry_count: number
          snapshot_frozen_at: string | null
          snapshot_total_bytes: number | null
          snapshot_total_chunks: number | null
          source_webm_key: string | null
          source_webm_size: number | null
          status: Database["public"]["Enums"]["live_replay_status"]
          storage_provider: string
          stream_deleted_at: string | null
          stream_uid: string | null
          temp_bucket: string | null
          temp_hls_key: string | null
          temp_hls_url: string | null
          temp_mp4_key: string | null
          temp_prefix: string | null
          temp_total_size: number | null
          thumbnail_url: string | null
          total_chunks_for_ingest: number | null
          tus_offset: number
          tus_reset_count: number
          tus_upload_url: string | null
          updated_at: string
          user_id: string
          webhook_received_at: string | null
          webm_source_deleted_at: string | null
        }
        Insert: {
          archive_attempts?: number
          archive_bucket?: string | null
          archive_completed_at?: string | null
          archive_error?: string | null
          archive_file_size?: number | null
          archive_lease_until?: string | null
          archive_mp4_key?: string | null
          archive_mp4_url?: string | null
          archive_next_retry_at?: string | null
          archive_phase?: string | null
          archive_started_at?: string | null
          archive_status?: string
          archived_at?: string | null
          auto_posted_at?: string | null
          chunked_recording_id: string
          chunks_deleted_at?: string | null
          chunks_stable_since?: string | null
          cleanup_attempts?: number
          cleanup_completed_at?: string | null
          cleanup_next_retry_at?: string | null
          cleanup_started_at?: string | null
          cleanup_status?: string
          cloudflare_deleted_at?: string | null
          cloudflare_mp4_download_url?: string | null
          cloudflare_playback_url?: string | null
          cloudflare_video_uid?: string | null
          cloudflare_vod_enabled?: boolean
          concat_completed_at?: string | null
          concat_completed_parts?: Json | null
          concat_next_part?: number | null
          concat_plan?: Json | null
          concat_started_at?: string | null
          concat_upload_id?: string | null
          created_at?: string
          delete_stream_error?: string | null
          deleted_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          expires_at?: string | null
          expiry_notified_at?: string | null
          filesize_bytes?: number | null
          hls_ready_at?: string | null
          id?: string
          ingest_attempts?: number
          last_cf_response?: Json | null
          last_cf_status?: string | null
          last_error_at?: string | null
          last_failed_at?: string | null
          last_ingest_at?: string | null
          last_webhook_event?: string | null
          live_session_id: string
          mp4_export_started_at?: string | null
          mp4_ready_at?: string | null
          mp4_total_bytes?: number | null
          multipart_bytes_done?: number | null
          multipart_part_size?: number | null
          multipart_parts_done?: Json | null
          multipart_total_parts?: number | null
          multipart_upload_id?: string | null
          next_chunk_seq?: number
          normalized_object_key?: string | null
          playback_dash?: string | null
          playback_hls?: string | null
          playback_mp4?: string | null
          playback_provider?: string
          playback_type?: string | null
          posted_at?: string | null
          processing_started_at?: string | null
          r2_bucket?: string | null
          r2_object_key?: string | null
          r2_verified_at?: string | null
          r2_video_url?: string | null
          replay_post_id?: string | null
          replay_ready_at?: string | null
          replay_status?: string
          retry_count?: number
          snapshot_frozen_at?: string | null
          snapshot_total_bytes?: number | null
          snapshot_total_chunks?: number | null
          source_webm_key?: string | null
          source_webm_size?: number | null
          status?: Database["public"]["Enums"]["live_replay_status"]
          storage_provider?: string
          stream_deleted_at?: string | null
          stream_uid?: string | null
          temp_bucket?: string | null
          temp_hls_key?: string | null
          temp_hls_url?: string | null
          temp_mp4_key?: string | null
          temp_prefix?: string | null
          temp_total_size?: number | null
          thumbnail_url?: string | null
          total_chunks_for_ingest?: number | null
          tus_offset?: number
          tus_reset_count?: number
          tus_upload_url?: string | null
          updated_at?: string
          user_id: string
          webhook_received_at?: string | null
          webm_source_deleted_at?: string | null
        }
        Update: {
          archive_attempts?: number
          archive_bucket?: string | null
          archive_completed_at?: string | null
          archive_error?: string | null
          archive_file_size?: number | null
          archive_lease_until?: string | null
          archive_mp4_key?: string | null
          archive_mp4_url?: string | null
          archive_next_retry_at?: string | null
          archive_phase?: string | null
          archive_started_at?: string | null
          archive_status?: string
          archived_at?: string | null
          auto_posted_at?: string | null
          chunked_recording_id?: string
          chunks_deleted_at?: string | null
          chunks_stable_since?: string | null
          cleanup_attempts?: number
          cleanup_completed_at?: string | null
          cleanup_next_retry_at?: string | null
          cleanup_started_at?: string | null
          cleanup_status?: string
          cloudflare_deleted_at?: string | null
          cloudflare_mp4_download_url?: string | null
          cloudflare_playback_url?: string | null
          cloudflare_video_uid?: string | null
          cloudflare_vod_enabled?: boolean
          concat_completed_at?: string | null
          concat_completed_parts?: Json | null
          concat_next_part?: number | null
          concat_plan?: Json | null
          concat_started_at?: string | null
          concat_upload_id?: string | null
          created_at?: string
          delete_stream_error?: string | null
          deleted_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          expires_at?: string | null
          expiry_notified_at?: string | null
          filesize_bytes?: number | null
          hls_ready_at?: string | null
          id?: string
          ingest_attempts?: number
          last_cf_response?: Json | null
          last_cf_status?: string | null
          last_error_at?: string | null
          last_failed_at?: string | null
          last_ingest_at?: string | null
          last_webhook_event?: string | null
          live_session_id?: string
          mp4_export_started_at?: string | null
          mp4_ready_at?: string | null
          mp4_total_bytes?: number | null
          multipart_bytes_done?: number | null
          multipart_part_size?: number | null
          multipart_parts_done?: Json | null
          multipart_total_parts?: number | null
          multipart_upload_id?: string | null
          next_chunk_seq?: number
          normalized_object_key?: string | null
          playback_dash?: string | null
          playback_hls?: string | null
          playback_mp4?: string | null
          playback_provider?: string
          playback_type?: string | null
          posted_at?: string | null
          processing_started_at?: string | null
          r2_bucket?: string | null
          r2_object_key?: string | null
          r2_verified_at?: string | null
          r2_video_url?: string | null
          replay_post_id?: string | null
          replay_ready_at?: string | null
          replay_status?: string
          retry_count?: number
          snapshot_frozen_at?: string | null
          snapshot_total_bytes?: number | null
          snapshot_total_chunks?: number | null
          source_webm_key?: string | null
          source_webm_size?: number | null
          status?: Database["public"]["Enums"]["live_replay_status"]
          storage_provider?: string
          stream_deleted_at?: string | null
          stream_uid?: string | null
          temp_bucket?: string | null
          temp_hls_key?: string | null
          temp_hls_url?: string | null
          temp_mp4_key?: string | null
          temp_prefix?: string | null
          temp_total_size?: number | null
          thumbnail_url?: string | null
          total_chunks_for_ingest?: number | null
          tus_offset?: number
          tus_reset_count?: number
          tus_upload_url?: string | null
          updated_at?: string
          user_id?: string
          webhook_received_at?: string | null
          webm_source_deleted_at?: string | null
        }
        Relationships: []
      }
      live_session_events: {
        Row: {
          created_at: string
          from_status: string | null
          id: number
          live_session_id: string
          payload: Json | null
          reason: string | null
          source: string | null
          to_status: string | null
        }
        Insert: {
          created_at?: string
          from_status?: string | null
          id?: number
          live_session_id: string
          payload?: Json | null
          reason?: string | null
          source?: string | null
          to_status?: string | null
        }
        Update: {
          created_at?: string
          from_status?: string | null
          id?: number
          live_session_id?: string
          payload?: Json | null
          reason?: string | null
          source?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_session_events_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_session_events_live_session_id_fkey"
            columns: ["live_session_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      live_sessions: {
        Row: {
          agora_channel: string | null
          agora_channel_name: string | null
          agora_uid: number | null
          agora_uid_host: number | null
          archive_bucket: string | null
          archive_error: string | null
          archive_next_retry_at: string | null
          archive_object_key: string | null
          archive_retry_count: number
          archive_status: string
          archived_at: string | null
          armed_at: string | null
          armed_session_token: string | null
          auto_end_at: string | null
          auto_end_reason: string | null
          browser_recording_chunk_count: number | null
          browser_recording_status: string | null
          browser_recording_total_bytes: number | null
          browser_recording_warning: string | null
          channel_name: string
          cleanup_attempts: number
          cloudflare_deleted_at: string | null
          cloudflare_input_id: string | null
          cloudflare_live_input_id: string | null
          cloudflare_mp4_download_url: string | null
          cloudflare_video_uid: string | null
          connected_at: string | null
          connection_status: string
          created_at: string
          delete_stream_error: string | null
          deleted_at: string | null
          description: string | null
          device_id: string | null
          disconnected_at: string | null
          end_reason: string | null
          ended_at: string | null
          error_message: string | null
          go_live_clicked_at: string | null
          hls_url: string | null
          host_connection_status: string
          host_user_id: string
          id: string
          is_input_armed: boolean
          is_persistent_stream: boolean
          last_armed_heartbeat_at: string | null
          last_cleanup_at: string | null
          last_connection_check_at: string | null
          last_disconnected_at: string | null
          last_failed_at: string | null
          last_host_heartbeat_at: string | null
          last_recovery_at: string | null
          last_seen_at: string | null
          last_source_seen_at: string | null
          last_worker_response: Json | null
          live_input_disable_error: string | null
          live_input_disabled_at: string | null
          live_input_status: string | null
          live_post_id: string | null
          mode: string
          owner_id: string
          playback_provider: string
          playback_url: string | null
          post_id: string | null
          posted_at: string | null
          preview_ready: boolean
          preview_url: string | null
          privacy: string
          processing_started_at: string | null
          r2_archived_at: string | null
          r2_bucket: string | null
          r2_object_key: string | null
          r2_video_url: string | null
          reconnect_count: number
          reconnect_deadline_at: string | null
          recording_acquired_at: string | null
          recording_aspect_ratio: string | null
          recording_error: string | null
          recording_error_code: string | null
          recording_error_message: string | null
          recording_files: Json | null
          recording_height: number | null
          recording_last_query_at: string | null
          recording_layout: string | null
          recording_provider: string | null
          recording_ready_at: string | null
          recording_resource_id: string | null
          recording_sid: string | null
          recording_started_at: string | null
          recording_status: string
          recording_stop_requested_at: string | null
          recording_stopped_at: string | null
          recording_uid: number | null
          recording_width: number | null
          recovery_attempts: number
          replay_post_id: string | null
          replay_ready_at: string | null
          replay_url: string | null
          resource_id: string | null
          rtmp_config_id: string | null
          rtmps_url: string | null
          sid: string | null
          signal_lost_at: string | null
          signal_status: string | null
          slug: string | null
          source_connected: boolean
          source_connected_at: string | null
          source_device_type: string | null
          started_at: string
          status: string
          storage_provider: string
          stream_deleted_at: string | null
          stream_key_encrypted: string | null
          stream_key_last_reset_at: string | null
          temp_bucket: string | null
          temp_object_key: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          user_id: string | null
          viewer_count: number
        }
        Insert: {
          agora_channel?: string | null
          agora_channel_name?: string | null
          agora_uid?: number | null
          agora_uid_host?: number | null
          archive_bucket?: string | null
          archive_error?: string | null
          archive_next_retry_at?: string | null
          archive_object_key?: string | null
          archive_retry_count?: number
          archive_status?: string
          archived_at?: string | null
          armed_at?: string | null
          armed_session_token?: string | null
          auto_end_at?: string | null
          auto_end_reason?: string | null
          browser_recording_chunk_count?: number | null
          browser_recording_status?: string | null
          browser_recording_total_bytes?: number | null
          browser_recording_warning?: string | null
          channel_name: string
          cleanup_attempts?: number
          cloudflare_deleted_at?: string | null
          cloudflare_input_id?: string | null
          cloudflare_live_input_id?: string | null
          cloudflare_mp4_download_url?: string | null
          cloudflare_video_uid?: string | null
          connected_at?: string | null
          connection_status?: string
          created_at?: string
          delete_stream_error?: string | null
          deleted_at?: string | null
          description?: string | null
          device_id?: string | null
          disconnected_at?: string | null
          end_reason?: string | null
          ended_at?: string | null
          error_message?: string | null
          go_live_clicked_at?: string | null
          hls_url?: string | null
          host_connection_status?: string
          host_user_id: string
          id?: string
          is_input_armed?: boolean
          is_persistent_stream?: boolean
          last_armed_heartbeat_at?: string | null
          last_cleanup_at?: string | null
          last_connection_check_at?: string | null
          last_disconnected_at?: string | null
          last_failed_at?: string | null
          last_host_heartbeat_at?: string | null
          last_recovery_at?: string | null
          last_seen_at?: string | null
          last_source_seen_at?: string | null
          last_worker_response?: Json | null
          live_input_disable_error?: string | null
          live_input_disabled_at?: string | null
          live_input_status?: string | null
          live_post_id?: string | null
          mode?: string
          owner_id: string
          playback_provider?: string
          playback_url?: string | null
          post_id?: string | null
          posted_at?: string | null
          preview_ready?: boolean
          preview_url?: string | null
          privacy?: string
          processing_started_at?: string | null
          r2_archived_at?: string | null
          r2_bucket?: string | null
          r2_object_key?: string | null
          r2_video_url?: string | null
          reconnect_count?: number
          reconnect_deadline_at?: string | null
          recording_acquired_at?: string | null
          recording_aspect_ratio?: string | null
          recording_error?: string | null
          recording_error_code?: string | null
          recording_error_message?: string | null
          recording_files?: Json | null
          recording_height?: number | null
          recording_last_query_at?: string | null
          recording_layout?: string | null
          recording_provider?: string | null
          recording_ready_at?: string | null
          recording_resource_id?: string | null
          recording_sid?: string | null
          recording_started_at?: string | null
          recording_status?: string
          recording_stop_requested_at?: string | null
          recording_stopped_at?: string | null
          recording_uid?: number | null
          recording_width?: number | null
          recovery_attempts?: number
          replay_post_id?: string | null
          replay_ready_at?: string | null
          replay_url?: string | null
          resource_id?: string | null
          rtmp_config_id?: string | null
          rtmps_url?: string | null
          sid?: string | null
          signal_lost_at?: string | null
          signal_status?: string | null
          slug?: string | null
          source_connected?: boolean
          source_connected_at?: string | null
          source_device_type?: string | null
          started_at?: string
          status?: string
          storage_provider?: string
          stream_deleted_at?: string | null
          stream_key_encrypted?: string | null
          stream_key_last_reset_at?: string | null
          temp_bucket?: string | null
          temp_object_key?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          viewer_count?: number
        }
        Update: {
          agora_channel?: string | null
          agora_channel_name?: string | null
          agora_uid?: number | null
          agora_uid_host?: number | null
          archive_bucket?: string | null
          archive_error?: string | null
          archive_next_retry_at?: string | null
          archive_object_key?: string | null
          archive_retry_count?: number
          archive_status?: string
          archived_at?: string | null
          armed_at?: string | null
          armed_session_token?: string | null
          auto_end_at?: string | null
          auto_end_reason?: string | null
          browser_recording_chunk_count?: number | null
          browser_recording_status?: string | null
          browser_recording_total_bytes?: number | null
          browser_recording_warning?: string | null
          channel_name?: string
          cleanup_attempts?: number
          cloudflare_deleted_at?: string | null
          cloudflare_input_id?: string | null
          cloudflare_live_input_id?: string | null
          cloudflare_mp4_download_url?: string | null
          cloudflare_video_uid?: string | null
          connected_at?: string | null
          connection_status?: string
          created_at?: string
          delete_stream_error?: string | null
          deleted_at?: string | null
          description?: string | null
          device_id?: string | null
          disconnected_at?: string | null
          end_reason?: string | null
          ended_at?: string | null
          error_message?: string | null
          go_live_clicked_at?: string | null
          hls_url?: string | null
          host_connection_status?: string
          host_user_id?: string
          id?: string
          is_input_armed?: boolean
          is_persistent_stream?: boolean
          last_armed_heartbeat_at?: string | null
          last_cleanup_at?: string | null
          last_connection_check_at?: string | null
          last_disconnected_at?: string | null
          last_failed_at?: string | null
          last_host_heartbeat_at?: string | null
          last_recovery_at?: string | null
          last_seen_at?: string | null
          last_source_seen_at?: string | null
          last_worker_response?: Json | null
          live_input_disable_error?: string | null
          live_input_disabled_at?: string | null
          live_input_status?: string | null
          live_post_id?: string | null
          mode?: string
          owner_id?: string
          playback_provider?: string
          playback_url?: string | null
          post_id?: string | null
          posted_at?: string | null
          preview_ready?: boolean
          preview_url?: string | null
          privacy?: string
          processing_started_at?: string | null
          r2_archived_at?: string | null
          r2_bucket?: string | null
          r2_object_key?: string | null
          r2_video_url?: string | null
          reconnect_count?: number
          reconnect_deadline_at?: string | null
          recording_acquired_at?: string | null
          recording_aspect_ratio?: string | null
          recording_error?: string | null
          recording_error_code?: string | null
          recording_error_message?: string | null
          recording_files?: Json | null
          recording_height?: number | null
          recording_last_query_at?: string | null
          recording_layout?: string | null
          recording_provider?: string | null
          recording_ready_at?: string | null
          recording_resource_id?: string | null
          recording_sid?: string | null
          recording_started_at?: string | null
          recording_status?: string
          recording_stop_requested_at?: string | null
          recording_stopped_at?: string | null
          recording_uid?: number | null
          recording_width?: number | null
          recovery_attempts?: number
          replay_post_id?: string | null
          replay_ready_at?: string | null
          replay_url?: string | null
          resource_id?: string | null
          rtmp_config_id?: string | null
          rtmps_url?: string | null
          sid?: string | null
          signal_lost_at?: string | null
          signal_status?: string | null
          slug?: string | null
          source_connected?: boolean
          source_connected_at?: string | null
          source_device_type?: string | null
          started_at?: string
          status?: string
          storage_provider?: string
          stream_deleted_at?: string | null
          stream_key_encrypted?: string | null
          stream_key_last_reset_at?: string | null
          temp_bucket?: string | null
          temp_object_key?: string | null
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
          viewer_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_live_post_id_fkey"
            columns: ["live_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_replay_post_id_fkey"
            columns: ["replay_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_rtmp_config_id_fkey"
            columns: ["rtmp_config_id"]
            isOneToOne: false
            referencedRelation: "rtmp_stream_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      livestreams: {
        Row: {
          created_at: string | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          is_eligible: boolean | null
          started_at: string
          stream_id: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_eligible?: boolean | null
          started_at?: string
          stream_id?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          is_eligible?: boolean | null
          started_at?: string
          stream_id?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "livestreams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "livestreams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "livestreams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "livestreams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_ip_logs: {
        Row: {
          created_at: string
          id: string
          ip_address: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "login_ip_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_ip_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_ip_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "login_ip_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      m6b_gap_scan_batches: {
        Row: {
          created_at: string
          est_rows: number
          finished_at: string | null
          gap_found: number
          gap_samples: Json
          half: number
          id: string
          last_error: string | null
          month: string
          range_end: string
          range_start: string
          rows_scanned: number
          started_at: string | null
          status: string
          token_symbol: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          est_rows?: number
          finished_at?: string | null
          gap_found?: number
          gap_samples?: Json
          half?: number
          id?: string
          last_error?: string | null
          month: string
          range_end: string
          range_start: string
          rows_scanned?: number
          started_at?: string | null
          status?: string
          token_symbol: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          est_rows?: number
          finished_at?: string | null
          gap_found?: number
          gap_samples?: Json
          half?: number
          id?: string
          last_error?: string | null
          month?: string
          range_end?: string
          range_start?: string
          rows_scanned?: number
          started_at?: string | null
          status?: string
          token_symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          id: string
          message_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          message_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          message_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string | null
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean | null
          media_urls: Json | null
          message_type: string
          metadata: Json
          pinned_at: string | null
          pinned_by: string | null
          reply_to_id: string | null
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          media_urls?: Json | null
          message_type?: string
          metadata?: Json
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean | null
          media_urls?: Json | null
          message_type?: string
          metadata?: Json
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to_id?: string | null
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_gap_signups: {
        Row: {
          created_at: string
          email: string | null
          id: string
          logged_at: string
          signup_method: string
          user_id: string
          username: string | null
          wallet_address: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          logged_at?: string
          signup_method?: string
          user_id: string
          username?: string | null
          wallet_address?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          logged_at?: string
          signup_method?: string
          user_id?: string
          username?: string | null
          wallet_address?: string | null
        }
        Relationships: []
      }
      mint_allocations: {
        Row: {
          allocation_amount: number
          allocation_amount_capped: number
          consistency_factor: number | null
          created_at: string | null
          epoch_id: string
          id: string
          instant_amount: number | null
          is_eligible: boolean
          light_score_total: number
          locked_amount: number | null
          mint_request_id: string | null
          reason_codes: string[] | null
          share_percent: number
          status: string
          trust_band: string | null
          updated_at: string | null
          user_id: string
          utility_factor: number | null
          vesting_schedule_id: string | null
        }
        Insert: {
          allocation_amount?: number
          allocation_amount_capped?: number
          consistency_factor?: number | null
          created_at?: string | null
          epoch_id: string
          id?: string
          instant_amount?: number | null
          is_eligible?: boolean
          light_score_total?: number
          locked_amount?: number | null
          mint_request_id?: string | null
          reason_codes?: string[] | null
          share_percent?: number
          status?: string
          trust_band?: string | null
          updated_at?: string | null
          user_id: string
          utility_factor?: number | null
          vesting_schedule_id?: string | null
        }
        Update: {
          allocation_amount?: number
          allocation_amount_capped?: number
          consistency_factor?: number | null
          created_at?: string | null
          epoch_id?: string
          id?: string
          instant_amount?: number | null
          is_eligible?: boolean
          light_score_total?: number
          locked_amount?: number | null
          mint_request_id?: string | null
          reason_codes?: string[] | null
          share_percent?: number
          status?: string
          trust_band?: string | null
          updated_at?: string | null
          user_id?: string
          utility_factor?: number | null
          vesting_schedule_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mint_allocations_epoch_id_fkey"
            columns: ["epoch_id"]
            isOneToOne: false
            referencedRelation: "mint_epochs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mint_allocations_mint_request_id_fkey"
            columns: ["mint_request_id"]
            isOneToOne: false
            referencedRelation: "pplp_mint_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      mint_epochs: {
        Row: {
          active_quality_users: number | null
          allocation_breakdown: Json | null
          base_expansion: number | null
          contribution_expansion: number | null
          created_at: string
          discipline_modulator: number | null
          ecosystem_expansion: number | null
          ecosystem_usage_index: number | null
          eligible_users: number | null
          epoch_date: string
          epoch_month: string | null
          final_mint: number | null
          guard_bypassed: boolean
          guard_bypassed_at: string | null
          guard_bypassed_by: string | null
          guard_report: Json | null
          id: string
          mint_pool: number | null
          platform_pool: Json
          rules_version: string | null
          snapshot_at: string | null
          soft_ceiling: number | null
          status: string | null
          system_stage: string | null
          total_actions: number
          total_cap: number
          total_light_score: number | null
          total_minted: number
          unique_users: number
          updated_at: string
          verified_contribution_value: number | null
          verified_light_score: number | null
        }
        Insert: {
          active_quality_users?: number | null
          allocation_breakdown?: Json | null
          base_expansion?: number | null
          contribution_expansion?: number | null
          created_at?: string
          discipline_modulator?: number | null
          ecosystem_expansion?: number | null
          ecosystem_usage_index?: number | null
          eligible_users?: number | null
          epoch_date: string
          epoch_month?: string | null
          final_mint?: number | null
          guard_bypassed?: boolean
          guard_bypassed_at?: string | null
          guard_bypassed_by?: string | null
          guard_report?: Json | null
          id?: string
          mint_pool?: number | null
          platform_pool?: Json
          rules_version?: string | null
          snapshot_at?: string | null
          soft_ceiling?: number | null
          status?: string | null
          system_stage?: string | null
          total_actions?: number
          total_cap?: number
          total_light_score?: number | null
          total_minted?: number
          unique_users?: number
          updated_at?: string
          verified_contribution_value?: number | null
          verified_light_score?: number | null
        }
        Update: {
          active_quality_users?: number | null
          allocation_breakdown?: Json | null
          base_expansion?: number | null
          contribution_expansion?: number | null
          created_at?: string
          discipline_modulator?: number | null
          ecosystem_expansion?: number | null
          ecosystem_usage_index?: number | null
          eligible_users?: number | null
          epoch_date?: string
          epoch_month?: string | null
          final_mint?: number | null
          guard_bypassed?: boolean
          guard_bypassed_at?: string | null
          guard_bypassed_by?: string | null
          guard_report?: Json | null
          id?: string
          mint_pool?: number | null
          platform_pool?: Json
          rules_version?: string | null
          snapshot_at?: string | null
          soft_ceiling?: number | null
          status?: string | null
          system_stage?: string | null
          total_actions?: number
          total_cap?: number
          total_light_score?: number | null
          total_minted?: number
          unique_users?: number
          updated_at?: string
          verified_contribution_value?: number | null
          verified_light_score?: number | null
        }
        Relationships: []
      }
      moralis_api_usage: {
        Row: {
          alert_threshold_pct: number
          alerted_at: string | null
          call_count: number
          daily_limit: number
          last_source: string | null
          updated_at: string
          usage_date: string
        }
        Insert: {
          alert_threshold_pct?: number
          alerted_at?: string | null
          call_count?: number
          daily_limit?: number
          last_source?: string | null
          updated_at?: string
          usage_date: string
        }
        Update: {
          alert_threshold_pct?: number
          alerted_at?: string | null
          call_count?: number
          daily_limit?: number
          last_source?: string | null
          updated_at?: string
          usage_date?: string
        }
        Relationships: []
      }
      mystery_box_definitions: {
        Row: {
          code: string
          cost_camly: number | null
          created_at: string
          drop_table: Json
          icon: string | null
          id: string
          is_active: boolean
          name_en: string
          name_vi: string
          pity_threshold: number
          source_type: Database["public"]["Enums"]["box_source"]
          tier: Database["public"]["Enums"]["box_tier"]
          updated_at: string
        }
        Insert: {
          code: string
          cost_camly?: number | null
          created_at?: string
          drop_table?: Json
          icon?: string | null
          id?: string
          is_active?: boolean
          name_en: string
          name_vi: string
          pity_threshold?: number
          source_type: Database["public"]["Enums"]["box_source"]
          tier: Database["public"]["Enums"]["box_tier"]
          updated_at?: string
        }
        Update: {
          code?: string
          cost_camly?: number | null
          created_at?: string
          drop_table?: Json
          icon?: string | null
          id?: string
          is_active?: boolean
          name_en?: string
          name_vi?: string
          pity_threshold?: number
          source_type?: Database["public"]["Enums"]["box_source"]
          tier?: Database["public"]["Enums"]["box_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      mystery_box_grant_audit: {
        Row: {
          box_code: string | null
          created_at: string
          granted_by: string | null
          id: string
          inventory_id: string | null
          reason: string | null
          source: Database["public"]["Enums"]["box_source"]
          target_user_id: string
        }
        Insert: {
          box_code?: string | null
          created_at?: string
          granted_by?: string | null
          id?: string
          inventory_id?: string | null
          reason?: string | null
          source: Database["public"]["Enums"]["box_source"]
          target_user_id: string
        }
        Update: {
          box_code?: string | null
          created_at?: string
          granted_by?: string | null
          id?: string
          inventory_id?: string | null
          reason?: string | null
          source?: Database["public"]["Enums"]["box_source"]
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mystery_box_grant_audit_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      mystery_box_inventory: {
        Row: {
          box_def_id: string
          created_at: string
          expires_at: string | null
          id: string
          locked: boolean
          opened_at: string | null
          pity_counter: number
          reward_jsonb: Json | null
          risk_flag: boolean
          source_event: Database["public"]["Enums"]["box_source"]
          source_ref_id: string | null
          user_id: string
        }
        Insert: {
          box_def_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          locked?: boolean
          opened_at?: string | null
          pity_counter?: number
          reward_jsonb?: Json | null
          risk_flag?: boolean
          source_event: Database["public"]["Enums"]["box_source"]
          source_ref_id?: string | null
          user_id: string
        }
        Update: {
          box_def_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          locked?: boolean
          opened_at?: string | null
          pity_counter?: number
          reward_jsonb?: Json | null
          risk_flag?: boolean
          source_event?: Database["public"]["Enums"]["box_source"]
          source_ref_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mystery_box_inventory_box_def_id_fkey"
            columns: ["box_def_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      mystery_box_open_log: {
        Row: {
          box_def_id: string
          id: string
          inventory_id: string
          opened_at: string
          reward_id: string | null
          reward_jsonb: Json
          rng_seed: string
          user_id: string
        }
        Insert: {
          box_def_id: string
          id?: string
          inventory_id: string
          opened_at?: string
          reward_id?: string | null
          reward_jsonb: Json
          rng_seed: string
          user_id: string
        }
        Update: {
          box_def_id?: string
          id?: string
          inventory_id?: string
          opened_at?: string
          reward_id?: string | null
          reward_jsonb?: Json
          rng_seed?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mystery_box_open_log_box_def_id_fkey"
            columns: ["box_def_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_open_log_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_open_log_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      mystery_box_orders: {
        Row: {
          box_code: string
          box_def_id: string
          confirmed_at: string | null
          created_at: string
          expires_at: string
          failure_reason: string | null
          from_address: string | null
          id: string
          inventory_id: string | null
          price_camly: number
          status: string
          treasury_address: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          box_code: string
          box_def_id: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          failure_reason?: string | null
          from_address?: string | null
          id?: string
          inventory_id?: string | null
          price_camly: number
          status?: string
          treasury_address: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          box_code?: string
          box_def_id?: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          failure_reason?: string | null
          from_address?: string | null
          id?: string
          inventory_id?: string | null
          price_camly?: number
          status?: string
          treasury_address?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mystery_box_orders_box_def_id_fkey"
            columns: ["box_def_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_orders_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      mystery_box_premium_grants: {
        Row: {
          granted_at: string
          inventory_id: string | null
          trigger_balance: number
          user_id: string
        }
        Insert: {
          granted_at?: string
          inventory_id?: string | null
          trigger_balance: number
          user_id: string
        }
        Update: {
          granted_at?: string
          inventory_id?: string | null
          trigger_balance?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mystery_box_premium_grants_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_premium_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_premium_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_premium_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_premium_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mystery_box_rewards: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          rarity: string | null
          type: Database["public"]["Enums"]["box_reward_type"]
          value_int: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          rarity?: string | null
          type: Database["public"]["Enums"]["box_reward_type"]
          value_int?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          rarity?: string | null
          type?: Database["public"]["Enums"]["box_reward_type"]
          value_int?: number
        }
        Relationships: []
      }
      mystery_box_risk_log: {
        Row: {
          created_at: string
          details: Json
          id: string
          inventory_id: string | null
          resolved: boolean
          risk_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          inventory_id?: string | null
          resolved?: boolean
          risk_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          inventory_id?: string | null
          resolved?: boolean
          risk_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mystery_box_risk_log_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_risk_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_risk_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_risk_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mystery_box_risk_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mystery_box_shop_config: {
        Row: {
          camly_decimals: number
          camly_token: string
          chain_id: number
          id: number
          is_enabled: boolean
          min_confirmations: number
          treasury_address: string
          updated_at: string
        }
        Insert: {
          camly_decimals?: number
          camly_token: string
          chain_id?: number
          id?: number
          is_enabled?: boolean
          min_confirmations?: number
          treasury_address: string
          updated_at?: string
        }
        Update: {
          camly_decimals?: number
          camly_token?: string
          chain_id?: number
          id?: number
          is_enabled?: boolean
          min_confirmations?: number
          treasury_address?: string
          updated_at?: string
        }
        Relationships: []
      }
      mystery_box_stats_daily: {
        Row: {
          actual_pct: number
          box_def_id: string
          created_at: string
          delta_pct: number | null
          expected_pct: number
          id: string
          opens_count: number
          reward_code: string
          stat_date: string
        }
        Insert: {
          actual_pct?: number
          box_def_id: string
          created_at?: string
          delta_pct?: number | null
          expected_pct?: number
          id?: string
          opens_count?: number
          reward_code: string
          stat_date: string
        }
        Update: {
          actual_pct?: number
          box_def_id?: string
          created_at?: string
          delta_pct?: number | null
          expected_pct?: number
          id?: string
          opens_count?: number
          reward_code?: string
          stat_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "mystery_box_stats_daily_box_def_id_fkey"
            columns: ["box_def_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          metadata: Json | null
          post_id: string | null
          read: boolean
          type: string
          user_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          post_id?: string | null
          read?: boolean
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          post_id?: string | null
          read?: boolean
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_clients: {
        Row: {
          allowed_scopes: string[]
          client_id: string
          client_name: string
          client_secret: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          platform_name: string | null
          redirect_uris: string[]
          updated_at: string
          webhook_url: string | null
          website_url: string | null
        }
        Insert: {
          allowed_scopes?: string[]
          client_id: string
          client_name: string
          client_secret: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          platform_name?: string | null
          redirect_uris?: string[]
          updated_at?: string
          webhook_url?: string | null
          website_url?: string | null
        }
        Update: {
          allowed_scopes?: string[]
          client_id?: string
          client_name?: string
          client_secret?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          platform_name?: string | null
          redirect_uris?: string[]
          updated_at?: string
          webhook_url?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      oauth_codes: {
        Row: {
          client_id: string
          code: string
          code_challenge: string | null
          code_challenge_method: string | null
          created_at: string
          expires_at: string
          id: string
          is_used: boolean
          redirect_uri: string
          scope: string[]
          user_id: string
        }
        Insert: {
          client_id: string
          code: string
          code_challenge?: string | null
          code_challenge_method?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          redirect_uri: string
          scope?: string[]
          user_id: string
        }
        Update: {
          client_id?: string
          code?: string
          code_challenge?: string | null
          code_challenge_method?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          redirect_uri?: string
          scope?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "oauth_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string
          member_did_id: string
          metadata: Json
          org_did_id: string
          permissions: Json
          removed_at: string | null
          role: string
          status: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          member_did_id: string
          metadata?: Json
          org_did_id: string
          permissions?: Json
          removed_at?: string | null
          role?: string
          status?: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          member_did_id?: string
          metadata?: Json
          org_did_id?: string
          permissions?: Json
          removed_at?: string | null
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
          {
            foreignKeyName: "org_members_member_did_id_fkey"
            columns: ["member_did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
          {
            foreignKeyName: "org_members_org_did_id_fkey"
            columns: ["org_did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      org_profile: {
        Row: {
          created_at: string
          description: string | null
          did_id: string
          display_name: string
          domain: string | null
          domain_verified: boolean
          domain_verified_at: string | null
          legal_name: string | null
          logo_url: string | null
          member_count: number
          metadata: Json
          org_type: string
          updated_at: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          did_id: string
          display_name: string
          domain?: string | null
          domain_verified?: boolean
          domain_verified_at?: string | null
          legal_name?: string | null
          logo_url?: string | null
          member_count?: number
          metadata?: Json
          org_type?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          did_id?: string
          display_name?: string
          domain?: string | null
          domain_verified?: boolean
          domain_verified_at?: string | null
          legal_name?: string | null
          logo_url?: string | null
          member_count?: number
          metadata?: Json
          org_type?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_profile_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: true
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          expires_at: string
          id: string
          identifier: string
          is_used: boolean
          max_attempts: number
          type: string
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          expires_at: string
          id?: string
          identifier: string
          is_used?: boolean
          max_attempts?: number
          type?: string
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          identifier?: string
          is_used?: boolean
          max_attempts?: number
          type?: string
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          request_ip: string | null
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          request_ip?: string | null
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          request_ip?: string | null
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pending_claims: {
        Row: {
          admin_id: string | null
          admin_note: string | null
          amount: number
          bscscan_url: string | null
          created_at: string | null
          id: string
          reviewed_at: string | null
          status: string
          tx_hash: string | null
          updated_at: string | null
          user_id: string
          wallet_address: string
        }
        Insert: {
          admin_id?: string | null
          admin_note?: string | null
          amount: number
          bscscan_url?: string | null
          created_at?: string | null
          id?: string
          reviewed_at?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string | null
          user_id: string
          wallet_address: string
        }
        Update: {
          admin_id?: string | null
          admin_note?: string | null
          amount?: number
          bscscan_url?: string | null
          created_at?: string | null
          id?: string
          reviewed_at?: string | null
          status?: string
          tx_hash?: string | null
          updated_at?: string | null
          user_id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_claims_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_claims_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_claims_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_claims_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_provisions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          email: string
          fun_profile_id: string | null
          id: string
          merge_request_id: string | null
          password_token_hash: string
          platform_data: Json | null
          platform_id: string
          platform_user_id: string | null
          status: string | null
          token_expires_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          email: string
          fun_profile_id?: string | null
          id?: string
          merge_request_id?: string | null
          password_token_hash: string
          platform_data?: Json | null
          platform_id: string
          platform_user_id?: string | null
          status?: string | null
          token_expires_at: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          email?: string
          fun_profile_id?: string | null
          id?: string
          merge_request_id?: string | null
          password_token_hash?: string
          platform_data?: Json | null
          platform_id?: string
          platform_user_id?: string | null
          status?: string | null
          token_expires_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_provisions_merge_request_id_fkey"
            columns: ["merge_request_id"]
            isOneToOne: false
            referencedRelation: "account_merge_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_battle_leaderboard: {
        Row: {
          draws: number
          id: string
          losses: number
          points: number
          season_id: string
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          draws?: number
          id?: string
          losses?: number
          points?: number
          season_id: string
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          draws?: number
          id?: string
          losses?: number
          points?: number
          season_id?: string
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "pet_battle_leaderboard_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "pet_battle_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_battle_seasons: {
        Row: {
          created_at: string
          end_at: string
          id: string
          is_current: boolean
          name: string
          start_at: string
        }
        Insert: {
          created_at?: string
          end_at: string
          id?: string
          is_current?: boolean
          name: string
          start_at: string
        }
        Update: {
          created_at?: string
          end_at?: string
          id?: string
          is_current?: boolean
          name?: string
          start_at?: string
        }
        Relationships: []
      }
      pet_battles: {
        Row: {
          challenger_id: string
          challenger_snapshot: Json
          created_at: string
          expires_at: string
          id: string
          opponent_id: string
          opponent_snapshot: Json
          resolved_at: string | null
          rounds: Json
          season_id: string | null
          seed: string
          status: string
          winner_id: string | null
          xp_award_challenger: number
          xp_award_opponent: number
        }
        Insert: {
          challenger_id: string
          challenger_snapshot: Json
          created_at?: string
          expires_at?: string
          id?: string
          opponent_id: string
          opponent_snapshot: Json
          resolved_at?: string | null
          rounds?: Json
          season_id?: string | null
          seed?: string
          status?: string
          winner_id?: string | null
          xp_award_challenger?: number
          xp_award_opponent?: number
        }
        Update: {
          challenger_id?: string
          challenger_snapshot?: Json
          created_at?: string
          expires_at?: string
          id?: string
          opponent_id?: string
          opponent_snapshot?: Json
          resolved_at?: string | null
          rounds?: Json
          season_id?: string | null
          seed?: string
          status?: string
          winner_id?: string | null
          xp_award_challenger?: number
          xp_award_opponent?: number
        }
        Relationships: []
      }
      pet_cheers: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          message: string | null
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          message?: string | null
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          message?: string | null
          to_user_id?: string
        }
        Relationships: []
      }
      pet_cosmetics_catalog: {
        Row: {
          created_at: string
          description_en: string | null
          description_vi: string | null
          for_sale: boolean
          id: string
          is_active: boolean
          level_required: number
          name_en: string
          name_vi: string
          price_camly: number
          rarity: string
          slot: string
          slug: string
          sold_count: number
          sprite_url: string | null
          stock_limit: number | null
          unlock_condition: string | null
        }
        Insert: {
          created_at?: string
          description_en?: string | null
          description_vi?: string | null
          for_sale?: boolean
          id?: string
          is_active?: boolean
          level_required?: number
          name_en: string
          name_vi: string
          price_camly?: number
          rarity: string
          slot: string
          slug: string
          sold_count?: number
          sprite_url?: string | null
          stock_limit?: number | null
          unlock_condition?: string | null
        }
        Update: {
          created_at?: string
          description_en?: string | null
          description_vi?: string | null
          for_sale?: boolean
          id?: string
          is_active?: boolean
          level_required?: number
          name_en?: string
          name_vi?: string
          price_camly?: number
          rarity?: string
          slot?: string
          slug?: string
          sold_count?: number
          sprite_url?: string | null
          stock_limit?: number | null
          unlock_condition?: string | null
        }
        Relationships: []
      }
      pet_cosmetics_owned: {
        Row: {
          acquired_at: string
          cosmetic_id: string
          equipped: boolean
          flagged_at: string | null
          id: string
          source: string
          source_box_open_id: string | null
          user_id: string
        }
        Insert: {
          acquired_at?: string
          cosmetic_id: string
          equipped?: boolean
          flagged_at?: string | null
          id?: string
          source?: string
          source_box_open_id?: string | null
          user_id: string
        }
        Update: {
          acquired_at?: string
          cosmetic_id?: string
          equipped?: boolean
          flagged_at?: string | null
          id?: string
          source?: string
          source_box_open_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_cosmetics_owned_cosmetic_id_fkey"
            columns: ["cosmetic_id"]
            isOneToOne: false
            referencedRelation: "pet_cosmetics_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pet_cosmetics_owned_source_box_open_id_fkey"
            columns: ["source_box_open_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_open_log"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_interactions: {
        Row: {
          created_at: string
          event: Database["public"]["Enums"]["pet_event_type"]
          id: number
          mood_after: Database["public"]["Enums"]["pet_mood"] | null
          mood_before: Database["public"]["Enums"]["pet_mood"] | null
          user_id: string
          xp_delta: number
        }
        Insert: {
          created_at?: string
          event: Database["public"]["Enums"]["pet_event_type"]
          id?: number
          mood_after?: Database["public"]["Enums"]["pet_mood"] | null
          mood_before?: Database["public"]["Enums"]["pet_mood"] | null
          user_id: string
          xp_delta?: number
        }
        Update: {
          created_at?: string
          event?: Database["public"]["Enums"]["pet_event_type"]
          id?: number
          mood_after?: Database["public"]["Enums"]["pet_mood"] | null
          mood_before?: Database["public"]["Enums"]["pet_mood"] | null
          user_id?: string
          xp_delta?: number
        }
        Relationships: []
      }
      pet_risk_appeals: {
        Row: {
          admin_id: string | null
          admin_note: string | null
          created_at: string
          evidence_urls: string[] | null
          id: string
          message: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          admin_note?: string | null
          created_at?: string
          evidence_urls?: string[] | null
          id?: string
          message: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          admin_note?: string | null
          created_at?: string
          evidence_urls?: string[] | null
          id?: string
          message?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      pet_risk_scores: {
        Row: {
          last_reasons: Json
          risk_score: number
          risk_tier: string
          signal_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          last_reasons?: Json
          risk_score?: number
          risk_tier?: string
          signal_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          last_reasons?: Json
          risk_score?: number
          risk_tier?: string
          signal_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pet_risk_signals: {
        Row: {
          created_at: string
          evidence: Json
          id: string
          severity: number
          signal_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          id?: string
          severity?: number
          signal_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          id?: string
          severity?: number
          signal_type?: string
          user_id?: string
        }
        Relationships: []
      }
      pet_shop_config: {
        Row: {
          camly_decimals: number
          camly_token: string
          chain_id: number
          id: number
          is_enabled: boolean
          min_confirmations: number
          treasury_address: string
          updated_at: string
        }
        Insert: {
          camly_decimals?: number
          camly_token?: string
          chain_id?: number
          id?: number
          is_enabled?: boolean
          min_confirmations?: number
          treasury_address: string
          updated_at?: string
        }
        Update: {
          camly_decimals?: number
          camly_token?: string
          chain_id?: number
          id?: number
          is_enabled?: boolean
          min_confirmations?: number
          treasury_address?: string
          updated_at?: string
        }
        Relationships: []
      }
      pet_shop_orders: {
        Row: {
          confirmed_at: string | null
          cosmetic_id: string
          created_at: string
          expires_at: string
          failure_reason: string | null
          from_address: string | null
          id: string
          price_camly: number
          status: string
          treasury_address: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          cosmetic_id: string
          created_at?: string
          expires_at?: string
          failure_reason?: string | null
          from_address?: string | null
          id?: string
          price_camly: number
          status?: string
          treasury_address: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          cosmetic_id?: string
          created_at?: string
          expires_at?: string
          failure_reason?: string | null
          from_address?: string | null
          id?: string
          price_camly?: number
          status?: string
          treasury_address?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_shop_orders_cosmetic_id_fkey"
            columns: ["cosmetic_id"]
            isOneToOne: false
            referencedRelation: "pet_cosmetics_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_states: {
        Row: {
          accessories: Json
          cheers_received_total: number
          created_at: string
          evolution_stage: number
          last_interaction_at: string
          last_renamed_at: string | null
          level: number
          mood: Database["public"]["Enums"]["pet_mood"]
          name: string
          risk_tier: string
          species: string
          updated_at: string
          user_id: string
          visible: boolean
          voice_enabled: boolean
          xp: number
          xp_today: number
          xp_today_date: string
        }
        Insert: {
          accessories?: Json
          cheers_received_total?: number
          created_at?: string
          evolution_stage?: number
          last_interaction_at?: string
          last_renamed_at?: string | null
          level?: number
          mood?: Database["public"]["Enums"]["pet_mood"]
          name?: string
          risk_tier?: string
          species?: string
          updated_at?: string
          user_id: string
          visible?: boolean
          voice_enabled?: boolean
          xp?: number
          xp_today?: number
          xp_today_date?: string
        }
        Update: {
          accessories?: Json
          cheers_received_total?: number
          created_at?: string
          evolution_stage?: number
          last_interaction_at?: string
          last_renamed_at?: string | null
          level?: number
          mood?: Database["public"]["Enums"]["pet_mood"]
          name?: string
          risk_tier?: string
          species?: string
          updated_at?: string
          user_id?: string
          visible?: boolean
          voice_enabled?: boolean
          xp?: number
          xp_today?: number
          xp_today_date?: string
        }
        Relationships: []
      }
      pet_voice_lines: {
        Row: {
          audio_url: string | null
          created_at: string
          id: string
          is_active: boolean
          mood: Database["public"]["Enums"]["pet_mood"]
          sort_order: number
          text_en: string
          text_vi: string
          trigger_event: Database["public"]["Enums"]["pet_event_type"]
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mood: Database["public"]["Enums"]["pet_mood"]
          sort_order?: number
          text_en: string
          text_vi: string
          trigger_event: Database["public"]["Enums"]["pet_event_type"]
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          mood?: Database["public"]["Enums"]["pet_mood"]
          sort_order?: number
          text_en?: string
          text_vi?: string
          trigger_event?: Database["public"]["Enums"]["pet_event_type"]
        }
        Relationships: []
      }
      platform_financial_data: {
        Row: {
          client_id: string
          client_timestamp: string | null
          created_at: string
          id: string
          last_sync_at: string
          sync_count: number
          total_bet: number
          total_deposit: number
          total_loss: number
          total_profit: number
          total_win: number
          total_withdraw: number
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          client_timestamp?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string
          sync_count?: number
          total_bet?: number
          total_deposit?: number
          total_loss?: number
          total_profit?: number
          total_win?: number
          total_withdraw?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          client_timestamp?: string | null
          created_at?: string
          id?: string
          last_sync_at?: string
          sync_count?: number
          total_bet?: number
          total_deposit?: number
          total_loss?: number
          total_profit?: number
          total_win?: number
          total_withdraw?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_user_data: {
        Row: {
          client_id: string
          client_timestamp: string | null
          created_at: string
          data: Json
          id: string
          last_sync_mode: string | null
          sync_count: number
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          client_timestamp?: string | null
          created_at?: string
          data?: Json
          id?: string
          last_sync_mode?: string | null
          sync_count?: number
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          client_timestamp?: string | null
          created_at?: string
          data?: Json
          id?: string
          last_sync_mode?: string | null
          sync_count?: number
          synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      post_attachments: {
        Row: {
          alt_text: string | null
          created_at: string
          file_type: string
          file_url: string
          height: number | null
          id: string
          mime_type: string | null
          post_id: string
          size_bytes: number | null
          sort_order: number
          storage_key: string | null
          transform_meta: Json | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          file_type?: string
          file_url: string
          height?: number | null
          id?: string
          mime_type?: string | null
          post_id: string
          size_bytes?: number | null
          sort_order?: number
          storage_key?: string | null
          transform_meta?: Json | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          file_type?: string
          file_url?: string
          height?: number | null
          id?: string
          mime_type?: string | null
          post_id?: string
          size_bytes?: number | null
          sort_order?: number
          storage_key?: string | null
          transform_meta?: Json | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_attachments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_edit_after_score_log: {
        Row: {
          created_at: string
          id: string
          new_hash: string | null
          new_length: number | null
          old_hash: string | null
          old_length: number | null
          post_id: string
          scored_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          new_hash?: string | null
          new_length?: number | null
          old_hash?: string | null
          old_length?: number | null
          post_id: string
          scored_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          new_hash?: string | null
          new_length?: number | null
          old_hash?: string | null
          old_length?: number | null
          post_id?: string
          scored_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      post_tags: {
        Row: {
          created_at: string
          id: string
          post_id: string
          tagged_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          tagged_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          tagged_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          content: string
          content_hash: string | null
          created_at: string
          deleted_at: string | null
          gift_amount: string | null
          gift_message: string | null
          gift_recipient_id: string | null
          gift_sender_id: string | null
          gift_token: string | null
          highlight_expires_at: string | null
          id: string
          image_url: string | null
          is_highlighted: boolean
          is_reward_eligible: boolean | null
          location: string | null
          media_urls: Json | null
          metadata: Json
          moderation_status: string
          playback_provider: string | null
          post_type: string
          pplp_pillar: string | null
          processing_message: string | null
          public_id: string
          replay_ready: boolean | null
          replay_status: string | null
          scored_at: string | null
          scored_content_hash: string | null
          share_code: string
          slug: string | null
          thumbnail_url: string | null
          tx_hash: string | null
          updated_at: string
          user_id: string
          video_duration_seconds: number | null
          video_processing_status: string | null
          video_size_bytes: number | null
          video_url: string | null
          visibility: string
        }
        Insert: {
          content: string
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          gift_amount?: string | null
          gift_message?: string | null
          gift_recipient_id?: string | null
          gift_sender_id?: string | null
          gift_token?: string | null
          highlight_expires_at?: string | null
          id?: string
          image_url?: string | null
          is_highlighted?: boolean
          is_reward_eligible?: boolean | null
          location?: string | null
          media_urls?: Json | null
          metadata?: Json
          moderation_status?: string
          playback_provider?: string | null
          post_type?: string
          pplp_pillar?: string | null
          processing_message?: string | null
          public_id?: string
          replay_ready?: boolean | null
          replay_status?: string | null
          scored_at?: string | null
          scored_content_hash?: string | null
          share_code?: string
          slug?: string | null
          thumbnail_url?: string | null
          tx_hash?: string | null
          updated_at?: string
          user_id: string
          video_duration_seconds?: number | null
          video_processing_status?: string | null
          video_size_bytes?: number | null
          video_url?: string | null
          visibility?: string
        }
        Update: {
          content?: string
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          gift_amount?: string | null
          gift_message?: string | null
          gift_recipient_id?: string | null
          gift_sender_id?: string | null
          gift_token?: string | null
          highlight_expires_at?: string | null
          id?: string
          image_url?: string | null
          is_highlighted?: boolean
          is_reward_eligible?: boolean | null
          location?: string | null
          media_urls?: Json | null
          metadata?: Json
          moderation_status?: string
          playback_provider?: string | null
          post_type?: string
          pplp_pillar?: string | null
          processing_message?: string | null
          public_id?: string
          replay_ready?: boolean | null
          replay_status?: string | null
          scored_at?: string | null
          scored_content_hash?: string | null
          share_code?: string
          slug?: string | null
          thumbnail_url?: string | null
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
          video_duration_seconds?: number | null
          video_processing_status?: string | null
          video_size_bytes?: number | null
          video_url?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_action_caps: {
        Row: {
          action_type: string
          base_reward: number | null
          cooldown_seconds: number | null
          created_at: string | null
          diminishing_factor: number | null
          diminishing_threshold: number | null
          id: string
          is_active: boolean | null
          max_global_daily: number | null
          max_per_user_daily: number | null
          max_per_user_weekly: number | null
          min_quality_score: number | null
          multiplier_ranges: Json | null
          platform_id: string | null
          thresholds: Json | null
        }
        Insert: {
          action_type: string
          base_reward?: number | null
          cooldown_seconds?: number | null
          created_at?: string | null
          diminishing_factor?: number | null
          diminishing_threshold?: number | null
          id?: string
          is_active?: boolean | null
          max_global_daily?: number | null
          max_per_user_daily?: number | null
          max_per_user_weekly?: number | null
          min_quality_score?: number | null
          multiplier_ranges?: Json | null
          platform_id?: string | null
          thresholds?: Json | null
        }
        Update: {
          action_type?: string
          base_reward?: number | null
          cooldown_seconds?: number | null
          created_at?: string | null
          diminishing_factor?: number | null
          diminishing_threshold?: number | null
          id?: string
          is_active?: boolean | null
          max_global_daily?: number | null
          max_per_user_daily?: number | null
          max_per_user_weekly?: number | null
          min_quality_score?: number | null
          multiplier_ranges?: Json | null
          platform_id?: string | null
          thresholds?: Json | null
        }
        Relationships: []
      }
      pplp_actions: {
        Row: {
          action_type: string
          action_type_enum: string | null
          actor_id: string
          canonical_hash: string | null
          created_at: string | null
          evidence_hash: string | null
          id: string
          impact: Json | null
          integrity: Json | null
          metadata: Json | null
          mint_request_hash: string | null
          minted_at: string | null
          platform_id: string
          policy_snapshot: Json | null
          policy_version: string | null
          scored_at: string | null
          status: string | null
          target_id: string | null
        }
        Insert: {
          action_type: string
          action_type_enum?: string | null
          actor_id: string
          canonical_hash?: string | null
          created_at?: string | null
          evidence_hash?: string | null
          id?: string
          impact?: Json | null
          integrity?: Json | null
          metadata?: Json | null
          mint_request_hash?: string | null
          minted_at?: string | null
          platform_id?: string
          policy_snapshot?: Json | null
          policy_version?: string | null
          scored_at?: string | null
          status?: string | null
          target_id?: string | null
        }
        Update: {
          action_type?: string
          action_type_enum?: string | null
          actor_id?: string
          canonical_hash?: string | null
          created_at?: string | null
          evidence_hash?: string | null
          id?: string
          impact?: Json | null
          integrity?: Json | null
          metadata?: Json | null
          mint_request_hash?: string | null
          minted_at?: string | null
          platform_id?: string
          policy_snapshot?: Json | null
          policy_version?: string | null
          scored_at?: string | null
          status?: string | null
          target_id?: string | null
        }
        Relationships: []
      }
      pplp_audits: {
        Row: {
          action_id: string | null
          actor_id: string
          audit_type: string | null
          created_at: string | null
          id: string
          status: string | null
        }
        Insert: {
          action_id?: string | null
          actor_id: string
          audit_type?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
        }
        Update: {
          action_id?: string | null
          actor_id?: string
          audit_type?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pplp_audits_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pplp_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_daily_action_mint: {
        Row: {
          action_name: string
          cap_wei: number
          created_at: string
          day_utc: string
          release_count: number
          reserve_count: number
          reserved_wei: number
          updated_at: string
        }
        Insert: {
          action_name: string
          cap_wei?: number
          created_at?: string
          day_utc: string
          release_count?: number
          reserve_count?: number
          reserved_wei?: number
          updated_at?: string
        }
        Update: {
          action_name?: string
          cap_wei?: number
          created_at?: string
          day_utc?: string
          release_count?: number
          reserve_count?: number
          reserved_wei?: number
          updated_at?: string
        }
        Relationships: []
      }
      pplp_device_registry: {
        Row: {
          device_hash: string
          fingerprint_version: number
          flag_reason: string | null
          id: string
          is_flagged: boolean | null
          last_seen: string | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          device_hash: string
          fingerprint_version?: number
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          last_seen?: string | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          device_hash?: string
          fingerprint_version?: number
          flag_reason?: string | null
          id?: string
          is_flagged?: boolean | null
          last_seen?: string | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      pplp_epoch_caps: {
        Row: {
          action_counts: Json | null
          created_at: string | null
          epoch_date: string
          epoch_type: string | null
          id: string
          total_minted: number | null
          unique_users: number | null
          updated_at: string | null
        }
        Insert: {
          action_counts?: Json | null
          created_at?: string | null
          epoch_date: string
          epoch_type?: string | null
          id?: string
          total_minted?: number | null
          unique_users?: number | null
          updated_at?: string | null
        }
        Update: {
          action_counts?: Json | null
          created_at?: string | null
          epoch_date?: string
          epoch_type?: string | null
          id?: string
          total_minted?: number | null
          unique_users?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pplp_evidences: {
        Row: {
          action_id: string | null
          content_hash: string | null
          created_at: string | null
          evidence_type: string
          evidence_type_enum: string | null
          id: string
          metadata: Json | null
          uri: string | null
        }
        Insert: {
          action_id?: string | null
          content_hash?: string | null
          created_at?: string | null
          evidence_type: string
          evidence_type_enum?: string | null
          id?: string
          metadata?: Json | null
          uri?: string | null
        }
        Update: {
          action_id?: string | null
          content_hash?: string | null
          created_at?: string | null
          evidence_type?: string
          evidence_type_enum?: string | null
          id?: string
          metadata?: Json | null
          uri?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pplp_evidences_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pplp_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_fraud_signals: {
        Row: {
          actor_id: string
          created_at: string | null
          details: Json | null
          id: string
          is_resolved: boolean | null
          resolution: string | null
          severity: number | null
          signal_type: string
          source: string | null
        }
        Insert: {
          actor_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          is_resolved?: boolean | null
          resolution?: string | null
          severity?: number | null
          signal_type: string
          source?: string | null
        }
        Update: {
          actor_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          is_resolved?: boolean | null
          resolution?: string | null
          severity?: number | null
          signal_type?: string
          source?: string | null
        }
        Relationships: []
      }
      pplp_mint_requests: {
        Row: {
          action_hash: string | null
          action_ids: string[]
          action_name: string
          action_types: string[]
          amount_display: number
          amount_wei: string
          block_number: number | null
          confirmed_at: string | null
          created_at: string
          deadline: number | null
          epoch_id: string | null
          error_message: string | null
          evidence_hash: string
          external_ref: string | null
          id: string
          multisig_completed_groups: string[] | null
          multisig_required_groups: string[] | null
          multisig_signatures: Json | null
          nonce: number
          parent_request_id: string | null
          recipient_address: string
          retry_count: number
          signature: string | null
          signed_at: string | null
          signed_by: string | null
          source_project: string
          status: string
          submitted_at: string | null
          tx_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_hash?: string | null
          action_ids?: string[]
          action_name?: string
          action_types?: string[]
          amount_display: number
          amount_wei: string
          block_number?: number | null
          confirmed_at?: string | null
          created_at?: string
          deadline?: number | null
          epoch_id?: string | null
          error_message?: string | null
          evidence_hash: string
          external_ref?: string | null
          id?: string
          multisig_completed_groups?: string[] | null
          multisig_required_groups?: string[] | null
          multisig_signatures?: Json | null
          nonce: number
          parent_request_id?: string | null
          recipient_address: string
          retry_count?: number
          signature?: string | null
          signed_at?: string | null
          signed_by?: string | null
          source_project?: string
          status?: string
          submitted_at?: string | null
          tx_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_hash?: string | null
          action_ids?: string[]
          action_name?: string
          action_types?: string[]
          amount_display?: number
          amount_wei?: string
          block_number?: number | null
          confirmed_at?: string | null
          created_at?: string
          deadline?: number | null
          epoch_id?: string | null
          error_message?: string | null
          evidence_hash?: string
          external_ref?: string | null
          id?: string
          multisig_completed_groups?: string[] | null
          multisig_required_groups?: string[] | null
          multisig_signatures?: Json | null
          nonce?: number
          parent_request_id?: string | null
          recipient_address?: string
          retry_count?: number
          signature?: string | null
          signed_at?: string | null
          signed_by?: string | null
          source_project?: string
          status?: string
          submitted_at?: string | null
          tx_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pplp_mint_requests_epoch_id_fkey"
            columns: ["epoch_id"]
            isOneToOne: false
            referencedRelation: "mint_epochs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_mint_requests_parent_request_id_fkey"
            columns: ["parent_request_id"]
            isOneToOne: false
            referencedRelation: "pplp_mint_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_policies: {
        Row: {
          action_configs: Json | null
          caps: Json | null
          created_at: string | null
          formulas: Json | null
          id: string
          is_active: boolean | null
          policy_hash: string | null
          thresholds: Json | null
          version: string
        }
        Insert: {
          action_configs?: Json | null
          caps?: Json | null
          created_at?: string | null
          formulas?: Json | null
          id?: string
          is_active?: boolean | null
          policy_hash?: string | null
          thresholds?: Json | null
          version: string
        }
        Update: {
          action_configs?: Json | null
          caps?: Json | null
          created_at?: string | null
          formulas?: Json | null
          id?: string
          is_active?: boolean | null
          policy_hash?: string | null
          thresholds?: Json | null
          version?: string
        }
        Relationships: []
      }
      pplp_recovery_runs: {
        Row: {
          approved_at: string
          approved_by: string
          created_at: string
          id: string
          last_tick_at: string | null
          max_per_run: number
          month_filter: string
          notes: string | null
          reason_filter: string
          status: string
          total_eligible: number
          total_recovered: number
          total_skipped: number
          updated_at: string
        }
        Insert: {
          approved_at?: string
          approved_by: string
          created_at?: string
          id?: string
          last_tick_at?: string | null
          max_per_run?: number
          month_filter: string
          notes?: string | null
          reason_filter?: string
          status?: string
          total_eligible?: number
          total_recovered?: number
          total_skipped?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string
          approved_by?: string
          created_at?: string
          id?: string
          last_tick_at?: string | null
          max_per_run?: number
          month_filter?: string
          notes?: string | null
          reason_filter?: string
          status?: string
          total_eligible?: number
          total_recovered?: number
          total_skipped?: number
          updated_at?: string
        }
        Relationships: []
      }
      pplp_scores: {
        Row: {
          action_id: string | null
          base_reward: number | null
          created_at: string | null
          decision: string
          decision_reason: string | null
          fail_reasons: string[] | null
          final_reward: number
          id: string
          light_score: number
          multiplier_i: number | null
          multiplier_k: number | null
          multiplier_q: number | null
          pillar_c: number
          pillar_h: number
          pillar_s: number
          pillar_t: number
          pillar_u: number
          policy_version: string | null
          scored_by: string | null
        }
        Insert: {
          action_id?: string | null
          base_reward?: number | null
          created_at?: string | null
          decision?: string
          decision_reason?: string | null
          fail_reasons?: string[] | null
          final_reward?: number
          id?: string
          light_score?: number
          multiplier_i?: number | null
          multiplier_k?: number | null
          multiplier_q?: number | null
          pillar_c?: number
          pillar_h?: number
          pillar_s?: number
          pillar_t?: number
          pillar_u?: number
          policy_version?: string | null
          scored_by?: string | null
        }
        Update: {
          action_id?: string | null
          base_reward?: number | null
          created_at?: string | null
          decision?: string
          decision_reason?: string | null
          fail_reasons?: string[] | null
          final_reward?: number
          id?: string
          light_score?: number
          multiplier_i?: number | null
          multiplier_k?: number | null
          multiplier_q?: number | null
          pillar_c?: number
          pillar_h?: number
          pillar_s?: number
          pillar_t?: number
          pillar_u?: number
          policy_version?: string | null
          scored_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pplp_scores_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: true
            referencedRelation: "pplp_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_user_caps: {
        Row: {
          action_counts: Json | null
          created_at: string | null
          epoch_date: string
          epoch_type: string | null
          id: string
          last_action_at: string | null
          total_minted: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          action_counts?: Json | null
          created_at?: string | null
          epoch_date?: string
          epoch_type?: string | null
          id?: string
          last_action_at?: string | null
          total_minted?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          action_counts?: Json | null
          created_at?: string | null
          epoch_date?: string
          epoch_type?: string | null
          id?: string
          last_action_at?: string | null
          total_minted?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pplp_user_nonces: {
        Row: {
          current_nonce: number | null
          last_used_at: string | null
          user_id: string
        }
        Insert: {
          current_nonce?: number | null
          last_used_at?: string | null
          user_id: string
        }
        Update: {
          current_nonce?: number | null
          last_used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pplp_user_tiers: {
        Row: {
          cap_multiplier: number | null
          created_at: string | null
          failed_actions: number | null
          fraud_flags: number | null
          id: string
          known_device_hashes: string[] | null
          last_device_hash: string | null
          last_tier_change: string | null
          passed_actions: number | null
          tier: number | null
          tier_change_reason: string | null
          total_actions_scored: number | null
          trust_score: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cap_multiplier?: number | null
          created_at?: string | null
          failed_actions?: number | null
          fraud_flags?: number | null
          id?: string
          known_device_hashes?: string[] | null
          last_device_hash?: string | null
          last_tier_change?: string | null
          passed_actions?: number | null
          tier?: number | null
          tier_change_reason?: string | null
          total_actions_scored?: number | null
          trust_score?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cap_multiplier?: number | null
          created_at?: string | null
          failed_actions?: number | null
          fraud_flags?: number | null
          id?: string
          known_device_hashes?: string[] | null
          last_device_hash?: string | null
          last_tier_change?: string | null
          passed_actions?: number | null
          tier?: number | null
          tier_change_reason?: string | null
          total_actions_scored?: number | null
          trust_score?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pplp_v2_action_types: {
        Row: {
          base_impact_score: number
          code: string
          created_at: string
          description: string | null
          description_vi: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          name_vi: string
          pillar_weights: Json
          updated_at: string
        }
        Insert: {
          base_impact_score?: number
          code: string
          created_at?: string
          description?: string | null
          description_vi?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_vi: string
          pillar_weights?: Json
          updated_at?: string
        }
        Update: {
          base_impact_score?: number
          code?: string
          created_at?: string
          description?: string | null
          description_vi?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_vi?: string
          pillar_weights?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pplp_v2_attendance: {
        Row: {
          app_check_in_signal: boolean | null
          app_check_out_signal: boolean | null
          attendance_confidence: number | null
          attendance_mode: string
          check_in_at: string | null
          check_out_at: string | null
          confirmation_status: string
          confirmed_by_leader: boolean | null
          created_at: string
          duration_met_signal: boolean | null
          duration_minutes: number | null
          group_id: string
          host_confirmed_signal: boolean | null
          id: string
          optional_presence_signal_value: boolean | null
          participation_factor: number | null
          reflection_text: string | null
          response_submitted_signal: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_check_in_signal?: boolean | null
          app_check_out_signal?: boolean | null
          attendance_confidence?: number | null
          attendance_mode?: string
          check_in_at?: string | null
          check_out_at?: string | null
          confirmation_status?: string
          confirmed_by_leader?: boolean | null
          created_at?: string
          duration_met_signal?: boolean | null
          duration_minutes?: number | null
          group_id: string
          host_confirmed_signal?: boolean | null
          id?: string
          optional_presence_signal_value?: boolean | null
          participation_factor?: number | null
          reflection_text?: string | null
          response_submitted_signal?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_check_in_signal?: boolean | null
          app_check_out_signal?: boolean | null
          attendance_confidence?: number | null
          attendance_mode?: string
          check_in_at?: string | null
          check_out_at?: string | null
          confirmation_status?: string
          confirmed_by_leader?: boolean | null
          created_at?: string
          duration_met_signal?: boolean | null
          duration_minutes?: number | null
          group_id?: string
          host_confirmed_signal?: boolean | null
          id?: string
          optional_presence_signal_value?: boolean | null
          participation_factor?: number | null
          reflection_text?: string | null
          response_submitted_signal?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_attendance_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "pplp_v2_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v2_balance_ledger: {
        Row: {
          amount: number
          created_at: string
          entry_type: string
          id: string
          note: string | null
          reference_id: string | null
          reference_table: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          entry_type: string
          id?: string
          note?: string | null
          reference_id?: string | null
          reference_table?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          entry_type?: string
          id?: string
          note?: string | null
          reference_id?: string | null
          reference_table?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_balance_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_balance_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_balance_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_balance_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v2_community_reviews: {
        Row: {
          action_id: string
          comment: string | null
          created_at: string
          endorse_score: number | null
          flag_score: number | null
          id: string
          pillar_healing_love: number | null
          pillar_long_term_value: number | null
          pillar_serving_life: number | null
          pillar_transparent_truth: number | null
          pillar_unity_over_separation: number | null
          review_type: string
          reviewer_user_id: string
        }
        Insert: {
          action_id: string
          comment?: string | null
          created_at?: string
          endorse_score?: number | null
          flag_score?: number | null
          id?: string
          pillar_healing_love?: number | null
          pillar_long_term_value?: number | null
          pillar_serving_life?: number | null
          pillar_transparent_truth?: number | null
          pillar_unity_over_separation?: number | null
          review_type?: string
          reviewer_user_id: string
        }
        Update: {
          action_id?: string
          comment?: string | null
          created_at?: string
          endorse_score?: number | null
          flag_score?: number | null
          id?: string
          pillar_healing_love?: number | null
          pillar_long_term_value?: number | null
          pillar_serving_life?: number | null
          pillar_transparent_truth?: number | null
          pillar_unity_over_separation?: number | null
          review_type?: string
          reviewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_community_reviews_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pplp_v2_user_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_community_reviews_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_community_reviews_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_community_reviews_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_community_reviews_reviewer_user_id_fkey"
            columns: ["reviewer_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v2_event_log: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          reference_id: string | null
          reference_table: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          reference_id?: string | null
          reference_table?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          reference_id?: string | null
          reference_table?: string | null
        }
        Relationships: []
      }
      pplp_v2_events: {
        Row: {
          created_at: string
          end_at: string | null
          event_score: number | null
          event_type: string
          expected_duration_minutes: number | null
          host_user_id: string
          id: string
          livestream_urls: Json | null
          platform_links: Json | null
          raw_metadata: Json | null
          recording_hash: string | null
          recording_url: string | null
          start_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_at?: string | null
          event_score?: number | null
          event_type?: string
          expected_duration_minutes?: number | null
          host_user_id: string
          id?: string
          livestream_urls?: Json | null
          platform_links?: Json | null
          raw_metadata?: Json | null
          recording_hash?: string | null
          recording_url?: string | null
          start_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_at?: string | null
          event_score?: number | null
          event_type?: string
          expected_duration_minutes?: number | null
          host_user_id?: string
          id?: string
          livestream_urls?: Json | null
          platform_links?: Json | null
          raw_metadata?: Json | null
          recording_hash?: string | null
          recording_url?: string | null
          start_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_events_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_events_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_events_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_events_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v2_fraud_signals: {
        Row: {
          action_id: string | null
          created_at: string
          details: Json | null
          id: string
          resolved: boolean | null
          resolved_at: string | null
          resolved_by: string | null
          severity: number
          signal_type: string
          source: string
          user_id: string
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: number
          signal_type: string
          source?: string
          user_id: string
        }
        Update: {
          action_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: number
          signal_type?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_fraud_signals_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pplp_v2_user_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_fraud_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_fraud_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_fraud_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_fraud_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v2_groups: {
        Row: {
          created_at: string
          event_id: string
          expected_count: number | null
          id: string
          leader_confirmed_at: string | null
          leader_user_id: string
          location: string | null
          love_house_id: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          expected_count?: number | null
          id?: string
          leader_confirmed_at?: string | null
          leader_user_id: string
          location?: string | null
          love_house_id?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          expected_count?: number | null
          id?: string
          leader_confirmed_at?: string | null
          leader_user_id?: string
          location?: string | null
          love_house_id?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_groups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "pplp_v2_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_groups_leader_user_id_fkey"
            columns: ["leader_user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_groups_leader_user_id_fkey"
            columns: ["leader_user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_groups_leader_user_id_fkey"
            columns: ["leader_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_groups_leader_user_id_fkey"
            columns: ["leader_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v2_immutable_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          rule_code: string
          rule_name: string
          rule_value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          rule_code: string
          rule_name: string
          rule_value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          rule_code?: string
          rule_name?: string
          rule_value?: string
        }
        Relationships: []
      }
      pplp_v2_mint_records: {
        Row: {
          action_id: string
          base_mint_rate: number
          claimable_now: number | null
          created_at: string
          id: string
          light_score: number
          locked_amount: number | null
          mint_amount_platform: number
          mint_amount_total: number
          mint_amount_user: number
          minted_at: string | null
          release_mode: string
          status: string
          tx_hash: string | null
          user_id: string
        }
        Insert: {
          action_id: string
          base_mint_rate?: number
          claimable_now?: number | null
          created_at?: string
          id?: string
          light_score?: number
          locked_amount?: number | null
          mint_amount_platform?: number
          mint_amount_total?: number
          mint_amount_user?: number
          minted_at?: string | null
          release_mode?: string
          status?: string
          tx_hash?: string | null
          user_id: string
        }
        Update: {
          action_id?: string
          base_mint_rate?: number
          claimable_now?: number | null
          created_at?: string
          id?: string
          light_score?: number
          locked_amount?: number | null
          mint_amount_platform?: number
          mint_amount_total?: number
          mint_amount_user?: number
          minted_at?: string | null
          release_mode?: string
          status?: string
          tx_hash?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_mint_records_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pplp_v2_user_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_mint_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_mint_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_mint_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_mint_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v2_proofs: {
        Row: {
          action_id: string
          created_at: string
          external_ref: string | null
          extracted_text: string | null
          file_hash: string | null
          id: string
          proof_type: string
          proof_url: string | null
          raw_metadata: Json | null
        }
        Insert: {
          action_id: string
          created_at?: string
          external_ref?: string | null
          extracted_text?: string | null
          file_hash?: string | null
          id?: string
          proof_type?: string
          proof_url?: string | null
          raw_metadata?: Json | null
        }
        Update: {
          action_id?: string
          created_at?: string
          external_ref?: string | null
          extracted_text?: string | null
          file_hash?: string | null
          id?: string
          proof_type?: string
          proof_url?: string | null
          raw_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_proofs_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pplp_v2_user_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v2_review_queue: {
        Row: {
          action_id: string
          assigned_to: string | null
          created_at: string
          id: string
          priority: string
          reason: string
          resolution_note: string | null
          resolution_status: string | null
          resolved_at: string | null
          resolved_by: string | null
          updated_at: string
        }
        Insert: {
          action_id: string
          assigned_to?: string | null
          created_at?: string
          id?: string
          priority?: string
          reason: string
          resolution_note?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Update: {
          action_id?: string
          assigned_to?: string | null
          created_at?: string
          id?: string
          priority?: string
          reason?: string
          resolution_note?: string | null
          resolution_status?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_review_queue_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: true
            referencedRelation: "pplp_v2_user_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_review_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_review_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_review_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_review_queue_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_review_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_review_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_review_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_review_queue_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v2_user_actions: {
        Row: {
          action_type_code: string
          created_at: string
          description: string | null
          id: string
          metrics: Json | null
          platform: string | null
          raw_metadata: Json | null
          source_platform: string | null
          source_url: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action_type_code: string
          created_at?: string
          description?: string | null
          id?: string
          metrics?: Json | null
          platform?: string | null
          raw_metadata?: Json | null
          source_platform?: string | null
          source_url?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action_type_code?: string
          created_at?: string
          description?: string | null
          id?: string
          metrics?: Json | null
          platform?: string | null
          raw_metadata?: Json | null
          source_platform?: string | null
          source_url?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_user_actions_action_type_code_fkey"
            columns: ["action_type_code"]
            isOneToOne: false
            referencedRelation: "pplp_v2_action_types"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "pplp_v2_user_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_user_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_user_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pplp_v2_user_actions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v2_validations: {
        Row: {
          action_id: string
          ai_score: number | null
          authenticity: number | null
          community_score: number | null
          confidence: number | null
          created_at: string
          depth_score: number | null
          ego_signal: number | null
          explanation: Json | null
          final_light_score: number | null
          flags: Json | null
          giving_pillar: number | null
          gratitude: number | null
          healing_love: number
          help_pillar: number | null
          id: string
          intent_score: number | null
          long_term_value: number
          love_tone: number | null
          raw_light_score: number | null
          repentance: number | null
          service_pillar: number | null
          serving_life: number
          transparent_truth: number
          trust_signal_score: number | null
          unity_over_separation: number
          updated_at: string
          validated_at: string | null
          validation_status: string
          validator_type: string | null
        }
        Insert: {
          action_id: string
          ai_score?: number | null
          authenticity?: number | null
          community_score?: number | null
          confidence?: number | null
          created_at?: string
          depth_score?: number | null
          ego_signal?: number | null
          explanation?: Json | null
          final_light_score?: number | null
          flags?: Json | null
          giving_pillar?: number | null
          gratitude?: number | null
          healing_love?: number
          help_pillar?: number | null
          id?: string
          intent_score?: number | null
          long_term_value?: number
          love_tone?: number | null
          raw_light_score?: number | null
          repentance?: number | null
          service_pillar?: number | null
          serving_life?: number
          transparent_truth?: number
          trust_signal_score?: number | null
          unity_over_separation?: number
          updated_at?: string
          validated_at?: string | null
          validation_status?: string
          validator_type?: string | null
        }
        Update: {
          action_id?: string
          ai_score?: number | null
          authenticity?: number | null
          community_score?: number | null
          confidence?: number | null
          created_at?: string
          depth_score?: number | null
          ego_signal?: number | null
          explanation?: Json | null
          final_light_score?: number | null
          flags?: Json | null
          giving_pillar?: number | null
          gratitude?: number | null
          healing_love?: number
          help_pillar?: number | null
          id?: string
          intent_score?: number | null
          long_term_value?: number
          love_tone?: number | null
          raw_light_score?: number | null
          repentance?: number | null
          service_pillar?: number | null
          serving_life?: number
          transparent_truth?: number
          trust_signal_score?: number | null
          unity_over_separation?: number
          updated_at?: string
          validated_at?: string | null
          validation_status?: string
          validator_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pplp_v2_validations_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "pplp_v2_user_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      pplp_v25_action_overrides: {
        Row: {
          action_type: string
          base_multiplier: number
          created_at: string
          daily_cap: number | null
          id: string
          is_active: boolean
          notes: string | null
          over_cap_multiplier: number
          quality_bonus: number
          updated_at: string
        }
        Insert: {
          action_type: string
          base_multiplier?: number
          created_at?: string
          daily_cap?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          over_cap_multiplier?: number
          quality_bonus?: number
          updated_at?: string
        }
        Update: {
          action_type?: string
          base_multiplier?: number
          created_at?: string
          daily_cap?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          over_cap_multiplier?: number
          quality_bonus?: number
          updated_at?: string
        }
        Relationships: []
      }
      pplp_v25_action_overrides_history: {
        Row: {
          id: string
          payload: Json
          reason: string | null
          snapshot_at: string
          snapshot_by: string | null
        }
        Insert: {
          id?: string
          payload: Json
          reason?: string | null
          snapshot_at?: string
          snapshot_by?: string | null
        }
        Update: {
          id?: string
          payload?: Json
          reason?: string | null
          snapshot_at?: string
          snapshot_by?: string | null
        }
        Relationships: []
      }
      pplp_v25_config: {
        Row: {
          alpha: number
          beta: number
          config_key: string
          created_at: string
          display_compression: string
          gamma: number
          id: string
          iis_max: number
          iis_min: number
          im_max: number
          im_min: number
          is_active: boolean
          tier_multipliers: Json
          tier_thresholds: Json
          updated_at: string
        }
        Insert: {
          alpha?: number
          beta?: number
          config_key?: string
          created_at?: string
          display_compression?: string
          gamma?: number
          id?: string
          iis_max?: number
          iis_min?: number
          im_max?: number
          im_min?: number
          is_active?: boolean
          tier_multipliers?: Json
          tier_thresholds?: Json
          updated_at?: string
        }
        Update: {
          alpha?: number
          beta?: number
          config_key?: string
          created_at?: string
          display_compression?: string
          gamma?: number
          id?: string
          iis_max?: number
          iis_min?: number
          im_max?: number
          im_min?: number
          is_active?: boolean
          tier_multipliers?: Json
          tier_thresholds?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pplp_v25_event_base_values: {
        Row: {
          base_default: number
          base_max: number
          base_min: number
          category: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          is_active: boolean
          notes: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          base_default?: number
          base_max?: number
          base_min?: number
          category: string
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          is_active?: boolean
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          base_default?: number
          base_max?: number
          base_min?: number
          category?: string
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pplp_v25_impact_metrics: {
        Row: {
          computed_at: string
          created_at: string
          helped_users_count: number
          id: string
          im_value: number
          knowledge_value: number
          referral_quality: number
          retention_lift: number
          source_id: string | null
          source_table: string | null
          user_id: string
        }
        Insert: {
          computed_at?: string
          created_at?: string
          helped_users_count?: number
          id?: string
          im_value?: number
          knowledge_value?: number
          referral_quality?: number
          retention_lift?: number
          source_id?: string | null
          source_table?: string | null
          user_id: string
        }
        Update: {
          computed_at?: string
          created_at?: string
          helped_users_count?: number
          id?: string
          im_value?: number
          knowledge_value?: number
          referral_quality?: number
          retention_lift?: number
          source_id?: string | null
          source_table?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pplp_v25_intent_metrics: {
        Row: {
          computed_window_days: number
          consistency_score: number
          created_at: string
          farm_ratio: number
          id: string
          iis_value: number
          last_computed_at: string
          manipulation_score: number
          purity_bonus: number
          updated_at: string
          user_id: string
        }
        Insert: {
          computed_window_days?: number
          consistency_score?: number
          created_at?: string
          farm_ratio?: number
          id?: string
          iis_value?: number
          last_computed_at?: string
          manipulation_score?: number
          purity_bonus?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          computed_window_days?: number
          consistency_score?: number
          created_at?: string
          farm_ratio?: number
          id?: string
          iis_value?: number
          last_computed_at?: string
          manipulation_score?: number
          purity_bonus?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pplp_v25_legacy_params: {
        Row: {
          created_at: string
          default_value: number
          formula: string | null
          id: string
          is_active: boolean
          level_label: string
          notes: string | null
          param_code: string
          range_max: number
          range_min: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_value?: number
          formula?: string | null
          id?: string
          is_active?: boolean
          level_label: string
          notes?: string | null
          param_code: string
          range_max?: number
          range_min?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_value?: number
          formula?: string | null
          id?: string
          is_active?: boolean
          level_label?: string
          notes?: string | null
          param_code?: string
          range_max?: number
          range_min?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pplp_v25_light_scores: {
        Row: {
          alpha: number
          beta: number
          consistency_multiplier: number
          created_at: string
          display_ls: number
          epoch_label: string | null
          gamma: number
          id: string
          is_current: boolean
          lls: number
          nls: number
          pls: number
          raw_ls: number
          reliability_multiplier: number
          snapshot_at: string
          tls: number
          user_id: string
        }
        Insert: {
          alpha?: number
          beta?: number
          consistency_multiplier?: number
          created_at?: string
          display_ls?: number
          epoch_label?: string | null
          gamma?: number
          id?: string
          is_current?: boolean
          lls?: number
          nls?: number
          pls?: number
          raw_ls?: number
          reliability_multiplier?: number
          snapshot_at?: string
          tls?: number
          user_id: string
        }
        Update: {
          alpha?: number
          beta?: number
          consistency_multiplier?: number
          created_at?: string
          display_ls?: number
          epoch_label?: string | null
          gamma?: number
          id?: string
          is_current?: boolean
          lls?: number
          nls?: number
          pls?: number
          raw_ls?: number
          reliability_multiplier?: number
          snapshot_at?: string
          tls?: number
          user_id?: string
        }
        Relationships: []
      }
      pplp_v25_mint_linking_config: {
        Row: {
          created_at: string
          delta_ls_window_days: number
          formula: string
          id: string
          max_mint_per_epoch_per_user: number
          min_tc_to_mint: number
          mint_base_rate: number
          notes: string | null
          phase_name: string
          stability_weight: number
          tc_weight: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delta_ls_window_days?: number
          formula?: string
          id?: string
          max_mint_per_epoch_per_user?: number
          min_tc_to_mint?: number
          mint_base_rate?: number
          notes?: string | null
          phase_name: string
          stability_weight?: number
          tc_weight?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delta_ls_window_days?: number
          formula?: string
          id?: string
          max_mint_per_epoch_per_user?: number
          min_tc_to_mint?: number
          mint_base_rate?: number
          notes?: string | null
          phase_name?: string
          stability_weight?: number
          tc_weight?: number
          updated_at?: string
        }
        Relationships: []
      }
      pplp_v25_multiplier_ranges: {
        Row: {
          condition_description: string | null
          created_at: string
          default_value: number
          id: string
          is_active: boolean
          level_label: string
          multiplier_code: string
          multiplier_group: string
          range_max: number
          range_min: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          condition_description?: string | null
          created_at?: string
          default_value?: number
          id?: string
          is_active?: boolean
          level_label: string
          multiplier_code: string
          multiplier_group: string
          range_max?: number
          range_min?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          condition_description?: string | null
          created_at?: string
          default_value?: number
          id?: string
          is_active?: boolean
          level_label?: string
          multiplier_code?: string
          multiplier_group?: string
          range_max?: number
          range_min?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      pplp_v25_param_audit_log: {
        Row: {
          after_data: Json | null
          before_data: Json | null
          changed_at: string
          changed_by: string | null
          id: string
          reason: string | null
          row_id: string | null
          table_name: string
        }
        Insert: {
          after_data?: Json | null
          before_data?: Json | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          reason?: string | null
          row_id?: string | null
          table_name: string
        }
        Update: {
          after_data?: Json | null
          before_data?: Json | null
          changed_at?: string
          changed_by?: string | null
          id?: string
          reason?: string | null
          row_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      pplp_v25_phase_config: {
        Row: {
          alpha: number
          beta: number
          created_at: string
          display_formula: string
          gamma: number
          id: string
          is_active: boolean
          min_tc_for_basic: number
          notes: string | null
          phase_name: string
          threshold_earn_advanced: number
          threshold_earn_basic: number
          threshold_governance: number
          threshold_proposal: number
          threshold_referral: number
          threshold_validator: number
          updated_at: string
        }
        Insert: {
          alpha?: number
          beta?: number
          created_at?: string
          display_formula?: string
          gamma?: number
          id?: string
          is_active?: boolean
          min_tc_for_basic?: number
          notes?: string | null
          phase_name: string
          threshold_earn_advanced?: number
          threshold_earn_basic?: number
          threshold_governance?: number
          threshold_proposal?: number
          threshold_referral?: number
          threshold_validator?: number
          updated_at?: string
        }
        Update: {
          alpha?: number
          beta?: number
          created_at?: string
          display_formula?: string
          gamma?: number
          id?: string
          is_active?: boolean
          min_tc_for_basic?: number
          notes?: string | null
          phase_name?: string
          threshold_earn_advanced?: number
          threshold_earn_basic?: number
          threshold_governance?: number
          threshold_proposal?: number
          threshold_referral?: number
          threshold_validator?: number
          updated_at?: string
        }
        Relationships: []
      }
      pplp_v25_stability_index: {
        Row: {
          behavior_consistency: number
          computed_at: string
          id: string
          ls_volatility_30d: number
          network_stability: number
          snapshot_date: string
          stability_index: number
          user_id: string
        }
        Insert: {
          behavior_consistency?: number
          computed_at?: string
          id?: string
          ls_volatility_30d?: number
          network_stability?: number
          snapshot_date?: string
          stability_index?: number
          user_id: string
        }
        Update: {
          behavior_consistency?: number
          computed_at?: string
          id?: string
          ls_volatility_30d?: number
          network_stability?: number
          snapshot_date?: string
          stability_index?: number
          user_id?: string
        }
        Relationships: []
      }
      pplp_v25_tier_assignments: {
        Row: {
          assigned_at: string
          created_at: string
          id: string
          is_current: boolean
          raw_ls_at_assignment: number
          tier_level: number
          tier_multiplier: number
          tier_name: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          created_at?: string
          id?: string
          is_current?: boolean
          raw_ls_at_assignment?: number
          tier_level?: number
          tier_multiplier?: number
          tier_name: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          created_at?: string
          id?: string
          is_current?: boolean
          raw_ls_at_assignment?: number
          tier_level?: number
          tier_multiplier?: number
          tier_name?: string
          user_id?: string
        }
        Relationships: []
      }
      pplp_v25_vvu_log: {
        Row: {
          anti_abuse_factor: number
          base_value: number
          computed_at: string
          created_at: string
          erp_factor: number
          id: string
          iis_value: number
          im_value: number
          metadata: Json | null
          quality_score: number
          source_id: string
          source_table: string
          trust_context: number
          user_id: string
          vvu_type: string
          vvu_value: number
        }
        Insert: {
          anti_abuse_factor?: number
          base_value?: number
          computed_at?: string
          created_at?: string
          erp_factor?: number
          id?: string
          iis_value?: number
          im_value?: number
          metadata?: Json | null
          quality_score?: number
          source_id: string
          source_table: string
          trust_context?: number
          user_id: string
          vvu_type?: string
          vvu_value?: number
        }
        Update: {
          anti_abuse_factor?: number
          base_value?: number
          computed_at?: string
          created_at?: string
          erp_factor?: number
          id?: string
          iis_value?: number
          im_value?: number
          metadata?: Json | null
          quality_score?: number
          source_id?: string
          source_table?: string
          trust_context?: number
          user_id?: string
          vvu_type?: string
          vvu_value?: number
        }
        Relationships: []
      }
      profile_btc_aux_addresses: {
        Row: {
          address: string
          classification: string | null
          created_at: string
          disabled_at: string | null
          disabled_reason: string | null
          first_seen_tx: string | null
          id: string
          source: string
          user_id: string
          verified: boolean
        }
        Insert: {
          address: string
          classification?: string | null
          created_at?: string
          disabled_at?: string | null
          disabled_reason?: string | null
          first_seen_tx?: string | null
          id?: string
          source?: string
          user_id: string
          verified?: boolean
        }
        Update: {
          address?: string
          classification?: string | null
          created_at?: string
          disabled_at?: string | null
          disabled_reason?: string | null
          first_seen_tx?: string | null
          id?: string
          source?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profile_btc_aux_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_btc_aux_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_btc_aux_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_btc_aux_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          admin_notes: string | null
          approved_reward: number
          avatar_phash: string | null
          avatar_url: string | null
          ban_reason: string | null
          banned_at: string | null
          bio: string | null
          btc_address: string | null
          btc_addresses: Json | null
          claim_freeze_until: string | null
          claim_speed_limit_until: string | null
          cover_url: string | null
          created_at: string
          cross_platform_data: Json | null
          current_live_session_id: string | null
          custodial_wallet_address: string | null
          default_wallet_type: string | null
          display_light_score: number | null
          display_name: string | null
          education: string | null
          email: string | null
          email_verified_at: string | null
          exclude_from_leaderboard: boolean
          external_wallet_address: string | null
          farming_score: number | null
          financial_updated_at: string | null
          fraud_risk_level: number
          fraud_trusted: boolean
          full_name: string | null
          fun_id: string | null
          grand_total_bet: number
          grand_total_deposit: number
          grand_total_loss: number
          grand_total_profit: number
          grand_total_win: number
          grand_total_withdraw: number
          has_password: boolean | null
          id: string
          identity_is_test: boolean
          identity_level: string | null
          identity_verified: boolean
          identity_verified_at: string | null
          iis_value: number | null
          impersonation_scanned_at: string | null
          is_banned: boolean
          is_live: boolean
          is_restricted: boolean
          last_login_platform: string | null
          last_wallet_change_at: string | null
          law_of_light_accepted: boolean
          law_of_light_accepted_at: string | null
          light_tier: string | null
          live_started_at: string | null
          location: string | null
          login_wallet_address: string | null
          max_claim_per_request: number | null
          oauth_provider: string | null
          pending_reward: number
          pinned_post_id: string | null
          preferred_language: string
          preferred_rtmp_stream_mode: string
          public_wallet_address: string | null
          raw_light_score: number | null
          registered_from: string | null
          relationship_status: string | null
          reward_locked: boolean
          reward_status: string
          signup_method: string
          social_links: Json | null
          soul_level: number
          suspected_farming: boolean
          total_light_score: number
          total_rewards: number
          trust_level: number
          updated_at: string
          username: string
          username_normalized: string | null
          wallet_address: string | null
          wallet_change_count_30d: number | null
          wallet_risk_status: string | null
          workplace: string | null
        }
        Insert: {
          account_status?: string
          admin_notes?: string | null
          approved_reward?: number
          avatar_phash?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          bio?: string | null
          btc_address?: string | null
          btc_addresses?: Json | null
          claim_freeze_until?: string | null
          claim_speed_limit_until?: string | null
          cover_url?: string | null
          created_at?: string
          cross_platform_data?: Json | null
          current_live_session_id?: string | null
          custodial_wallet_address?: string | null
          default_wallet_type?: string | null
          display_light_score?: number | null
          display_name?: string | null
          education?: string | null
          email?: string | null
          email_verified_at?: string | null
          exclude_from_leaderboard?: boolean
          external_wallet_address?: string | null
          farming_score?: number | null
          financial_updated_at?: string | null
          fraud_risk_level?: number
          fraud_trusted?: boolean
          full_name?: string | null
          fun_id?: string | null
          grand_total_bet?: number
          grand_total_deposit?: number
          grand_total_loss?: number
          grand_total_profit?: number
          grand_total_win?: number
          grand_total_withdraw?: number
          has_password?: boolean | null
          id: string
          identity_is_test?: boolean
          identity_level?: string | null
          identity_verified?: boolean
          identity_verified_at?: string | null
          iis_value?: number | null
          impersonation_scanned_at?: string | null
          is_banned?: boolean
          is_live?: boolean
          is_restricted?: boolean
          last_login_platform?: string | null
          last_wallet_change_at?: string | null
          law_of_light_accepted?: boolean
          law_of_light_accepted_at?: string | null
          light_tier?: string | null
          live_started_at?: string | null
          location?: string | null
          login_wallet_address?: string | null
          max_claim_per_request?: number | null
          oauth_provider?: string | null
          pending_reward?: number
          pinned_post_id?: string | null
          preferred_language?: string
          preferred_rtmp_stream_mode?: string
          public_wallet_address?: string | null
          raw_light_score?: number | null
          registered_from?: string | null
          relationship_status?: string | null
          reward_locked?: boolean
          reward_status?: string
          signup_method?: string
          social_links?: Json | null
          soul_level?: number
          suspected_farming?: boolean
          total_light_score?: number
          total_rewards?: number
          trust_level?: number
          updated_at?: string
          username: string
          username_normalized?: string | null
          wallet_address?: string | null
          wallet_change_count_30d?: number | null
          wallet_risk_status?: string | null
          workplace?: string | null
        }
        Update: {
          account_status?: string
          admin_notes?: string | null
          approved_reward?: number
          avatar_phash?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          bio?: string | null
          btc_address?: string | null
          btc_addresses?: Json | null
          claim_freeze_until?: string | null
          claim_speed_limit_until?: string | null
          cover_url?: string | null
          created_at?: string
          cross_platform_data?: Json | null
          current_live_session_id?: string | null
          custodial_wallet_address?: string | null
          default_wallet_type?: string | null
          display_light_score?: number | null
          display_name?: string | null
          education?: string | null
          email?: string | null
          email_verified_at?: string | null
          exclude_from_leaderboard?: boolean
          external_wallet_address?: string | null
          farming_score?: number | null
          financial_updated_at?: string | null
          fraud_risk_level?: number
          fraud_trusted?: boolean
          full_name?: string | null
          fun_id?: string | null
          grand_total_bet?: number
          grand_total_deposit?: number
          grand_total_loss?: number
          grand_total_profit?: number
          grand_total_win?: number
          grand_total_withdraw?: number
          has_password?: boolean | null
          id?: string
          identity_is_test?: boolean
          identity_level?: string | null
          identity_verified?: boolean
          identity_verified_at?: string | null
          iis_value?: number | null
          impersonation_scanned_at?: string | null
          is_banned?: boolean
          is_live?: boolean
          is_restricted?: boolean
          last_login_platform?: string | null
          last_wallet_change_at?: string | null
          law_of_light_accepted?: boolean
          law_of_light_accepted_at?: string | null
          light_tier?: string | null
          live_started_at?: string | null
          location?: string | null
          login_wallet_address?: string | null
          max_claim_per_request?: number | null
          oauth_provider?: string | null
          pending_reward?: number
          pinned_post_id?: string | null
          preferred_language?: string
          preferred_rtmp_stream_mode?: string
          public_wallet_address?: string | null
          raw_light_score?: number | null
          registered_from?: string | null
          relationship_status?: string | null
          reward_locked?: boolean
          reward_status?: string
          signup_method?: string
          social_links?: Json | null
          soul_level?: number
          suspected_farming?: boolean
          total_light_score?: number
          total_rewards?: number
          trust_level?: number
          updated_at?: string
          username?: string
          username_normalized?: string | null
          wallet_address?: string | null
          wallet_change_count_30d?: number | null
          wallet_risk_status?: string | null
          workplace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_live_session_id_fkey"
            columns: ["current_live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_current_live_session_id_fkey"
            columns: ["current_live_session_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pinned_post_id_fkey"
            columns: ["pinned_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_preferred_language_fkey"
            columns: ["preferred_language"]
            isOneToOne: false
            referencedRelation: "i18n_languages"
            referencedColumns: ["code"]
          },
        ]
      }
      profiles_wallet_audit: {
        Row: {
          application_name: string | null
          changed_at: string
          changed_by: string | null
          client_addr: unknown
          column_name: string
          db_current_user: string | null
          db_session_user: string | null
          id: number
          new_value: string | null
          old_value: string | null
          request_id: string | null
          user_id: string
        }
        Insert: {
          application_name?: string | null
          changed_at?: string
          changed_by?: string | null
          client_addr?: unknown
          column_name: string
          db_current_user?: string | null
          db_session_user?: string | null
          id?: number
          new_value?: string | null
          old_value?: string | null
          request_id?: string | null
          user_id: string
        }
        Update: {
          application_name?: string | null
          changed_at?: string
          changed_by?: string | null
          client_addr?: unknown
          column_name?: string
          db_current_user?: string | null
          db_session_user?: string | null
          id?: number
          new_value?: string | null
          old_value?: string | null
          request_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      provider_registry: {
        Row: {
          api_key_last4: string | null
          avg_latency_ms: number | null
          base_url: string | null
          burst_limit: number | null
          capabilities: string[]
          chain_key: string
          consecutive_error_count: number
          cooldown_until: string | null
          created_at: string
          created_by: string | null
          display_name: string
          enabled: boolean
          encrypted_api_key: string | null
          encryption_key_version: number
          error_count: number
          health_status: Database["public"]["Enums"]["provider_health"]
          id: string
          last_error_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_success_at: string | null
          max_concurrent_requests: number | null
          max_requests_per_second: number | null
          monthly_quota_calls: number | null
          monthly_quota_reset_at: string | null
          monthly_quota_used: number
          network_error_count: number
          notes: string | null
          p50_latency_ms: number | null
          p95_latency_ms: number | null
          p99_latency_ms: number | null
          priority: number
          provider_key: string
          provider_kind: Database["public"]["Enums"]["provider_kind"]
          provider_mode: Database["public"]["Enums"]["provider_mode"]
          provider_score: number | null
          quota_exceeded_count: number
          rate_limit_count: number
          success_count: number
          supports_balance: boolean
          supports_internal_tx: boolean
          supports_logs: boolean
          supports_nft: boolean
          supports_token_metadata: boolean
          supports_token_price: boolean
          supports_webhook: boolean
          timeout_count: number
          unknown_error_count: number
          updated_at: string
          updated_by: string | null
          uptime_pct_24h: number | null
          webhook_url: string | null
          weight: number
          ws_url: string | null
        }
        Insert: {
          api_key_last4?: string | null
          avg_latency_ms?: number | null
          base_url?: string | null
          burst_limit?: number | null
          capabilities?: string[]
          chain_key: string
          consecutive_error_count?: number
          cooldown_until?: string | null
          created_at?: string
          created_by?: string | null
          display_name: string
          enabled?: boolean
          encrypted_api_key?: string | null
          encryption_key_version?: number
          error_count?: number
          health_status?: Database["public"]["Enums"]["provider_health"]
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          max_concurrent_requests?: number | null
          max_requests_per_second?: number | null
          monthly_quota_calls?: number | null
          monthly_quota_reset_at?: string | null
          monthly_quota_used?: number
          network_error_count?: number
          notes?: string | null
          p50_latency_ms?: number | null
          p95_latency_ms?: number | null
          p99_latency_ms?: number | null
          priority?: number
          provider_key: string
          provider_kind: Database["public"]["Enums"]["provider_kind"]
          provider_mode?: Database["public"]["Enums"]["provider_mode"]
          provider_score?: number | null
          quota_exceeded_count?: number
          rate_limit_count?: number
          success_count?: number
          supports_balance?: boolean
          supports_internal_tx?: boolean
          supports_logs?: boolean
          supports_nft?: boolean
          supports_token_metadata?: boolean
          supports_token_price?: boolean
          supports_webhook?: boolean
          timeout_count?: number
          unknown_error_count?: number
          updated_at?: string
          updated_by?: string | null
          uptime_pct_24h?: number | null
          webhook_url?: string | null
          weight?: number
          ws_url?: string | null
        }
        Update: {
          api_key_last4?: string | null
          avg_latency_ms?: number | null
          base_url?: string | null
          burst_limit?: number | null
          capabilities?: string[]
          chain_key?: string
          consecutive_error_count?: number
          cooldown_until?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string
          enabled?: boolean
          encrypted_api_key?: string | null
          encryption_key_version?: number
          error_count?: number
          health_status?: Database["public"]["Enums"]["provider_health"]
          id?: string
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_success_at?: string | null
          max_concurrent_requests?: number | null
          max_requests_per_second?: number | null
          monthly_quota_calls?: number | null
          monthly_quota_reset_at?: string | null
          monthly_quota_used?: number
          network_error_count?: number
          notes?: string | null
          p50_latency_ms?: number | null
          p95_latency_ms?: number | null
          p99_latency_ms?: number | null
          priority?: number
          provider_key?: string
          provider_kind?: Database["public"]["Enums"]["provider_kind"]
          provider_mode?: Database["public"]["Enums"]["provider_mode"]
          provider_score?: number | null
          quota_exceeded_count?: number
          rate_limit_count?: number
          success_count?: number
          supports_balance?: boolean
          supports_internal_tx?: boolean
          supports_logs?: boolean
          supports_nft?: boolean
          supports_token_metadata?: boolean
          supports_token_price?: boolean
          supports_webhook?: boolean
          timeout_count?: number
          unknown_error_count?: number
          updated_at?: string
          updated_by?: string | null
          uptime_pct_24h?: number | null
          webhook_url?: string | null
          weight?: number
          ws_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_registry_chain_key_fkey"
            columns: ["chain_key"]
            isOneToOne: false
            referencedRelation: "chains_registry"
            referencedColumns: ["chain_key"]
          },
        ]
      }
      provider_request_log: {
        Row: {
          attempt_number: number
          capability: string | null
          chain_key: string
          created_at: string
          error_class: string | null
          error_code: string | null
          id: string
          latency_ms: number | null
          method: string | null
          provider_id: string
          provider_key: string
          request_id: string | null
          status_code: number | null
          success: boolean
        }
        Insert: {
          attempt_number?: number
          capability?: string | null
          chain_key: string
          created_at?: string
          error_class?: string | null
          error_code?: string | null
          id?: string
          latency_ms?: number | null
          method?: string | null
          provider_id: string
          provider_key: string
          request_id?: string | null
          status_code?: number | null
          success?: boolean
        }
        Update: {
          attempt_number?: number
          capability?: string | null
          chain_key?: string
          created_at?: string
          error_class?: string | null
          error_code?: string | null
          id?: string
          latency_ms?: number | null
          method?: string | null
          provider_id?: string
          provider_key?: string
          request_id?: string | null
          status_code?: number | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "provider_request_log_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "provider_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_definitions: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          frequency: Database["public"]["Enums"]["quest_frequency"]
          icon: string | null
          id: string
          is_active: boolean
          ls_base: number
          sort_order: number
          target_count: number
          title_en: string
          title_vi: string
          trigger_event: string
          trigger_filter: Json
          trust_tier_min: Database["public"]["Enums"]["trust_tier"]
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description?: string | null
          frequency?: Database["public"]["Enums"]["quest_frequency"]
          icon?: string | null
          id?: string
          is_active?: boolean
          ls_base?: number
          sort_order?: number
          target_count?: number
          title_en: string
          title_vi: string
          trigger_event: string
          trigger_filter?: Json
          trust_tier_min?: Database["public"]["Enums"]["trust_tier"]
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          frequency?: Database["public"]["Enums"]["quest_frequency"]
          icon?: string | null
          id?: string
          is_active?: boolean
          ls_base?: number
          sort_order?: number
          target_count?: number
          title_en?: string
          title_vi?: string
          trigger_event?: string
          trigger_filter?: Json
          trust_tier_min?: Database["public"]["Enums"]["trust_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      quest_streaks: {
        Row: {
          current_streak: number
          freeze_pass_refilled_at: string | null
          freeze_passes_remaining: number
          last_active_date: string | null
          longest_streak: number
          total_ls_from_quests: number
          total_quests_completed: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_streak?: number
          freeze_pass_refilled_at?: string | null
          freeze_passes_remaining?: number
          last_active_date?: string | null
          longest_streak?: number
          total_ls_from_quests?: number
          total_quests_completed?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_streak?: number
          freeze_pass_refilled_at?: string | null
          freeze_passes_remaining?: number
          last_active_date?: string | null
          longest_streak?: number
          total_ls_from_quests?: number
          total_quests_completed?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_user_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          evidence: Json
          id: string
          ls_awarded: number
          ls_capped: boolean
          period_key: string
          progress_count: number
          quest_id: string
          target_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          ls_awarded?: number
          ls_capped?: boolean
          period_key: string
          progress_count?: number
          quest_id: string
          target_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          ls_awarded?: number
          ls_capped?: boolean
          period_key?: string
          progress_count?: number
          quest_id?: string
          target_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_user_progress_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "quest_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quest_user_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_state: {
        Row: {
          count: number
          expires_at: string
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          expires_at: string
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          expires_at?: string
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          post_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          type?: string
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_logs: {
        Row: {
          auto_adjusted: boolean | null
          discrepancies: Json | null
          id: string
          level: number
          notes: string | null
          run_at: string
          run_by: string | null
          status: string
          total_checked: number | null
          total_mismatched: number | null
        }
        Insert: {
          auto_adjusted?: boolean | null
          discrepancies?: Json | null
          id?: string
          level?: number
          notes?: string | null
          run_at?: string
          run_by?: string | null
          status?: string
          total_checked?: number | null
          total_mismatched?: number | null
        }
        Update: {
          auto_adjusted?: boolean | null
          discrepancies?: Json | null
          id?: string
          level?: number
          notes?: string | null
          run_at?: string
          run_by?: string | null
          status?: string
          total_checked?: number | null
          total_mismatched?: number | null
        }
        Relationships: []
      }
      red_envelope_claims: {
        Row: {
          amount: number
          claimed_at: string
          claimer_id: string
          envelope_id: string
          id: string
        }
        Insert: {
          amount: number
          claimed_at?: string
          claimer_id: string
          envelope_id: string
          id?: string
        }
        Update: {
          amount?: number
          claimed_at?: string
          claimer_id?: string
          envelope_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "red_envelope_claims_envelope_id_fkey"
            columns: ["envelope_id"]
            isOneToOne: false
            referencedRelation: "red_envelopes"
            referencedColumns: ["id"]
          },
        ]
      }
      red_envelopes: {
        Row: {
          conversation_id: string
          created_at: string
          creator_id: string
          expires_at: string
          greeting: string | null
          id: string
          message_id: string | null
          remaining_amount: number
          remaining_count: number
          status: string
          token: string
          total_amount: number
          total_count: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          creator_id: string
          expires_at?: string
          greeting?: string | null
          id?: string
          message_id?: string | null
          remaining_amount: number
          remaining_count: number
          status?: string
          token?: string
          total_amount: number
          total_count: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          creator_id?: string
          expires_at?: string
          greeting?: string | null
          id?: string
          message_id?: string | null
          remaining_amount?: number
          remaining_count?: number
          status?: string
          token?: string
          total_amount?: number
          total_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "red_envelopes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "red_envelopes_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_bookmarks: {
        Row: {
          created_at: string
          id: string
          reel_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reel_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_bookmarks_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "reel_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          like_count: number
          parent_comment_id: string | null
          reel_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          like_count?: number
          parent_comment_id?: string | null
          reel_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          like_count?: number
          parent_comment_id?: string | null
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "reel_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_likes: {
        Row: {
          created_at: string
          id: string
          reel_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reel_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_likes_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_shares: {
        Row: {
          created_at: string
          id: string
          reel_id: string
          shared_to: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reel_id: string
          shared_to?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reel_id?: string
          shared_to?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_shares_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_views: {
        Row: {
          completed: boolean | null
          created_at: string
          id: string
          reel_id: string
          user_id: string | null
          watch_duration_seconds: number | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          id?: string
          reel_id: string
          user_id?: string | null
          watch_duration_seconds?: number | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          id?: string
          reel_id?: string
          user_id?: string | null
          watch_duration_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reel_views_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reels: {
        Row: {
          audio_artist: string | null
          audio_name: string | null
          caption: string | null
          comment_count: number
          created_at: string
          duration_seconds: number | null
          id: string
          is_active: boolean
          like_count: number
          share_count: number
          slug: string | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          video_url: string
          view_count: number
          visibility: string
        }
        Insert: {
          audio_artist?: string | null
          audio_name?: string | null
          caption?: string | null
          comment_count?: number
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_active?: boolean
          like_count?: number
          share_count?: number
          slug?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          video_url: string
          view_count?: number
          visibility?: string
        }
        Update: {
          audio_artist?: string | null
          audio_name?: string | null
          caption?: string | null
          comment_count?: number
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_active?: boolean
          like_count?: number
          share_count?: number
          slug?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string
          view_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "reels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registry_drift_alerts: {
        Row: {
          ack: boolean
          ack_at: string | null
          ack_by: string | null
          created_at: string
          event_count: number
          id: string
          reason: string
          sample_contracts: Json | null
          threshold: number
          window_end: string
          window_start: string
        }
        Insert: {
          ack?: boolean
          ack_at?: string | null
          ack_by?: string | null
          created_at?: string
          event_count: number
          id?: string
          reason: string
          sample_contracts?: Json | null
          threshold: number
          window_end: string
          window_start: string
        }
        Update: {
          ack?: boolean
          ack_at?: string | null
          ack_by?: string | null
          created_at?: string
          event_count?: number
          id?: string
          reason?: string
          sample_contracts?: Json | null
          threshold?: number
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      registry_validate_log: {
        Row: {
          amount: number | null
          chain_id: number | null
          created_at: string
          extra: Json | null
          id: string
          reason: string
          recipient_wallet: string | null
          sender_wallet: string | null
          token_address: string | null
          token_symbol: string | null
          tx_hash: string | null
        }
        Insert: {
          amount?: number | null
          chain_id?: number | null
          created_at?: string
          extra?: Json | null
          id?: string
          reason: string
          recipient_wallet?: string | null
          sender_wallet?: string | null
          token_address?: string | null
          token_symbol?: string | null
          tx_hash?: string | null
        }
        Update: {
          amount?: number | null
          chain_id?: number | null
          created_at?: string
          extra?: Json | null
          id?: string
          reason?: string
          recipient_wallet?: string | null
          sender_wallet?: string | null
          token_address?: string | null
          token_symbol?: string | null
          tx_hash?: string | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          conversation_id: string | null
          created_at: string
          details: string | null
          id: string
          message_id: string | null
          reason: string
          reported_user_id: string | null
          reporter_id: string
          status: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string | null
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          status?: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          message_id?: string | null
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_usernames: {
        Row: {
          created_at: string | null
          reason: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          reason?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          reason?: string | null
          username?: string
        }
        Relationships: []
      }
      reward_adjustments: {
        Row: {
          admin_id: string
          amount: number
          created_at: string
          id: string
          reason: string
          user_id: string
        }
        Insert: {
          admin_id: string
          amount: number
          created_at?: string
          id?: string
          reason: string
          user_id: string
        }
        Update: {
          admin_id?: string
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      reward_approvals: {
        Row: {
          admin_id: string
          admin_note: string | null
          amount: number
          created_at: string
          id: string
          reviewed_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_id: string
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          reviewed_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_id?: string
          admin_note?: string | null
          amount?: number
          created_at?: string
          id?: string
          reviewed_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      reward_claims: {
        Row: {
          amount: number
          created_at: string
          id: string
          user_id: string | null
          wallet_address: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          user_id?: string | null
          wallet_address: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          user_id?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      reward_vesting_schedules: {
        Row: {
          allocation_id: string | null
          created_at: string | null
          epoch_id: string | null
          id: string
          instant_amount: number
          locked_amount: number
          next_unlock_check_at: string | null
          release_at: string
          released_amount: number
          remaining_locked: number
          status: string
          total_amount: number
          trust_band: string | null
          unlock_history: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allocation_id?: string | null
          created_at?: string | null
          epoch_id?: string | null
          id?: string
          instant_amount?: number
          locked_amount?: number
          next_unlock_check_at?: string | null
          release_at: string
          released_amount?: number
          remaining_locked?: number
          status?: string
          total_amount: number
          trust_band?: string | null
          unlock_history?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allocation_id?: string | null
          created_at?: string | null
          epoch_id?: string | null
          id?: string
          instant_amount?: number
          locked_amount?: number
          next_unlock_check_at?: string | null
          release_at?: string
          released_amount?: number
          remaining_locked?: number
          status?: string
          total_amount?: number
          trust_band?: string | null
          unlock_history?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_vesting_schedules_epoch_id_fkey"
            columns: ["epoch_id"]
            isOneToOne: false
            referencedRelation: "mint_epochs"
            referencedColumns: ["id"]
          },
        ]
      }
      rtmp_stream_configs: {
        Row: {
          cloudflare_live_input_id: string
          created_at: string
          deleted_at: string | null
          id: string
          is_persistent: boolean
          rtmps_url: string
          stream_key_encrypted: string
          stream_key_last_reset_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cloudflare_live_input_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_persistent?: boolean
          rtmps_url: string
          stream_key_encrypted: string
          stream_key_last_reset_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cloudflare_live_input_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_persistent?: boolean
          rtmps_url?: string
          stream_key_encrypted?: string
          stream_key_last_reset_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sbt_issuance_rules: {
        Row: {
          auto_conditions: Json
          category: Database["public"]["Enums"]["sbt_category"]
          created_at: string
          description: string | null
          display_name: string
          is_active: boolean
          mode: Database["public"]["Enums"]["sbt_issuance_mode"]
          privacy_level: Database["public"]["Enums"]["sbt_privacy"]
          sbt_type: string
          tc_impact: number
          trust_weight: number
        }
        Insert: {
          auto_conditions?: Json
          category: Database["public"]["Enums"]["sbt_category"]
          created_at?: string
          description?: string | null
          display_name: string
          is_active?: boolean
          mode?: Database["public"]["Enums"]["sbt_issuance_mode"]
          privacy_level?: Database["public"]["Enums"]["sbt_privacy"]
          sbt_type: string
          tc_impact?: number
          trust_weight?: number
        }
        Update: {
          auto_conditions?: Json
          category?: Database["public"]["Enums"]["sbt_category"]
          created_at?: string
          description?: string | null
          display_name?: string
          is_active?: boolean
          mode?: Database["public"]["Enums"]["sbt_issuance_mode"]
          privacy_level?: Database["public"]["Enums"]["sbt_privacy"]
          sbt_type?: string
          tc_impact?: number
          trust_weight?: number
        }
        Relationships: []
      }
      sbt_registry: {
        Row: {
          did_id: string
          evidence_hash: string | null
          expires_at: string | null
          issued_at: string
          issuer: string
          metadata: Json
          privacy_level: Database["public"]["Enums"]["sbt_privacy"]
          revocation_reason: string | null
          sbt_category: Database["public"]["Enums"]["sbt_category"]
          sbt_type: string
          status: Database["public"]["Enums"]["sbt_status"]
          token_id: string
          trust_weight: number
        }
        Insert: {
          did_id: string
          evidence_hash?: string | null
          expires_at?: string | null
          issued_at?: string
          issuer?: string
          metadata?: Json
          privacy_level?: Database["public"]["Enums"]["sbt_privacy"]
          revocation_reason?: string | null
          sbt_category: Database["public"]["Enums"]["sbt_category"]
          sbt_type: string
          status?: Database["public"]["Enums"]["sbt_status"]
          token_id?: string
          trust_weight?: number
        }
        Update: {
          did_id?: string
          evidence_hash?: string | null
          expires_at?: string | null
          issued_at?: string
          issuer?: string
          metadata?: Json
          privacy_level?: Database["public"]["Enums"]["sbt_privacy"]
          revocation_reason?: string | null
          sbt_category?: Database["public"]["Enums"]["sbt_category"]
          sbt_type?: string
          status?: Database["public"]["Enums"]["sbt_status"]
          token_id?: string
          trust_weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "sbt_registry_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: false
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      scanner_block_gaps: {
        Row: {
          block: number
          chain_id: number
          created_at: string
          id: string
          reason: string
          resolved_at: string | null
          retries: number
          updated_at: string
        }
        Insert: {
          block: number
          chain_id: number
          created_at?: string
          id?: string
          reason: string
          resolved_at?: string | null
          retries?: number
          updated_at?: string
        }
        Update: {
          block?: number
          chain_id?: number
          created_at?: string
          id?: string
          reason?: string
          resolved_at?: string | null
          retries?: number
          updated_at?: string
        }
        Relationships: []
      }
      scanner_tick_log: {
        Row: {
          candidates: number
          chain_id: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          gap_blocks_added: number
          gaps_resolved: number
          head_block: number | null
          id: string
          missing_in_db: number
          mode: string
          ok: boolean
          rpc_endpoint_stats: Json
          rpc_healthy: number
          safe_head: number | null
          scanned_ranges: Json
          wallets_tracked: number
          watermark_advanced: boolean
        }
        Insert: {
          candidates?: number
          chain_id?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          gap_blocks_added?: number
          gaps_resolved?: number
          head_block?: number | null
          id?: string
          missing_in_db?: number
          mode?: string
          ok?: boolean
          rpc_endpoint_stats?: Json
          rpc_healthy?: number
          safe_head?: number | null
          scanned_ranges?: Json
          wallets_tracked?: number
          watermark_advanced?: boolean
        }
        Update: {
          candidates?: number
          chain_id?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          gap_blocks_added?: number
          gaps_resolved?: number
          head_block?: number | null
          id?: string
          missing_in_db?: number
          mode?: string
          ok?: boolean
          rpc_endpoint_stats?: Json
          rpc_healthy?: number
          safe_head?: number | null
          scanned_ranges?: Json
          wallets_tracked?: number
          watermark_advanced?: boolean
        }
        Relationships: []
      }
      scanner_transfers_watermarks: {
        Row: {
          last_block: number
          updated_at: string
          wallet_address: string
        }
        Insert: {
          last_block: number
          updated_at?: string
          wallet_address: string
        }
        Update: {
          last_block?: number
          updated_at?: string
          wallet_address?: string
        }
        Relationships: []
      }
      scanner_watermarks: {
        Row: {
          chain_id: number
          created_at: string
          head_block: number
          id: string
          last_block: number
          source: string
          token_address: string | null
          updated_at: string
        }
        Insert: {
          chain_id: number
          created_at?: string
          head_block?: number
          id?: string
          last_block?: number
          source: string
          token_address?: string | null
          updated_at?: string
        }
        Update: {
          chain_id?: number
          created_at?: string
          head_block?: number
          id?: string
          last_block?: number
          source?: string
          token_address?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string | null
          id: string
          last_used_at: string | null
          metadata: Json | null
          query: string
          type: string
          use_count: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          query: string
          type?: string
          use_count?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_used_at?: string | null
          metadata?: Json | null
          query?: string
          type?: string
          use_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      search_logs: {
        Row: {
          created_at: string
          id: string
          search_query: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          search_query: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          search_query?: string
          user_id?: string
        }
        Relationships: []
      }
      shared_posts: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          original_post_id: string
          user_id: string
          visibility: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          original_post_id: string
          user_id: string
          visibility?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          original_post_id?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_posts_original_post_id_fkey"
            columns: ["original_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_failure_log: {
        Row: {
          context: Json
          created_at: string
          email_input: string | null
          error_message: string | null
          id: string
          occurred_at: string
          source: string
          sqlstate: string | null
          username_input: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          email_input?: string | null
          error_message?: string | null
          id?: string
          occurred_at?: string
          source: string
          sqlstate?: string | null
          username_input?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          email_input?: string | null
          error_message?: string | null
          id?: string
          occurred_at?: string
          source?: string
          sqlstate?: string | null
          username_input?: string | null
        }
        Relationships: []
      }
      slug_history: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          id: string
          new_slug: string | null
          old_slug: string
          user_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          id?: string
          new_slug?: string | null
          old_slug: string
          user_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          id?: string
          new_slug?: string | null
          old_slug?: string
          user_id?: string
        }
        Relationships: []
      }
      soul_nfts: {
        Row: {
          chain_id: number
          contract_address: string | null
          created_at: string
          experience_points: number
          id: string
          is_minted: boolean
          metadata_uri: string | null
          minted_at: string | null
          soul_element: string | null
          soul_level: number
          soul_name: string | null
          token_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          chain_id?: number
          contract_address?: string | null
          created_at?: string
          experience_points?: number
          id?: string
          is_minted?: boolean
          metadata_uri?: string | null
          minted_at?: string | null
          soul_element?: string | null
          soul_level?: number
          soul_name?: string | null
          token_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          chain_id?: number
          contract_address?: string | null
          created_at?: string
          experience_points?: number
          id?: string
          is_minted?: boolean
          metadata_uri?: string | null
          minted_at?: string | null
          soul_element?: string | null
          soul_level?: number
          soul_name?: string | null
          token_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "soul_nfts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soul_nfts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soul_nfts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soul_nfts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stale_account_reminder_log: {
        Row: {
          batch_number: number
          created_at: string
          email: string | null
          final_note: string | null
          final_status: string
          final_status_at: string | null
          id: string
          resend_message_id: string | null
          sent_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_number: number
          created_at?: string
          email?: string | null
          final_note?: string | null
          final_status?: string
          final_status_at?: string | null
          id?: string
          resend_message_id?: string | null
          sent_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_number?: number
          created_at?: string
          email?: string | null
          final_note?: string | null
          final_status?: string
          final_status_at?: string | null
          id?: string
          resend_message_id?: string | null
          sent_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stale_unaccepted_accounts_log: {
        Row: {
          account_created_at: string | null
          created_at: string
          days_stale: number | null
          email: string | null
          id: string
          last_signed_in_at: string | null
          scanned_at: string
          threshold_days: number
          user_id: string
        }
        Insert: {
          account_created_at?: string | null
          created_at?: string
          days_stale?: number | null
          email?: string | null
          id?: string
          last_signed_in_at?: string | null
          scanned_at?: string
          threshold_days?: number
          user_id: string
        }
        Update: {
          account_created_at?: string | null
          created_at?: string
          days_stale?: number | null
          email?: string | null
          id?: string
          last_signed_in_at?: string | null
          scanned_at?: string
          threshold_days?: number
          user_id?: string
        }
        Relationships: []
      }
      sticker_packs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_free: boolean
          name: string
          preview_url: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_free?: boolean
          name: string
          preview_url: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_free?: boolean
          name?: string
          preview_url?: string
          sort_order?: number
        }
        Relationships: []
      }
      stickers: {
        Row: {
          created_at: string
          id: string
          is_animated: boolean
          name: string
          pack_id: string
          sort_order: number
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_animated?: boolean
          name: string
          pack_id: string
          sort_order?: number
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_animated?: boolean
          name?: string
          pack_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "stickers_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "sticker_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      streams: {
        Row: {
          created_at: string
          duration: number
          id: string
          status: string
          title: string
          updated_at: string
          user_id: string
          video_path: string
        }
        Insert: {
          created_at?: string
          duration: number
          id?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
          video_path: string
        }
        Update: {
          created_at?: string
          duration?: number
          id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
          video_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "streams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "streams_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suspicious_wallet_events: {
        Row: {
          chain_id: number
          created_at: string
          first_seen_at: string
          from_address: string | null
          id: string
          last_seen_at: string
          log_index: number | null
          network: string
          occurrences: number
          raw_amount_wei: string | null
          raw_decimals: number | null
          raw_symbol: string | null
          raw_token_address: string | null
          reason: string
          source: string
          to_address: string | null
          tx_hash: string
          watched_address: string
        }
        Insert: {
          chain_id: number
          created_at?: string
          first_seen_at?: string
          from_address?: string | null
          id?: string
          last_seen_at?: string
          log_index?: number | null
          network: string
          occurrences?: number
          raw_amount_wei?: string | null
          raw_decimals?: number | null
          raw_symbol?: string | null
          raw_token_address?: string | null
          reason: string
          source?: string
          to_address?: string | null
          tx_hash: string
          watched_address: string
        }
        Update: {
          chain_id?: number
          created_at?: string
          first_seen_at?: string
          from_address?: string | null
          id?: string
          last_seen_at?: string
          log_index?: number | null
          network?: string
          occurrences?: number
          raw_amount_wei?: string | null
          raw_decimals?: number | null
          raw_symbol?: string | null
          raw_token_address?: string | null
          reason?: string
          source?: string
          to_address?: string | null
          tx_hash?: string
          watched_address?: string
        }
        Relationships: []
      }
      swap_failures: {
        Row: {
          attempts: number
          chain_id: number | null
          context: Json
          created_at: string
          error_message: string | null
          first_failed_at: string
          http_status: number | null
          id: string
          last_failed_at: string
          notified_at: string | null
          reason: string | null
          sqlstate: string | null
          stage: string
          tx_hash: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          chain_id?: number | null
          context?: Json
          created_at?: string
          error_message?: string | null
          first_failed_at?: string
          http_status?: number | null
          id?: string
          last_failed_at?: string
          notified_at?: string | null
          reason?: string | null
          sqlstate?: string | null
          stage: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          chain_id?: number | null
          context?: Json
          created_at?: string
          error_message?: string | null
          first_failed_at?: string
          http_status?: number | null
          id?: string
          last_failed_at?: string
          notified_at?: string | null
          reason?: string | null
          sqlstate?: string | null
          stage?: string
          tx_hash?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      swap_price_validation_log: {
        Row: {
          amount: number | null
          chain_id: number | null
          code_amount_usd: number | null
          code_price_usd: number | null
          created_at: string
          diff_pct: number | null
          history_price_usd: number | null
          id: string
          phase: string
          side: string
          swap_date: string
          swap_id: string | null
          token_symbol: string
          tx_hash: string | null
          verdict: string
        }
        Insert: {
          amount?: number | null
          chain_id?: number | null
          code_amount_usd?: number | null
          code_price_usd?: number | null
          created_at?: string
          diff_pct?: number | null
          history_price_usd?: number | null
          id?: string
          phase?: string
          side: string
          swap_date: string
          swap_id?: string | null
          token_symbol: string
          tx_hash?: string | null
          verdict: string
        }
        Update: {
          amount?: number | null
          chain_id?: number | null
          code_amount_usd?: number | null
          code_price_usd?: number | null
          created_at?: string
          diff_pct?: number | null
          history_price_usd?: number | null
          id?: string
          phase?: string
          side?: string
          swap_date?: string
          swap_id?: string | null
          token_symbol?: string
          tx_hash?: string | null
          verdict?: string
        }
        Relationships: []
      }
      swap_transactions: {
        Row: {
          chain_id: number
          created_at: string
          dex_provider: string | null
          from_amount: number
          from_amount_usd: number | null
          from_symbol: string
          id: string
          quote_id: string | null
          status: string
          to_amount: number
          to_amount_usd: number | null
          to_symbol: string
          tx_hash: string
          user_id: string
          verified_by: string
        }
        Insert: {
          chain_id?: number
          created_at?: string
          dex_provider?: string | null
          from_amount: number
          from_amount_usd?: number | null
          from_symbol: string
          id?: string
          quote_id?: string | null
          status?: string
          to_amount: number
          to_amount_usd?: number | null
          to_symbol: string
          tx_hash: string
          user_id: string
          verified_by?: string
        }
        Update: {
          chain_id?: number
          created_at?: string
          dex_provider?: string | null
          from_amount?: number
          from_amount_usd?: number | null
          from_symbol?: string
          id?: string
          quote_id?: string | null
          status?: string
          to_amount?: number
          to_amount_usd?: number | null
          to_symbol?: string
          tx_hash?: string
          user_id?: string
          verified_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sybil_clusters: {
        Row: {
          admin_notes: string | null
          ai_analysis: Json | null
          cluster_key: string
          cluster_type: string
          confidence_score: number
          created_at: string | null
          detection_signals: Json | null
          id: string
          last_scanned_at: string | null
          resolved_at: string | null
          resolved_by: string | null
          risk_level: number
          updated_at: string | null
          user_ids: string[]
        }
        Insert: {
          admin_notes?: string | null
          ai_analysis?: Json | null
          cluster_key: string
          cluster_type: string
          confidence_score?: number
          created_at?: string | null
          detection_signals?: Json | null
          id?: string
          last_scanned_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: number
          updated_at?: string | null
          user_ids?: string[]
        }
        Update: {
          admin_notes?: string | null
          ai_analysis?: Json | null
          cluster_key?: string
          cluster_type?: string
          confidence_score?: number
          created_at?: string | null
          detection_signals?: Json | null
          id?: string
          last_scanned_at?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: number
          updated_at?: string | null
          user_ids?: string[]
        }
        Relationships: []
      }
      system_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      token_ingest_filters: {
        Row: {
          chain: string
          enabled: boolean
          min_amount: number
          notes: string | null
          token_symbol: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          chain?: string
          enabled?: boolean
          min_amount: number
          notes?: string | null
          token_symbol: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          chain?: string
          enabled?: boolean
          min_amount?: number
          notes?: string | null
          token_symbol?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      token_price_current: {
        Row: {
          fetched_at: string
          price_usd: number
          source: string
          symbol: string
          updated_at: string
          usd_24h_change: number | null
        }
        Insert: {
          fetched_at?: string
          price_usd: number
          source?: string
          symbol: string
          updated_at?: string
          usd_24h_change?: number | null
        }
        Update: {
          fetched_at?: string
          price_usd?: number
          source?: string
          symbol?: string
          updated_at?: string
          usd_24h_change?: number | null
        }
        Relationships: []
      }
      token_price_fetch_failures: {
        Row: {
          attempts: number
          date: string
          first_failed_at: string
          last_failed_at: string
          notified_at: string | null
          symbol: string
        }
        Insert: {
          attempts?: number
          date: string
          first_failed_at?: string
          last_failed_at?: string
          notified_at?: string | null
          symbol: string
        }
        Update: {
          attempts?: number
          date?: string
          first_failed_at?: string
          last_failed_at?: string
          notified_at?: string | null
          symbol?: string
        }
        Relationships: []
      }
      token_price_history: {
        Row: {
          date: string
          fetched_at: string
          price_usd: number
          source: string
          symbol: string
        }
        Insert: {
          date: string
          fetched_at?: string
          price_usd: number
          source?: string
          symbol: string
        }
        Update: {
          date?: string
          fetched_at?: string
          price_usd?: number
          source?: string
          symbol?: string
        }
        Relationships: []
      }
      tokens_registry: {
        Row: {
          chain_id: number
          created_at: string
          decimals: number
          default_price_usd: number | null
          id: string
          is_active: boolean
          is_leaderboard_eligible: boolean
          is_verified: boolean
          max_single_usd: number | null
          name: string
          network: string
          notes: string | null
          ranking_dimension: string
          risk_level: string
          source: string
          symbol: string
          token_address: string | null
          token_icon: string | null
          updated_at: string
        }
        Insert: {
          chain_id: number
          created_at?: string
          decimals: number
          default_price_usd?: number | null
          id?: string
          is_active?: boolean
          is_leaderboard_eligible?: boolean
          is_verified?: boolean
          max_single_usd?: number | null
          name: string
          network: string
          notes?: string | null
          ranking_dimension?: string
          risk_level?: string
          source?: string
          symbol: string
          token_address?: string | null
          token_icon?: string | null
          updated_at?: string
        }
        Update: {
          chain_id?: number
          created_at?: string
          decimals?: number
          default_price_usd?: number | null
          id?: string
          is_active?: boolean
          is_leaderboard_eligible?: boolean
          is_verified?: boolean
          max_single_usd?: number | null
          name?: string
          network?: string
          notes?: string | null
          ranking_dimension?: string
          risk_level?: string
          source?: string
          symbol?: string
          token_address?: string | null
          token_icon?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: string
          amount_fix_note: string | null
          amount_normalized: number | null
          chain_id: number
          created_at: string
          from_address: string
          id: string
          is_junk_token: boolean
          junk_reason: string | null
          status: string
          to_address: string
          token_address: string | null
          token_symbol: string
          tx_hash: string
          user_id: string
        }
        Insert: {
          amount: string
          amount_fix_note?: string | null
          amount_normalized?: number | null
          chain_id: number
          created_at?: string
          from_address: string
          id?: string
          is_junk_token?: boolean
          junk_reason?: string | null
          status?: string
          to_address: string
          token_address?: string | null
          token_symbol: string
          tx_hash: string
          user_id: string
        }
        Update: {
          amount?: string
          amount_fix_note?: string | null
          amount_normalized?: number | null
          chain_id?: number
          created_at?: string
          from_address?: string
          id?: string
          is_junk_token?: boolean
          junk_reason?: string | null
          status?: string
          to_address?: string
          token_address?: string | null
          token_symbol?: string
          tx_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions_trust_admin_audit: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          payload: Json
          target_id: string | null
          target_kind: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          payload?: Json
          target_id?: string | null
          target_kind: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          payload?: Json
          target_id?: string | null
          target_kind?: string
        }
        Relationships: []
      }
      treasury_flows: {
        Row: {
          amount: number
          created_at: string | null
          destination_vault: string | null
          flow_type: string
          id: string
          metadata: Json | null
          reason: string | null
          reference_id: string | null
          reference_table: string | null
          source: string | null
          token_symbol: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          destination_vault?: string | null
          flow_type: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          reference_id?: string | null
          reference_table?: string | null
          source?: string | null
          token_symbol?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          destination_vault?: string | null
          flow_type?: string
          id?: string
          metadata?: Json | null
          reason?: string | null
          reference_id?: string | null
          reference_table?: string | null
          source?: string | null
          token_symbol?: string
        }
        Relationships: []
      }
      treasury_vaults: {
        Row: {
          allocation_pct: number | null
          balance: number
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          token_symbol: string
          total_inflow: number
          total_outflow: number
          updated_at: string | null
          vault_key: string
          vault_name: string
        }
        Insert: {
          allocation_pct?: number | null
          balance?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          token_symbol?: string
          total_inflow?: number
          total_outflow?: number
          updated_at?: string | null
          vault_key: string
          vault_name: string
        }
        Update: {
          allocation_pct?: number | null
          balance?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          token_symbol?: string
          total_inflow?: number
          total_outflow?: number
          updated_at?: string | null
          vault_key?: string
          vault_name?: string
        }
        Relationships: []
      }
      trust_profile: {
        Row: {
          behavior_stability: number
          did_id: string
          fraud_risk: Database["public"]["Enums"]["sybil_risk_level"]
          historical_cleanliness: number
          last_calculated_at: string
          onchain_credibility: number
          risk_factor: number
          social_trust: number
          sybil_risk: Database["public"]["Enums"]["sybil_risk_level"]
          tc: number
          trust_tier: Database["public"]["Enums"]["trust_tier"]
          verification_strength: number
        }
        Insert: {
          behavior_stability?: number
          did_id: string
          fraud_risk?: Database["public"]["Enums"]["sybil_risk_level"]
          historical_cleanliness?: number
          last_calculated_at?: string
          onchain_credibility?: number
          risk_factor?: number
          social_trust?: number
          sybil_risk?: Database["public"]["Enums"]["sybil_risk_level"]
          tc?: number
          trust_tier?: Database["public"]["Enums"]["trust_tier"]
          verification_strength?: number
        }
        Update: {
          behavior_stability?: number
          did_id?: string
          fraud_risk?: Database["public"]["Enums"]["sybil_risk_level"]
          historical_cleanliness?: number
          last_calculated_at?: string
          onchain_credibility?: number
          risk_factor?: number
          social_trust?: number
          sybil_risk?: Database["public"]["Enums"]["sybil_risk_level"]
          tc?: number
          trust_tier?: Database["public"]["Enums"]["trust_tier"]
          verification_strength?: number
        }
        Relationships: [
          {
            foreignKeyName: "trust_profile_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: true
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      tx_perf_samples: {
        Row: {
          created_at: string
          id: string
          meta: Json
          ms: number
          op: string
          payload_bytes: number | null
          surface: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          meta?: Json
          ms: number
          op: string
          payload_bytes?: number | null
          surface: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          meta?: Json
          ms?: number
          op?: string
          payload_bytes?: number | null
          surface?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tx_shadow_diffs: {
        Row: {
          created_at: string
          details: Json
          diff_type: string
          id: string
          legacy_count: number | null
          legacy_sum: number | null
          surface: string
          unified_count: number | null
          unified_sum: number | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          diff_type: string
          id?: string
          legacy_count?: number | null
          legacy_sum?: number | null
          surface: string
          unified_count?: number | null
          unified_sum?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          diff_type?: string
          id?: string
          legacy_count?: number | null
          legacy_sum?: number | null
          surface?: string
          unified_count?: number | null
          unified_sum?: number | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      tx_validation_snapshots: {
        Row: {
          created_at: string
          diff_json: Json
          from_ts: string | null
          id: string
          legacy_json: Json
          metrics_json: Json
          notes: string | null
          ran_at: string
          ran_by: string | null
          status: string
          target_user_id: string
          to_ts: string | null
          unified_json: Json
        }
        Insert: {
          created_at?: string
          diff_json?: Json
          from_ts?: string | null
          id?: string
          legacy_json?: Json
          metrics_json?: Json
          notes?: string | null
          ran_at?: string
          ran_by?: string | null
          status: string
          target_user_id: string
          to_ts?: string | null
          unified_json?: Json
        }
        Update: {
          created_at?: string
          diff_json?: Json
          from_ts?: string | null
          id?: string
          legacy_json?: Json
          metrics_json?: Json
          notes?: string | null
          ran_at?: string
          ran_by?: string | null
          status?: string
          target_user_id?: string
          to_ts?: string | null
          unified_json?: Json
        }
        Relationships: []
      }
      unified_transactions_snapshot: {
        Row: {
          amount_decimal: number | null
          amount_raw: string | null
          block_number: number | null
          chain: string | null
          chain_id: number | null
          confirmed_at: string | null
          counterparty_user_id: string | null
          created_at: string | null
          decimals: number | null
          dedup_rank: number | null
          direction: string | null
          direction_confidence: string | null
          fee_raw: string | null
          id: string | null
          is_external: boolean | null
          is_spam: boolean | null
          memo: string | null
          metadata: Json | null
          network: string | null
          occurred_at: string | null
          recipient_address: string | null
          sender_address: string | null
          source_id: string | null
          source_table: string | null
          status: string | null
          token_address: string | null
          token_symbol: string | null
          tx_hash: string | null
          tx_type: string | null
          user_id: string | null
        }
        Insert: {
          amount_decimal?: number | null
          amount_raw?: string | null
          block_number?: number | null
          chain?: string | null
          chain_id?: number | null
          confirmed_at?: string | null
          counterparty_user_id?: string | null
          created_at?: string | null
          decimals?: number | null
          dedup_rank?: number | null
          direction?: string | null
          direction_confidence?: string | null
          fee_raw?: string | null
          id?: string | null
          is_external?: boolean | null
          is_spam?: boolean | null
          memo?: string | null
          metadata?: Json | null
          network?: string | null
          occurred_at?: string | null
          recipient_address?: string | null
          sender_address?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: string | null
          token_address?: string | null
          token_symbol?: string | null
          tx_hash?: string | null
          tx_type?: string | null
          user_id?: string | null
        }
        Update: {
          amount_decimal?: number | null
          amount_raw?: string | null
          block_number?: number | null
          chain?: string | null
          chain_id?: number | null
          confirmed_at?: string | null
          counterparty_user_id?: string | null
          created_at?: string | null
          decimals?: number | null
          dedup_rank?: number | null
          direction?: string | null
          direction_confidence?: string | null
          fee_raw?: string | null
          id?: string | null
          is_external?: boolean | null
          is_spam?: boolean | null
          memo?: string | null
          metadata?: Json | null
          network?: string | null
          occurred_at?: string | null
          recipient_address?: string | null
          sender_address?: string | null
          source_id?: string | null
          source_table?: string | null
          status?: string | null
          token_address?: string | null
          token_symbol?: string | null
          tx_hash?: string | null
          tx_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      user_dimension_scores: {
        Row: {
          activity_score: number | null
          computed_at: string | null
          created_at: string | null
          decay_applied: boolean | null
          ecosystem_score: number | null
          identity_score: number | null
          inactive_days: number | null
          level_name: string | null
          onchain_score: number | null
          risk_penalty: number | null
          streak_bonus_pct: number | null
          total_light_score: number | null
          transparency_score: number | null
          user_id: string
        }
        Insert: {
          activity_score?: number | null
          computed_at?: string | null
          created_at?: string | null
          decay_applied?: boolean | null
          ecosystem_score?: number | null
          identity_score?: number | null
          inactive_days?: number | null
          level_name?: string | null
          onchain_score?: number | null
          risk_penalty?: number | null
          streak_bonus_pct?: number | null
          total_light_score?: number | null
          transparency_score?: number | null
          user_id: string
        }
        Update: {
          activity_score?: number | null
          computed_at?: string | null
          created_at?: string | null
          decay_applied?: boolean | null
          ecosystem_score?: number | null
          identity_score?: number | null
          inactive_days?: number | null
          level_name?: string | null
          onchain_score?: number | null
          risk_penalty?: number | null
          streak_bonus_pct?: number | null
          total_light_score?: number | null
          transparency_score?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_epoch_scores: {
        Row: {
          active_days: number | null
          burst_penalty_factor: number | null
          computed_at: string | null
          consistency_factor: number | null
          cross_window_continuity_factor: number | null
          deduped_activity_count: number | null
          epoch_id: string | null
          epoch_label: string
          finalized_at: string | null
          finalized_score: number | null
          fraud_factor: number | null
          id: string
          late_window_suppression_factor: number | null
          preview_score: number | null
          raw_activity_count: number | null
          total_window_days: number | null
          trust_factor: number | null
          trust_ramp_factor: number | null
          user_id: string
          utility_participation_factor: number | null
          validated_score: number | null
          weighted_score: number | null
          window_type: string
        }
        Insert: {
          active_days?: number | null
          burst_penalty_factor?: number | null
          computed_at?: string | null
          consistency_factor?: number | null
          cross_window_continuity_factor?: number | null
          deduped_activity_count?: number | null
          epoch_id?: string | null
          epoch_label: string
          finalized_at?: string | null
          finalized_score?: number | null
          fraud_factor?: number | null
          id?: string
          late_window_suppression_factor?: number | null
          preview_score?: number | null
          raw_activity_count?: number | null
          total_window_days?: number | null
          trust_factor?: number | null
          trust_ramp_factor?: number | null
          user_id: string
          utility_participation_factor?: number | null
          validated_score?: number | null
          weighted_score?: number | null
          window_type?: string
        }
        Update: {
          active_days?: number | null
          burst_penalty_factor?: number | null
          computed_at?: string | null
          consistency_factor?: number | null
          cross_window_continuity_factor?: number | null
          deduped_activity_count?: number | null
          epoch_id?: string | null
          epoch_label?: string
          finalized_at?: string | null
          finalized_score?: number | null
          fraud_factor?: number | null
          id?: string
          late_window_suppression_factor?: number | null
          preview_score?: number | null
          raw_activity_count?: number | null
          total_window_days?: number | null
          trust_factor?: number | null
          trust_ramp_factor?: number | null
          user_id?: string
          utility_participation_factor?: number | null
          validated_score?: number | null
          weighted_score?: number | null
          window_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_epoch_scores_epoch_id_fkey"
            columns: ["epoch_id"]
            isOneToOne: false
            referencedRelation: "mint_epochs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_honor_stats_cache: {
        Row: {
          actual_comments_count: number | null
          actual_friends_count: number | null
          actual_livestreams_count: number | null
          actual_posts_count: number | null
          actual_reactions_count: number | null
          actual_shares_count: number | null
          claimed_amount: number | null
          comments_count: number | null
          friends_count: number | null
          livestreams_count: number | null
          posts_all_count: number | null
          posts_count: number | null
          reactions_made_count: number | null
          reactions_on_posts: number | null
          refreshed_at: string
          shares_count: number | null
          today_reward: number | null
          total_reward: number | null
          user_id: string
        }
        Insert: {
          actual_comments_count?: number | null
          actual_friends_count?: number | null
          actual_livestreams_count?: number | null
          actual_posts_count?: number | null
          actual_reactions_count?: number | null
          actual_shares_count?: number | null
          claimed_amount?: number | null
          comments_count?: number | null
          friends_count?: number | null
          livestreams_count?: number | null
          posts_all_count?: number | null
          posts_count?: number | null
          reactions_made_count?: number | null
          reactions_on_posts?: number | null
          refreshed_at?: string
          shares_count?: number | null
          today_reward?: number | null
          total_reward?: number | null
          user_id: string
        }
        Update: {
          actual_comments_count?: number | null
          actual_friends_count?: number | null
          actual_livestreams_count?: number | null
          actual_posts_count?: number | null
          actual_reactions_count?: number | null
          actual_shares_count?: number | null
          claimed_amount?: number | null
          comments_count?: number | null
          friends_count?: number | null
          livestreams_count?: number | null
          posts_all_count?: number | null
          posts_count?: number | null
          reactions_made_count?: number | null
          reactions_on_posts?: number | null
          refreshed_at?: string
          shares_count?: number | null
          today_reward?: number | null
          total_reward?: number | null
          user_id?: string
        }
        Relationships: []
      }
      user_honor_stats_refresh_queue: {
        Row: {
          queued_at: string
          user_id: string
        }
        Insert: {
          queued_at?: string
          user_id: string
        }
        Update: {
          queued_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_light_totals: {
        Row: {
          prev_score: number
          recent_score: number
          refreshed_at: string
          total_score: number
          user_id: string
        }
        Insert: {
          prev_score?: number
          recent_score?: number
          refreshed_at?: string
          total_score?: number
          user_id: string
        }
        Update: {
          prev_score?: number
          recent_score?: number
          refreshed_at?: string
          total_score?: number
          user_id?: string
        }
        Relationships: []
      }
      user_reel_preferences: {
        Row: {
          engagement_score: number | null
          id: string
          liked_categories: string[] | null
          updated_at: string
          user_id: string
          watched_creators: string[] | null
        }
        Insert: {
          engagement_score?: number | null
          id?: string
          liked_categories?: string[] | null
          updated_at?: string
          user_id: string
          watched_creators?: string[] | null
        }
        Update: {
          engagement_score?: number | null
          id?: string
          liked_categories?: string[] | null
          updated_at?: string
          user_id?: string
          watched_creators?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "user_reel_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reel_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reel_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reel_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_watched_wallets: {
        Row: {
          address: string
          chain: string
          created_at: string
          enabled: boolean
          id: string
          label: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          chain: string
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      username_history: {
        Row: {
          created_at: string | null
          id: string
          new_username: string | null
          old_username: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          new_username?: string | null
          old_username: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          new_username?: string | null
          old_username?: string
          user_id?: string
        }
        Relationships: []
      }
      validator_profile: {
        Row: {
          contact_email: string | null
          created_at: string
          description: string | null
          did_id: string
          display_name: string
          exited_at: string | null
          last_slash_at: string | null
          metadata: Json
          min_stake_required: number
          slash_count: number
          stake_amount: number
          stake_started_at: string | null
          status: string
          successful_validations: number
          total_validations: number
          updated_at: string
          uptime_pct: number
          website: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          description?: string | null
          did_id: string
          display_name: string
          exited_at?: string | null
          last_slash_at?: string | null
          metadata?: Json
          min_stake_required?: number
          slash_count?: number
          stake_amount?: number
          stake_started_at?: string | null
          status?: string
          successful_validations?: number
          total_validations?: number
          updated_at?: string
          uptime_pct?: number
          website?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          description?: string | null
          did_id?: string
          display_name?: string
          exited_at?: string | null
          last_slash_at?: string | null
          metadata?: Json
          min_stake_required?: number
          slash_count?: number
          stake_amount?: number
          stake_started_at?: string | null
          status?: string
          successful_validations?: number
          total_validations?: number
          updated_at?: string
          uptime_pct?: number
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "validator_profile_did_id_fkey"
            columns: ["did_id"]
            isOneToOne: true
            referencedRelation: "did_registry"
            referencedColumns: ["did_id"]
          },
        ]
      }
      video_downloads: {
        Row: {
          downloaded_at: string
          id: string
          post_id: string
          user_agent: string | null
          user_id: string | null
          video_provider: string | null
          video_url: string
        }
        Insert: {
          downloaded_at?: string
          id?: string
          post_id: string
          user_agent?: string | null
          user_id?: string | null
          video_provider?: string | null
          video_url: string
        }
        Update: {
          downloaded_at?: string
          id?: string
          post_id?: string
          user_agent?: string | null
          user_id?: string | null
          video_provider?: string | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_downloads_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      video_upload_sessions: {
        Row: {
          chunk_size: number
          content_type: string
          created_at: string
          duration_seconds: number | null
          expires_at: string
          failed_reason: string | null
          file_hash: string
          file_size: number
          id: string
          multipart_upload_id: string
          parts_done: Json
          public_url: string | null
          r2_key: string
          status: string
          total_parts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          chunk_size: number
          content_type: string
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string
          failed_reason?: string | null
          file_hash: string
          file_size: number
          id?: string
          multipart_upload_id: string
          parts_done?: Json
          public_url?: string | null
          r2_key: string
          status?: string
          total_parts: number
          updated_at?: string
          user_id: string
        }
        Update: {
          chunk_size?: number
          content_type?: string
          created_at?: string
          duration_seconds?: number | null
          expires_at?: string
          failed_reason?: string | null
          file_hash?: string
          file_size?: number
          id?: string
          multipart_upload_id?: string
          parts_done?: Json
          public_url?: string | null
          r2_key?: string
          status?: string
          total_parts?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_bulk_update_alerts: {
        Row: {
          affected_count: number
          application_name: string | null
          changed_by: string | null
          client_addr: unknown
          created_at: string
          db_session_user: string | null
          id: string
          note: string | null
          sample_user_ids: string[] | null
          severity: string
          window_end: string
          window_start: string
        }
        Insert: {
          affected_count: number
          application_name?: string | null
          changed_by?: string | null
          client_addr?: unknown
          created_at?: string
          db_session_user?: string | null
          id?: string
          note?: string | null
          sample_user_ids?: string[] | null
          severity?: string
          window_end: string
          window_start: string
        }
        Update: {
          affected_count?: number
          application_name?: string | null
          changed_by?: string | null
          client_addr?: unknown
          created_at?: string
          db_session_user?: string | null
          id?: string
          note?: string | null
          sample_user_ids?: string[] | null
          severity?: string
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      wallet_challenges: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          message: string
          nonce: string
          used_at: string | null
          wallet_address: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: string | null
          message: string
          nonce: string
          used_at?: string | null
          wallet_address: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          message?: string
          nonce?: string
          used_at?: string | null
          wallet_address?: string
        }
        Relationships: []
      }
      wallet_custom_tokens: {
        Row: {
          address: string
          chain_id: number
          created_at: string
          decimals: number
          id: string
          is_hidden: boolean
          logo_url: string | null
          name: string
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          chain_id?: number
          created_at?: string
          decimals: number
          id?: string
          is_hidden?: boolean
          logo_url?: string | null
          name: string
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          chain_id?: number
          created_at?: string
          decimals?: number
          id?: string
          is_hidden?: boolean
          logo_url?: string | null
          name?: string
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_custom_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_custom_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_custom_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_custom_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_history: {
        Row: {
          change_reason: string | null
          created_at: string
          device_hash: string | null
          ended_at: string | null
          id: string
          ip_address: string | null
          is_active: boolean
          metadata: Json | null
          started_at: string
          user_agent: string | null
          user_id: string
          wallet_address: string
        }
        Insert: {
          change_reason?: string | null
          created_at?: string
          device_hash?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          metadata?: Json | null
          started_at?: string
          user_agent?: string | null
          user_id: string
          wallet_address: string
        }
        Update: {
          change_reason?: string | null
          created_at?: string
          device_hash?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          metadata?: Json | null
          started_at?: string
          user_agent?: string | null
          user_id?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_reconciliation_findings: {
        Row: {
          action: string
          address: string | null
          chain: string
          created_at: string
          id: string
          payload: Json
          run_id: string
          tx_hash: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          address?: string | null
          chain: string
          created_at?: string
          id?: string
          payload?: Json
          run_id: string
          tx_hash?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          address?: string | null
          chain?: string
          created_at?: string
          id?: string
          payload?: Json
          run_id?: string
          tx_hash?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_reconciliation_findings_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "wallet_reconciliation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_reconciliation_runs: {
        Row: {
          chain: string
          errors: number
          finished_at: string | null
          id: string
          notes: string | null
          started_at: string
          status: string
          trigger: string
          triggered_by: string | null
          txs_backfilled: number
          txs_found: number
          wallets_scanned: number
        }
        Insert: {
          chain: string
          errors?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          status?: string
          trigger?: string
          triggered_by?: string | null
          txs_backfilled?: number
          txs_found?: number
          wallets_scanned?: number
        }
        Update: {
          chain?: string
          errors?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          status?: string
          trigger?: string
          triggered_by?: string | null
          txs_backfilled?: number
          txs_found?: number
          wallets_scanned?: number
        }
        Relationships: []
      }
      wallet_scan_metrics: {
        Row: {
          chains: string[]
          created_at: string
          id: string
          registry_size: number
          scanned_addresses: number
          suspicious_count: number
          verified_count: number
        }
        Insert: {
          chains?: string[]
          created_at?: string
          id?: string
          registry_size?: number
          scanned_addresses?: number
          suspicious_count?: number
          verified_count?: number
        }
        Update: {
          chains?: string[]
          created_at?: string
          id?: string
          registry_size?: number
          scanned_addresses?: number
          suspicious_count?: number
          verified_count?: number
        }
        Relationships: []
      }
      wallet_security_audit: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          new_value: string | null
          old_value: string | null
          reason: string | null
          setting_key: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          setting_key: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          setting_key?: string
        }
        Relationships: []
      }
      wallet_transfers: {
        Row: {
          amount: number
          chain_family: string
          chain_id: number
          classifier_version: string | null
          confirmations: number | null
          counterparty_address: string | null
          created_at: string
          direction: string
          fee: string | null
          id: string
          integrity_status: string
          status: string
          superseded_by: string | null
          tags: string[]
          token_address: string | null
          token_symbol: string
          tx_hash: string
          user_id: string
          vout_index: number | null
        }
        Insert: {
          amount: number
          chain_family?: string
          chain_id?: number
          classifier_version?: string | null
          confirmations?: number | null
          counterparty_address?: string | null
          created_at?: string
          direction: string
          fee?: string | null
          id?: string
          integrity_status?: string
          status?: string
          superseded_by?: string | null
          tags?: string[]
          token_address?: string | null
          token_symbol: string
          tx_hash: string
          user_id: string
          vout_index?: number | null
        }
        Update: {
          amount?: number
          chain_family?: string
          chain_id?: number
          classifier_version?: string | null
          confirmations?: number | null
          counterparty_address?: string | null
          created_at?: string
          direction?: string
          fee?: string | null
          id?: string
          integrity_status?: string
          status?: string
          superseded_by?: string | null
          tags?: string[]
          token_address?: string | null
          token_symbol?: string
          tx_hash?: string
          user_id?: string
          vout_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transfers_superseded_by_fk"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "btc_tx_semantic"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transfers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transfers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transfers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transfers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_writer_audit: {
        Row: {
          application_name: string | null
          blocked: boolean
          changed_by: string | null
          client_addr: unknown
          column_name: string
          db_session_user: string | null
          id: string
          is_allowed: boolean
          new_value: string | null
          occurred_at: string
          old_value: string | null
          request_id: string | null
          strict_mode: boolean
          user_id: string | null
          writer_tag: string | null
        }
        Insert: {
          application_name?: string | null
          blocked?: boolean
          changed_by?: string | null
          client_addr?: unknown
          column_name: string
          db_session_user?: string | null
          id?: string
          is_allowed: boolean
          new_value?: string | null
          occurred_at?: string
          old_value?: string | null
          request_id?: string | null
          strict_mode: boolean
          user_id?: string | null
          writer_tag?: string | null
        }
        Update: {
          application_name?: string | null
          blocked?: boolean
          changed_by?: string | null
          client_addr?: unknown
          column_name?: string
          db_session_user?: string | null
          id?: string
          is_allowed?: boolean
          new_value?: string | null
          occurred_at?: string
          old_value?: string | null
          request_id?: string | null
          strict_mode?: boolean
          user_id?: string | null
          writer_tag?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      admin_profiles_moderation: {
        Row: {
          admin_notes: string | null
          avatar_url: string | null
          ban_reason: string | null
          banned_at: string | null
          fraud_risk_level: number | null
          fraud_trusted: boolean | null
          full_name: string | null
          id: string | null
          is_banned: boolean | null
          is_restricted: boolean | null
          pending_reward: number | null
          reward_status: string | null
          username: string | null
          wallet_address: string | null
          wallet_risk_status: string | null
        }
        Insert: {
          admin_notes?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          fraud_risk_level?: number | null
          fraud_trusted?: boolean | null
          full_name?: string | null
          id?: string | null
          is_banned?: boolean | null
          is_restricted?: boolean | null
          pending_reward?: number | null
          reward_status?: string | null
          username?: string | null
          wallet_address?: string | null
          wallet_risk_status?: string | null
        }
        Update: {
          admin_notes?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          fraud_risk_level?: number | null
          fraud_trusted?: boolean | null
          full_name?: string | null
          id?: string | null
          is_banned?: boolean | null
          is_restricted?: boolean | null
          pending_reward?: number | null
          reward_status?: string | null
          username?: string | null
          wallet_address?: string | null
          wallet_risk_status?: string | null
        }
        Relationships: []
      }
      my_profile_moderation: {
        Row: {
          admin_notes: string | null
          avatar_url: string | null
          ban_reason: string | null
          btc_address: string | null
          claim_freeze_until: string | null
          cover_url: string | null
          created_at: string | null
          display_name: string | null
          fraud_risk_level: number | null
          fraud_trusted: boolean | null
          full_name: string | null
          id: string | null
          last_wallet_change_at: string | null
          reward_status: string | null
          social_links: Json | null
          username: string | null
          wallet_change_count_30d: number | null
          wallet_risk_status: string | null
        }
        Insert: {
          admin_notes?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          btc_address?: string | null
          claim_freeze_until?: string | null
          cover_url?: string | null
          created_at?: string | null
          display_name?: string | null
          fraud_risk_level?: number | null
          fraud_trusted?: boolean | null
          full_name?: string | null
          id?: string | null
          last_wallet_change_at?: string | null
          reward_status?: string | null
          social_links?: Json | null
          username?: string | null
          wallet_change_count_30d?: number | null
          wallet_risk_status?: string | null
        }
        Update: {
          admin_notes?: string | null
          avatar_url?: string | null
          ban_reason?: string | null
          btc_address?: string | null
          claim_freeze_until?: string | null
          cover_url?: string | null
          created_at?: string | null
          display_name?: string | null
          fraud_risk_level?: number | null
          fraud_trusted?: boolean | null
          full_name?: string | null
          id?: string | null
          last_wallet_change_at?: string | null
          reward_status?: string | null
          social_links?: Json | null
          username?: string | null
          wallet_change_count_30d?: number | null
          wallet_risk_status?: string | null
        }
        Relationships: []
      }
      mystery_box_orders_public: {
        Row: {
          box_code: string | null
          box_def_id: string | null
          box_icon: string | null
          box_name_en: string | null
          box_name_vi: string | null
          box_tier: Database["public"]["Enums"]["box_tier"] | null
          confirmed_at: string | null
          created_at: string | null
          id: string | null
          price_camly: number | null
          tx_hash: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mystery_box_orders_box_def_id_fkey"
            columns: ["box_def_id"]
            isOneToOne: false
            referencedRelation: "mystery_box_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_arena_public: {
        Row: {
          level: number | null
          name: string | null
          risk_tier: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          level?: number | null
          name?: string | null
          risk_tier?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          level?: number | null
          name?: string | null
          risk_tier?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      pet_shop_orders_public: {
        Row: {
          confirmed_at: string | null
          cosmetic_id: string | null
          cosmetic_name_en: string | null
          cosmetic_name_vi: string | null
          cosmetic_rarity: string | null
          cosmetic_slot: string | null
          cosmetic_slug: string | null
          cosmetic_sprite_url: string | null
          created_at: string | null
          id: string | null
          price_camly: number | null
          tx_hash: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pet_shop_orders_cosmetic_id_fkey"
            columns: ["cosmetic_id"]
            isOneToOne: false
            referencedRelation: "pet_cosmetics_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      public_light_reputation: {
        Row: {
          actions_count: number | null
          tier: number | null
          total_light_score: number | null
          total_minted: number | null
          user_id: string | null
        }
        Insert: {
          actions_count?: number | null
          tier?: number | null
          total_light_score?: number | null
          total_minted?: number | null
          user_id?: string | null
        }
        Update: {
          actions_count?: number | null
          tier?: number | null
          total_light_score?: number | null
          total_minted?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "light_reputation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_reputation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_reputation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "light_reputation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_live_sessions: {
        Row: {
          channel_name: string | null
          created_at: string | null
          device_id: string | null
          ended_at: string | null
          host_user_id: string | null
          id: string | null
          owner_id: string | null
          post_id: string | null
          privacy: string | null
          recording_status: string | null
          slug: string | null
          started_at: string | null
          status: string | null
          title: string | null
          updated_at: string | null
          viewer_count: number | null
        }
        Insert: {
          channel_name?: string | null
          created_at?: string | null
          device_id?: string | null
          ended_at?: string | null
          host_user_id?: string | null
          id?: string | null
          owner_id?: string | null
          post_id?: string | null
          privacy?: string | null
          recording_status?: string | null
          slug?: string | null
          started_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          viewer_count?: number | null
        }
        Update: {
          channel_name?: string | null
          created_at?: string | null
          device_id?: string | null
          ended_at?: string | null
          host_user_id?: string | null
          id?: string | null
          owner_id?: string | null
          post_id?: string | null
          privacy?: string | null
          recording_status?: string | null
          slug?: string | null
          started_at?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          viewer_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_host_user_id_fkey"
            columns: ["host_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "admin_profiles_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "my_profile_moderation"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_sessions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      public_pet_states: {
        Row: {
          cheers_received_total: number | null
          equipped_accessory_slug: string | null
          equipped_aura_slug: string | null
          equipped_frame_slug: string | null
          equipped_hat_slug: string | null
          equipped_skin_slug: string | null
          evolution_stage: number | null
          level: number | null
          mood: Database["public"]["Enums"]["pet_mood"] | null
          name: string | null
          species: string | null
          user_id: string | null
          visible: boolean | null
        }
        Insert: {
          cheers_received_total?: number | null
          equipped_accessory_slug?: never
          equipped_aura_slug?: never
          equipped_frame_slug?: never
          equipped_hat_slug?: never
          equipped_skin_slug?: never
          evolution_stage?: number | null
          level?: number | null
          mood?: Database["public"]["Enums"]["pet_mood"] | null
          name?: string | null
          species?: string | null
          user_id?: string | null
          visible?: boolean | null
        }
        Update: {
          cheers_received_total?: number | null
          equipped_accessory_slug?: never
          equipped_aura_slug?: never
          equipped_frame_slug?: never
          equipped_hat_slug?: never
          equipped_skin_slug?: never
          evolution_stage?: number | null
          level?: number | null
          mood?: Database["public"]["Enums"]["pet_mood"] | null
          name?: string | null
          species?: string | null
          user_id?: string | null
          visible?: boolean | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          btc_address: string | null
          cover_url: string | null
          created_at: string | null
          current_live_session_id: string | null
          display_name: string | null
          education: string | null
          full_name: string | null
          id: string | null
          is_banned: boolean | null
          is_live: boolean | null
          live_started_at: string | null
          location: string | null
          public_wallet_address: string | null
          relationship_status: string | null
          social_links: Json | null
          username: string | null
          username_normalized: string | null
          workplace: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          btc_address?: string | null
          cover_url?: string | null
          created_at?: string | null
          current_live_session_id?: string | null
          display_name?: string | null
          education?: string | null
          full_name?: string | null
          id?: string | null
          is_banned?: boolean | null
          is_live?: boolean | null
          live_started_at?: string | null
          location?: string | null
          public_wallet_address?: string | null
          relationship_status?: string | null
          social_links?: Json | null
          username?: string | null
          username_normalized?: string | null
          workplace?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          btc_address?: string | null
          cover_url?: string | null
          created_at?: string | null
          current_live_session_id?: string | null
          display_name?: string | null
          education?: string | null
          full_name?: string | null
          id?: string | null
          is_banned?: boolean | null
          is_live?: boolean | null
          live_started_at?: string | null
          location?: string | null
          public_wallet_address?: string | null
          relationship_status?: string | null
          social_links?: Json | null
          username?: string | null
          username_normalized?: string | null
          workplace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_live_session_id_fkey"
            columns: ["current_live_session_id"]
            isOneToOne: false
            referencedRelation: "live_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_current_live_session_id_fkey"
            columns: ["current_live_session_id"]
            isOneToOne: false
            referencedRelation: "public_live_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      public_system_config: {
        Row: {
          key: string | null
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          key?: string | null
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      unified_user_light_score: {
        Row: {
          combined_actions_count: number | null
          combined_light_score: number | null
          user_id: string | null
          v1_actions_count: number | null
          v1_last_action_at: string | null
          v1_light_score: number | null
          v1_streak: number | null
          v1_tier: number | null
          v2_actions_count: number | null
          v2_light_score: number | null
          v2_minted_amount: number | null
        }
        Relationships: []
      }
      v_internal_addresses: {
        Row: {
          addr: string | null
        }
        Relationships: []
      }
      v_unified_transactions: {
        Row: {
          amount_decimal: number | null
          amount_raw: string | null
          block_number: number | null
          chain: string | null
          chain_id: number | null
          confirmed_at: string | null
          counterparty_user_id: string | null
          created_at: string | null
          decimals: number | null
          direction: string | null
          direction_confidence: string | null
          fee_raw: string | null
          id: string | null
          is_external: boolean | null
          is_spam: boolean | null
          memo: string | null
          metadata: Json | null
          network: string | null
          occurred_at: string | null
          recipient_address: string | null
          sender_address: string | null
          source_id: string | null
          source_table: string | null
          status: string | null
          token_address: string | null
          token_symbol: string | null
          tx_hash: string | null
          tx_type: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_unified_transactions_primary: {
        Row: {
          amount_decimal: number | null
          amount_raw: string | null
          block_number: number | null
          chain: string | null
          chain_id: number | null
          confirmed_at: string | null
          counterparty_user_id: string | null
          created_at: string | null
          decimals: number | null
          dedup_rank: number | null
          direction: string | null
          direction_confidence: string | null
          fee_raw: string | null
          id: string | null
          is_external: boolean | null
          is_spam: boolean | null
          memo: string | null
          metadata: Json | null
          network: string | null
          occurred_at: string | null
          recipient_address: string | null
          sender_address: string | null
          source_id: string | null
          source_table: string | null
          status: string | null
          token_address: string | null
          token_symbol: string | null
          tx_hash: string | null
          tx_type: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _emit_fp_activity: {
        Args: { p_event_type: string; p_payload: Json; p_subject_user: string }
        Returns: undefined
      }
      _emit_fp_event: {
        Args: {
          p_aggregate_id: string
          p_event_type: string
          p_force?: boolean
          p_payload: Json
        }
        Returns: string
      }
      _resolve_decimals: {
        Args: { _chain_id: number; _symbol: string; _token_address: string }
        Returns: number
      }
      _safe_numeric: { Args: { _t: string }; Returns: number }
      _unified_profile_lite: { Args: { _uid: string }; Returns: Json }
      _unified_tx_can_view: { Args: { _target: string }; Returns: boolean }
      admin_backfill_create_job: {
        Args: {
          p_from_ts?: string
          p_scope: string
          p_to_ts?: string
          p_wallets?: string[]
        }
        Returns: string
      }
      admin_backfill_job_view: { Args: { p_job_id: string }; Returns: Json }
      admin_backfill_toggle_selection: {
        Args: {
          p_candidate_ids: string[]
          p_job_id: string
          p_selected: boolean
        }
        Returns: number
      }
      admin_fix_live_replay_orientation: {
        Args: { p_layout: string; p_session_id: string }
        Returns: Json
      }
      admin_sql_exec: { Args: { _sql: string }; Returns: Json[] }
      app_secret_delete: {
        Args: { _actor: string; _name: string }
        Returns: boolean
      }
      app_secret_get: { Args: { _key: string; _name: string }; Returns: string }
      app_secret_set: {
        Args: {
          _actor: string
          _description?: string
          _key: string
          _name: string
          _value: string
        }
        Returns: string
      }
      apply_attester_signature: {
        Args: {
          p_group: string
          p_request_id: string
          p_signature: string
          p_signer_address: string
          p_signer_name: string
        }
        Returns: Json
      }
      apply_pet_event: {
        Args: {
          _event: Database["public"]["Enums"]["pet_event_type"]
          _user_id: string
        }
        Returns: {
          accessories: Json
          cheers_received_total: number
          created_at: string
          evolution_stage: number
          last_interaction_at: string
          last_renamed_at: string | null
          level: number
          mood: Database["public"]["Enums"]["pet_mood"]
          name: string
          risk_tier: string
          species: string
          updated_at: string
          user_id: string
          visible: boolean
          voice_enabled: boolean
          xp: number
          xp_today: number
          xp_today_date: string
        }
        SetofOptions: {
          from: "*"
          to: "pet_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_pet_xp_grant: {
        Args: { _source?: string; _user_id: string; _xp_delta: number }
        Returns: {
          accessories: Json
          cheers_received_total: number
          created_at: string
          evolution_stage: number
          last_interaction_at: string
          last_renamed_at: string | null
          level: number
          mood: Database["public"]["Enums"]["pet_mood"]
          name: string
          risk_tier: string
          species: string
          updated_at: string
          user_id: string
          visible: boolean
          voice_enabled: boolean
          xp: number
          xp_today: number
          xp_today_date: string
        }
        SetofOptions: {
          from: "*"
          to: "pet_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_user_reward: {
        Args: { p_admin_id: string; p_note?: string; p_user_id: string }
        Returns: number
      }
      archive_acquire_lease: {
        Args: { p_id: string; p_minutes?: number }
        Returns: boolean
      }
      attach_live_replay_to_post: {
        Args: {
          _duration_seconds?: number
          _playback_url: string
          _session_id: string
          _thumbnail_url?: string
        }
        Returns: {
          agora_channel: string | null
          agora_channel_name: string | null
          agora_uid: number | null
          agora_uid_host: number | null
          archive_bucket: string | null
          archive_error: string | null
          archive_next_retry_at: string | null
          archive_object_key: string | null
          archive_retry_count: number
          archive_status: string
          archived_at: string | null
          armed_at: string | null
          armed_session_token: string | null
          auto_end_at: string | null
          auto_end_reason: string | null
          browser_recording_chunk_count: number | null
          browser_recording_status: string | null
          browser_recording_total_bytes: number | null
          browser_recording_warning: string | null
          channel_name: string
          cleanup_attempts: number
          cloudflare_deleted_at: string | null
          cloudflare_input_id: string | null
          cloudflare_live_input_id: string | null
          cloudflare_mp4_download_url: string | null
          cloudflare_video_uid: string | null
          connected_at: string | null
          connection_status: string
          created_at: string
          delete_stream_error: string | null
          deleted_at: string | null
          description: string | null
          device_id: string | null
          disconnected_at: string | null
          end_reason: string | null
          ended_at: string | null
          error_message: string | null
          go_live_clicked_at: string | null
          hls_url: string | null
          host_connection_status: string
          host_user_id: string
          id: string
          is_input_armed: boolean
          is_persistent_stream: boolean
          last_armed_heartbeat_at: string | null
          last_cleanup_at: string | null
          last_connection_check_at: string | null
          last_disconnected_at: string | null
          last_failed_at: string | null
          last_host_heartbeat_at: string | null
          last_recovery_at: string | null
          last_seen_at: string | null
          last_source_seen_at: string | null
          last_worker_response: Json | null
          live_input_disable_error: string | null
          live_input_disabled_at: string | null
          live_input_status: string | null
          live_post_id: string | null
          mode: string
          owner_id: string
          playback_provider: string
          playback_url: string | null
          post_id: string | null
          posted_at: string | null
          preview_ready: boolean
          preview_url: string | null
          privacy: string
          processing_started_at: string | null
          r2_archived_at: string | null
          r2_bucket: string | null
          r2_object_key: string | null
          r2_video_url: string | null
          reconnect_count: number
          reconnect_deadline_at: string | null
          recording_acquired_at: string | null
          recording_aspect_ratio: string | null
          recording_error: string | null
          recording_error_code: string | null
          recording_error_message: string | null
          recording_files: Json | null
          recording_height: number | null
          recording_last_query_at: string | null
          recording_layout: string | null
          recording_provider: string | null
          recording_ready_at: string | null
          recording_resource_id: string | null
          recording_sid: string | null
          recording_started_at: string | null
          recording_status: string
          recording_stop_requested_at: string | null
          recording_stopped_at: string | null
          recording_uid: number | null
          recording_width: number | null
          recovery_attempts: number
          replay_post_id: string | null
          replay_ready_at: string | null
          replay_url: string | null
          resource_id: string | null
          rtmp_config_id: string | null
          rtmps_url: string | null
          sid: string | null
          signal_lost_at: string | null
          signal_status: string | null
          slug: string | null
          source_connected: boolean
          source_connected_at: string | null
          source_device_type: string | null
          started_at: string
          status: string
          storage_provider: string
          stream_deleted_at: string | null
          stream_key_encrypted: string | null
          stream_key_last_reset_at: string | null
          temp_bucket: string | null
          temp_object_key: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          user_id: string | null
          viewer_count: number
        }
        SetofOptions: {
          from: "*"
          to: "live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auto_flip_pending_light_actions: { Args: never; Returns: Json }
      auto_flip_recoverable_mint_allocations: { Args: never; Returns: Json }
      backfill_transactions_from_sources: { Args: never; Returns: Json }
      ban_user_permanently: {
        Args: { p_admin_id: string; p_reason?: string; p_user_id: string }
        Returns: boolean
      }
      batch_ban_ghost_users: {
        Args: { admin_id: string; user_ids: string[] }
        Returns: number
      }
      batch_delete_orphan_auth_users: {
        Args: { p_admin_id: string }
        Returns: number
      }
      btc_manual_confirm_enabled: { Args: never; Returns: boolean }
      btc_normalize_address: { Args: { p_address: string }; Returns: string }
      btc_pending_verification_sweep: {
        Args: { _ttl_days?: number }
        Returns: Json
      }
      btc_persist_semantic_batch: {
        Args: {
          p_cache_rows?: Json
          p_review_rows?: Json
          p_semantic_rows?: Json
        }
        Returns: Json
      }
      btc_raw_sat_guard_scan: { Args: never; Returns: Json }
      btc_reconcile_apply_op: { Args: { p_op: Json }; Returns: Json }
      btc_resolver_fn_checksum_verify: {
        Args: never
        Returns: {
          actual_md5: string
          expected_md5: string
          fn_name: string
          status: string
        }[]
      }
      buddy_circle_create: {
        Args: { _max_members: number; _name: string }
        Returns: {
          created_at: string
          id: string
          invite_code: string
          max_members: number
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "buddy_circles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      buddy_circle_invite: {
        Args: { _circle_id: string; _user_id: string }
        Returns: undefined
      }
      buddy_circle_join_by_code: {
        Args: { _code: string }
        Returns: {
          created_at: string
          id: string
          invite_code: string
          max_members: number
          name: string
          owner_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "buddy_circles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      buddy_circle_leave: { Args: { _circle_id: string }; Returns: undefined }
      buddy_quest_complete: {
        Args: { _circle_id: string; _quest_id: string }
        Returns: Json
      }
      calculate_light_score: {
        Args: {
          base_reward: number
          impact_score: number
          integrity_score: number
          quality_score: number
          unity_multiplier: number
        }
        Returns: number
      }
      calculate_tier: { Args: { total_score: number }; Returns: number }
      calculate_unity_multiplier: {
        Args: { unity_score: number }
        Returns: number
      }
      check_email_collision: {
        Args: { p_email: string; p_exclude_user_id: string }
        Returns: boolean
      }
      check_login_method: { Args: { p_email: string }; Returns: Json }
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_ms?: number }
        Returns: Json
      }
      check_user_cap_and_update: {
        Args: { _action_type: string; _reward_amount: number; _user_id: string }
        Returns: Json
      }
      claim_btc_ownership: {
        Args: {
          p_address: string
          p_created_by: string
          p_evidence_ref: string
          p_request_id?: string
          p_user_id: string
          p_verification_method: string
        }
        Returns: {
          address: string
          created_at: string
          created_by: string
          evidence_ref: string | null
          id: string
          request_id: string | null
          user_id: string
          valid_from: string
          valid_to: string | null
          verification_method: string
          verified_at: string
        }
        SetofOptions: {
          from: "*"
          to: "btc_address_ownership_history"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_red_envelope: { Args: { p_envelope_id: string }; Returns: number }
      cleanup_expired_oauth_data: { Args: never; Returns: undefined }
      cleanup_old_system_data: { Args: never; Returns: Json }
      connector_revert_link: {
        Args: { _admin_id: string; _link_id: string; _reason: string }
        Returns: Json
      }
      cron_unschedule_by_name: { Args: { job_name: string }; Returns: boolean }
      decay_fraud_risk: { Args: never; Returns: number }
      decrement_live_viewer_count: {
        Args: { session_id: string }
        Returns: undefined
      }
      detect_wallet_bulk_updates: {
        Args: { p_threshold?: number; p_window_minutes?: number }
        Returns: number
      }
      diagnose_signup_failure: {
        Args: { _email: string; _source: string; _username: string }
        Returns: Json
      }
      donation_board_usd_total: { Args: never; Returns: number }
      drain_honor_stats_refresh_queue: {
        Args: { p_batch?: number }
        Returns: number
      }
      end_livestream: { Args: { p_livestream_id: string }; Returns: boolean }
      expire_old_mint_requests_v2: { Args: never; Returns: number }
      find_similar_profiles_for_impersonation: {
        Args: {
          p_limit?: number
          p_min_similarity?: number
          p_profile_id: string
        }
        Returns: {
          avatar_phash: string
          avatar_url: string
          created_at: string
          display_name: string
          full_name: string
          id: string
          name_similarity: number
          username: string
        }[]
      }
      fp_backfill_eligible_count: {
        Args: {
          p_include_banned?: boolean
          p_include_test?: boolean
          p_include_unverified?: boolean
        }
        Returns: number
      }
      fp_backfill_eligible_profiles: {
        Args: {
          p_include_banned?: boolean
          p_include_test?: boolean
          p_include_unverified?: boolean
          p_limit?: number
        }
        Returns: {
          auth_email: string
          created_at: string
          display_name: string
          email_confirmed_at: string
          id: string
          identity_is_test: boolean
          is_banned: boolean
          profile_email: string
          username: string
        }[]
      }
      fp_backfill_lookup_one: {
        Args: { p_user_id: string }
        Returns: {
          auth_email: string
          display_name: string
          email_confirmed_at: string
          id: string
          identity_is_test: boolean
          is_banned: boolean
          profile_email: string
          username: string
        }[]
      }
      fun_profile_apply_outbox_rollout_preset: {
        Args: { p_preset: string }
        Returns: Json
      }
      fun_profile_dry_run_emit_event: {
        Args: { p_event_type: string; p_user_id: string }
        Returns: Json
      }
      fun_profile_get_outbox_event_flags: { Args: never; Returns: Json }
      fun_profile_outbox_publisher_ack: {
        Args: { p_error?: string; p_id: string; p_success: boolean }
        Returns: Json
      }
      fun_profile_outbox_publisher_claim: {
        Args: { p_limit?: number }
        Returns: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          sent_at: string | null
          status: string
          trace_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "fun_profile_event_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      fun_profile_outbox_retry_dead_batch: {
        Args: { p_limit?: number }
        Returns: Json
      }
      fun_profile_outbox_retry_one: { Args: { p_id: string }; Returns: Json }
      fun_profile_set_outbox_event_flag: {
        Args: { p_enabled: boolean; p_event_type: string }
        Returns: Json
      }
      fun_profile_toggle_outbox_producer: {
        Args: { p_enabled: boolean }
        Returns: Json
      }
      fun_profile_toggle_outbox_publisher: {
        Args: { p_enabled: boolean }
        Returns: Json
      }
      gen_post_share_code: { Args: never; Returns: string }
      generate_content_slug: {
        Args: { p_table_name: string; p_user_id: string; title: string }
        Returns: string
      }
      generate_post_slug: {
        Args: { p_user_id: string; title: string }
        Returns: string
      }
      generate_secure_token: { Args: { length?: number }; Returns: string }
      get_all_claim_history: {
        Args: never
        Returns: {
          amount: number
          avatar_url: string
          created_at: string
          full_name: string
          id: string
          user_id: string
          username: string
          wallet_address: string
        }[]
      }
      get_app_stats:
        | {
            Args: never
            Returns: {
              priced_coverage_pct: number
              skipped_symbols: string[]
              total_camly_claimed: number
              total_livestreams: number
              total_photos: number
              total_posts: number
              total_received_usd: number
              total_rewards: number
              total_sent_usd: number
              total_users: number
              total_videos: number
              total_videos_combined: number
              treasury_camly_received: number
              unpriced_symbols: string[]
            }[]
          }
        | {
            Args: { p_prices: Json }
            Returns: {
              priced_coverage_pct: number
              skipped_symbols: string[]
              total_camly_claimed: number
              total_livestreams: number
              total_photos: number
              total_posts: number
              total_received_usd: number
              total_rewards: number
              total_sent_usd: number
              total_users: number
              total_videos: number
              total_videos_combined: number
              treasury_camly_received: number
              unpriced_symbols: string[]
            }[]
          }
      get_attester_dashboard_stats: {
        Args: { wallet_addr: string }
        Returns: {
          confirmed_count: number
          confirmed_fun: number
          is_capped: boolean
          pending_sig_count: number
          pending_sig_fun: number
          rejected_24h_count: number
          rejected_24h_fun: number
          signed_count: number
          signed_fun: number
          signing_count: number
          signing_fun: number
          total_in_dashboard: number
        }[]
      }
      get_attester_mint_requests:
        | {
            Args: { wallet_addr: string }
            Returns: {
              action_hash: string
              action_name: string
              action_types: string[]
              amount_display: number
              amount_wei: string
              created_at: string
              error_message: string
              evidence_hash: string
              id: string
              multisig_completed_groups: string[]
              multisig_required_groups: string[]
              multisig_signatures: Json
              nonce: number
              profile_avatar_url: string
              profile_full_name: string
              profile_username: string
              recipient_address: string
              status: string
              updated_at: string
              user_id: string
            }[]
          }
        | {
            Args: { p_request_id: string; wallet_addr: string }
            Returns: {
              action_hash: string
              action_name: string
              action_types: string[]
              amount_display: number
              amount_wei: string
              created_at: string
              evidence_hash: string
              id: string
              multisig_completed_groups: string[]
              multisig_required_groups: string[]
              multisig_signatures: Json
              nonce: number
              profile_avatar_url: string
              profile_full_name: string
              profile_username: string
              recipient_address: string
              status: string
              updated_at: string
              user_id: string
            }[]
          }
      get_auth_user_id_by_email: { Args: { p_email: string }; Returns: string }
      get_banned_user_claims: {
        Args: never
        Returns: {
          claim_count: number
          first_claim_at: string
          last_claim_at: string
          total_claimed: number
          user_id: string
        }[]
      }
      get_benefactor_leaderboard: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_time_range?: string
          p_to?: string
          p_token_symbol?: string
        }
        Returns: {
          avatar_url: string
          full_name: string
          rank: number
          total_amount_usd: number
          total_light_score: number
          total_transactions: number
          totals_by_token: Json
          user_id: string
          username: string
        }[]
      }
      get_content_stats_grouped_vn: {
        Args: {
          p_limit?: number
          p_mode?: string
          p_offset?: number
          p_type: string
        }
        Returns: {
          period: string
          total: number
        }[]
      }
      get_content_users_by_period_vn: {
        Args: { p_date: string; p_mode: string; p_type: string }
        Returns: {
          avatar_url: string
          display_name: string
          post_count: number
          social_links: Json
          user_id: string
          username: string
        }[]
      }
      get_contribution_dimension_stats: {
        Args: {
          p_dimension?: string
          p_from?: string
          p_time_range?: string
          p_to?: string
        }
        Returns: {
          ranking_dimension: string
          token_decimals: number
          token_icon: string
          token_symbol: string
          total_received: number
          total_sent: number
          transactions: number
          unique_participants: number
          unique_recipients: number
          unique_senders: number
        }[]
      }
      get_daily_cap: { Args: { tier: number }; Returns: number }
      get_daily_signups_vn: {
        Args: { p_days?: number }
        Returns: {
          new_users: number
          signup_date: string
        }[]
      }
      get_donation_global_stats: {
        Args: { p_from?: string; p_time_range?: string; p_to?: string }
        Returns: {
          total_donated_usd: number
          total_donations: number
          total_donors: number
          total_light_score: number
          total_recipients: number
          totals_by_token: Json
        }[]
      }
      get_donation_history: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_type?: string
          p_user_id: string
        }
        Returns: {
          amount: string
          amount_usd: number
          confirmed_at: string
          created_at: string
          id: string
          light_score_earned: number
          message: string
          message_template: string
          post_id: string
          recipient_avatar_url: string
          recipient_id: string
          recipient_username: string
          sender_avatar_url: string
          sender_id: string
          sender_username: string
          status: string
          token_symbol: string
          tx_hash: string
        }[]
      }
      get_founder_economy_stats: { Args: never; Returns: Json }
      get_founder_identity_stats: { Args: never; Returns: Json }
      get_founder_overview_stats: { Args: never; Returns: Json }
      get_gift_day_counts: {
        Args: never
        Returns: {
          gift_count: number
          vn_date: string
        }[]
      }
      get_gift_day_token_totals: {
        Args: never
        Returns: {
          chain_id: number
          token_symbol: string
          total_amount: number
          tx_count: number
          vn_date: string
        }[]
      }
      get_global_gift_breakdown:
        | {
            Args: { p_direction: string }
            Returns: {
              count: number
              source: string
              token_symbol: string
              total_amount: number
              usd_value: number
            }[]
          }
        | {
            Args: { p_direction: string; p_prices?: Json }
            Returns: {
              count: number
              source: string
              token_symbol: string
              total_amount: number
              usd_value: number
            }[]
          }
      get_global_wallet_flow_breakdown: {
        Args: { p_direction: string; p_prices?: Json }
        Returns: {
          count: number
          source: string
          token_symbol: string
          total_amount: number
          usd_value: number
        }[]
      }
      get_light_community: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          light_emoji: string
          light_level: string
          trend: string
          trend_emoji: string
          user_id: string
          username: string
        }[]
      }
      get_live_recording_context: {
        Args: { _session_id: string }
        Returns: {
          agora_channel: string
          channel_name: string
          host_user_id: string
          id: string
          last_worker_response: Json
          post_id: string
          recording_error: string
          recording_ready_at: string
          recording_started_at: string
          recording_status: string
          recording_stopped_at: string
          recording_uid: number
          resource_id: string
          sid: string
        }[]
      }
      get_livestream_stats: {
        Args: never
        Returns: {
          active_sessions: number
          avg_duration_minutes: number
          ended_sessions: number
          max_duration_minutes: number
          recordings_done: number
          recordings_failed: number
          recordings_stuck: number
          success_rate: number
          total_chunks: number
          total_recordings: number
          total_sessions: number
          total_viewers: number
        }[]
      }
      get_member_reward_breakdown: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          is_banned: boolean
          remaining: number
          total_claimed: number
          total_earned: number
          user_id: string
          username: string
        }[]
      }
      get_my_did: { Args: never; Returns: string }
      get_my_profile_private: {
        Args: never
        Returns: {
          cross_platform_data: Json
          email: string
          email_verified_at: string
        }[]
      }
      get_my_rewards: {
        Args: never
        Returns: {
          avatar_url: string
          comments_count: number
          friends_count: number
          id: string
          livestreams_count: number
          posts_count: number
          reactions_count: number
          reactions_on_posts: number
          shares_count: number
          today_reward: number
          total_reward: number
          username: string
        }[]
      }
      get_next_nonce: { Args: { _user_id: string }; Returns: number }
      get_post_stats: {
        Args: { p_post_ids: string[] }
        Returns: {
          comment_count: number
          post_id: string
          reaction_count: number
          reactions: Json
          share_count: number
        }[]
      }
      get_pplp_admin_stats: { Args: never; Returns: Json }
      get_profile_shared_posts: {
        Args: {
          p_cursor?: string
          p_limit?: number
          p_offset?: number
          p_user_id: string
        }
        Returns: Json[]
      }
      get_qualified_reward_users: {
        Args: { p_admin_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          days_active: number
          donation_count: number
          full_name: string
          light_score: number
          real_links_count: number
          reward_status: string
          tier: number
          total_donated: number
          user_id: string
          username: string
          wallet_address: string
        }[]
      }
      get_recipient_leaderboard: {
        Args: {
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_time_range?: string
          p_to?: string
          p_token_symbol?: string
        }
        Returns: {
          avatar_url: string
          full_name: string
          includes_external: boolean
          rank: number
          total_amount_usd: number
          total_transactions: number
          totals_by_token: Json
          user_id: string
          username: string
        }[]
      }
      get_replay_backlog_summary: { Args: never; Returns: Json }
      get_signups_by_date_vn: {
        Args: { p_date: string }
        Returns: {
          avatar_url: string
          created_at: string
          full_name: string
          id: string
          social_links: Json
          username: string
        }[]
      }
      get_signups_by_range_vn: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          avatar_url: string
          created_at: string
          full_name: string
          id: string
          social_links: Json
          username: string
        }[]
      }
      get_signups_grouped_vn: {
        Args: { p_limit: number; p_mode: string; p_offset: number }
        Returns: {
          new_users: number
          period_label: string
        }[]
      }
      get_token_leaderboard: {
        Args: {
          p_direction?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_time_range?: string
          p_to?: string
          p_token_symbol: string
        }
        Returns: {
          avatar_url: string
          full_name: string
          rank: number
          ranking_dimension: string
          token_decimals: number
          token_icon: string
          token_symbol: string
          total_amount: number
          total_amount_usd: number
          total_transactions: number
          user_id: string
          username: string
        }[]
      }
      get_token_price_at: {
        Args: { p_date: string; p_symbol: string }
        Returns: number
      }
      get_token_price_now: { Args: { p_symbol: string }; Returns: number }
      get_treasury_camly_overview: { Args: never; Returns: Json }
      get_unified_admin_stats: {
        Args: { _from_ts?: string; _to_ts?: string }
        Returns: Json
      }
      get_unified_counterparties: {
        Args: {
          _chain?: string
          _direction?: string
          _external_only?: boolean
          _from_ts?: string
          _limit?: number
          _scope: string
          _search?: string
          _status?: string
          _target_user_id?: string
          _to_ts?: string
          _token_symbol?: string
          _tx_type?: string
        }
        Returns: {
          avatar_url: string
          display_name: string
          tx_count: number
          user_id: string
          username: string
        }[]
      }
      get_unified_facets: {
        Args: { _scope: string; _target_user_id?: string }
        Returns: Json
      }
      get_unified_light_score: {
        Args: { p_user_id: string }
        Returns: {
          combined_light_score: number
          user_id: string
          v1_actions_count: number
          v1_light_score: number
          v1_streak: number
          v1_tier: number
          v2_actions_count: number
          v2_light_score: number
          v2_minted_amount: number
        }[]
      }
      get_unified_summary: {
        Args: {
          _chain?: string
          _counterparty_user_id?: string
          _direction?: string
          _external_only?: boolean
          _from_ts?: string
          _scope: string
          _search?: string
          _status?: string
          _target_user_id?: string
          _to_ts?: string
          _token_symbol?: string
          _tx_type?: string
        }
        Returns: Json
      }
      get_unified_transaction_detail: {
        Args: { _source_id?: string; _source_table?: string; _tx_hash?: string }
        Returns: Json
      }
      get_unified_transactions: {
        Args: {
          _chain?: string
          _counterparty_user_id?: string
          _direction?: string
          _external_only?: boolean
          _from_ts?: string
          _limit?: number
          _offset?: number
          _scope: string
          _search?: string
          _status?: string
          _target_user_id?: string
          _to_ts?: string
          _token_symbol?: string
          _tx_type?: string
        }
        Returns: {
          amount_decimal: number
          amount_raw: string
          block_number: number
          chain: string
          chain_id: number
          confirmed_at: string
          counterparty_avatar_url: string
          counterparty_display_name: string
          counterparty_user_id: string
          counterparty_username: string
          created_at: string
          decimals: number
          direction: string
          direction_confidence: string
          fee_raw: string
          id: string
          is_external: boolean
          memo: string
          metadata: Json
          network: string
          occurred_at: string
          owner_avatar_url: string
          owner_display_name: string
          owner_username: string
          recipient_address: string
          recipient_avatar_url: string
          recipient_display_name: string
          recipient_user_id: string
          recipient_username: string
          recipient_wallet_address: string
          sender_address: string
          sender_avatar_url: string
          sender_display_name: string
          sender_user_id: string
          sender_username: string
          sender_wallet_address: string
          source_id: string
          source_table: string
          status: string
          token_address: string
          token_symbol: string
          total_count: number
          tx_hash: string
          tx_type: string
          user_id: string
        }[]
      }
      get_user_directory_admin: {
        Args: never
        Returns: {
          approved_reward: number
          avatar_url: string
          camly_calculated: number
          camly_claimed: number
          camly_today: number
          comments_count: number
          created_at: string
          email: string
          friends_count: number
          full_name: string
          id: string
          internal_received: number
          internal_sent: number
          is_banned: boolean
          livestreams_count: number
          pending_reward: number
          posts_count: number
          reactions_on_posts: number
          reward_status: string
          shares_count: number
          tier: number
          total_light_score: number
          total_minted: number
          usdt_received: number
          username: string
          wallet_address: string
          web3_received: number
          web3_sent: number
        }[]
      }
      get_user_directory_summary: {
        Args: never
        Returns: {
          avatar_url: string
          camly_calculated: number
          camly_claimed: number
          comments_count: number
          created_at: string
          friends_count: number
          full_name: string
          id: string
          internal_received: number
          internal_sent: number
          is_banned: boolean
          livestreams_count: number
          posts_count: number
          reactions_on_posts: number
          shares_count: number
          tier: number
          total_light_score: number
          total_minted: number
          usdt_received: number
          username: string
          wallet_address: string
          web3_received: number
          web3_sent: number
        }[]
      }
      get_user_directory_totals: {
        Args: never
        Returns: {
          total_approved: number
          total_camly_calculated: number
          total_camly_claimed: number
          total_comments: number
          total_internal_received: number
          total_internal_sent: number
          total_light_score: number
          total_minted: number
          total_pending: number
          total_posts: number
          total_users: number
          total_web3_received: number
          total_web3_sent: number
          total_withdrawn: number
        }[]
      }
      get_user_donation_stats: {
        Args: { p_user_id: string }
        Returns: {
          donations_received: number
          donations_sent: number
          light_score_from_donations: number
          total_received: number
          total_sent: number
          unique_donors: number
          unique_recipients: number
        }[]
      }
      get_user_donation_summary: { Args: { p_user_id: string }; Returns: Json }
      get_user_emails_for_admin: {
        Args: { p_admin_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_user_friends: {
        Args: { target_user_id: string }
        Returns: {
          friend_id: string
          friendship_id: string
        }[]
      }
      get_user_gift_breakdown: {
        Args: { p_direction: string; p_prices?: Json; p_user_id: string }
        Returns: {
          cnt: number
          price_usd: number
          token_symbol: string
          total_amount: number
          usd_value: number
        }[]
      }
      get_user_honor_stats: {
        Args: { p_user_id: string }
        Returns: {
          actual_comments_count: number
          actual_friends_count: number
          actual_posts_count: number
          actual_reactions_count: number
          actual_shares_count: number
          claimed_amount: number
          comments_count: number
          friends_count: number
          livestreams_count: number
          posts_count: number
          reactions_on_posts: number
          shares_count: number
          today_reward: number
          total_reward: number
        }[]
      }
      get_user_honor_stats_compute: {
        Args: { p_user_id: string }
        Returns: {
          actual_comments_count: number
          actual_friends_count: number
          actual_posts_count: number
          actual_reactions_count: number
          actual_shares_count: number
          claimed_amount: number
          comments_count: number
          friends_count: number
          livestreams_count: number
          posts_count: number
          reactions_on_posts: number
          shares_count: number
          today_reward: number
          total_reward: number
        }[]
      }
      get_user_light_score: { Args: { p_user_id: string }; Returns: Json }
      get_user_mint_stats: {
        Args: { search_query?: string }
        Returns: {
          avatar_url: string
          confirmed_count: number
          epoch_allocated: number
          failed_count: number
          pending_count: number
          signed_count: number
          submitted_count: number
          total_actions: number
          total_light_score: number
          total_minted: number
          user_id: string
          username: string
          wallet_address: string
        }[]
      }
      get_user_posts_by_period_vn: {
        Args: {
          p_date: string
          p_date_from?: string
          p_date_to?: string
          p_mode: string
          p_type: string
          p_user_id: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          image_url: string
          media_urls: Json
          post_type: string
          video_url: string
        }[]
      }
      get_user_rewards: {
        Args: { limit_count?: number }
        Returns: {
          avatar_url: string
          comments_count: number
          friends_count: number
          id: string
          posts_count: number
          reactions_count: number
          reactions_on_posts: number
          shares_count: number
          total_reward: number
          username: string
        }[]
      }
      get_user_rewards_v2: {
        Args: { limit_count?: number }
        Returns: {
          avatar_url: string
          comments_count: number
          friends_count: number
          id: string
          livestreams_count: number
          posts_count: number
          reactions_count: number
          reactions_on_posts: number
          shares_count: number
          today_reward: number
          total_reward: number
          username: string
        }[]
      }
      get_user_rewards_v2_single: {
        Args: { target_user_id: string }
        Returns: {
          avatar_url: string
          comments_count: number
          friends_count: number
          id: string
          livestreams_count: number
          posts_count: number
          reactions_count: number
          reactions_on_posts: number
          shares_count: number
          today_reward: number
          total_reward: number
          username: string
        }[]
      }
      get_wallet_change_count_30d: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_who_can_message: { Args: { p_user_id: string }; Returns: string }
      has_block_between: {
        Args: { user_a: string; user_b: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_live_viewer_count: {
        Args: { session_id: string }
        Returns: undefined
      }
      is_buddy_member: {
        Args: { _circle_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_admin: {
        Args: { check_user_id: string; conv_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { check_user_id: string; conv_id: string }
        Returns: boolean
      }
      is_friend: { Args: { _other_user_id: string }; Returns: boolean }
      is_gov_attester:
        | { Args: { check_user_id: string }; Returns: boolean }
        | { Args: { wallet_addr: string }; Returns: boolean }
      is_org_admin: {
        Args: { _did_id: string; _user_id: string }
        Returns: boolean
      }
      job_acquire_lease: {
        Args: {
          p_job_name: string
          p_owner_token: string
          p_ttl_seconds?: number
        }
        Returns: boolean
      }
      job_release_lease: {
        Args: { p_job_name: string; p_owner_token: string }
        Returns: boolean
      }
      kyc_metrics_increment: {
        Args: { _delta?: number; _field: string; _provider: string }
        Returns: undefined
      }
      live_replay_force_resync: { Args: { p_replay_id: string }; Returns: Json }
      live_replay_recover_409_failed: { Args: never; Returns: Json }
      live_replays_patch: {
        Args: { p_id: string; p_patch: Json }
        Returns: undefined
      }
      live_session_events_retention: {
        Args: { _batch?: number; _days?: number; _max_batches?: number }
        Returns: Json
      }
      log_btc_resolver_shadow_comparison: {
        Args: {
          p_address: string
          p_call_site: string
          p_created_by: string
          p_event_at?: string
          p_idempotency_key: string
          p_legacy_source: string
          p_legacy_user_id: string
          p_raw_address_legacy_side?: string
          p_request_id?: string
          p_tx_hash?: string
        }
        Returns: {
          address: string
          call_site: string
          created_at: string
          created_by: string
          event_at: string
          id: string
          idempotency_key: string
          is_match: boolean
          legacy_source: string
          legacy_user_id: string | null
          observed_at: string
          priority_account_flag: boolean
          raw_address_legacy_side: string | null
          request_id: string | null
          resolver_user_id: string | null
          suspected_legacy_format_mismatch: boolean
          tx_hash: string | null
        }
        SetofOptions: {
          from: "*"
          to: "btc_resolver_shadow_log"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_founder_admin_action: {
        Args: {
          _action: string
          _payload?: Json
          _target_kind?: string
          _target_ref?: string
        }
        Returns: string
      }
      log_security_action: {
        Args: { p_action: string; p_details?: Json; p_user_id: string }
        Returns: undefined
      }
      log_signup_failure: {
        Args: {
          _context?: Json
          _email?: string
          _error_message?: string
          _source: string
          _sqlstate?: string
          _username?: string
        }
        Returns: string
      }
      log_swap_failure: {
        Args: {
          p_chain_id?: number
          p_context?: Json
          p_error_message?: string
          p_http_status?: number
          p_reason?: string
          p_sqlstate?: string
          p_stage: string
          p_tx_hash?: string
          p_user_id?: string
        }
        Returns: string
      }
      m6b_gap_claim_next_batch: {
        Args: never
        Returns: {
          created_at: string
          est_rows: number
          finished_at: string | null
          gap_found: number
          gap_samples: Json
          half: number
          id: string
          last_error: string | null
          month: string
          range_end: string
          range_start: string
          rows_scanned: number
          started_at: string | null
          status: string
          token_symbol: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "m6b_gap_scan_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      m6b_gap_plan_batches: {
        Args: { _max_rows?: number }
        Returns: {
          inserted: number
          total_batches: number
        }[]
      }
      m6b_gap_scan_run_batch: {
        Args: { _batch_id: string }
        Returns: {
          created_at: string
          est_rows: number
          finished_at: string | null
          gap_found: number
          gap_samples: Json
          half: number
          id: string
          last_error: string | null
          month: string
          range_end: string
          range_start: string
          rows_scanned: number
          started_at: string | null
          status: string
          token_symbol: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "m6b_gap_scan_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_suspected_farming: { Args: never; Returns: Json }
      moralis_usage_record: {
        Args: { p_calls: number; p_source?: string }
        Returns: {
          call_count: number
          daily_limit: number
          pct_used: number
          should_alert: boolean
        }[]
      }
      mystery_box_create_order: { Args: { _box_code: string }; Returns: Json }
      mystery_box_fail_order: {
        Args: { _order_id: string; _reason: string }
        Returns: undefined
      }
      mystery_box_finalize_order: {
        Args: { _from_address: string; _order_id: string; _tx_hash: string }
        Returns: Json
      }
      mystery_box_grant: {
        Args: {
          _box_code: string
          _source_event: Database["public"]["Enums"]["box_source"]
          _source_ref?: string
          _user_id: string
        }
        Returns: string
      }
      mystery_box_open: { Args: { _inventory_id: string }; Returns: Json }
      mystery_box_purchase: { Args: { _box_code: string }; Returns: string }
      normalize_price_map: {
        Args: { p_prices: Json }
        Returns: {
          price: number
          sym: string
        }[]
      }
      normalize_price_symbol: { Args: { p_symbol: string }; Returns: string }
      normalize_username: { Args: { input_text: string }; Returns: string }
      pet_battle_accept: {
        Args: { _battle_id: string }
        Returns: {
          challenger_id: string
          challenger_snapshot: Json
          created_at: string
          expires_at: string
          id: string
          opponent_id: string
          opponent_snapshot: Json
          resolved_at: string | null
          rounds: Json
          season_id: string | null
          seed: string
          status: string
          winner_id: string | null
          xp_award_challenger: number
          xp_award_opponent: number
        }
        SetofOptions: {
          from: "*"
          to: "pet_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pet_battle_challenge: {
        Args: { _opponent_id: string }
        Returns: {
          challenger_id: string
          challenger_snapshot: Json
          created_at: string
          expires_at: string
          id: string
          opponent_id: string
          opponent_snapshot: Json
          resolved_at: string | null
          rounds: Json
          season_id: string | null
          seed: string
          status: string
          winner_id: string | null
          xp_award_challenger: number
          xp_award_opponent: number
        }
        SetofOptions: {
          from: "*"
          to: "pet_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pet_battle_compute_stats: { Args: { _user_id: string }; Returns: Json }
      pet_battle_decline: {
        Args: { _battle_id: string }
        Returns: {
          challenger_id: string
          challenger_snapshot: Json
          created_at: string
          expires_at: string
          id: string
          opponent_id: string
          opponent_snapshot: Json
          resolved_at: string | null
          rounds: Json
          season_id: string | null
          seed: string
          status: string
          winner_id: string | null
          xp_award_challenger: number
          xp_award_opponent: number
        }
        SetofOptions: {
          from: "*"
          to: "pet_battles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pet_battle_expire_pending: { Args: never; Returns: number }
      pet_cheer: {
        Args: { _message?: string; _to_user_id: string }
        Returns: {
          created_at: string
          from_user_id: string
          id: string
          message: string | null
          to_user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pet_cheers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pet_equip_cosmetic: {
        Args: { _cosmetic_id: string }
        Returns: {
          acquired_at: string
          cosmetic_id: string
          equipped: boolean
          flagged_at: string | null
          id: string
          source: string
          source_box_open_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pet_cosmetics_owned"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pet_leaderboard_top: {
        Args: { _limit?: number }
        Returns: {
          cheers_received_total: number
          equipped_skin_slug: string
          evolution_stage: number
          level: number
          name: string
          user_id: string
        }[]
      }
      pet_level_for_xp: { Args: { _xp: number }; Returns: number }
      pet_rename: {
        Args: { _new_name: string }
        Returns: {
          accessories: Json
          cheers_received_total: number
          created_at: string
          evolution_stage: number
          last_interaction_at: string
          last_renamed_at: string | null
          level: number
          mood: Database["public"]["Enums"]["pet_mood"]
          name: string
          risk_tier: string
          species: string
          updated_at: string
          user_id: string
          visible: boolean
          voice_enabled: boolean
          xp: number
          xp_today: number
          xp_today_date: string
        }
        SetofOptions: {
          from: "*"
          to: "pet_states"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pet_risk_assert_allowed: {
        Args: { _action: string; _user_id: string }
        Returns: undefined
      }
      pet_risk_recompute: {
        Args: { _user_id: string }
        Returns: {
          last_reasons: Json
          risk_score: number
          risk_tier: string
          signal_count: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pet_risk_scores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pet_shop_create_order: { Args: { _cosmetic_id: string }; Returns: Json }
      pet_shop_fail_order: {
        Args: { _order_id: string; _reason: string }
        Returns: undefined
      }
      pet_shop_finalize_order: {
        Args: { _from_address: string; _order_id: string; _tx_hash: string }
        Returns: Json
      }
      pet_stage_for_xp: { Args: { _xp: number }; Returns: number }
      pet_unequip_cosmetic: {
        Args: { _cosmetic_id: string }
        Returns: {
          acquired_at: string
          cosmetic_id: string
          equipped: boolean
          flagged_at: string | null
          id: string
          source: string
          source_box_open_id: string | null
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "pet_cosmetics_owned"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pin_message: { Args: { p_message_id: string }; Returns: undefined }
      pplp_post_edit_after_score_check: {
        Args: { p_max_rate?: number; p_min_events?: number }
        Returns: Json
      }
      pplp_release_daily_mint: {
        Args: { p_action_name: string; p_amount_wei: number; p_source?: string }
        Returns: Json
      }
      pplp_reserve_daily_mint: {
        Args: { p_action_name: string; p_amount_wei: number; p_source?: string }
        Returns: Json
      }
      pplp_v25_dashboard_stats: { Args: never; Returns: Json }
      process_wallet_change: {
        Args: {
          p_device_hash?: string
          p_ip?: string
          p_new_wallet: string
          p_old_wallet?: string
          p_reason?: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: Json
      }
      quest_period_key: {
        Args: {
          p_freq: Database["public"]["Enums"]["quest_frequency"]
          p_now?: string
        }
        Returns: string
      }
      quest_record_progress: {
        Args: {
          p_evidence?: Json
          p_increment?: number
          p_quest_code: string
          p_user_id: string
        }
        Returns: Json
      }
      quest_set_progress: {
        Args: {
          p_evidence?: Json
          p_quest_code: string
          p_set_to: number
          p_user_id: string
        }
        Returns: Json
      }
      quest_streak_multiplier: { Args: { p_streak: number }; Returns: number }
      recalculate_user_financial: {
        Args: { p_admin_id?: string; p_client_id?: string; p_user_id: string }
        Returns: Json
      }
      refresh_app_stats_cache: { Args: never; Returns: undefined }
      refresh_donation_board_base: { Args: never; Returns: number }
      refresh_gift_breakdown_cache: { Args: never; Returns: number }
      refresh_stalest_honor_stats: {
        Args: { p_batch?: number }
        Returns: number
      }
      refresh_unified_transactions_snapshot: { Args: never; Returns: number }
      refresh_user_honor_stats_cache: {
        Args: { p_user_id: string }
        Returns: {
          actual_comments_count: number
          actual_friends_count: number
          actual_posts_count: number
          actual_reactions_count: number
          actual_shares_count: number
          claimed_amount: number
          comments_count: number
          friends_count: number
          livestreams_count: number
          posts_count: number
          reactions_on_posts: number
          shares_count: number
          today_reward: number
          total_reward: number
        }[]
      }
      refresh_user_light_totals: { Args: never; Returns: number }
      reject_user_reward: {
        Args: { p_admin_id: string; p_note?: string; p_user_id: string }
        Returns: number
      }
      resolve_btc_owner: {
        Args: { p_address: string; p_at?: string }
        Returns: string
      }
      resolve_live_session_route_id: {
        Args: { p_id: string }
        Returns: {
          live_post_id: string
          live_session_id: string
          playback_url: string
          post_id: string
          r2_video_url: string
          replay_post_id: string
          status: string
        }[]
      }
      run_financial_reconciliation: {
        Args: { p_admin_id?: string; p_dry_run?: boolean }
        Returns: Json
      }
      scan_stale_unaccepted_accounts: {
        Args: { p_threshold_days?: number }
        Returns: number
      }
      scanner_rpc_status: { Args: never; Returns: Json }
      scanner_watermark_advance: {
        Args: {
          p_chain_id: number
          p_head_block: number
          p_last_block: number
          p_source: string
          p_token_address: string
        }
        Returns: number
      }
      set_live_recording_state: {
        Args: {
          _last_worker_response?: Json
          _recording_error?: string
          _recording_ready_at?: string
          _recording_started_at?: string
          _recording_status?: string
          _recording_stopped_at?: string
          _recording_uid?: number
          _resource_id?: string
          _session_id: string
          _sid?: string
        }
        Returns: {
          agora_channel: string | null
          agora_channel_name: string | null
          agora_uid: number | null
          agora_uid_host: number | null
          archive_bucket: string | null
          archive_error: string | null
          archive_next_retry_at: string | null
          archive_object_key: string | null
          archive_retry_count: number
          archive_status: string
          archived_at: string | null
          armed_at: string | null
          armed_session_token: string | null
          auto_end_at: string | null
          auto_end_reason: string | null
          browser_recording_chunk_count: number | null
          browser_recording_status: string | null
          browser_recording_total_bytes: number | null
          browser_recording_warning: string | null
          channel_name: string
          cleanup_attempts: number
          cloudflare_deleted_at: string | null
          cloudflare_input_id: string | null
          cloudflare_live_input_id: string | null
          cloudflare_mp4_download_url: string | null
          cloudflare_video_uid: string | null
          connected_at: string | null
          connection_status: string
          created_at: string
          delete_stream_error: string | null
          deleted_at: string | null
          description: string | null
          device_id: string | null
          disconnected_at: string | null
          end_reason: string | null
          ended_at: string | null
          error_message: string | null
          go_live_clicked_at: string | null
          hls_url: string | null
          host_connection_status: string
          host_user_id: string
          id: string
          is_input_armed: boolean
          is_persistent_stream: boolean
          last_armed_heartbeat_at: string | null
          last_cleanup_at: string | null
          last_connection_check_at: string | null
          last_disconnected_at: string | null
          last_failed_at: string | null
          last_host_heartbeat_at: string | null
          last_recovery_at: string | null
          last_seen_at: string | null
          last_source_seen_at: string | null
          last_worker_response: Json | null
          live_input_disable_error: string | null
          live_input_disabled_at: string | null
          live_input_status: string | null
          live_post_id: string | null
          mode: string
          owner_id: string
          playback_provider: string
          playback_url: string | null
          post_id: string | null
          posted_at: string | null
          preview_ready: boolean
          preview_url: string | null
          privacy: string
          processing_started_at: string | null
          r2_archived_at: string | null
          r2_bucket: string | null
          r2_object_key: string | null
          r2_video_url: string | null
          reconnect_count: number
          reconnect_deadline_at: string | null
          recording_acquired_at: string | null
          recording_aspect_ratio: string | null
          recording_error: string | null
          recording_error_code: string | null
          recording_error_message: string | null
          recording_files: Json | null
          recording_height: number | null
          recording_last_query_at: string | null
          recording_layout: string | null
          recording_provider: string | null
          recording_ready_at: string | null
          recording_resource_id: string | null
          recording_sid: string | null
          recording_started_at: string | null
          recording_status: string
          recording_stop_requested_at: string | null
          recording_stopped_at: string | null
          recording_uid: number | null
          recording_width: number | null
          recovery_attempts: number
          replay_post_id: string | null
          replay_ready_at: string | null
          replay_url: string | null
          resource_id: string | null
          rtmp_config_id: string | null
          rtmps_url: string | null
          sid: string | null
          signal_lost_at: string | null
          signal_status: string | null
          slug: string | null
          source_connected: boolean
          source_connected_at: string | null
          source_device_type: string | null
          started_at: string
          status: string
          storage_provider: string
          stream_deleted_at: string | null
          stream_key_encrypted: string | null
          stream_key_last_reset_at: string | null
          temp_bucket: string | null
          temp_object_key: string | null
          thumbnail_url: string | null
          title: string | null
          updated_at: string
          user_id: string | null
          viewer_count: number
        }
        SetofOptions: {
          from: "*"
          to: "live_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_wallet_kill_switch: {
        Args: { _enabled: boolean; _reason: string }
        Returns: undefined
      }
      set_wallet_strict_mode: {
        Args: { _enabled: boolean; _reason: string }
        Returns: undefined
      }
      stale_reminder_deletion_preview: {
        Args: never
        Returns: {
          account_created_at: string
          batch_number: number
          days_since_reminder: number
          email: string
          post_count: number
          reminder_sent_at: string
          user_id: string
          username: string
        }[]
      }
      stale_reminder_excluded_count: { Args: never; Returns: number }
      stale_reminder_finalize: {
        Args: { p_note?: string; p_status: string; p_user_id: string }
        Returns: undefined
      }
      stale_reminder_pick_batch: {
        Args: { p_batch: number; p_limit?: number }
        Returns: {
          account_created_at: string
          days_stale: number
          email: string
          user_id: string
        }[]
      }
      stale_reminder_record_sent: {
        Args: {
          p_batch: number
          p_email: string
          p_message_id?: string
          p_user_id: string
        }
        Returns: undefined
      }
      sync_active_live_state: { Args: { p_user_id: string }; Returns: Json }
      sync_all_active_live_states: { Args: never; Returns: Json }
      tokens_registry_coverage_30d: {
        Args: never
        Returns: {
          by_reason: Json
          coverage_pct: number
          top_suspicious: Json
          total_scans: number
          total_suspicious: number
          total_verified: number
        }[]
      }
      treasury_record_outflow_atomic: {
        Args: {
          _amount: number
          _metadata?: Json
          _reason?: string
          _reference_id?: string
          _reference_table?: string
          _token_symbol: string
          _vault_key: string
        }
        Returns: Json
      }
      treasury_recycle_atomic: {
        Args: {
          _amount: number
          _reason?: string
          _reference_id?: string
          _reference_table?: string
          _source: string
          _token_symbol: string
        }
        Returns: Json
      }
      tt_ack_drift: { Args: { p_alert_id: string }; Returns: undefined }
      tt_approve_suspicious: {
        Args: {
          p_decimals: number
          p_event_id: string
          p_name: string
          p_symbol: string
        }
        Returns: string
      }
      tt_block_suspicious: { Args: { p_event_id: string }; Returns: string }
      tt_ignore_suspicious: { Args: { p_event_id: string }; Returns: undefined }
      unban_user: {
        Args: { p_admin_id: string; p_reason?: string; p_user_id: string }
        Returns: boolean
      }
      unlock_wallet_reward: { Args: { p_user_id: string }; Returns: boolean }
      unpin_message: { Args: { p_message_id: string }; Returns: undefined }
      upsert_live_recording_row: {
        Args: {
          _duration_seconds?: number
          _file_list_json?: Json
          _media_url?: string
          _raw_response?: Json
          _recorder_uid?: string
          _resource_id?: string
          _session_id: string
          _sid?: string
          _status?: string
          _stopped_at?: string
          _thumbnail_url?: string
        }
        Returns: {
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          file_list_json: Json
          id: string
          live_id: string
          media_url: string | null
          mode: string | null
          raw_response: Json | null
          recorder_uid: string | null
          resource_id: string | null
          sid: string | null
          status: string
          stopped_at: string | null
          storage_region: number | null
          storage_vendor: number | null
          thumbnail_url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "live_recordings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      vus_append_part: {
        Args: {
          _etag: string
          _part_number: number
          _session_id: string
          _size: number
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      attestation_type:
        | "peer_endorsement"
        | "mentor"
        | "recovery_guardian"
        | "witness"
      box_reward_type:
        | "ls"
        | "camly"
        | "pet_xp"
        | "pet_skin"
        | "cosmetic"
        | "sbt_trigger"
        | "box_upgrade"
      box_source:
        | "daily_login"
        | "quest_complete"
        | "streak_7d"
        | "streak_30d"
        | "gift_sent"
        | "invite_t1"
        | "premium_purchase"
        | "event"
      box_tier: "common" | "rare" | "epic" | "legendary" | "cosmic"
      chain_status: "active" | "maintenance" | "deprecated" | "disabled"
      did_entity_type:
        | "human"
        | "organization"
        | "ai_agent"
        | "validator"
        | "merchant"
      did_level: "L0" | "L1" | "L2" | "L3" | "L4"
      did_status:
        | "pending"
        | "basic"
        | "verified"
        | "trusted"
        | "restricted"
        | "suspended"
      dispute_status:
        | "pending"
        | "under_review"
        | "accepted"
        | "rejected"
        | "withdrawn"
      dispute_type:
        | "sbt_revoke"
        | "sbt_freeze"
        | "sybil_flag"
        | "trust_penalty"
        | "did_demotion"
      identity_link_type:
        | "wallet"
        | "social"
        | "device"
        | "organization"
        | "email"
        | "phone"
      link_verification_state: "unverified" | "verified" | "revoked"
      live_replay_status:
        | "uploading"
        | "queued"
        | "processing"
        | "ready"
        | "failed"
        | "skipped_legacy"
        | "awaiting_chunks"
        | "normalizing"
        | "expired"
      pet_event_type:
        | "quest_completed"
        | "daily_streak_extended"
        | "streak_break"
        | "donation_sent"
        | "reaction_added"
        | "inactive_24h"
        | "midnight_utc"
        | "level_up"
        | "evolution"
        | "login"
        | "box_reward_xp"
        | "box_opened"
      pet_mood: "happy" | "calm" | "sad" | "excited" | "sleepy" | "hungry"
      provider_health: "healthy" | "degraded" | "dead" | "unknown"
      provider_kind:
        | "rpc"
        | "indexer"
        | "explorer"
        | "webhook"
        | "utxo"
        | "price"
      provider_mode: "primary" | "secondary" | "backup" | "disabled"
      quest_frequency: "daily" | "weekly" | "once" | "per_event"
      sbt_category:
        | "identity"
        | "trust"
        | "contribution"
        | "credential"
        | "milestone"
        | "legacy"
      sbt_issuance_mode: "auto" | "semi_auto" | "governance"
      sbt_privacy: "public" | "permissioned" | "private"
      sbt_status: "active" | "frozen" | "revoked" | "archived"
      sybil_risk_level: "low" | "medium" | "high" | "critical"
      trust_tier: "T0" | "T1" | "T2" | "T3" | "T4"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      attestation_type: [
        "peer_endorsement",
        "mentor",
        "recovery_guardian",
        "witness",
      ],
      box_reward_type: [
        "ls",
        "camly",
        "pet_xp",
        "pet_skin",
        "cosmetic",
        "sbt_trigger",
        "box_upgrade",
      ],
      box_source: [
        "daily_login",
        "quest_complete",
        "streak_7d",
        "streak_30d",
        "gift_sent",
        "invite_t1",
        "premium_purchase",
        "event",
      ],
      box_tier: ["common", "rare", "epic", "legendary", "cosmic"],
      chain_status: ["active", "maintenance", "deprecated", "disabled"],
      did_entity_type: [
        "human",
        "organization",
        "ai_agent",
        "validator",
        "merchant",
      ],
      did_level: ["L0", "L1", "L2", "L3", "L4"],
      did_status: [
        "pending",
        "basic",
        "verified",
        "trusted",
        "restricted",
        "suspended",
      ],
      dispute_status: [
        "pending",
        "under_review",
        "accepted",
        "rejected",
        "withdrawn",
      ],
      dispute_type: [
        "sbt_revoke",
        "sbt_freeze",
        "sybil_flag",
        "trust_penalty",
        "did_demotion",
      ],
      identity_link_type: [
        "wallet",
        "social",
        "device",
        "organization",
        "email",
        "phone",
      ],
      link_verification_state: ["unverified", "verified", "revoked"],
      live_replay_status: [
        "uploading",
        "queued",
        "processing",
        "ready",
        "failed",
        "skipped_legacy",
        "awaiting_chunks",
        "normalizing",
        "expired",
      ],
      pet_event_type: [
        "quest_completed",
        "daily_streak_extended",
        "streak_break",
        "donation_sent",
        "reaction_added",
        "inactive_24h",
        "midnight_utc",
        "level_up",
        "evolution",
        "login",
        "box_reward_xp",
        "box_opened",
      ],
      pet_mood: ["happy", "calm", "sad", "excited", "sleepy", "hungry"],
      provider_health: ["healthy", "degraded", "dead", "unknown"],
      provider_kind: ["rpc", "indexer", "explorer", "webhook", "utxo", "price"],
      provider_mode: ["primary", "secondary", "backup", "disabled"],
      quest_frequency: ["daily", "weekly", "once", "per_event"],
      sbt_category: [
        "identity",
        "trust",
        "contribution",
        "credential",
        "milestone",
        "legacy",
      ],
      sbt_issuance_mode: ["auto", "semi_auto", "governance"],
      sbt_privacy: ["public", "permissioned", "private"],
      sbt_status: ["active", "frozen", "revoked", "archived"],
      sybil_risk_level: ["low", "medium", "high", "critical"],
      trust_tier: ["T0", "T1", "T2", "T3", "T4"],
    },
  },
} as const
