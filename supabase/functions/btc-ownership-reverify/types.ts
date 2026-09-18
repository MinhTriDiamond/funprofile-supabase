// G5A · btc-ownership-reverify · types

export type ReverifyMode = 'dry_run' | 'apply';

export type CandidateSource = 'profile_primary' | 'aux_legacy';

export interface Candidate {
  address: string;
  user_id: string;
  candidate_source: CandidateSource;
  legacy_row_id?: string | null; // profile_btc_aux_addresses.id
  first_seen_tx?: string | null;
}

export interface GuardSnapshot {
  tx_count: number;
  funded_btc: number;
  address_type: string;
  fetched_at: string;
}

export type Verdict = 'accepted' | 'review_queue' | 'rejected' | 'skipped_already_owned';

export interface CandidateResult {
  address: string;
  user_id: string;
  candidate_source: CandidateSource;
  verdict: Verdict;
  reason: string;
  guard_snapshot: GuardSnapshot | null;
  confidence: number | null;
  review_id?: string;
  conflict_user?: string;
}

export interface ReverifyBody {
  mode?: ReverifyMode;
  batch_size?: number;
  offset?: number;
  user_ids?: string[];
  include_primary?: boolean;
  include_aux?: boolean;
  address?: string; // one-off recheck
}

// UUID v5 namespace for deterministic review IDs (isolated from discovery)
export const REVIEW_QUEUE_UUID_NAMESPACE = '4f5c2b30-9a1e-5e77-9c12-6e04b7de3a91';
