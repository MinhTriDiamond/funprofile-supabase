// btc-parser-v2 · persister
// Flag-gated. Wraps writes in one transaction via RPC btc_persist_semantic_batch.
// OFF luôn thắng ON.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { SemanticResult, FlagStatus, RequestMode } from './types.ts';
import type { CacheRowInsert } from './fetcher.ts';
import { CLASSIFIER_VERSION } from './types.ts';

export interface PersistDecision {
  mode_effective: RequestMode;
  will_persist: boolean;
  will_cache: boolean;
  will_enqueue_review: boolean;
  warning?: string;
}

export function decidePersist(
  requestedMode: RequestMode,
  flags: FlagStatus,
): PersistDecision {
  if (requestedMode === 'dry_run') {
    return {
      mode_effective: 'dry_run',
      will_persist: false,
      will_cache: false,
      will_enqueue_review: false,
    };
  }
  // shadow_write requested
  if (!flags.scan_btc_v2_enabled) {
    return {
      mode_effective: 'dry_run',
      will_persist: false,
      will_cache: false,
      will_enqueue_review: false,
      warning: 'scan_btc_v2_enabled OFF — downgraded to dry_run',
    };
  }
  if (!flags.btc_shadow_write_enabled) {
    return {
      mode_effective: 'dry_run',
      will_persist: false,
      will_cache: false,
      will_enqueue_review: false,
      warning: 'btc_shadow_write_enabled OFF — downgraded to dry_run',
    };
  }
  return {
    mode_effective: 'shadow_write',
    will_persist: true,
    will_cache: true,
    will_enqueue_review: true,
  };
}

export async function persistBatch(
  admin: SupabaseClient,
  results: SemanticResult[],
  cacheRows: CacheRowInsert[],
  decision: PersistDecision,
): Promise<{ cache_inserted: number; semantic_inserted: number; semantic_updated: number; review_inserted: number } | null> {
  if (decision.mode_effective !== 'shadow_write') return null;

  const semanticRows = results.flatMap((r) =>
    r.flows
      .filter((f) => f.classification.category !== 'unknown' || f.tags.includes('treasury_flow'))
      .map((f) => ({
        chain_family: f.chain_family,
        tx_hash: f.tx_hash,
        vout_index: f.vout_index,
        block_height: f.block_height,
        block_time: f.block_time,
        flow_type: f.classification.flow_type,
        sender_user: f.sender_user,
        recipient_user: f.recipient_user,
        sender_address: f.sender_address,
        recipient_address: f.recipient_address,
        amount_sat: f.amount_sat,
        is_self_transfer: f.is_self_transfer,
        is_change: f.is_change,
        is_treasury: f.is_treasury,
        is_coinjoin: f.is_coinjoin,
        tags: f.tags,
        classifier_version: CLASSIFIER_VERSION,
      })),
  );

  const reviewRows = results.flatMap((r) =>
    r.reviewItems.map((it) => ({
      id: it.id,
      tx_hash: it.tx_hash,
      vout_index: it.vout_index,
      reason: it.reason,
      severity: it.severity,
      evidence: it.evidence,
      suggested_verdict: it.suggested_verdict ?? null,
      status: 'pending',
    })),
  );

  const { data, error } = await admin.rpc('btc_persist_semantic_batch', {
    p_cache_rows: cacheRows,
    p_semantic_rows: semanticRows,
    p_review_rows: reviewRows,
  });
  if (error) throw new Error(`persist rpc: ${error.message}`);
  return data as {
    cache_inserted: number;
    semantic_inserted: number;
    semantic_updated: number;
    review_inserted: number;
  };
}
