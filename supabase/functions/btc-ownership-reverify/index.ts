/**
 * G5A · btc-ownership-reverify
 *
 * Re-verify BTC ownership candidates and populate `btc_ownership_snapshot` (SSOT)
 * with strict guards. Candidate sources:
 *   - profiles.btc_address  → source='profile_primary' (trusted, confidence 1.000)
 *   - profile_btc_aux_addresses (active only) → source='hd_change_verified' after guards
 *
 * Legacy `profile_btc_aux_addresses` is treated as CANDIDATE ONLY (not SSOT).
 * Address must pass ALL guards before entering ownership snapshot.
 *
 * Feature flag: `btc_ownership_reverify_enabled` (default OFF).
 * Modes: dry_run (no writes), apply (writes to snapshot + review queue).
 *
 * Guards (fail → review queue with full evidence):
 *   - class_a_blacklist (disabled_reason ILIKE '%exchange%' in aux table or blacklisted_wallets)
 *   - conflict (address already snapshot for a different user)
 *   - father / treasury (never auto-apply → review as father_aux_manual)
 *   - tx_count > 20  → hd_change_needs_verify
 *   - funded_btc > 1 → hd_change_needs_verify
 */

import { corsHeaders, json, createAdminClient, requireUser } from '../_shared/httpAuth.ts';
import { BtcProviderManager, type ProviderMetrics } from '../_shared/btcProviderManager.ts';
import { dispatchBtcResolverShadowLog } from '../_shared/btcResolverShadowLog.ts';
import { uuidv5 } from './uuidv5.ts';
import type { Candidate, CandidateResult, GuardSnapshot, ReverifyBody, ReverifyMode } from './types.ts';
import { REVIEW_QUEUE_UUID_NAMESPACE } from './types.ts';
import { btcNormalizeAddress } from '../_shared/btcAddress.ts';

const MAX_TX_COUNT = 20;
const MAX_FUNDED_BTC = 1.0;
const FATHER_USERNAMES = new Set(['angelfather', 'father']);
const TREASURY_USERNAMES = new Set(['funtreasury']);

async function readReverifyFlag(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { data } = await admin.from('system_config').select('value').eq('key', 'btc_ownership_reverify_enabled').maybeSingle();
  const v = data?.value as unknown;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v === 'true';
  if (v && typeof v === 'object' && 'enabled' in (v as Record<string, unknown>)) return (v as { enabled: boolean }).enabled === true;
  return false;
}

async function fetchGuardSnapshot(pm: BtcProviderManager, address: string): Promise<GuardSnapshot> {
  const s = await pm.getAddressStats(address);
  return {
    tx_count: s.tx_count,
    funded_btc: s.funded_btc,
    address_type: s.address_type,
    fetched_at: s.fetched_at,
  };
}

interface CandidateBundle {
  candidates: Candidate[];
  classA: Set<string>;
  fatherOrTreasury: Set<string>; // user_ids
}

