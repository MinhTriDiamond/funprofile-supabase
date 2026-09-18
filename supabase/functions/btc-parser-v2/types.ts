// btc-parser-v2 · shared types
// Nguyên tắc: KHÔNG suy diễn human intent. Parser chỉ phân loại money flow.

export interface RawTxVin {
  txid: string;
  vout: number;
  prevout?: {
    scriptpubkey_address?: string;
    value: number;
  };
}

export interface RawTxVout {
  scriptpubkey_address?: string;
  value: number;
}

export interface RawTx {
  txid: string;
  version: number;
  locktime: number;
  vin: RawTxVin[];
  vout: RawTxVout[];
  size?: number;
  fee?: number;
  status?: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
    block_hash?: string;
  };
}

export type OwnershipSource = 'custodial' | 'profile_primary' | 'snapshot' | 'unknown';
export type OwnershipIntegrity = 'ok' | 'needs_review' | 'revoked' | 'unknown';

export interface OwnershipEntry {
  user_id: string | null;
  source: OwnershipSource;
  confidence: number; // 0..1
  integrity: OwnershipIntegrity;
  is_father?: boolean;
  is_treasury?: boolean;
}

/** address (lowercase) → OwnershipEntry. Immutable map passed to classifier. */
export type OwnershipMap = ReadonlyMap<string, OwnershipEntry>;

export type FlowCategory =
  | 'donation'
  | 'transfer'
  | 'change'
  | 'treasury'
  | 'coinjoin_holdout'
  | 'unknown';

export type FlowSubtype =
  | 'internal'
  | 'external_in'
  | 'external_out'
  | 'self'
  | 'multi_owner'
  | 'return_to_sender'
  | 'unknown';

export interface Classification {
  category: FlowCategory;
  subtype: FlowSubtype;
  /** persisted string "category:subtype" for backward-compat with btc_tx_semantic.flow_type */
  flow_type: string;
}

export interface FlowRow {
  chain_family: 'bitcoin';
  tx_hash: string;
  vout_index: number;
  block_height: number | null;
  block_time: string | null; // ISO
  classification: Classification;
  sender_user: string | null;
  recipient_user: string | null;
  sender_address: string | null;
  recipient_address: string;
  amount_sat: number;
  is_self_transfer: boolean;
  is_change: boolean;
  is_treasury: boolean;
  is_coinjoin: boolean;
  tags: string[];
}

export interface ReviewItem {
  id: string;            // deterministic uuid v5
  tx_hash: string;
  vout_index: number | null;
  reason:
    | 'coinjoin_multi_owner'
    | 'father_aux_manual'
    | 'hd_change_needs_verify'
    | 'ambiguous_ownership'
    | 'class_b_suspect'
    | 'treasury_flow_unclassified';
  severity: 'critical' | 'high' | 'medium' | 'low';
  evidence: Record<string, unknown>;
  suggested_verdict?: Record<string, unknown>;
}

export interface ParserMetrics {
  total_inputs: number;
  total_outputs: number;
  resolved_inputs: number;
  resolved_outputs: number;
  unknown_addresses: number;
  change_outputs: number;
  donation_outputs: number;
  transfer_outputs: number;
  review_outputs: number;
  coinjoin: boolean;
}

export interface SemanticResult {
  tx_hash: string;
  flows: FlowRow[];
  reviewItems: ReviewItem[];
  warnings: string[];
  metrics: ParserMetrics;
  stats: {
    input_owners_distinct: number;
    input_addresses_distinct: number;
    output_addresses_distinct: number;
  };
}

export interface FlagStatus {
  scan_btc_v2_enabled: boolean;
  btc_shadow_write_enabled: boolean;
  btc_discovery_v2_enabled: boolean;
  btc_history_ssot_enabled: boolean;
}

export type RequestMode = 'dry_run' | 'shadow_write';

export interface TxResult {
  tx_hash: string;
  cache_hit: boolean;
  cache_integrity_ok: boolean;
  fetched_from_mempool: boolean;
  block_height: number | null;
  block_time: string | null;
  vouts: Array<{
    vout_index: number;
    flow_type: string;
    category: FlowCategory;
    subtype: FlowSubtype;
    sender_user: string | null;
    recipient_user: string | null;
    amount_sat: number;
    tags: string[];
  }>;
  metrics: ParserMetrics;
  review_items: number;
  persisted: boolean;
  error?: string;
}

// Fixed namespace UUID for deterministic v5 review IDs (do not change).
export const REVIEW_QUEUE_UUID_NAMESPACE = '6ba7b8f0-9dad-11d1-80b4-00c04fd430c8';

export const CLASSIFIER_VERSION = 'v2.0.0-g4';
