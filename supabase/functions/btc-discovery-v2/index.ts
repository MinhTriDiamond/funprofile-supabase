/**
 * btc-discovery-v2 · HTTP entrypoint (G4 dark-launch)
 *
 * Learn BTC ownership ONLY from verified change-output candidates.
 * ❌ Never learn from input side (RC-10 root cause).
 * ❌ Never auto-apply Father / treasury aux.
 * ❌ Never auto-apply if flag OFF or guard fails.
 */

import { corsHeaders, json, createAdminClient, requireUser } from '../_shared/httpAuth.ts';
import { uuidv5 } from './uuidv5.ts';
import { REVIEW_QUEUE_UUID_NAMESPACE } from './types.ts';
import type { DiscoveryCandidate, DiscoveryMode, CandidateResult } from './types.ts';
import { MAX_TX_COUNT, MAX_FUNDED_BTC, fetchGuardSnapshot, loadBlacklists, isFatherOrTreasury, isAddressClaimed } from './guards.ts';
import { dispatchBtcResolverShadowLog } from '../_shared/btcResolverShadowLog.ts';
import { btcNormalizeAddress } from '../_shared/btcAddress.ts';

async function readDiscoveryFlag(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { data } = await admin
    .from('system_config')
    .select('value')
    .eq('key', 'btc_discovery_v2_enabled')
    .maybeSingle();
  return data?.value === true || data?.value === 'true';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const t0 = performance.now();
  try {
    const user = await requireUser(req);
    const admin = createAdminClient();

    const { data: role } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    if (!role) return json({ ok: false, error: 'admin only' }, 403);

    const body = await req.json().catch(() => ({}));
    const candidates: DiscoveryCandidate[] = Array.isArray(body?.candidates) ? body.candidates : [];
    const requestedMode: DiscoveryMode = ['dry_run', 'enqueue', 'apply'].includes(body?.mode) ? body.mode : 'dry_run';
    if (candidates.length === 0) return json({ ok: false, error: 'candidates required' }, 400);
    if (candidates.length > 100) return json({ ok: false, error: 'max 100 candidates' }, 400);

    const flagOn = await readDiscoveryFlag(admin);
    const modeEffective: DiscoveryMode = flagOn ? requestedMode : 'dry_run';
    const warning = !flagOn && requestedMode !== 'dry_run'
      ? 'btc_discovery_v2_enabled OFF — downgraded to dry_run'
      : undefined;

    const { classA, classB } = await loadBlacklists(admin);
    const results: CandidateResult[] = [];
    const reviewRowsToInsert: Array<Record<string, unknown>> = [];
    const snapshotRowsToInsert: Array<Record<string, unknown>> = [];

    for (const c of candidates) {
      const addr = btcNormalizeAddress(c.address);
      if (!addr || !c.user_id) {
        results.push({ address: c.address, user_id: c.user_id, verdict: 'rejected', reason: 'invalid input', guard_snapshot: null, class_a_blacklist_hit: false, class_b_suspect_hit: false, is_father: false, is_treasury: false });
        continue;
      }
      if (c.hint === 'hd_change' || c.hint === 'return_to_sender' || c.hint === 'manual') {
        // ok
      } else {
        results.push({ address: addr, user_id: c.user_id, verdict: 'rejected', reason: 'hint must be change-output based', guard_snapshot: null, class_a_blacklist_hit: false, class_b_suspect_hit: false, is_father: false, is_treasury: false });
        continue;
      }

      // Class A blacklist → hard reject
      if (classA.has(addr)) {
        results.push({ address: addr, user_id: c.user_id, verdict: 'rejected', reason: 'class_a_blacklist', guard_snapshot: null, class_a_blacklist_hit: true, class_b_suspect_hit: false, is_father: false, is_treasury: false });
        continue;
      }

      // Address already claimed by another user → conflict
      const claimedBy = await isAddressClaimed(admin, addr);
      if (claimedBy && claimedBy !== c.user_id) {
        results.push({ address: addr, user_id: c.user_id, verdict: 'rejected', reason: `already_owned_by:${claimedBy}`, guard_snapshot: null, class_a_blacklist_hit: false, class_b_suspect_hit: false, is_father: false, is_treasury: false });
        continue;
      }

      // Father/treasury → review only, never auto-apply
      const { is_father, is_treasury } = await isFatherOrTreasury(admin, c.user_id);

      // Fetch on-chain snapshot
      let snap;
      try {
        snap = await fetchGuardSnapshot(addr, c.source_tx);
      } catch (e) {
        results.push({ address: addr, user_id: c.user_id, verdict: 'rejected', reason: `mempool_error:${e instanceof Error ? e.message : e}`, guard_snapshot: null, class_a_blacklist_hit: false, class_b_suspect_hit: classB.has(addr), is_father, is_treasury });
        continue;
      }

      const classBHit = classB.has(addr);
      const evidence = {
        guard_snapshot: snap,
        source_tx: c.source_tx,
        candidate_user: c.user_id,
        resolver_hint: c.hint,
        class_a_blacklist_hit: false,
        class_b_suspect_hit: classBHit,
        is_father,
        is_treasury,
      };

      const enqueueReview = (reason: string, severity: 'critical' | 'high' | 'medium' | 'low' = 'medium'): CandidateResult => {
        const rid = uuidv5(`${c.source_tx}:${addr}:${reason}`, REVIEW_QUEUE_UUID_NAMESPACE);
        reviewRowsToInsert.push({
          id: rid,
          tx_hash: c.source_tx,
          vout_index: null,
          reason,
          severity,
          evidence,
          suggested_verdict: null,
          status: 'pending',
        });
        return { address: addr, user_id: c.user_id, verdict: 'review_queue', reason, guard_snapshot: snap, class_a_blacklist_hit: false, class_b_suspect_hit: classBHit, is_father, is_treasury, review_id: rid };
      };

      // Guard cascade
      if (is_father || is_treasury) {
        results.push(enqueueReview('father_aux_manual', 'high'));
        continue;
      }
      if (classBHit) {
        results.push(enqueueReview('class_b_suspect', 'high'));
        continue;
      }
      if (snap.tx_count > MAX_TX_COUNT) {
        results.push(enqueueReview('hd_change_needs_verify', 'medium'));
        continue;
      }
      if (snap.funded_btc > MAX_FUNDED_BTC) {
        results.push(enqueueReview('hd_change_needs_verify', 'medium'));
        continue;
      }

      // ✅ All guards pass → candidate for snapshot
      snapshotRowsToInsert.push({
        address: addr,
        user_id: c.user_id,
        source: 'hd_change_verified',
        confidence: 0.93,
        integrity_status: 'ok',
        tx_count_at_verify: snap.tx_count,
        funded_btc_at_verify: snap.funded_btc,
        verified_at: new Date().toISOString(),
        verified_by: user.id,
        notes: `source_tx=${c.source_tx};hint=${c.hint}`,
      });
      results.push({ address: addr, user_id: c.user_id, verdict: 'accepted', reason: 'all_guards_pass', guard_snapshot: snap, class_a_blacklist_hit: false, class_b_suspect_hit: false, is_father: false, is_treasury: false });

      // Shadow-log (Phase 2, chỉ quan sát): so sánh candidate ownership (đề xuất từ
      // change-output heuristic của discovery-v2) với resolver mới, trước khi có thể ghi snapshot.
      dispatchBtcResolverShadowLog(admin, {
        address: addr,
        rawAddressLegacySide: addr,
        callSite: 'btc-discovery-v2:candidate',
        legacyUserId: c.user_id,
        legacySource: `discovery_v2:${c.hint}`,
        idempotencyKey: `btc-discovery-v2:candidate:${c.source_tx}:${addr}`,
        createdBy: 'btc-discovery-v2',
        txHash: c.source_tx,
      });
    }

    // Apply writes based on mode
    let review_inserted = 0;
    let snapshot_inserted = 0;
    if (modeEffective === 'enqueue' || modeEffective === 'apply') {
      if (reviewRowsToInsert.length > 0) {
        const { error, count } = await admin
          .from('btc_review_queue')
          .upsert(reviewRowsToInsert, { onConflict: 'id', ignoreDuplicates: true, count: 'exact' });
        if (error) console.warn('review insert:', error.message);
        else review_inserted = count ?? reviewRowsToInsert.length;
      }
    }
    if (modeEffective === 'apply' && snapshotRowsToInsert.length > 0) {
      const { error, count } = await admin
        .from('btc_ownership_snapshot')
        .upsert(snapshotRowsToInsert, { onConflict: 'address', ignoreDuplicates: true, count: 'exact' });
      if (error) console.warn('snapshot insert:', error.message);
      else snapshot_inserted = count ?? snapshotRowsToInsert.length;
    }

    const total_ms = performance.now() - t0;

    try {
      await admin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'btc_discovery_v2_invoke',
        target_type: 'btc_ownership',
        target_id: null,
        metadata: {
          mode_requested: requestedMode,
          mode_effective: modeEffective,
          warning,
          candidate_count: candidates.length,
          accepted: results.filter((r) => r.verdict === 'accepted').length,
          review_queue: results.filter((r) => r.verdict === 'review_queue').length,
          rejected: results.filter((r) => r.verdict === 'rejected').length,
          review_inserted,
          snapshot_inserted,
          timings_ms: { total: total_ms },
        },
      });
    } catch (e) {
      console.warn('audit log:', e instanceof Error ? e.message : e);
    }

    return json({
      ok: true,
      flag: { btc_discovery_v2_enabled: flagOn },
      mode_requested: requestedMode,
      mode_effective: modeEffective,
      warning,
      total_ms,
      candidate_count: candidates.length,
      review_inserted,
      snapshot_inserted,
      results,
    });
  } catch (e) {
    console.error('btc-discovery-v2 error:', e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