async function loadCandidates(admin: ReturnType<typeof createAdminClient>, body: ReverifyBody): Promise<CandidateBundle> {
  const includePrimary = body.include_primary !== false;
  const includeAux = body.include_aux !== false;
  const filter = body.user_ids && body.user_ids.length > 0 ? new Set(body.user_ids) : null;

  const candidates: Candidate[] = [];

  // one-off recheck
  if (body.address) {
    const addr = btcNormalizeAddress(body.address);
    const { data: aux } = await admin
      .from('profile_btc_aux_addresses')
      .select('id, user_id, address, first_seen_tx, disabled_at')
      .eq('address', addr)
      .maybeSingle();
    if (aux && !aux.disabled_at) {
      candidates.push({ address: addr, user_id: aux.user_id, candidate_source: 'aux_legacy', legacy_row_id: aux.id, first_seen_tx: aux.first_seen_tx });
    } else {
      const { data: p } = await admin
        .from('profiles')
        .select('id, btc_address')
        .eq('btc_address', addr)
        .maybeSingle();
      if (p) candidates.push({ address: addr, user_id: p.id, candidate_source: 'profile_primary' });
    }
  } else {
    if (includePrimary) {
      let q = admin.from('profiles').select('id, btc_address').not('btc_address', 'is', null);
      if (filter) q = q.in('id', Array.from(filter));
      const { data } = await q;
      for (const r of data ?? []) {
        const addr = btcNormalizeAddress(r.btc_address);
        if (!addr) continue;
        candidates.push({ address: addr, user_id: r.id, candidate_source: 'profile_primary' });
      }
    }
    if (includeAux) {
      // Paginate to bypass PostgREST default 1000 row limit
      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = admin
          .from('profile_btc_aux_addresses')
          .select('id, user_id, address, first_seen_tx, disabled_at, disabled_reason')
          .is('disabled_at', null)
          .order('created_at', { ascending: true })
          .range(from, from + PAGE - 1);
        if (filter) q = q.in('user_id', Array.from(filter));
        const { data, error } = await q;
        if (error) { console.warn('aux page err:', error.message); break; }
        const rows = data ?? [];
        for (const r of rows) {
          if (filter && !filter.has(r.user_id)) continue;
          candidates.push({
            address: btcNormalizeAddress(r.address),
            user_id: r.user_id,
            candidate_source: 'aux_legacy',
            legacy_row_id: r.id,
            first_seen_tx: r.first_seen_tx,
          });
        }
        if (rows.length < PAGE) break;
        from += PAGE;
      }
    }
  }

  // Class A blacklist: E-phase auto-disabled exchange addresses + blacklisted_wallets
  const classA = new Set<string>();
  const { data: disabledA } = await admin
    .from('profile_btc_aux_addresses')
    .select('address, disabled_reason')
    .not('disabled_at', 'is', null)
    .ilike('disabled_reason', '%exchange%');
  for (const r of disabledA ?? []) classA.add(btcNormalizeAddress(r.address));
  const { data: bl } = await admin.from('blacklisted_wallets').select('wallet_address');
  for (const r of bl ?? []) classA.add(btcNormalizeAddress(r.wallet_address));

  // Father/treasury user ids
  const fatherOrTreasury = new Set<string>();
  const { data: ftUsers } = await admin
    .from('profiles')
    .select('id, username')
    .in('username', [...FATHER_USERNAMES, ...TREASURY_USERNAMES]);
  for (const r of ftUsers ?? []) fatherOrTreasury.add(r.id);

  return { candidates, classA, fatherOrTreasury };
}

async function loadExistingSnapshot(admin: ReturnType<typeof createAdminClient>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await admin.from('btc_ownership_snapshot').select('address, user_id');
  for (const r of data ?? []) map.set(btcNormalizeAddress(r.address), r.user_id);
  return map;
}

interface RunSummary {
  run_id: string;
  started_at: string;
  finished_at?: string;
  status: 'running' | 'done' | 'error' | 'paused';
  mode: ReverifyMode;
  totals: {
    candidate_total: number;
    accepted: number;
    review_queue: number;
    rejected: number;
    skipped: number;
    snapshot_would_insert: number;
    review_would_insert: number;
  };
  by_reason: Record<string, number>;
  by_source: Record<string, number>;
  users_coverage: Record<string, { candidates: number; accepted: number; skipped: number; review: number; rejected: number }>;
  network?: ProviderMetrics;
  checkpoint?: {
    processed_addresses: string[]; // aux addresses already handled (idempotent resume key)
    fast_path_done: boolean;
    last_saved_at: string;
  };
  errors?: string[];
  total_ms?: number;
}

