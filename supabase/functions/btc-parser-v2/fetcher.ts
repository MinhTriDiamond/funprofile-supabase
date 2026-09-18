// btc-parser-v2 · fetcher
// mempool.space fetch + cache integrity (raw_sha256). Concurrency ≤ 3, retry backoff.
// Dry-run: NEVER writes cache (caller enforces).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { RawTx } from './types.ts';

const MEMPOOL_BASE = 'https://mempool.space/api/tx';
const CONCURRENCY = 3;
const RETRIES = [2000, 5000, 10000];

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(obj: unknown): string {
  // Stable ordering: sort keys deeply.
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((obj as Record<string, unknown>)[k])}`).join(',')}}`;
}

export interface FetchResult {
  tx_hash: string;
  raw: RawTx;
  sha256: string;
  cache_hit: boolean;
  cache_integrity_ok: boolean;
  fetched_from_mempool: boolean;
}

export interface CacheRowInsert {
  tx_hash: string;
  raw_json: RawTx;
  raw_sha256: string;
  block_height: number | null;
  block_time: string | null;
  size_bytes: number | null;
  source: string;
  fetched_at: string;
}

async function fetchOneMempool(tx: string): Promise<RawTx> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < RETRIES.length + 1; attempt++) {
    try {
      const res = await fetch(`${MEMPOOL_BASE}/${tx}`, {
        headers: { 'User-Agent': 'fun-profile-btc-parser-v2/g4' },
      });
      if (res.status === 200) {
        const json = await res.json();
        return json as RawTx;
      }
      if (res.status === 404) {
        await res.text();
        throw new Error(`mempool 404: ${tx}`);
      }
      if (res.status === 429 || res.status >= 500) {
        await res.text();
        lastErr = new Error(`mempool ${res.status}`);
      } else {
        await res.text();
        throw new Error(`mempool ${res.status}`);
      }
    } catch (e) {
      lastErr = e;
    }
    if (attempt < RETRIES.length) {
      await new Promise((r) => setTimeout(r, RETRIES[attempt]));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`mempool fetch failed: ${tx}`);
}

async function readCache(
  admin: SupabaseClient,
  tx: string,
): Promise<{ raw: RawTx; sha256: string | null } | null> {
  const { data, error } = await admin
    .from('btc_raw_tx_cache')
    .select('raw_json, raw_sha256')
    .eq('tx_hash', tx)
    .maybeSingle();
  if (error || !data) return null;
  return { raw: data.raw_json as RawTx, sha256: data.raw_sha256 as string | null };
}

/**
 * Fetch a batch of tx. If forceRefetch=true, bypass cache read.
 * Returns array with per-tx result + pending cache row inserts (caller decides whether to persist).
 */
export async function fetchTransactions(
  admin: SupabaseClient,
  tx_hashes: string[],
  opts: { forceRefetch?: boolean } = {},
): Promise<{ results: FetchResult[]; pendingCacheRows: CacheRowInsert[]; errors: Array<{ tx: string; error: string }> }> {
  const results: FetchResult[] = [];
  const pending: CacheRowInsert[] = [];
  const errors: Array<{ tx: string; error: string }> = [];

  // Simple concurrency pool
  const queue = [...new Set(tx_hashes)];
  const inflight: Promise<void>[] = [];

  async function processOne(tx: string) {
    try {
      let raw: RawTx | null = null;
      let sha: string | null = null;
      let cache_hit = false;
      let cache_integrity_ok = true;
      let fetched_from_mempool = false;

      if (!opts.forceRefetch) {
        const cached = await readCache(admin, tx);
        if (cached) {
          const recomputed = await sha256Hex(new TextEncoder().encode(canonicalJson(cached.raw)));
          if (cached.sha256 && cached.sha256 !== recomputed) {
            cache_integrity_ok = false;
            // Treat as miss — refetch from mempool.
          } else {
            raw = cached.raw;
            sha = cached.sha256 ?? recomputed;
            cache_hit = true;
          }
        }
      }

      if (!raw) {
        raw = await fetchOneMempool(tx);
        fetched_from_mempool = true;
        const canonical = canonicalJson(raw);
        sha = await sha256Hex(new TextEncoder().encode(canonical));
        pending.push({
          tx_hash: tx,
          raw_json: raw,
          raw_sha256: sha,
          block_height: raw.status?.block_height ?? null,
          block_time: raw.status?.block_time
            ? new Date(raw.status.block_time * 1000).toISOString()
            : null,
          size_bytes: raw.size ?? null,
          source: 'mempool.space',
          fetched_at: new Date().toISOString(),
        });
      }

      results.push({
        tx_hash: tx,
        raw,
        sha256: sha!,
        cache_hit,
        cache_integrity_ok,
        fetched_from_mempool,
      });
    } catch (e) {
      errors.push({ tx, error: e instanceof Error ? e.message : String(e) });
    }
  }

  while (queue.length || inflight.length) {
    while (queue.length && inflight.length < CONCURRENCY) {
      const tx = queue.shift()!;
      const p = processOne(tx).finally(() => {
        const i = inflight.indexOf(p);
        if (i >= 0) inflight.splice(i, 1);
      });
      inflight.push(p);
    }
    if (inflight.length) await Promise.race(inflight);
  }

  return { results, pendingCacheRows: pending, errors };
}
