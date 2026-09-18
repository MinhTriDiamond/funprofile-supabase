/**
 * btc-parser-v2 · HTTP entrypoint (G4 dark-launch)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NGUYÊN TẮC KIẾN TRÚC TỐI CAO:
 *   Parser v2 TUYỆT ĐỐI KHÔNG suy diễn human intent.
 *   Chỉ phân loại money flow từ on-chain + ownership đã xác minh.
 *   Mọi diễn giải nghiệp vụ (donation intent, treasury payout, reward, bridge,
 *   lightning, ordinal…) thuộc semantic layer / review policy ở G5+.
 *
 * FLAG PRECEDENCE: OFF luôn thắng ON.
 *   Bất kỳ flag phụ thuộc OFF → downgrade toàn bộ về dry_run,
 *   không persist, không queue, không cache, không side effect.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Manual invoke only (admin-gated). No cron. No writes to donations/wallet_transfers.
 */

import { corsHeaders, json, createAdminClient, requireUser } from '../_shared/httpAuth.ts';
import { classify } from './classifier.ts';
import { loadOwnershipMap, extractAddresses } from './resolver.ts';
import { fetchTransactions } from './fetcher.ts';
import { decidePersist, persistBatch } from './persister.ts';
import { dispatchBtcResolverShadowLog } from '../_shared/btcResolverShadowLog.ts';
import type { FlagStatus, RequestMode, TxResult, SemanticResult } from './types.ts';

