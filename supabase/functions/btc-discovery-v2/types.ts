// btc-discovery-v2 · types

export type DiscoveryMode = 'dry_run' | 'enqueue' | 'apply';

export interface DiscoveryCandidate {
  address: string;              // lowercase
  user_id: string;              // proposed owner
  source_tx: string;            // tx_hash where the change output was seen
  hint: 'hd_change' | 'return_to_sender' | 'manual';
}

export interface GuardSnapshot {
  tx_count: number;
  funded_btc: number;
  address_type: string | null;
  first_seen_tx: string | null;
  last_seen_tx: string | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export type Verdict = 'accepted' | 'review_queue' | 'rejected';

export interface CandidateResult {
  address: string;
  user_id: string;
  verdict: Verdict;
  reason: string;
  guard_snapshot: GuardSnapshot | null;
  class_a_blacklist_hit: boolean;
  class_b_suspect_hit: boolean;
  is_father: boolean;
  is_treasury: boolean;
  review_id?: string;
  snapshot_id?: string;
}

export const REVIEW_QUEUE_UUID_NAMESPACE = '6ba7b8f0-9dad-11d1-80b4-00c04fd430c8';
