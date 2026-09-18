/**
 * PPLP Epoch Snapshot v2 — FUN Monetary Expansion v1
 * 
 * Công thức:
 *   TotalMint = BaseExpansion + ContributionExpansion + EcosystemExpansion
 *   AdjustedMint = TotalMint × DisciplineModulator
 *   FinalMint = clamp(MinMint, AdjustedMint, SoftCeiling)
 * 
 * Allocation: User 70% / Ecosystem 12% / Treasury 10% / Strategic 5% / Resilience 3%
 * UserSplit: 15% instant + 85% locked (vesting 28 ngày)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MIN_LIGHT_THRESHOLD = 10;
// Khớp CHECK constraint mint_allocations_min_amount_when_pending (B+ 30/04/2026):
// allocation_amount_capped phải = 0 HOẶC >= 100 khi status='pending'.
// Hạ từ 200 → 100 để vớt thêm user LS thấp khi pool tháng được mở rộng (50M+).
const MIN_ALLOC_AMOUNT = 100;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    // Auth: chấp nhận (a) service-role key, (b) cron-shared-secret, HOẶC (c) admin JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    const SERVICE_KEY = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const CRON_SECRET = Deno.env.get('CRON_SHARED_SECRET') ?? '';
    const cronHeader = req.headers.get('x-cron-secret') ?? '';

    const isService = token && token === SERVICE_KEY;
    const isCron = CRON_SECRET && cronHeader === CRON_SECRET;
    let adminUserId: string | null = null;

    if (!isService && !isCron) {
      if (!token) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: roleData } = await supabase
        .from('user_roles').select('role')
        .eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Admin role required' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      adminUserId = user.id;
    } else {
      console.log(`[EPOCH-SNAPSHOT] ${isService ? 'service-role' : 'cron-secret'} invocation`);
    }

    const body = await req.json().catch(() => ({}));
    const epochMonth = body.epoch_month || new Date().toISOString().slice(0, 7);

    // === Load epoch_config ===
    const { data: cfg } = await supabase
      .from('epoch_config').select('*')
      .eq('config_key', 'default').eq('is_active', true).single();
    if (!cfg) throw new Error('No active epoch_config found');

    const SOFT_CEILING = Number(cfg.soft_ceiling) || 50_000_000;
    const MIN_MINT = Number(cfg.min_epoch_mint) || 50_000_000;
    console.log(`[EPOCH-SNAPSHOT v2] Stage=${cfg.system_stage}, ceiling=${SOFT_CEILING}, month=${epochMonth}`);

    const [year, month] = epochMonth.split('-').map(Number);
    const startDate = `${epochMonth}-01T00:00:00Z`;
    const endDate = new Date(year, month, 1).toISOString();

    // === Aggregate v1 + v2 light scores ===
    const v1Scores = new Map<string, number>();
    const v2Scores = new Map<string, number>();
    const pageSize = 1000;

    // v1 light_actions
    let page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('light_actions').select('user_id, light_score')
        .eq('is_eligible', true).eq('mint_status', 'approved')
        .gte('created_at', startDate).lt('created_at', endDate)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const r of data) v1Scores.set(r.user_id, (v1Scores.get(r.user_id) || 0) + (r.light_score || 0));
      if (data.length < pageSize) break;
      page++;
    }

    // v2 validations
    page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('pplp_v2_validations')
        .select('final_light_score, created_at, pplp_v2_user_actions!inner(user_id)')
        .eq('validation_status', 'validated')
        .gte('created_at', startDate).lt('created_at', endDate)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) { console.warn('v2 query error:', error.message); break; }
      if (!data || data.length === 0) break;
      for (const r of data) {
        const uid = (r as any).pplp_v2_user_actions?.user_id;
        if (uid) v2Scores.set(uid, (v2Scores.get(uid) || 0) + (r.final_light_score || 0));
      }
      if (data.length < pageSize) break;
      page++;
    }

    const allUserIds = new Set([...v1Scores.keys(), ...v2Scores.keys()]);
    let allScores = Array.from(allUserIds).map(uid => ({
      user_id: uid,
      total_light: (v1Scores.get(uid) || 0) + (v2Scores.get(uid) || 0),
      v1: v1Scores.get(uid) || 0,
      v2: v2Scores.get(uid) || 0,
    }));

    // Filter banned users
    let bannedScores: typeof allScores = [];
    if (allScores.length > 0) {
      const ids = allScores.map(s => s.user_id);
      const banned = new Set<string>();
      for (let i = 0; i < ids.length; i += 500) {
        const batch = ids.slice(i, i + 500);
        const { data } = await supabase.from('profiles').select('id').in('id', batch).eq('is_banned', true);
        if (data) for (const b of data) banned.add(b.id);
      }
      if (banned.size > 0) {
        bannedScores = allScores.filter(s => banned.has(s.user_id));
        allScores = allScores.filter(s => !banned.has(s.user_id));
      }
    }

    // === AGGREGATION COMPLETENESS GUARD (sự cố T4/2026: snapshot chạy sớm thiếu 268/670 user) ===
    // Trước khi tin tưởng allScores, kiểm tra xem light_actions đã ổn định chưa:
    //  1. Đếm pending light_actions trong epoch month — nếu còn > 50 row pending → abort
    //  2. Đếm distinct user_id trong light_actions tháng (bất kể status) — so với
    //     allUserIds đã aggregate. Nếu thiếu > 5% và > 20 user → abort.
    // Admin có thể bypass bằng body.force_snapshot = true (log warning vào audit).
    // B3-05 (3.3): force_snapshot CHỈ dành cho admin JWT. Cron/service-role KHÔNG được bypass
    // để tránh guard bị vô hiệu hoá âm thầm bởi lịch chạy tự động.
    const forceRequested = body.force_snapshot === true;
    if (forceRequested && !adminUserId) {
      return new Response(JSON.stringify({
        error: 'FORCE_SNAPSHOT_ADMIN_ONLY',
        message: 'Chỉ admin (đăng nhập) được phép bypass guard bằng force_snapshot. Cron/service-role không được dùng.',
      }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const forceSnapshot = forceRequested && !!adminUserId;
    const guardReport: Record<string, unknown> = {
      force_snapshot: forceSnapshot,
      forced_by: adminUserId,
    };
    let guardBypassed = false;
    {
      const { count: pendingCount } = await supabase
        .from('light_actions')
        .select('id', { count: 'exact', head: true })
        .eq('mint_status', 'pending')
        .gte('created_at', startDate).lt('created_at', endDate);
      guardReport.pending_actions = pendingCount ?? 0;

      // Distinct users có ít nhất 1 light_action eligible+approved trong tháng
      // (chỉ truy vấn qua RPC nếu sẵn có, fallback sang full scan với limit lớn)
      let distinctUserIds = new Set<string>();
      let p2 = 0;
      while (true) {
        const { data, error } = await supabase
          .from('light_actions').select('user_id')
          .eq('is_eligible', true).eq('mint_status', 'approved')
          .gte('created_at', startDate).lt('created_at', endDate)
          .range(p2 * pageSize, (p2 + 1) * pageSize - 1);
        if (error || !data || data.length === 0) break;
        for (const r of data) distinctUserIds.add(r.user_id);
        if (data.length < pageSize) break;
        p2++;
      }
      const distinctCount = distinctUserIds.size;
      const aggregatedCount = allUserIds.size;
      const missingFromAggregation = [...distinctUserIds].filter(uid => !allUserIds.has(uid)).length;
      const missingPct = distinctCount > 0 ? missingFromAggregation / distinctCount : 0;
      guardReport.distinct_users_in_actions = distinctCount;
      guardReport.aggregated_users = aggregatedCount;
      guardReport.missing_from_aggregation = missingFromAggregation;
      guardReport.missing_pct = Math.round(missingPct * 10000) / 100;

      const pendingTooHigh = (pendingCount ?? 0) > 50;
      const aggregationIncomplete = missingFromAggregation > 20 && missingPct > 0.05;

      if ((pendingTooHigh || aggregationIncomplete) && forceSnapshot) {
        guardBypassed = true;
        guardReport.bypass_reason = pendingTooHigh ? 'pending_actions_too_high' : 'aggregation_incomplete';
        console.warn('[GUARD] BYPASSED by admin', adminUserId, guardReport);
        await supabase.from('pplp_v2_event_log').insert({
          event_type: 'epoch.snapshot.guard_bypassed',
          reference_table: 'mint_epochs',
          payload: { epoch_month: epochMonth, guard: guardReport, admin_user_id: adminUserId },
        }).then(() => {}, () => {});
      }

      if ((pendingTooHigh || aggregationIncomplete) && !forceSnapshot) {
        // Audit + abort
        await supabase.from('pplp_v2_event_log').insert({
          event_type: 'epoch.snapshot.aborted_by_guard',
          reference_table: 'mint_epochs',
          payload: { epoch_month: epochMonth, guard: guardReport, reason: pendingTooHigh ? 'pending_actions_too_high' : 'aggregation_incomplete' },
        }).then(() => {}, () => {});
        return new Response(JSON.stringify({
          success: false,
          error: 'AGGREGATION_GUARD_BLOCKED',
          message: 'Light actions chưa aggregate xong hoặc còn nhiều pending. Chờ pplp-batch-processor chạy hết hoặc gọi lại với { "force_snapshot": true } để bypass.',
          guard: guardReport,
        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      console.log('[GUARD] aggregation completeness OK:', guardReport);
    }

    const eligibleUsers = allScores.filter(u => u.total_light >= MIN_LIGHT_THRESHOLD);
    const ineligibleUsers = allScores.filter(u => u.total_light < MIN_LIGHT_THRESHOLD);
    const totalLight = eligibleUsers.reduce((s, u) => s + u.total_light, 0);

    // === Monetary Formula v1 ===
    // 1. BaseExpansion = base_rate × stage_factor (Stage 1 = 1.0, Stage 2 = 0.7, Stage 3 = 0.5)
    const stageFactor = cfg.system_stage === 'mature' ? 0.5 : cfg.system_stage === 'growth' ? 0.7 : 1.0;
    const baseExpansion = Number(cfg.base_rate) * stageFactor;

    // 2. ContributionExpansion = α·log(1+VLS) + β·sqrt(1+VCV) + γ·ServiceImpact
    const verifiedLightScore = totalLight;
    const verifiedContributionValue = totalLight * 1.2; // proxy
    const serviceImpactScore = eligibleUsers.length * 50; // proxy: 50 pts per active user
    const contributionExpansion =
      Number(cfg.alpha) * Math.log(1 + verifiedLightScore) +
      Number(cfg.beta) * Math.sqrt(1 + verifiedContributionValue) +
      Number(cfg.gamma) * Math.log(1 + serviceImpactScore);

    // 3. EcosystemExpansion = δ·UsageIndex + ε·ActiveQualityUsers + ζ·UtilityDiversity
    const ecosystemUsageIndex = Math.log(1 + eligibleUsers.length * 10);
    const activeQualityUsers = eligibleUsers.length;
    const utilityDiversityIndex = Math.min(6, eligibleUsers.length / 50); // platforms in use
    const ecosystemExpansion =
      Number(cfg.delta) * ecosystemUsageIndex +
      Number(cfg.epsilon) * Math.sqrt(activeQualityUsers) +
      Number(cfg.zeta) * utilityDiversityIndex;

    const totalMint = baseExpansion + contributionExpansion + ecosystemExpansion;

    // 4. DisciplineModulator (1.0 default; can be tuned by previous epoch health)
    const { data: lastHealth } = await supabase
      .from('inflation_health_metrics').select('*')
      .order('measured_at', { ascending: false }).limit(1).maybeSingle();
    let modulator = 1.0;
    if (lastHealth) {
      const fraud = Number(lastHealth.fraud_pressure_ratio) || 0;
      const utility = Number(lastHealth.utility_absorption_ratio) || 1;
      modulator = Math.max(
        Number(cfg.modulator_min),
        Math.min(Number(cfg.modulator_max), 1.0 - fraud * 0.5 + (utility - 1) * 0.2)
      );
    }
    const adjustedMint = totalMint * modulator;
    const finalMint = Math.max(MIN_MINT, Math.min(SOFT_CEILING, adjustedMint));

    console.log(`[MONETARY] base=${baseExpansion.toFixed(0)} contrib=${contributionExpansion.toFixed(0)} eco=${ecosystemExpansion.toFixed(0)} mod=${modulator.toFixed(3)} final=${finalMint.toFixed(0)}`);

    if (totalLight === 0 || eligibleUsers.length === 0) {
      return new Response(JSON.stringify({
        success: false, error: 'No eligible users',
        stats: { total_users: allScores.length, eligible: 0 },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // === 5-bucket Allocation ===
    const userPool = finalMint * Number(cfg.user_pool_pct);
    const ecosystemPool = finalMint * Number(cfg.ecosystem_pool_pct);
    const treasuryPool = finalMint * Number(cfg.treasury_pool_pct);
    const strategicPool = finalMint * Number(cfg.strategic_pool_pct);
    const resiliencePool = finalMint * Number(cfg.resilience_pool_pct);
    const maxSharePerUser = Number((cfg as any).max_share_per_user ?? 0.03) || 0.03;
    const capAmount = Math.floor(userPool * maxSharePerUser);

    // === User allocations: PPLP v2.5 — RawLS × TierMultiplier × Consistency ===
    // Phương án A: thay total_light_score bằng raw_light_score v2.5
    // Fallback về total_light cũ nếu user chưa có v2.5 data
    const eligibleIds = eligibleUsers.map(u => u.user_id);
    const v25Map = new Map<string, { raw_ls: number; consistency: number; tier_mult: number }>();

    if (eligibleIds.length > 0) {
      // Pull v2.5 light scores
      for (let i = 0; i < eligibleIds.length; i += 500) {
        const batch = eligibleIds.slice(i, i + 500);
        const { data: lsData } = await supabase
          .from('pplp_v25_light_scores')
          .select('user_id, raw_ls, consistency_multiplier')
          .in('user_id', batch)
          .eq('is_current', true);
        for (const r of lsData ?? []) {
          v25Map.set(r.user_id, {
            raw_ls: Number(r.raw_ls ?? 0),
            consistency: Number(r.consistency_multiplier ?? 1.0),
            tier_mult: 1.0,
          });
        }
        // Pull tier multipliers
        const { data: tierData } = await supabase
          .from('pplp_v25_tier_assignments')
          .select('user_id, tier_multiplier')
          .in('user_id', batch)
          .eq('is_current', true);
        for (const r of tierData ?? []) {
          const cur = v25Map.get(r.user_id) ?? { raw_ls: 0, consistency: 1.0, tier_mult: 1.0 };
          cur.tier_mult = Number(r.tier_multiplier ?? 1.0);
          v25Map.set(r.user_id, cur);
        }
      }
    }

    const allocations = eligibleUsers.map(u => {
      const v25 = v25Map.get(u.user_id);
      // Phương án A: thay hoàn toàn total_light bằng raw_ls khi có
      const baseScore = v25?.raw_ls ?? u.total_light;
      const tierMult = v25?.tier_mult ?? 1.0;
      const consistency = v25?.consistency ?? 1.0;
      const weighted = baseScore * tierMult * consistency;
      return { ...u, weighted, v25_raw_ls: v25?.raw_ls ?? 0, v25_tier_mult: tierMult };
    });

    console.log(`[V2.5] ${v25Map.size}/${eligibleUsers.length} users have v2.5 RawLS data`);
    const sumWeighted = allocations.reduce((s, a) => s + a.weighted, 0);
    const finalAllocs = allocations.map(a => {
      const userMint = (a.weighted / sumWeighted) * userPool;
      const cappedMint = Math.min(Math.floor(userMint), capAmount);
      const instant = Math.floor(cappedMint * Number(cfg.instant_portion_pct));
      const locked = cappedMint - instant;
      return {
        user_id: a.user_id,
        light_score_total: a.total_light,
        share_percent: (a.weighted / sumWeighted) * 100,
        allocation_amount: userMint,
        allocation_amount_capped: cappedMint,
        instant_amount: instant,
        locked_amount: locked,
        v2_contribution: a.v2,
        was_capped: userMint > capAmount,
      };
    });

    // === Upsert epoch ===
    const allocationBreakdown = {
      user_pool: userPool,
      ecosystem_pool: ecosystemPool,
      treasury_pool: treasuryPool,
      strategic_pool: strategicPool,
      resilience_pool: resiliencePool,
      max_share_per_user: maxSharePerUser,
      cap_amount: capAmount,
      rule_basis: 'userRewardPool',
    };

    let epochId: string;
    let { data: existing } = await supabase
      .from('mint_epochs').select('id, status, snapshot_at').eq('epoch_month', epochMonth).maybeSingle();

    // Recover leftover "daily open" row created by identity-epoch-snapshot-daily on the 1st
    // (epoch_month NULL, mint_pool=100000). This row blocks INSERT via unique(epoch_date).
    if (!existing) {
      const epochStartDate = `${epochMonth}-01`;
      const { data: orphan } = await supabase
        .from('mint_epochs').select('id, status, snapshot_at, epoch_month, mint_pool')
        .eq('epoch_date', epochStartDate).maybeSingle();
      if (orphan && !orphan.epoch_month) {
        console.warn(`[EPOCH-SNAPSHOT] adopting orphan daily row id=${orphan.id} for ${epochMonth}`);
        await supabase.from('mint_epochs').update({ epoch_month: epochMonth }).eq('id', orphan.id);
        existing = orphan as any;
      }
    }

    const isReSnapshot = !!existing;
    const snapshotIteration = isReSnapshot ? 2 : 1; // dùng để log
    console.log(`[EPOCH-SNAPSHOT] ${isReSnapshot ? 're-snapshot (delta-merge)' : 'first snapshot'} for ${epochMonth}`);

    const epochData = {
      mint_pool: finalMint,
      total_light_score: totalLight,
      eligible_users: eligibleUsers.length,
      status: 'snapshot',
      rules_version: 'MonetaryV1+AntiWhale3pct-userPool35M',
      snapshot_at: new Date().toISOString(),
      total_actions: allScores.length,
      unique_users: allScores.length,
      total_cap: finalMint,
      base_expansion: baseExpansion,
      contribution_expansion: contributionExpansion,
      ecosystem_expansion: ecosystemExpansion,
      discipline_modulator: modulator,
      final_mint: finalMint,
      system_stage: cfg.system_stage,
      soft_ceiling: SOFT_CEILING,
      verified_light_score: verifiedLightScore,
      verified_contribution_value: verifiedContributionValue,
      ecosystem_usage_index: ecosystemUsageIndex,
      active_quality_users: activeQualityUsers,
      allocation_breakdown: allocationBreakdown,
      guard_bypassed: guardBypassed,
      guard_report: guardReport,
      guard_bypassed_by: guardBypassed ? adminUserId : null,
      guard_bypassed_at: guardBypassed ? new Date().toISOString() : null,
    };

    // Snapshot allocations CŨ trước khi xoá để tính delta cho vesting + treasury
    const prevAllocByUser = new Map<string, { allocation_amount: number; instant_amount: number; locked_amount: number; id: string }>();
    let prevTreasuryByVault = new Map<string, number>();

    if (isReSnapshot) {
      if (existing!.status === 'finalized') {
        return new Response(JSON.stringify({ error: 'Epoch already finalized' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      epochId = existing!.id;

      // Lưu allocations cũ để tính delta
      const { data: prevAllocs } = await supabase
        .from('mint_allocations')
        .select('id, user_id, allocation_amount, instant_amount, locked_amount')
        .eq('epoch_id', epochId).eq('is_eligible', true);
      for (const a of prevAllocs ?? []) {
        prevAllocByUser.set(a.user_id, {
          id: a.id,
          allocation_amount: Number(a.allocation_amount) || 0,
          instant_amount: Number(a.instant_amount) || 0,
          locked_amount: Number(a.locked_amount) || 0,
        });
      }

      // Lưu treasury_flows cũ đã credit cho epoch này
      const { data: prevFlows } = await supabase
        .from('treasury_flows').select('destination_vault, amount')
        .eq('reference_id', epochId).eq('source', 'epoch_snapshot');
      for (const f of prevFlows ?? []) {
        prevTreasuryByVault.set(
          f.destination_vault,
          (prevTreasuryByVault.get(f.destination_vault) || 0) + Number(f.amount),
        );
      }

      // Xoá allocations cũ và epoch_metrics cũ (sẽ tạo lại snapshot mới)
      await supabase.from('mint_allocations').delete().eq('epoch_id', epochId);
      await supabase.from('epoch_metrics').delete().eq('epoch_id', epochId);
      const { error: updErr } = await supabase
        .from('mint_epochs')
        .update({ ...epochData, updated_at: new Date().toISOString() })
        .eq('id', epochId);
      if (updErr) {
        console.error('[EPOCH-SNAPSHOT] FAILED to update mint_epochs:', updErr);
        throw new Error(`Update mint_epochs failed: ${updErr.message}`);
      }
      console.log(`[EPOCH-SNAPSHOT] mint_epochs updated id=${epochId} status=snapshot eligible=${eligibleUsers.length}`);
    } else {
      const { data: newEp, error } = await supabase.from('mint_epochs').insert({
        epoch_date: `${epochMonth}-01`, epoch_month: epochMonth, total_minted: 0, ...epochData,
      }).select('id').single();
      if (error) throw error;
      epochId = newEp.id;
    }

    // === Insert allocations + vesting schedules ===
    // Tách user "dust" (suất < MIN_ALLOC_AMOUNT) thành ineligibleRows để pass CHECK constraint
    const dustAllocs = finalAllocs.filter(a => Math.floor(a.allocation_amount) < MIN_ALLOC_AMOUNT);
    const realAllocs = finalAllocs.filter(a => Math.floor(a.allocation_amount) >= MIN_ALLOC_AMOUNT);

    const allocRows = realAllocs.map(a => ({
      epoch_id: epochId,
      user_id: a.user_id,
      light_score_total: Math.round(a.light_score_total * 100) / 100,
      share_percent: Math.round(a.share_percent * 10000) / 10000,
      allocation_amount: Math.round(a.allocation_amount * 100) / 100,
      allocation_amount_capped: a.allocation_amount_capped,
      instant_amount: a.instant_amount,
      locked_amount: a.locked_amount,
      trust_band: 'standard',
      is_eligible: true,
      reason_codes: a.was_capped
        ? ['EPOCH_ELIGIBLE', 'MONETARY_V1', 'capped_at_3pct', `cap_amount=${capAmount}`, 'userRewardPool_share>3pct']
        : a.v2_contribution > 0
          ? ['EPOCH_ELIGIBLE', 'V2_PARTICIPANT', 'MONETARY_V1']
          : ['EPOCH_ELIGIBLE', 'MONETARY_V1'],
      status: 'pending',
    }));

    const dustRows = dustAllocs.map(a => ({
      epoch_id: epochId, user_id: a.user_id,
      light_score_total: Math.round(a.light_score_total * 100) / 100,
      share_percent: 0, allocation_amount: 0, allocation_amount_capped: 0,
      instant_amount: 0, locked_amount: 0,
      is_eligible: false, reason_codes: ['BELOW_DUST_THRESHOLD'], status: 'pending',
    }));

    const ineligibleRows = ineligibleUsers.map(u => ({
      epoch_id: epochId, user_id: u.user_id,
      light_score_total: Math.round(u.total_light * 100) / 100,
      share_percent: 0, allocation_amount: 0, allocation_amount_capped: 0,
      instant_amount: 0, locked_amount: 0,
      is_eligible: false, reason_codes: ['BELOW_MIN_LIGHT_THRESHOLD'], status: 'pending',
    }));
    const bannedRows = bannedScores.map(u => ({
      epoch_id: epochId, user_id: u.user_id,
      light_score_total: Math.round(u.total_light * 100) / 100,
      share_percent: 0, allocation_amount: 0, allocation_amount_capped: 0,
      instant_amount: 0, locked_amount: 0,
      is_eligible: false, reason_codes: ['FRAUD_BANNED'], status: 'pending',
    }));

    console.log(`[ALLOC] real=${allocRows.length} dust=${dustRows.length} below_min=${ineligibleRows.length} banned=${bannedRows.length}`);

    const allRows = [...allocRows, ...dustRows, ...ineligibleRows, ...bannedRows];
    for (let i = 0; i < allRows.length; i += 500) {
      const { error } = await supabase.from('mint_allocations').insert(allRows.slice(i, i + 500));
      if (error) throw error;
    }

    // === Vesting schedules — DELTA-MERGE để idempotent ===
    // Lần đầu: tạo mới với 15% instant, 85% locked, release sau base_vesting_days.
    // Re-snapshot: với mỗi user
    //   - Nếu đã có vesting cũ: cộng phần TĂNG (delta) vào locked + total + remaining_locked,
    //     giữ nguyên released_amount đã release để tránh double-pay.
    //   - Nếu user mới (T4 phase 2): tạo vesting mới như thường.
    const releaseAt = new Date(Date.now() + Number(cfg.base_vesting_days) * 86400_000);
    const nextUnlock = new Date(Date.now() + Number(cfg.unlock_check_interval_days) * 86400_000);

    const { data: insertedAllocs } = await supabase
      .from('mint_allocations').select('id, user_id, instant_amount, locked_amount')
      .eq('epoch_id', epochId).eq('is_eligible', true);

    let vestingCreated = 0;
    let vestingUpdated = 0;
    let vestingSkipped = 0;

    if (insertedAllocs) {
      const { data: existingVestings } = await supabase
        .from('reward_vesting_schedules')
        .select('id, user_id, total_amount, instant_amount, locked_amount, released_amount, remaining_locked, status')
        .eq('epoch_id', epochId);
      const vestingByUser = new Map<string, any>();
      for (const v of existingVestings ?? []) vestingByUser.set(v.user_id, v);

      const newVestingRows: any[] = [];

      for (const a of insertedAllocs) {
        const newInstant = Number(a.instant_amount);
        const newLocked = Number(a.locked_amount);
        const newTotal = newInstant + newLocked;
        const existingV = vestingByUser.get(a.user_id);

        if (!existingV) {
          newVestingRows.push({
            user_id: a.user_id,
            allocation_id: a.id,
            epoch_id: epochId,
            total_amount: newTotal,
            instant_amount: newInstant,
            locked_amount: newLocked,
            released_amount: newInstant,
            remaining_locked: newLocked,
            release_at: releaseAt.toISOString(),
            next_unlock_check_at: nextUnlock.toISOString(),
            status: 'active',
            trust_band: 'standard',
          });
          vestingCreated++;
        } else if (existingV.status === 'completed' || existingV.status === 'cancelled') {
          vestingSkipped++;
        } else {
          const deltaLocked = Math.max(0, newLocked - Number(existingV.locked_amount));
          const deltaInstant = Math.max(0, newInstant - Number(existingV.instant_amount));
          const deltaTotal = deltaLocked + deltaInstant;

          if (deltaTotal > 0) {
            await supabase.from('reward_vesting_schedules').update({
              allocation_id: a.id,
              total_amount: Number(existingV.total_amount) + deltaTotal,
              instant_amount: Number(existingV.instant_amount) + deltaInstant,
              locked_amount: Number(existingV.locked_amount) + deltaLocked,
              released_amount: Number(existingV.released_amount) + deltaInstant,
              remaining_locked: Number(existingV.remaining_locked) + deltaLocked,
              status: 'active',
              updated_at: new Date().toISOString(),
            }).eq('id', existingV.id);
            vestingUpdated++;
          } else {
            // Allocation mới ≤ cũ → chỉ cập nhật allocation_id link, không động số
            await supabase.from('reward_vesting_schedules').update({
              allocation_id: a.id, updated_at: new Date().toISOString(),
            }).eq('id', existingV.id);
            vestingSkipped++;
          }
        }
      }

      for (let i = 0; i < newVestingRows.length; i += 500) {
        await supabase.from('reward_vesting_schedules').insert(newVestingRows.slice(i, i + 500));
      }
    }

    console.log(`[VESTING] created=${vestingCreated} updated=${vestingUpdated} skipped=${vestingSkipped}`);

    // === epoch_metrics: insert mới (đã xoá ở trên nếu re-snapshot) ===
    await supabase.from('epoch_metrics').insert({
      epoch_id: epochId,
      epoch_label: epochMonth,
      verified_light_score: verifiedLightScore,
      verified_contribution_value: verifiedContributionValue,
      service_impact_score: serviceImpactScore,
      ecosystem_usage_index: ecosystemUsageIndex,
      active_quality_users: activeQualityUsers,
      utility_diversity_index: utilityDiversityIndex,
      raw_total_mint: totalMint,
      adjusted_mint: adjustedMint,
      final_mint: finalMint,
    });

    // === Treasury vault credits — DELTA-MERGE ===
    const treasuryFlows = [
      { vault: 'reward_reserve', amount: ecosystemPool + resiliencePool },
      { vault: 'infrastructure', amount: treasuryPool * 0.4 },
      { vault: 'community_growth', amount: treasuryPool * 0.3 },
      { vault: 'stability', amount: treasuryPool * 0.3 },
      { vault: 'strategic_expansion', amount: strategicPool },
    ];
    for (const f of treasuryFlows) {
      const newAmount = Math.floor(f.amount);
      const prevAmount = prevTreasuryByVault.get(f.vault) || 0;
      const delta = newAmount - prevAmount;
      if (delta > 0) {
        await supabase.from('treasury_flows').insert({
          flow_type: 'epoch_allocation', source: 'epoch_snapshot',
          destination_vault: f.vault, amount: delta,
          reason: `Epoch ${epochMonth} allocation${isReSnapshot ? ' (delta)' : ''}`,
          reference_table: 'mint_epochs', reference_id: epochId,
        });
        const { data: v } = await supabase.from('treasury_vaults').select('balance, total_inflow').eq('vault_key', f.vault).single();
        if (v) {
          await supabase.from('treasury_vaults').update({
            balance: Number(v.balance) + delta,
            total_inflow: Number(v.total_inflow) + delta,
          }).eq('vault_key', f.vault);
        }
      } else if (delta < 0 && isReSnapshot) {
        console.log(`[TREASURY] ${f.vault} new=${newAmount} prev=${prevAmount} delta=${delta} → skip (no reverse)`);
      }
    }

    return new Response(JSON.stringify({
      success: true, epoch_id: epochId, epoch_month: epochMonth,
      mode: isReSnapshot ? 're-snapshot (delta-merge)' : 'first snapshot',
      monetary: {
        base_expansion: Math.round(baseExpansion),
        contribution_expansion: Math.round(contributionExpansion),
        ecosystem_expansion: Math.round(ecosystemExpansion),
        total_mint: Math.round(totalMint),
        modulator,
        final_mint: Math.round(finalMint),
      },
      allocation: {
        user_pool: Math.round(userPool),
        ecosystem_pool: Math.round(ecosystemPool),
        treasury_pool: Math.round(treasuryPool),
        strategic_pool: Math.round(strategicPool),
        resilience_pool: Math.round(resiliencePool),
      },
      stats: {
        total_users: allScores.length,
        eligible_users: eligibleUsers.length,
        instant_total: Math.round(finalAllocs.reduce((s, a) => s + a.instant_amount, 0)),
        locked_total: Math.round(finalAllocs.reduce((s, a) => s + a.locked_amount, 0)),
      },
      vesting: {
        created: vestingCreated,
        updated: vestingUpdated,
        skipped: vestingSkipped,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('[EPOCH-SNAPSHOT v2] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
