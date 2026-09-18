import { btcNormalizeAddress, detectBtcAddressType } from './btcAddress.ts';
/**
 * BTC Provider Manager — network abstraction for G5–G7
 *
 * Contract:
 *   1) Cache-first (in-memory per-run; optional persistent tx cache via btc_raw_tx_cache)
 *   2) Provider chain: mempool.space → blockstream.info → (reserved)
 *   3) Per-provider retry with exponential backoff
 *   4) Metrics tracked per manager instance
 *
 * Metrics dumped to `NETWORK_PROVIDER_REPORT.md` friendly JSON via `snapshot()`.
 */

export type ProviderName = 'mempool' | 'blockstream' | 'reserved';

export interface AddressStats {
  tx_count: number;
  funded_btc: number;
  address_type: string;
  fetched_at: string;
  provider: ProviderName | 'cache';
}

export interface ProviderMetrics {
  cache_hit: number;
  by_provider: Record<ProviderName, {
    attempts: number;
    success: number;
    retry: number;
    timeout: number;
    http_429: number;
    other_error: number;
    total_ms: number;
  }>;
  provider_switch: number;
  total_requests: number;
  total_fetch_ms: number;
  failures_final: number; // exhausted all providers
}

interface ProviderDef {
  name: ProviderName;
  addressUrl: (a: string) => string;
  parseAddress: (j: unknown) => { tx_count: number; funded_sat: number };
  enabled: boolean;
}

const DEFAULT_PROVIDERS: ProviderDef[] = [
  {
    name: 'mempool',
    addressUrl: (a) => `https://mempool.space/api/address/${a}`,
    parseAddress: (j) => {
      const x = j as { chain_stats?: { tx_count?: number; funded_txo_sum?: number }; mempool_stats?: { tx_count?: number; funded_txo_sum?: number } };
      return {
        tx_count: (x.chain_stats?.tx_count ?? 0) + (x.mempool_stats?.tx_count ?? 0),
        funded_sat: (x.chain_stats?.funded_txo_sum ?? 0) + (x.mempool_stats?.funded_txo_sum ?? 0),
      };
    },
    enabled: true,
  },
  {
    name: 'blockstream',
    addressUrl: (a) => `https://blockstream.info/api/address/${a}`,
    parseAddress: (j) => {
      const x = j as { chain_stats?: { tx_count?: number; funded_txo_sum?: number }; mempool_stats?: { tx_count?: number; funded_txo_sum?: number } };
      return {
        tx_count: (x.chain_stats?.tx_count ?? 0) + (x.mempool_stats?.tx_count ?? 0),
        funded_sat: (x.chain_stats?.funded_txo_sum ?? 0) + (x.mempool_stats?.funded_txo_sum ?? 0),
      };
    },
    enabled: true,
  },
  {
    name: 'reserved',
    addressUrl: () => '',
    parseAddress: () => ({ tx_count: 0, funded_sat: 0 }),
    enabled: false,
  },
];

function detectAddrType(a: string): string {
  return detectBtcAddressType(a);
}

const emptyProviderStats = () => ({
  attempts: 0, success: 0, retry: 0, timeout: 0, http_429: 0, other_error: 0, total_ms: 0,
});

export interface ProviderManagerOptions {
  retriesPerProvider?: number;    // default 3
  backoffMs?: number[];           // default [500, 1500, 3000]
  timeoutMs?: number;             // default 5000
  cacheTtlMs?: number;            // default 5 min for address stats
  providers?: ProviderDef[];
}

export class BtcProviderManager {
  private providers: ProviderDef[];
  private retries: number;
  private backoff: number[];
  private timeoutMs: number;
  private cacheTtlMs: number;
  private addrCache = new Map<string, { value: AddressStats; expiresAt: number }>();
  private metrics: ProviderMetrics;

  constructor(opts: ProviderManagerOptions = {}) {
    this.providers = (opts.providers ?? DEFAULT_PROVIDERS).filter((p) => p.enabled);
    this.retries = opts.retriesPerProvider ?? 3;
    this.backoff = opts.backoffMs ?? [500, 1500, 3000];
    this.timeoutMs = opts.timeoutMs ?? 5000;
    this.cacheTtlMs = opts.cacheTtlMs ?? 5 * 60_000;
    this.metrics = {
      cache_hit: 0,
      by_provider: {
        mempool: emptyProviderStats(),
        blockstream: emptyProviderStats(),
        reserved: emptyProviderStats(),
      },
      provider_switch: 0,
      total_requests: 0,
      total_fetch_ms: 0,
      failures_final: 0,
    };
  }

  snapshot(): ProviderMetrics {
    return JSON.parse(JSON.stringify(this.metrics));
  }

  private async fetchOnce(url: string): Promise<{ ok: boolean; status: number; body?: unknown; timedOut?: boolean; err?: string }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const r = await fetch(url, { headers: { accept: 'application/json' }, signal: ctrl.signal });
      if (!r.ok) return { ok: false, status: r.status, err: `http_${r.status}` };
      const body = await r.json();
      return { ok: true, status: 200, body };
    } catch (e) {
      const err = e as Error;
      const timedOut = err.name === 'AbortError';
      return { ok: false, status: 0, timedOut, err: err.message };
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Fetch address stats with cache-first + provider chain + per-provider retry.
   */
  async getAddressStats(address: string, opts: { skipCache?: boolean } = {}): Promise<AddressStats> {
    const t0 = performance.now();
    this.metrics.total_requests += 1;
    const key = btcNormalizeAddress(address);
    if (!opts.skipCache) {
      const c = this.addrCache.get(key);
      if (c && c.expiresAt > Date.now()) {
        this.metrics.cache_hit += 1;
        return { ...c.value, provider: 'cache' };
      }
    }

    let lastErr = 'no_provider';
    let providerIdx = 0;
    for (const p of this.providers) {
      if (providerIdx > 0) this.metrics.provider_switch += 1;
      providerIdx += 1;
      const stats = this.metrics.by_provider[p.name];
      for (let attempt = 0; attempt < this.retries; attempt++) {
        stats.attempts += 1;
        if (attempt > 0) stats.retry += 1;
        const attemptT = performance.now();
        const res = await this.fetchOnce(p.addressUrl(address));
        stats.total_ms += performance.now() - attemptT;
        if (res.ok) {
          stats.success += 1;
          const parsed = p.parseAddress(res.body);
          const value: AddressStats = {
            tx_count: parsed.tx_count,
            funded_btc: parsed.funded_sat / 1e8,
            address_type: detectAddrType(address),
            fetched_at: new Date().toISOString(),
            provider: p.name,
          };
          this.addrCache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
          this.metrics.total_fetch_ms += performance.now() - t0;
          return value;
        }
        if (res.timedOut) stats.timeout += 1;
        else if (res.status === 429) stats.http_429 += 1;
        else stats.other_error += 1;
        lastErr = res.err ?? 'unknown';
        // backoff before next retry (not after last)
        if (attempt < this.retries - 1) {
          const wait = this.backoff[Math.min(attempt, this.backoff.length - 1)];
          await new Promise((r) => setTimeout(r, wait));
        }
      }
      // provider exhausted → try next
    }
    this.metrics.failures_final += 1;
    this.metrics.total_fetch_ms += performance.now() - t0;
    throw new Error(`all_providers_failed:${lastErr}`);
  }
}