async function writeRunSummary(admin: ReturnType<typeof createAdminClient>, summary: RunSummary) {
  await admin.from('system_config').upsert({
    key: `g5a_dryrun_run:${summary.run_id}`,
    value: summary as unknown as Record<string, unknown>,
  }, { onConflict: 'key' });
  await admin.from('system_config').upsert({
    key: 'g5a_dryrun_latest',
    value: { run_id: summary.run_id, status: summary.status, finished_at: summary.finished_at ?? null } as unknown as Record<string, unknown>,
  }, { onConflict: 'key' });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const t0 = performance.now();
  try {
    const admin = createAdminClient();

    // Parse body sớm để biết action
    let body = (await req.json().catch(() => ({}))) as ReverifyBody & { action?: string; run_id?: string; qa_user_ids?: string[] };

    // === Cron path: `cron_auto_resume` action bypasses admin auth ===
    // Action này chỉ resume dry-run đang chạy hoặc mark final_ready.
    // KHÔNG thể apply, KHÔNG thể start run mới → an toàn cho public POST.
    const isCronAction = body.action === 'cron_auto_resume';
    const isCron = isCronAction;

    let user: Awaited<ReturnType<typeof requireUser>> | null = null;
    if (!isCron) {
      user = await requireUser(req);
      const { data: role } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (!role) return json({ ok: false, error: 'admin only' }, 403);
    } else {
      // Force dry_run cho luồng cron
      body = { ...body, mode: 'dry_run' as ReverifyMode };
    }


    // === Action: cron_auto_resume — poll latest, resume if stalled, mark final ===
    if (body.action === 'cron_auto_resume') {
      const { data: latestRec } = await admin
        .from('system_config').select('value').eq('key', 'g5a_dryrun_latest').maybeSingle();
      const l = latestRec?.value as { run_id?: string } | undefined;
      if (!l?.run_id) return json({ ok: true, no_run: true });

      const { data: fullRec } = await admin
        .from('system_config').select('value').eq('key', `g5a_dryrun_run:${l.run_id}`).maybeSingle();
      const summary = fullRec?.value as RunSummary | undefined;
      if (!summary) return json({ ok: true, no_summary: true, run_id: l.run_id });

      // Terminal: done → mark final_ready idempotent
      if (summary.status === 'done') {
        const { data: flagRec } = await admin
          .from('system_config').select('value').eq('key', 'g5a_dryrun_final_ready').maybeSingle();
        const existingFlag = flagRec?.value as { run_id?: string } | undefined;
        if (!existingFlag || existingFlag.run_id !== summary.run_id) {
          await admin.from('system_config').upsert({
            key: 'g5a_dryrun_final_ready',
            value: {
              run_id: summary.run_id,
              completed_at: summary.finished_at ?? null,
              totals: summary.totals,
              network: summary.network ?? null,
              ack: false,
            } as unknown as Record<string, unknown>,
          }, { onConflict: 'key' });
        }
        return json({
          ok: true, done: true, run_id: summary.run_id,
          totals: summary.totals, network: summary.network ?? null,
        });
      }

      if (summary.status === 'error') {
        return json({ ok: true, error_stopped: true, run_id: summary.run_id, errors: summary.errors });
      }

      // running/paused: guard against overlap using last_saved_at freshness
      const lastSaved = summary.checkpoint?.last_saved_at ? new Date(summary.checkpoint.last_saved_at).getTime() : 0;
      const ageMs = Date.now() - lastSaved;
      if (ageMs > 0 && ageMs < 4 * 60 * 1000) {
        return json({ ok: true, still_active: true, run_id: summary.run_id, age_ms: ageMs, checkpoint_at: summary.checkpoint?.last_saved_at ?? null });
      }

      // Stalled → transform to resume and fall through
      body = { ...body, action: 'resume_full_dry_run', run_id: summary.run_id };
    }



    // === Action: get latest full dry-run summary ===
    if (body.action === 'get_full_dry_run') {
      const key = body.run_id ? `g5a_dryrun_run:${body.run_id}` : 'g5a_dryrun_latest';
      const { data: rec } = await admin.from('system_config').select('value').eq('key', key).maybeSingle();
      if (!rec) return json({ ok: false, error: 'no run found' }, 404);
      if (key === 'g5a_dryrun_latest') {
        const latest = rec.value as { run_id: string };
        const { data: full } = await admin.from('system_config').select('value').eq('key', `g5a_dryrun_run:${latest.run_id}`).maybeSingle();
        return json({ ok: true, summary: full?.value ?? rec.value });
      }
      return json({ ok: true, summary: rec.value });
    }

    // === Action: start full dry-run in background (with optional resume) ===
    if (body.action === 'start_full_dry_run' || body.action === 'resume_full_dry_run') {
      const isResume = body.action === 'resume_full_dry_run';
      let runId: string;
      let started_at: string;
      let initSummary: RunSummary;
      const qaSet = new Set<string>(body.qa_user_ids ?? []);

      if (isResume) {
        const rid = body.run_id;
        if (!rid) return json({ ok: false, error: 'run_id required for resume' }, 400);
        const { data: rec } = await admin.from('system_config').select('value').eq('key', `g5a_dryrun_run:${rid}`).maybeSingle();
        if (!rec) return json({ ok: false, error: 'run not found' }, 404);
        initSummary = rec.value as unknown as RunSummary;
        if (initSummary.status === 'done') return json({ ok: false, error: 'run already done' }, 409);
        runId = rid;
        started_at = initSummary.started_at;
        initSummary.status = 'running';
      } else {
        runId = crypto.randomUUID();
        started_at = new Date().toISOString();
        initSummary = {
          run_id: runId,
          started_at,
          status: 'running',
          mode: 'dry_run',
          totals: { candidate_total: 0, accepted: 0, review_queue: 0, rejected: 0, skipped: 0, snapshot_would_insert: 0, review_would_insert: 0 },
          by_reason: {},
          by_source: {},
          users_coverage: {},
          checkpoint: { processed_addresses: [], fast_path_done: false, last_saved_at: new Date().toISOString() },
        };
      }
      await writeRunSummary(admin, initSummary);

      const bgTask = (async () => {
        const errors: string[] = [];
        const pm = new BtcProviderManager({ retriesPerProvider: 3, backoffMs: [500, 1500, 3000], timeoutMs: 5000 });
        try {
          const { candidates, classA, fatherOrTreasury } = await loadCandidates(admin, { ...body, address: undefined, mode: 'dry_run' } as ReverifyBody);
          const existing = await loadExistingSnapshot(admin);
          const summary = initSummary;
          const processedSet = new Set<string>(summary.checkpoint?.processed_addresses ?? []);
          summary.totals.candidate_total = candidates.length;

          const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };
          const bumpUser = (uid: string, key: 'accepted' | 'skipped' | 'review' | 'rejected') => {
            const u = summary.users_coverage[uid] ?? { candidates: 0, accepted: 0, skipped: 0, review: 0, rejected: 0 };
            u[key] += 1;
            summary.users_coverage[uid] = u;
          };

          if (!summary.checkpoint?.fast_path_done) {
            // reset coverage totals on fresh run only (resume trusts saved state)
            summary.users_coverage = {};
            for (const c of candidates) {
              const u = summary.users_coverage[c.user_id] ?? { candidates: 0, accepted: 0, skipped: 0, review: 0, rejected: 0 };
              u.candidates += 1;
              summary.users_coverage[c.user_id] = u;
              bump(summary.by_source, c.candidate_source);
            }
          }

          // Fast-path scan (no network) — idempotent, only when not done
          const auxNeedsFetch: Candidate[] = [];
          if (!summary.checkpoint?.fast_path_done) {
            for (const c of candidates) {
              const owner = existing.get(c.address);
              if (owner === c.user_id) {
                summary.totals.skipped += 1; bumpUser(c.user_id, 'skipped'); bump(summary.by_reason, 'already_in_snapshot');
                processedSet.add(c.address); continue;
              }
              if (owner && owner !== c.user_id) {
                summary.totals.review_queue += 1; summary.totals.review_would_insert += 1; bumpUser(c.user_id, 'review'); bump(summary.by_reason, 'ambiguous_ownership');
                processedSet.add(c.address); continue;
              }
              if (c.candidate_source === 'profile_primary') {
                if (classA.has(c.address)) {
                  summary.totals.review_queue += 1; summary.totals.review_would_insert += 1; bumpUser(c.user_id, 'review'); bump(summary.by_reason, 'primary_classA_conflict');
                } else {
                  summary.totals.accepted += 1; summary.totals.snapshot_would_insert += 1; bumpUser(c.user_id, 'accepted'); bump(summary.by_reason, 'primary_declared');
                  dispatchBtcResolverShadowLog(admin, {
                    address: c.address,
                    rawAddressLegacySide: c.address,
                    callSite: 'btc-ownership-reverify:dryrun:primary',
                    legacyUserId: c.user_id,
                    legacySource: 'profile_primary',
                    idempotencyKey: `btc-ownership-reverify:primary:${c.address}`,
                    createdBy: 'btc-ownership-reverify',
                  });
                }
                processedSet.add(c.address); continue;
              }
              if (classA.has(c.address)) {
                summary.totals.rejected += 1; bumpUser(c.user_id, 'rejected'); bump(summary.by_reason, 'class_a_blacklist');
                processedSet.add(c.address); continue;
              }
              auxNeedsFetch.push(c);
            }
            summary.checkpoint = { processed_addresses: Array.from(processedSet), fast_path_done: true, last_saved_at: new Date().toISOString() };
            summary.network = pm.snapshot();
            await writeRunSummary(admin, summary);
          } else {
            // Resume: rebuild aux list from candidates minus processed
            for (const c of candidates) {
              if (processedSet.has(c.address)) continue;
              if (c.candidate_source === 'aux_legacy' && !classA.has(c.address)) auxNeedsFetch.push(c);
            }
          }

          // Aux: provider-managed fetch with reduced concurrency
          const CONCURRENCY = 3;
          const INTER_BATCH_DELAY_MS = 400;
          const nextCheckpoint = { ms: Date.now() + 8000 };
          for (let i = 0; i < auxNeedsFetch.length; i += CONCURRENCY) {
            const batch = auxNeedsFetch.slice(i, i + CONCURRENCY);
            const snaps = await Promise.all(batch.map(async (c) => {
              try { return { c, snap: await fetchGuardSnapshot(pm, c.address), err: null as unknown as null }; }
              catch (e) { return { c, snap: null, err: e as Error }; }
            }));
            for (const { c, snap, err } of snaps) {
              if (err || !snap) {
                summary.totals.review_queue += 1; summary.totals.review_would_insert += 1; bumpUser(c.user_id, 'review'); bump(summary.by_reason, 'provider_failure');
                processedSet.add(c.address); continue;
              }
              if (fatherOrTreasury.has(c.user_id)) {
                summary.totals.review_queue += 1; summary.totals.review_would_insert += 1; bumpUser(c.user_id, 'review'); bump(summary.by_reason, 'father_aux_manual');
              } else if (snap.tx_count > MAX_TX_COUNT) {
                summary.totals.review_queue += 1; summary.totals.review_would_insert += 1; bumpUser(c.user_id, 'review'); bump(summary.by_reason, 'tx_count_over_threshold');
              } else if (snap.funded_btc > MAX_FUNDED_BTC) {
                summary.totals.review_queue += 1; summary.totals.review_would_insert += 1; bumpUser(c.user_id, 'review'); bump(summary.by_reason, 'funded_over_threshold');
              } else {
                summary.totals.accepted += 1; summary.totals.snapshot_would_insert += 1; bumpUser(c.user_id, 'accepted'); bump(summary.by_reason, 'all_guards_pass');
                dispatchBtcResolverShadowLog(admin, {
                  address: c.address,
                  rawAddressLegacySide: c.address,
                  callSite: 'btc-ownership-reverify:dryrun:aux',
                  legacyUserId: c.user_id,
                  legacySource: 'aux_legacy',
                  idempotencyKey: `btc-ownership-reverify:aux:${c.address}`,
                  createdBy: 'btc-ownership-reverify',
                });
              }
              processedSet.add(c.address);
            }
            await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
            if (Date.now() > nextCheckpoint.ms) {
              summary.checkpoint = { processed_addresses: Array.from(processedSet), fast_path_done: true, last_saved_at: new Date().toISOString() };
              summary.network = pm.snapshot();
              try { await writeRunSummary(admin, summary); } catch { /* ignore */ }
              nextCheckpoint.ms = Date.now() + 8000;
            }
          }

          summary.status = 'done';
          summary.finished_at = new Date().toISOString();
          summary.total_ms = performance.now() - t0;
          summary.checkpoint = { processed_addresses: Array.from(processedSet), fast_path_done: true, last_saved_at: new Date().toISOString() };
          summary.network = pm.snapshot();
          if (qaSet.size > 0) {
            for (const uid of qaSet) {
              if (!summary.users_coverage[uid]) summary.users_coverage[uid] = { candidates: 0, accepted: 0, skipped: 0, review: 0, rejected: 0 };
            }
          }
          if (errors.length > 0) summary.errors = errors;
          await writeRunSummary(admin, summary);
        } catch (e) {
          const errSummary: RunSummary = { ...initSummary, status: 'error', finished_at: new Date().toISOString(), errors: [e instanceof Error ? e.message : String(e)], network: pm.snapshot() };
          try { await writeRunSummary(admin, errSummary); } catch { /* ignore */ }
        }
      })();

      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(bgTask) ?? bgTask;
      return json({ ok: true, run_id: runId, started_at, resumed: isResume, poll_action: 'get_full_dry_run' });
    }


    const requestedMode: ReverifyMode = body.mode === 'apply' ? 'apply' : 'dry_run';
    const batchSize = Math.min(Math.max(body.batch_size ?? 50, 1), 200);
    const offset = Math.max(body.offset ?? 0, 0);

    const flagOn = await readReverifyFlag(admin);
    const modeEffective: ReverifyMode = flagOn ? requestedMode : 'dry_run';
    const warning = !flagOn && requestedMode === 'apply'
      ? 'btc_ownership_reverify_enabled OFF — downgraded to dry_run'
      : undefined;

    const { candidates, classA, fatherOrTreasury } = await loadCandidates(admin, body);
    const totalCandidates = candidates.length;
    const slice = candidates.slice(offset, offset + batchSize);
    const existing = await loadExistingSnapshot(admin);

    const results: CandidateResult[] = [];
    const snapshotRows: Array<Record<string, unknown>> = [];
    const reviewRows: Array<Record<string, unknown>> = [];

    // Split slice into primary-fast-path vs aux-needs-mempool
    const auxNeedsFetch: Candidate[] = [];
    for (const c of slice) {
      const addr = c.address;
      const owner = existing.get(addr);
      if (owner === c.user_id) {
        results.push({ address: addr, user_id: c.user_id, candidate_source: c.candidate_source, verdict: 'skipped_already_owned', reason: 'already_in_snapshot', guard_snapshot: null, confidence: null });
        continue;
      }
      if (owner && owner !== c.user_id) {
        const rid = uuidv5(`conflict:${addr}:${c.user_id}`, REVIEW_QUEUE_UUID_NAMESPACE);
        reviewRows.push({
          id: rid, tx_hash: c.first_seen_tx ?? `ownership:${addr}`, vout_index: null,
          reason: 'ambiguous_ownership', severity: 'critical',
          evidence: { source: 'g5a_reverify', address: addr, claimed_by_snapshot: owner, candidate_user: c.user_id, candidate_source: c.candidate_source, legacy_row_id: c.legacy_row_id ?? null, first_seen_tx: c.first_seen_tx ?? null, guard_fail: 'address_already_owned_by_other_user' },
          status: 'pending',
        });
        results.push({ address: addr, user_id: c.user_id, candidate_source: c.candidate_source, verdict: 'review_queue', reason: 'ambiguous_ownership', guard_snapshot: null, confidence: null, review_id: rid, conflict_user: owner });
        continue;
      }
      if (c.candidate_source === 'profile_primary') {
        if (classA.has(addr)) {
          const rid = uuidv5(`primary_classA:${addr}:${c.user_id}`, REVIEW_QUEUE_UUID_NAMESPACE);
          reviewRows.push({ id: rid, tx_hash: `ownership:${addr}`, vout_index: null, reason: 'class_b_suspect', severity: 'high', evidence: { source: 'g5a_reverify', address: addr, candidate_user: c.user_id, candidate_source: 'profile_primary', guard_fail: 'primary_address_in_class_a_blacklist' }, status: 'pending' });
          results.push({ address: addr, user_id: c.user_id, candidate_source: c.candidate_source, verdict: 'review_queue', reason: 'primary_classA_conflict', guard_snapshot: null, confidence: null, review_id: rid });
          continue;
        }
        const notesTag = fatherOrTreasury.has(c.user_id) ? 'g5a_reverify:primary:father_or_treasury' : 'g5a_reverify:primary';
        snapshotRows.push({ address: addr, user_id: c.user_id, source: 'profile_primary', confidence: 1.000, integrity_status: 'ok', tx_count_at_verify: null, funded_btc_at_verify: null, verified_at: new Date().toISOString(), verified_by: user!.id, notes: notesTag });
        results.push({ address: addr, user_id: c.user_id, candidate_source: c.candidate_source, verdict: 'accepted', reason: 'primary_declared', guard_snapshot: null, confidence: 1.000 });
        dispatchBtcResolverShadowLog(admin, {
          address: addr,
          rawAddressLegacySide: addr,
          callSite: 'btc-ownership-reverify:primary',
          legacyUserId: c.user_id,
          legacySource: 'profile_primary',
          idempotencyKey: `btc-ownership-reverify:primary:${addr}`,
          createdBy: 'btc-ownership-reverify',
        });
        continue;
      }
      if (classA.has(addr)) {
        results.push({ address: addr, user_id: c.user_id, candidate_source: c.candidate_source, verdict: 'rejected', reason: 'class_a_blacklist', guard_snapshot: null, confidence: null });
        continue;
      }
      auxNeedsFetch.push(c);
    }

    // Provider-managed fetch for aux candidates (chain: mempool → blockstream)
    const pm = new BtcProviderManager({ retriesPerProvider: 3, backoffMs: [500, 1500, 3000], timeoutMs: 5000 });
    const CONCURRENCY = 3;
    for (let i = 0; i < auxNeedsFetch.length; i += CONCURRENCY) {
      const batch = auxNeedsFetch.slice(i, i + CONCURRENCY);
      const snapshots = await Promise.all(batch.map(async (c) => {
        try { return { c, snap: await fetchGuardSnapshot(pm, c.address), err: null as unknown as null }; }
        catch (e) { return { c, snap: null, err: e as Error }; }
      }));
      await new Promise((r) => setTimeout(r, 400));
      for (const { c, snap, err } of snapshots) {
        const addr = c.address;
        if (err || !snap) {
          const rid = uuidv5(`fetcherr:${addr}`, REVIEW_QUEUE_UUID_NAMESPACE);
          reviewRows.push({ id: rid, tx_hash: c.first_seen_tx ?? `ownership:${addr}`, vout_index: null, reason: 'hd_change_needs_verify', severity: 'low', evidence: { source: 'g5a_reverify', address: addr, candidate_user: c.user_id, candidate_source: 'aux_legacy', legacy_row_id: c.legacy_row_id ?? null, guard_fail: `provider_failure:${err instanceof Error ? err.message : err}` }, status: 'pending' });
          results.push({ address: addr, user_id: c.user_id, candidate_source: c.candidate_source, verdict: 'review_queue', reason: 'provider_failure', guard_snapshot: null, confidence: null, review_id: rid });
          continue;
        }
        const evidenceBase = { source: 'g5a_reverify', address: addr, candidate_user: c.user_id, candidate_source: 'aux_legacy', legacy_row_id: c.legacy_row_id ?? null, first_seen_tx: c.first_seen_tx ?? null, guard_snapshot: snap };
        if (fatherOrTreasury.has(c.user_id)) {
          const rid = uuidv5(`father:${addr}:${c.user_id}`, REVIEW_QUEUE_UUID_NAMESPACE);
          reviewRows.push({ id: rid, tx_hash: c.first_seen_tx ?? `ownership:${addr}`, vout_index: null, reason: 'father_aux_manual', severity: 'high', evidence: { ...evidenceBase, guard_fail: 'father_or_treasury_never_auto_apply' }, status: 'pending' });
          results.push({ address: addr, user_id: c.user_id, candidate_source: c.candidate_source, verdict: 'review_queue', reason: 'father_aux_manual', guard_snapshot: snap, confidence: null, review_id: rid });
          continue;
        }
        if (snap.tx_count > MAX_TX_COUNT) {
          const rid = uuidv5(`hi_tx:${addr}:${c.user_id}`, REVIEW_QUEUE_UUID_NAMESPACE);
          reviewRows.push({ id: rid, tx_hash: c.first_seen_tx ?? `ownership:${addr}`, vout_index: null, reason: 'hd_change_needs_verify', severity: 'medium', evidence: { ...evidenceBase, guard_fail: `tx_count>${MAX_TX_COUNT}` }, status: 'pending' });
          results.push({ address: addr, user_id: c.user_id, candidate_source: c.candidate_source, verdict: 'review_queue', reason: 'tx_count_over_threshold', guard_snapshot: snap, confidence: null, review_id: rid });
          continue;
        }
        if (snap.funded_btc > MAX_FUNDED_BTC) {
          const rid = uuidv5(`hi_fund:${addr}:${c.user_id}`, REVIEW_QUEUE_UUID_NAMESPACE);
          reviewRows.push({ id: rid, tx_hash: c.first_seen_tx ?? `ownership:${addr}`, vout_index: null, reason: 'hd_change_needs_verify', severity: 'medium', evidence: { ...evidenceBase, guard_fail: `funded_btc>${MAX_FUNDED_BTC}` }, status: 'pending' });
          results.push({ address: addr, user_id: c.user_id, candidate_source: c.candidate_source, verdict: 'review_queue', reason: 'funded_over_threshold', guard_snapshot: snap, confidence: null, review_id: rid });
          continue;
        }
        let confidence = 0.90;
        if (snap.tx_count <= 5) confidence += 0.05;
        if (snap.funded_btc > 0.1) confidence -= 0.05;
        confidence = Math.max(0.80, Math.min(0.95, Number(confidence.toFixed(3))));
        snapshotRows.push({ address: addr, user_id: c.user_id, source: 'hd_change_verified', confidence, integrity_status: 'ok', tx_count_at_verify: snap.tx_count, funded_btc_at_verify: snap.funded_btc, verified_at: new Date().toISOString(), verified_by: user!.id, notes: `g5a_reverify:aux:first_seen_tx=${c.first_seen_tx ?? 'n/a'}` });
        results.push({ address: addr, user_id: c.user_id, candidate_source: c.candidate_source, verdict: 'accepted', reason: 'all_guards_pass', guard_snapshot: snap, confidence });
        dispatchBtcResolverShadowLog(admin, {
          address: addr,
          rawAddressLegacySide: addr,
          callSite: 'btc-ownership-reverify:aux',
          legacyUserId: c.user_id,
          legacySource: 'aux_legacy',
          idempotencyKey: `btc-ownership-reverify:aux:${addr}`,
          createdBy: 'btc-ownership-reverify',
          txHash: c.first_seen_tx ?? undefined,
        });
      }
    }


    let snapshot_inserted = 0;
    let review_inserted = 0;

    if (modeEffective === 'apply') {
      if (snapshotRows.length > 0) {
        const { error, count } = await admin
          .from('btc_ownership_snapshot')
          .upsert(snapshotRows, { onConflict: 'address', ignoreDuplicates: true, count: 'exact' });
        if (error) console.warn('snapshot insert:', error.message);
        else snapshot_inserted = count ?? snapshotRows.length;
      }
      if (reviewRows.length > 0) {
        const { error, count } = await admin
          .from('btc_review_queue')
          .upsert(reviewRows, { onConflict: 'id', ignoreDuplicates: true, count: 'exact' });
        if (error) console.warn('review insert:', error.message);
        else review_inserted = count ?? reviewRows.length;
      }
    }

    const total_ms = performance.now() - t0;

    try {
      await admin.from('audit_logs').insert({
        actor_id: user!.id,
        action: 'btc_ownership_reverify_invoke',
        target_type: 'btc_ownership',
        target_id: null,
        metadata: {
          mode_requested: requestedMode,
          mode_effective: modeEffective,
          warning,
          total_candidates: totalCandidates,
          slice_size: slice.length,
          offset,
          batch_size: batchSize,
          accepted: results.filter((r) => r.verdict === 'accepted').length,
          review_queue: results.filter((r) => r.verdict === 'review_queue').length,
          rejected: results.filter((r) => r.verdict === 'rejected').length,
          skipped: results.filter((r) => r.verdict === 'skipped_already_owned').length,
          snapshot_inserted,
          review_inserted,
          total_ms,
        },
      });
    } catch (e) {
      console.warn('audit log:', e instanceof Error ? e.message : e);
    }

    return json({
      ok: true,
      flag: { btc_ownership_reverify_enabled: flagOn },
      mode_requested: requestedMode,
      mode_effective: modeEffective,
      warning,
      total_candidates: totalCandidates,
      slice_size: slice.length,
      offset,
      batch_size: batchSize,
      next_offset: offset + slice.length < totalCandidates ? offset + slice.length : null,
      snapshot_inserted,
      review_inserted,
      total_ms,
      network: pm.snapshot(),
      results,
    });
  } catch (e) {
    console.error('btc-ownership-reverify error:', e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
