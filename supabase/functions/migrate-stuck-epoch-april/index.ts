/**
 * Migrate Stuck Epoch T4 — One-time admin script
 * Chuyển 26 requests stuck (signed/failed) tháng 4/2026 sang flow vesting v1:
 *  - Tạo reward_vesting_schedule (15% instant + 85% locked)
 *  - Reset status về pending_sig
 *  - Tăng total_cap epoch T4 lên 20M
 *  - Log toàn bộ vào pplp_v2_event_log
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TARGET_MONTH = '2026-04';
const NEW_CAP = 20_000_000;
const INSTANT_PCT = 0.15;
const LOCKED_PCT = 0.85;
const VESTING_DAYS = 28;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    // Auth: admin only
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: roleData } = await supabase
      .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: 'Admin role required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false; // default true để an toàn

    // 1. Tìm epoch T4
    const { data: epoch } = await supabase
      .from('mint_epochs').select('*').eq('epoch_month', TARGET_MONTH).single();
    if (!epoch) {
      return new Response(JSON.stringify({ error: 'Epoch T4/2026 không tồn tại' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Tìm allocations T4
    const { data: allocations } = await supabase
      .from('mint_allocations').select('*').eq('epoch_id', epoch.id).eq('is_eligible', true);

    // 3. Tìm stuck mint_requests (signed/failed) tháng 4
    const startDate = `${TARGET_MONTH}-01T00:00:00Z`;
    const endDate = '2026-05-01T00:00:00Z';
    const { data: stuckRequests } = await supabase
      .from('pplp_mint_requests').select('*')
      .in('status', ['signed', 'failed'])
      .gte('created_at', startDate).lt('created_at', endDate);

    const summary = {
      epoch_id: epoch.id,
      epoch_month: TARGET_MONTH,
      current_total_cap: Number(epoch.total_cap),
      new_total_cap: NEW_CAP,
      eligible_allocations: allocations?.length || 0,
      stuck_requests: stuckRequests?.length || 0,
      dry_run: dryRun,
    };

    if (dryRun) {
      return new Response(JSON.stringify({
        success: true, mode: 'dry_run', summary,
        message: 'Gọi lại với { "dry_run": false } để execute.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === EXECUTE ===
    const releaseAt = new Date(Date.now() + VESTING_DAYS * 86400_000).toISOString();
    const nextUnlock = new Date(Date.now() + 7 * 86400_000).toISOString();

    // 4. Update epoch cap
    await supabase.from('mint_epochs').update({
      total_cap: NEW_CAP, soft_ceiling: NEW_CAP, updated_at: new Date().toISOString(),
    }).eq('id', epoch.id);

    // 5. Update allocations + create vesting schedules
    let vestingCreated = 0;
    for (const a of allocations || []) {
      const total = Number(a.allocation_amount_capped) || Number(a.allocation_amount);
      const instant = Math.floor(total * INSTANT_PCT);
      const locked = Math.floor(total * LOCKED_PCT);

      await supabase.from('mint_allocations').update({
        instant_amount: instant, locked_amount: locked, trust_band: 'standard',
      }).eq('id', a.id);

      // Check if vesting schedule already exists
      const { data: existing } = await supabase
        .from('reward_vesting_schedules').select('id').eq('allocation_id', a.id).maybeSingle();
      if (!existing) {
        await supabase.from('reward_vesting_schedules').insert({
          user_id: a.user_id,
          allocation_id: a.id,
          epoch_id: epoch.id,
          total_amount: total,
          instant_amount: instant,
          locked_amount: locked,
          released_amount: instant,
          remaining_locked: locked,
          release_at: releaseAt,
          next_unlock_check_at: nextUnlock,
          status: 'active',
          trust_band: 'standard',
        });
        vestingCreated++;
      }
    }

    // 6. Reset stuck requests về pending_sig (chờ ký lại với cap mới)
    let resetCount = 0;
    for (const r of stuckRequests || []) {
      await supabase.from('pplp_mint_requests').update({
        status: 'pending_sig',
        tx_hash: null,
        error_message: null,
        retry_count: 0,
      }).eq('id', r.id);
      resetCount++;
    }

    // 7. Audit log
    await supabase.from('pplp_v2_event_log').insert({
      event_type: 'epoch.t4.migration',
      actor_id: user.id,
      reference_table: 'mint_epochs',
      reference_id: epoch.id,
      payload: {
        ...summary,
        vesting_created: vestingCreated,
        requests_reset: resetCount,
        executed_at: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({
      success: true, mode: 'executed',
      summary: { ...summary, vesting_created: vestingCreated, requests_reset: resetCount },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[MIGRATE-T4] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