async function readFlags(admin: ReturnType<typeof createAdminClient>): Promise<FlagStatus> {
  const { data } = await admin
    .from('system_config')
    .select('key, value')
    .in('key', [
      'scan_btc_v2_enabled',
      'btc_shadow_write_enabled',
      'btc_discovery_v2_enabled',
      'btc_history_ssot_enabled',
    ]);
  const map = new Map<string, unknown>((data ?? []).map((r) => [r.key, r.value]));
  const asBool = (v: unknown): boolean => {
    if (v === true || v === 'true' || v === 't' || v === 1) return true;
    if (v && typeof v === 'object' && 'enabled' in (v as Record<string, unknown>)) {
      return asBool((v as Record<string, unknown>).enabled);
    }
    return false;
  };
  return {
    scan_btc_v2_enabled: asBool(map.get('scan_btc_v2_enabled')),
    btc_shadow_write_enabled: asBool(map.get('btc_shadow_write_enabled')),
    btc_discovery_v2_enabled: asBool(map.get('btc_discovery_v2_enabled')),
    btc_history_ssot_enabled: asBool(map.get('btc_history_ssot_enabled')),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const t0 = performance.now();
  const timings = { fetch: 0, resolve: 0, classify: 0, persist: 0, total: 0 };

  try {
    const user = await requireUser(req);
    const admin = createAdminClient();

    // Admin gate
    const { data: role } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!role) return json({ ok: false, error: 'admin only' }, 403);

    const body = await req.json().catch(() => ({}));
    const tx_hashes: string[] = Array.isArray(body?.tx_hashes) ? body.tx_hashes.slice(0, 50) : [];
    const requestedMode: RequestMode = body?.mode === 'shadow_write' ? 'shadow_write' : 'dry_run';
    const forceRefetch = !!body?.force_refetch;

    if (tx_hashes.length === 0) return json({ ok: false, error: 'tx_hashes required (1..50)' }, 400);
    for (const h of tx_hashes) {
      if (!/^[0-9a-f]{64}$/i.test(h)) return json({ ok: false, error: `invalid tx_hash: ${h}` }, 400);
    }

    const flags = await readFlags(admin);
    const decision = decidePersist(requestedMode, flags);

    // ── DRY-RUN: fetch WITHOUT caching. Even mempool responses stay in-memory only. ──
    const tFetch = performance.now();
    let rawResults: Awaited<ReturnType<typeof fetchTransactions>>;
    if (decision.mode_effective === 'dry_run') {
      // Use a client wrapper that never writes to cache: pass forceRefetch=true so no cache read either.
      // We DO want cache READS for dry-run to reduce mempool load, so we keep read but drop the pending writes below.
      rawResults = await fetchTransactions(admin, tx_hashes.map((h) => h.toLowerCase()), { forceRefetch });
      rawResults.pendingCacheRows = []; // ⛔ dry_run: never cache
    } else {
      rawResults = await fetchTransactions(admin, tx_hashes.map((h) => h.toLowerCase()), { forceRefetch });
    }
    timings.fetch = performance.now() - tFetch;

    // ── RESOLVER ──
    const tResolve = performance.now();
    const allAddresses = rawResults.results.flatMap((r) => extractAddresses(r.raw));
    const ownership = await loadOwnershipMap(admin, allAddresses);
    timings.resolve = performance.now() - tResolve;

    // Shadow-log (Phase 2, chỉ quan sát): so sánh ownership map của v2 resolver
    // (profile_primary/snapshot) với resolve_btc_owner() mới, theo từng địa chỉ/tx.
    for (const r of rawResults.results) {
      const blockTimeIso = r.raw.status?.block_time
        ? new Date(r.raw.status.block_time * 1000).toISOString()
        : undefined;
      for (const addr of extractAddresses(r.raw)) {
        const entry = ownership.get(addr);
        dispatchBtcResolverShadowLog(admin, {
          address: addr,
          rawAddressLegacySide: addr,
          callSite: 'btc-parser-v2:resolver',
          legacyUserId: entry?.user_id ?? null,
          legacySource: entry?.source ?? 'unresolved',
          idempotencyKey: `btc-parser-v2:resolver:${r.raw.txid}:${addr}`,
          createdBy: 'btc-parser-v2',
          eventAt: blockTimeIso,
          txHash: r.raw.txid,
        });
      }
    }

    // ── CLASSIFY (pure) ──
    const tClassify = performance.now();
    const semantic: SemanticResult[] = rawResults.results.map((r) => classify(r.raw, ownership));
    timings.classify = performance.now() - tClassify;

    // ── PERSIST (flag-gated, transaction-boundary) ──
    const tPersist = performance.now();
    const persistResult = await persistBatch(admin, semantic, rawResults.pendingCacheRows, decision);
    timings.persist = performance.now() - tPersist;

    timings.total = performance.now() - t0;

    // Aggregate metrics
    const metricsAgg = semantic.reduce(
      (acc, s) => {
        acc.total_inputs += s.metrics.total_inputs;
        acc.total_outputs += s.metrics.total_outputs;
        acc.resolved_inputs += s.metrics.resolved_inputs;
        acc.resolved_outputs += s.metrics.resolved_outputs;
        acc.unknown_addresses += s.metrics.unknown_addresses;
        acc.change_outputs += s.metrics.change_outputs;
        acc.donation_outputs += s.metrics.donation_outputs;
        acc.transfer_outputs += s.metrics.transfer_outputs;
        acc.review_outputs += s.metrics.review_outputs;
        acc.coinjoins += s.metrics.coinjoin ? 1 : 0;
        return acc;
      },
      { total_inputs: 0, total_outputs: 0, resolved_inputs: 0, resolved_outputs: 0, unknown_addresses: 0, change_outputs: 0, donation_outputs: 0, transfer_outputs: 0, review_outputs: 0, coinjoins: 0 },
    );

    // Per-tx result payload
    const results: TxResult[] = semantic.map((s, i) => {
      const raw = rawResults.results[i];
      return {
        tx_hash: s.tx_hash,
        cache_hit: raw.cache_hit,
        cache_integrity_ok: raw.cache_integrity_ok,
        fetched_from_mempool: raw.fetched_from_mempool,
        block_height: raw.raw.status?.block_height ?? null,
        block_time: raw.raw.status?.block_time
          ? new Date(raw.raw.status.block_time * 1000).toISOString()
          : null,
        vouts: s.flows.map((f) => ({
          vout_index: f.vout_index,
          flow_type: f.classification.flow_type,
          category: f.classification.category,
          subtype: f.classification.subtype,
          sender_user: f.sender_user,
          recipient_user: f.recipient_user,
          amount_sat: f.amount_sat,
          tags: f.tags,
        })),
        metrics: s.metrics,
        review_items: s.reviewItems.length,
        persisted: decision.mode_effective === 'shadow_write',
      };
    });

    // Audit log
    try {
      await admin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'btc_parser_v2_invoke',
        target_type: 'btc_transactions',
        target_id: null,
        metadata: {
          mode_requested: requestedMode,
          mode_effective: decision.mode_effective,
          warning: decision.warning,
          tx_count: tx_hashes.length,
          cache_hits: rawResults.results.filter((r) => r.cache_hit).length,
          cache_misses: rawResults.results.filter((r) => !r.cache_hit).length,
          fetch_errors: rawResults.errors,
          shadow_writes: persistResult,
          timings_ms: timings,
          metrics_agg: metricsAgg,
          flags,
        },
      });
    } catch (e) {
      console.warn('audit log insert failed:', e instanceof Error ? e.message : e);
    }

    return json({
      ok: true,
      flag_status: flags,
      mode_requested: requestedMode,
      mode_effective: decision.mode_effective,
      warning: decision.warning,
      timings_ms: timings,
      metrics_agg: metricsAgg,
      results,
      fetch_errors: rawResults.errors,
      shadow_write_stats: persistResult,
    });
  } catch (e) {
    console.error('btc-parser-v2 error:', e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
