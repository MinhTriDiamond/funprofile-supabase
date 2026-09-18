// DID Auto-Promotion — chấm cấp L0→L4 tự động dựa trên TC + SBT + tuổi tài khoản + sạch lịch sử
// Gọi từ identity-trust-engine sau mỗi lần recalc, hoặc batch độc lập.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Level = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

const LEVEL_RANK: Record<Level, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

/**
 * Quy tắc nâng cấp:
 * L0 (anonymous)  → mặc định khi tạo DID
 * L1 (basic)      → có email/phone verified
 * L2 (verified)   → L1 + wallet verified + TC ≥ 0.80 + sạch 7 ngày
 * L3 (trusted)    → L2 + TC ≥ 1.00 + ≥3 SBT active + tuổi ≥30 ngày + sybil_risk = low
 * L4 (core)       → L3 + TC ≥ 1.25 + ≥1 SBT category=legacy hoặc contribution + governance vote
 *                   (chỉ governance approve thủ công — auto chỉ đề xuất)
 */
async function evaluateLevel(supabase: any, did_id: string, owner_user_id: string): Promise<{ proposed: Level; reasons: string[] }> {
  const reasons: string[] = [];

  // Trust profile
  const { data: trust } = await supabase
    .from('trust_profile')
    .select('tc, sybil_risk, fraud_risk')
    .eq('did_id', did_id)
    .maybeSingle();
  const tc = Number(trust?.tc ?? 0.3);
  const sybil = trust?.sybil_risk ?? 'medium';

  // Identity links
  const { data: links } = await supabase
    .from('identity_links')
    .select('link_type, verification_state')
    .eq('did_id', did_id);
  const hasEmailVerified = (links ?? []).some((l: any) => l.link_type === 'social' && l.verification_state === 'verified')
    || (links ?? []).some((l: any) => l.link_type === 'email' && l.verification_state === 'verified');
  const hasWalletVerified = (links ?? []).some((l: any) => l.link_type === 'wallet' && l.verification_state === 'verified');

  // Profile (for email confirmation + age)
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, created_at, is_banned')
    .eq('id', owner_user_id)
    .maybeSingle();
  const ageDays = profile?.created_at ? (Date.now() - new Date(profile.created_at).getTime()) / 86400000 : 0;
  const hasEmail = !!profile?.email;
  const isBanned = !!profile?.is_banned;

  // SBT active count
  const { count: sbtCount } = await supabase
    .from('sbt_registry')
    .select('*', { count: 'exact', head: true })
    .eq('did_id', did_id)
    .eq('status', 'active');

  // SBT legacy/contribution
  const { data: highSbts } = await supabase
    .from('sbt_registry')
    .select('sbt_category')
    .eq('did_id', did_id)
    .eq('status', 'active')
    .in('sbt_category', ['legacy', 'contribution']);
  const hasHighSbt = (highSbts ?? []).length > 0;

  // Recent identity events (clean window)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { count: recentNegative } = await supabase
    .from('identity_events')
    .select('*', { count: 'exact', head: true })
    .eq('did_id', did_id)
    .lt('tc_delta', 0)
    .gte('created_at', sevenDaysAgo);

  let proposed: Level = 'L0';

  if (isBanned) {
    reasons.push('Tài khoản đang bị khóa');
    return { proposed: 'L0', reasons };
  }

  // L1
  if (hasEmail || hasEmailVerified) {
    proposed = 'L1';
    reasons.push('Có email');
  }

  // L2
  if (proposed === 'L1' && hasWalletVerified && tc >= 0.80 && (recentNegative ?? 0) === 0) {
    proposed = 'L2';
    reasons.push(`Wallet verified + TC ${tc.toFixed(2)} ≥ 0.80 + sạch 7 ngày`);
  }

  // L3
  if (proposed === 'L2' && tc >= 1.00 && (sbtCount ?? 0) >= 3 && ageDays >= 30 && sybil === 'low') {
    proposed = 'L3';
    reasons.push(`TC ${tc.toFixed(2)} ≥ 1.00 + ${sbtCount} SBT + ${Math.floor(ageDays)}d tuổi + sybil low`);
  }

  // L4 — chỉ proposed, không auto-promote
  if (proposed === 'L3' && tc >= 1.25 && hasHighSbt) {
    reasons.push(`Đủ điều kiện L4 (TC ${tc.toFixed(2)} + SBT cao cấp) — chờ governance duyệt`);
    // Không gán proposed = 'L4' tự động
  }

  return { proposed, reasons };
}

async function promoteOne(supabase: any, did_id: string, owner_user_id: string, dry_run: boolean) {
  const { data: did } = await supabase
    .from('did_registry')
    .select('did_level, status')
    .eq('did_id', did_id)
    .maybeSingle();
  if (!did) return { did_id, skipped: 'DID không tồn tại' };

  const current = did.did_level as Level;
  const { proposed, reasons } = await evaluateLevel(supabase, did_id, owner_user_id);

  const currentRank = LEVEL_RANK[current] ?? 0;
  const proposedRank = LEVEL_RANK[proposed] ?? 0;

  // Chỉ nâng, không hạ tự động (hạ phải qua admin)
  if (proposedRank <= currentRank) {
    return { did_id, current, proposed, action: 'no_change', reasons };
  }

  if (dry_run) {
    return { did_id, current, proposed, action: 'would_promote', reasons };
  }

  // Promote
  await supabase
    .from('did_registry')
    .update({ did_level: proposed, updated_at: new Date().toISOString() })
    .eq('did_id', did_id);

  // Log event
  await supabase.from('identity_events').insert({
    did_id,
    event_type: 'did_auto_promote',
    event_ref: `${current}_to_${proposed}`,
    tc_delta: 0,
    risk_delta: 0,
    source: 'identity-did-auto-promote',
    metadata: { from: current, to: proposed, reasons },
  });

  // Notification cho user
  try {
    await supabase.from('notifications').insert({
      user_id: owner_user_id,
      actor_id: owner_user_id,
      type: 'did_promoted',
      read: false,
      metadata: { did_id, from_level: current, to_level: proposed, reasons },
    });
  } catch (e) {
    console.error('[did-auto-promote] notif insert failed:', e);
  }

  return { did_id, current, proposed, action: 'promoted', reasons };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );
    const body = await req.json().catch(() => ({}));
    const { did_id, batch_limit = 100, dry_run = false } = body;

    const results: any[] = [];

    if (did_id) {
      const { data: did } = await supabase.from('did_registry')
        .select('did_id, owner_user_id').eq('did_id', did_id).maybeSingle();
      if (did) results.push(await promoteOne(supabase, did.did_id, did.owner_user_id, dry_run));
    } else {
      const { data: dids } = await supabase.from('did_registry')
        .select('did_id, owner_user_id')
        .order('updated_at', { ascending: true })
        .limit(batch_limit);
      for (const d of dids ?? []) {
        try { results.push(await promoteOne(supabase, d.did_id, d.owner_user_id, dry_run)); }
        catch (e: any) { results.push({ did_id: d.did_id, error: e.message }); }
      }
    }

    const promoted = results.filter((r) => r.action === 'promoted').length;
    return new Response(JSON.stringify({ success: true, count: results.length, promoted, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
