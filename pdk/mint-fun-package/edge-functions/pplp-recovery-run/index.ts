// pplp-recovery-run — Auto-recovery of EPOCH_CAP failed mint requests
// Modes: approve (admin), tick (cron/service-role), cancel (admin)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 6 on-chain actions whitelist (same as auto-submit throttle)
const ACTION_NAMES = ['INNER_WORK','CHANNELING','GIVING','HELPING','GRATITUDE','SERVICE'];
const DAILY_CAP_FUN = 950_000;
const MONTHLY_CAP_FUN = 1_050_000;

interface MintRow {
  id: string;
  user_id: string;
  amount_display: number;
  action_name: string | null;
  created_at: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    if (!action) return json({ error: 'action required' }, 400);

    // --- Service-role gate for tick ---
    const authHeader = req.headers.get('Authorization') || '';
    const isServiceRole = authHeader === `Bearer ${SERVICE_KEY}`;

    let callerId: string | null = null;
    let isAdmin = false;
    if (!isServiceRole) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabase.auth.getUser(token);
      callerId = userData?.user?.id ?? null;
      if (callerId) {
        const { data: rd } = await supabase.rpc('has_role', { _user_id: callerId, _role: 'admin' });
        isAdmin = !!rd;
      }
    }

    // ============= APPROVE =============
    if (action === 'approve') {
      if (!isAdmin) return json({ error: 'admin required' }, 403);
      const month = (body.month as string) || new Date().toISOString().slice(0, 7);
      const maxPerRun = Math.min(Math.max(parseInt(body.max_per_run ?? '50', 10) || 50, 1), 200);

      // Auto-cleanup stale empty runs (pending with 0 eligible) — không cần block
      await supabase
        .from('pplp_recovery_runs')
        .update({ status: 'completed', last_tick_at: new Date().toISOString() })
        .in('status', ['pending', 'running'])
        .eq('total_eligible', 0);

      // Block if any real active run remains
      const { data: existing } = await supabase
        .from('pplp_recovery_runs')
        .select('id, status')
        .in('status', ['pending', 'running'])
        .limit(1);
      if (existing && existing.length > 0) {
        return json({ ok: false, reason: 'active_run_exists', existing_run_id: existing[0].id, message: 'Đã có đợt recovery đang chạy' }, 200);
      }

      const monthStart = `${month}-01T00:00:00Z`;
      const [y, m] = month.split('-').map(Number);
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      const monthEnd = `${nextMonth}-01T00:00:00Z`;

      const { count: eligible } = await supabase
        .from('pplp_mint_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .ilike('error_message', '%lockWithPPLP reverted%')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd);

      // Không có gì để recover → trả 200 luôn, không tạo run rỗng
      if ((eligible ?? 0) === 0) {
        return json({
          ok: true,
          run_id: null,
          total_eligible: 0,
          recovered: 0,
          message: `Không có lệnh failed nào cần recover cho tháng ${month}.`,
        });
      }

      const { data: run, error: insertErr } = await supabase
        .from('pplp_recovery_runs')
        .insert({
          approved_by: callerId,
          status: 'pending',
          max_per_run: maxPerRun,
          total_eligible: eligible ?? 0,
          month_filter: month,
          reason_filter: 'lockWithPPLP reverted',
        })
        .select()
        .single();

      if (insertErr) return json({ error: insertErr.message }, 500);
      return json({ ok: true, run_id: run.id, total_eligible: eligible ?? 0, recovered: 0 });
    }

    // ============= CANCEL =============
    if (action === 'cancel') {
      if (!isAdmin) return json({ error: 'admin required' }, 403);
      const runId = body.run_id as string;
      if (!runId) return json({ error: 'run_id required' }, 400);
      const { error } = await supabase
        .from('pplp_recovery_runs')
        .update({ status: 'cancelled' })
        .eq('id', runId)
        .in('status', ['pending', 'running']);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ============= TICK =============
    if (action === 'tick') {
      // Tick is safe for anon (cron). It only consumes admin-approved runs,
      // and cannot create new runs. No need to gate on role.

      // Get oldest pending/running run
      const { data: runs } = await supabase
        .from('pplp_recovery_runs')
        .select('*')
        .in('status', ['pending', 'running'])
        .order('created_at', { ascending: true })
        .limit(1);

      const run = runs?.[0];
      if (!run) return json({ ok: true, message: 'no active run' });

      // Promote to running
      if (run.status === 'pending') {
        await supabase
          .from('pplp_recovery_runs')
          .update({ status: 'running', last_tick_at: new Date().toISOString() })
          .eq('id', run.id);
      }

      // Compute today's used per action (confirmed only)
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const { data: confirmedToday } = await supabase
        .from('pplp_mint_requests')
        .select('action_name, amount_display')
        .eq('status', 'confirmed')
        .gte('updated_at', dayStart.toISOString());

      const remaining: Record<string, number> = {};
      for (const a of ACTION_NAMES) remaining[a] = DAILY_CAP_FUN;
      for (const r of (confirmedToday || [])) {
        const a = (r as any).action_name as string;
        if (a && remaining[a] !== undefined) {
          remaining[a] -= Number((r as any).amount_display || 0);
        }
      }

      // Month bounds
      const month = run.month_filter as string;
      const [y, m] = month.split('-').map(Number);
      const monthStart = `${month}-01T00:00:00Z`;
      const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      const monthEnd = `${nextMonth}-01T00:00:00Z`;

      // Fetch candidate failed rows FIFO (oversample to account for skips)
      const fetchLimit = Math.min(run.max_per_run * 5, 500);
      const { data: candidates } = await supabase
        .from('pplp_mint_requests')
        .select('id, user_id, amount_display, action_name, created_at')
        .eq('status', 'failed')
        .ilike('error_message', '%lockWithPPLP reverted%')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd)
        .order('created_at', { ascending: true })
        .limit(fetchLimit);

      const list = (candidates || []) as MintRow[];
      let recovered = 0;
      let skipped = 0;
      const skipReasons: Record<string, number> = {};

      for (const row of list) {
        if (recovered >= run.max_per_run) break;

        const action_name = row.action_name || 'INNER_WORK';
        const amt = Number(row.amount_display || 0);

        // 1. user already has an active request?
        const { count: active } = await supabase
          .from('pplp_mint_requests')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', row.user_id)
          .in('status', ['pending_sig', 'signing', 'signed', 'submitted', 'queued_split']);
        if ((active ?? 0) > 0) {
          skipped++;
          skipReasons['active_exists'] = (skipReasons['active_exists'] || 0) + 1;
          continue;
        }

        // 2. monthly cap
        const { data: monthAgg } = await supabase
          .from('pplp_mint_requests')
          .select('amount_display')
          .eq('user_id', row.user_id)
          .in('status', ['confirmed', 'pending_sig', 'signing', 'signed', 'submitted', 'queued_split'])
          .gte('created_at', monthStart)
          .lt('created_at', monthEnd);
        const monthTotal = (monthAgg || []).reduce((s, x: any) => s + Number(x.amount_display || 0), 0);
        if (monthTotal + amt > MONTHLY_CAP_FUN) {
          skipped++;
          skipReasons['month_cap'] = (skipReasons['month_cap'] || 0) + 1;
          continue;
        }

        // 3. daily action throttle
        if (remaining[action_name] === undefined || remaining[action_name] < amt) {
          skipped++;
          skipReasons[`throttle_${action_name}`] = (skipReasons[`throttle_${action_name}`] || 0) + 1;
          continue;
        }

        // Promote
        const { error: upErr } = await supabase
          .from('pplp_mint_requests')
          .update({
            status: 'signed',
            retry_count: 0,
            error_message: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .eq('status', 'failed');

        if (upErr) {
          skipped++;
          skipReasons['update_error'] = (skipReasons['update_error'] || 0) + 1;
          continue;
        }

        remaining[action_name] -= amt;
        recovered++;
      }

      // Update run counters
      const newRecovered = (run.total_recovered || 0) + recovered;
      const newSkipped = (run.total_skipped || 0) + skipped;

      // Check if eligible queue exhausted
      const { count: remainingEligible } = await supabase
        .from('pplp_mint_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .ilike('error_message', '%lockWithPPLP reverted%')
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd);

      const nextStatus = (remainingEligible ?? 0) === 0 ? 'completed' : 'running';

      await supabase
        .from('pplp_recovery_runs')
        .update({
          total_recovered: newRecovered,
          total_skipped: newSkipped,
          status: nextStatus,
          last_tick_at: new Date().toISOString(),
          notes: JSON.stringify({ last_tick: { recovered, skipped, skipReasons, remainingEligible } }),
        })
        .eq('id', run.id);

      return json({
        ok: true,
        run_id: run.id,
        recovered,
        skipped,
        skip_reasons: skipReasons,
        remaining_eligible: remainingEligible,
        status: nextStatus,
      });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[pplp-recovery-run] error:', msg);
    return json({ error: msg }, 500);
  }
});
