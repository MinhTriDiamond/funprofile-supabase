/**
 * tx-snapshot-compare — Admin-only.
 * Input  : { user_id, from_ts?, to_ts?, save? (default true) }
 * Output : { status, legacy, unified, diff, snapshot_id? }
 *
 * Legacy aggregator: query thẳng donations + wallet_transfers + transactions
 * (giống logic 4 hook legacy hợp lại).
 * Unified aggregator: gọi RPC get_unified_transactions (paginate hết) +
 * get_unified_summary của M4.
 */
import { corsHeaders, json, requireUser, createAdminClient, HttpError, normalizeError } from '../_shared/httpAuth.ts';

interface Body { user_id: string; from_ts?: string; to_ts?: string; save?: boolean }

interface Agg {
  count: number;
  count_in: number;
  count_out: number;
  count_pending: number;
  sum_in: number;
  sum_out: number;
  by_token: Record<string, { in: number; out: number; count: number }>;
  by_chain: Record<string, { count: number }>;
  tx_hashes: string[];
}

function emptyAgg(): Agg {
  return { count: 0, count_in: 0, count_out: 0, count_pending: 0, sum_in: 0, sum_out: 0, by_token: {}, by_chain: {}, tx_hashes: [] };
}

function pushToken(a: Agg, sym: string | null, dir: 'in' | 'out' | 'unknown', amt: number) {
  const k = (sym || 'UNKNOWN').toUpperCase();
  if (!a.by_token[k]) a.by_token[k] = { in: 0, out: 0, count: 0 };
  a.by_token[k].count += 1;
  if (dir === 'in') a.by_token[k].in += amt;
  if (dir === 'out') a.by_token[k].out += amt;
}
function pushChain(a: Agg, chain: string | number | null) {
  const k = chain == null ? 'unknown' : String(chain);
  if (!a.by_chain[k]) a.by_chain[k] = { count: 0 };
  a.by_chain[k].count += 1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    const admin = createAdminClient();
    const { data: isAdminFlag } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdminFlag) throw new HttpError(403, 'FORBIDDEN', 'Chỉ admin');

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body?.user_id) throw new HttpError(400, 'BAD_REQUEST', 'Thiếu user_id');
    const from = body.from_ts ?? null;
    const to = body.to_ts ?? null;
    const save = body.save !== false;

    // -------- LEGACY AGG --------
    const legacy = emptyAgg();

    // donations: sender_id=user OR recipient_id=user
    {
      let q = admin.from('donations')
        .select('id,tx_hash,sender_id,recipient_id,amount,token_symbol,chain_id,status,created_at')
        .or(`sender_id.eq.${body.user_id},recipient_id.eq.${body.user_id}`);
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);
      const { data, error } = await q.limit(20000);
      if (error) throw error;
      (data || []).forEach((r: Record<string, unknown>) => {
        legacy.count++;
        const dir = r.sender_id === body.user_id ? 'out' : (r.recipient_id === body.user_id ? 'in' : 'unknown');
        const amt = Number(r.amount) || 0;
        if (dir === 'in') { legacy.count_in++; legacy.sum_in += amt; }
        else if (dir === 'out') { legacy.count_out++; legacy.sum_out += amt; }
        if ((r.status as string) !== 'confirmed' && (r.status as string) !== 'success') legacy.count_pending++;
        pushToken(legacy, r.token_symbol as string | null, dir as 'in' | 'out', amt);
        pushChain(legacy, r.chain_id as number | null);
        if (r.tx_hash) legacy.tx_hashes.push(String(r.tx_hash).toLowerCase());
      });
    }
    // wallet_transfers: user_id=user
    {
      let q = admin.from('wallet_transfers')
        .select('id,tx_hash,user_id,direction,amount,token_symbol,chain_id,status,created_at')
        .eq('user_id', body.user_id);
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);
      const { data, error } = await q.limit(20000);
      if (error) throw error;
      (data || []).forEach((r: Record<string, unknown>) => {
        legacy.count++;
        const dir = (r.direction === 'in' || r.direction === 'out') ? r.direction as 'in' | 'out' : 'unknown';
        const amt = Number(r.amount) || 0;
        if (dir === 'in') { legacy.count_in++; legacy.sum_in += amt; }
        else if (dir === 'out') { legacy.count_out++; legacy.sum_out += amt; }
        if ((r.status as string) !== 'confirmed') legacy.count_pending++;
        pushToken(legacy, r.token_symbol as string | null, dir, amt);
        pushChain(legacy, r.chain_id as number | null);
        if (r.tx_hash) legacy.tx_hashes.push(String(r.tx_hash).toLowerCase());
      });
    }
    // transactions: user_id=user
    {
      let q = admin.from('transactions')
        .select('id,tx_hash,user_id,from_address,to_address,amount,token_symbol,chain_id,status,created_at')
        .eq('user_id', body.user_id);
      if (from) q = q.gte('created_at', from);
      if (to) q = q.lte('created_at', to);
      const { data, error } = await q.limit(20000);
      if (error) throw error;
      (data || []).forEach((r: Record<string, unknown>) => {
        legacy.count++;
        legacy.count_out++; // legacy 'transactions' chủ yếu là outgoing
        const amt = Number(r.amount) || 0;
        legacy.sum_out += amt;
        if ((r.status as string) !== 'confirmed') legacy.count_pending++;
        pushToken(legacy, r.token_symbol as string | null, 'out', amt);
        pushChain(legacy, r.chain_id as number | null);
        if (r.tx_hash) legacy.tx_hashes.push(String(r.tx_hash).toLowerCase());
      });
    }

    // -------- UNIFIED AGG --------
    const unified = emptyAgg();
    const pageSize = 500;
    let offset = 0;
    while (true) {
      const { data, error } = await admin.rpc('get_unified_transactions', {
        _target_user_id: body.user_id,
        _from_ts: from ?? undefined,
        _to_ts: to ?? undefined,
        _limit: pageSize,
        _offset: offset,
      });
      if (error) throw error;
      const rows = (data || []) as Array<Record<string, unknown>>;
      if (!rows.length) break;
      rows.forEach((r) => {
        unified.count++;
        const dir = (r.direction === 'in' || r.direction === 'out') ? r.direction as 'in' | 'out' : 'unknown';
        const amt = Number(r.amount_decimal ?? r.amount ?? 0) || 0;
        if (dir === 'in') { unified.count_in++; unified.sum_in += amt; }
        else if (dir === 'out') { unified.count_out++; unified.sum_out += amt; }
        if ((r.status as string) !== 'confirmed') unified.count_pending++;
        pushToken(unified, r.token_symbol as string | null, dir, amt);
        pushChain(unified, (r.chain ?? r.chain_id) as string | number | null);
        if (r.tx_hash) unified.tx_hashes.push(String(r.tx_hash).toLowerCase());
      });
      if (rows.length < pageSize) break;
      offset += pageSize;
      if (offset > 20000) break;
    }

    // -------- DIFF --------
    const setL = new Set(legacy.tx_hashes);
    const setU = new Set(unified.tx_hashes);
    const missing_in_unified = [...setL].filter((h) => !setU.has(h)).slice(0, 200);
    const extra_in_unified = [...setU].filter((h) => !setL.has(h)).slice(0, 200);
    const duplicates_unified: string[] = [];
    const seen = new Set<string>();
    for (const h of unified.tx_hashes) { if (seen.has(h)) duplicates_unified.push(h); else seen.add(h); }

    const eps = 1e-8;
    const diff = {
      count: unified.count - legacy.count,
      count_in: unified.count_in - legacy.count_in,
      count_out: unified.count_out - legacy.count_out,
      sum_in: unified.sum_in - legacy.sum_in,
      sum_out: unified.sum_out - legacy.sum_out,
      missing_in_unified,
      extra_in_unified,
      duplicates_unified: duplicates_unified.slice(0, 200),
    };

    let status: 'pass' | 'warning' | 'failed' = 'pass';
    if (missing_in_unified.length > 0 || duplicates_unified.length > 0
      || Math.abs(diff.sum_in) > eps || Math.abs(diff.sum_out) > eps) {
      status = 'failed';
    } else if (diff.count !== 0 || diff.count_in !== 0 || diff.count_out !== 0 || extra_in_unified.length > 0) {
      status = 'warning';
    }

    let snapshot_id: string | null = null;
    if (save) {
      const { data: ins, error: insErr } = await admin
        .from('tx_validation_snapshots')
        .insert({
          target_user_id: body.user_id,
          ran_by: user.id,
          from_ts: from,
          to_ts: to,
          status,
          legacy_json: legacy,
          unified_json: unified,
          diff_json: diff,
          metrics_json: { legacy_tx: legacy.count, unified_tx: unified.count },
        })
        .select('id')
        .single();
      if (insErr) console.warn('save snapshot failed', insErr);
      else snapshot_id = ins?.id ?? null;
    }

    return json({ status, legacy, unified, diff, snapshot_id });
  } catch (e) {
    const n = normalizeError(e);
    return json({ error: n.message, code: n.code }, n.status ?? 500);
  }
});
