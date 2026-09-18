// Identity Trust Engine — TC = (0.30·VS + 0.25·BS + 0.15·SS + 0.20·OS + 0.10·HS) × RF
// Recalc cho 1 DID hoặc batch users có activity gần đây.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function tierFromTC(tc: number): string {
  if (tc >= 1.25) return 'T4';
  if (tc >= 1.00) return 'T3';
  if (tc >= 0.80) return 'T2';
  if (tc >= 0.60) return 'T1';
  return 'T0';
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

async function recalcOne(supabase: any, did_id: string, owner_user_id: string) {
  // Verification Strength — từ identity_links
  const { data: links } = await supabase
    .from('identity_links').select('link_type, verification_state').eq('did_id', did_id);
  const verifiedCount = (links ?? []).filter((l: any) => l.verification_state === 'verified').length;
  const VS = clamp(0.2 + verifiedCount * 0.2, 0.2, 1.0);

  // Behavior Stability — từ stability_index hoặc heuristic
  const { data: stab } = await supabase
    .from('pplp_v25_stability_index').select('stability_index, behavior_consistency')
    .eq('user_id', owner_user_id).order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
  const BS = clamp(Number(stab?.behavior_consistency ?? 0.6), 0.3, 1.0);

  // Social Trust — số attestation nhận được
  const { count: attCount } = await supabase
    .from('attestation_log').select('*', { count: 'exact', head: true })
    .eq('to_did', did_id).eq('status', 'active');
  const SS = clamp(0.2 + (attCount ?? 0) * 0.15, 0.2, 1.0);

  // On-chain Credibility — wallet linked + age
  const hasWallet = (links ?? []).some((l: any) => l.link_type === 'wallet' && l.verification_state === 'verified');
  const { data: prof } = await supabase.from('profiles').select('created_at').eq('id', owner_user_id).maybeSingle();
  const ageDays = prof?.created_at ? (Date.now() - new Date(prof.created_at).getTime()) / 86400000 : 0;
  const OS = clamp((hasWallet ? 0.5 : 0.2) + Math.min(ageDays / 365, 0.5), 0.2, 1.0);

  // Historical Cleanliness — không bị flag
  const { data: bannedProf } = await supabase.from('profiles').select('is_banned').eq('id', owner_user_id).maybeSingle();
  const HS = bannedProf?.is_banned ? 0.2 : clamp(0.5 + Math.min(ageDays / 180, 0.5), 0.2, 1.0);

  // Risk Factor — device flagged?
  const { data: device } = await supabase.from('pplp_device_registry')
    .select('is_flagged').eq('user_id', owner_user_id).limit(1).maybeSingle();
  const RF = device?.is_flagged ? 0.5 : 1.0;

  // Sybil risk
  let sybil = 'low';
  if (RF < 0.6) sybil = 'high';
  else if (verifiedCount === 0 && ageDays < 7) sybil = 'medium';

  // TC
  const tc = clamp((0.30 * VS + 0.25 * BS + 0.15 * SS + 0.20 * OS + 0.10 * HS) * RF, 0.30, 1.50);
  const tier = tierFromTC(tc);

  await supabase.from('trust_profile').upsert({
    did_id,
    tc: Number(tc.toFixed(3)),
    trust_tier: tier,
    verification_strength: Number(VS.toFixed(2)),
    behavior_stability: Number(BS.toFixed(2)),
    social_trust: Number(SS.toFixed(2)),
    onchain_credibility: Number(OS.toFixed(2)),
    historical_cleanliness: Number(HS.toFixed(2)),
    risk_factor: Number(RF.toFixed(2)),
    sybil_risk: sybil,
    fraud_risk: sybil,
    last_calculated_at: new Date().toISOString(),
  }, { onConflict: 'did_id' });

  return { did_id, tc, tier, sybil };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );
    const body = await req.json().catch(() => ({}));
    const { did_id, batch_limit = 100 } = body;

    const results: any[] = [];

    if (did_id) {
      const { data: did } = await supabase.from('did_registry')
        .select('did_id, owner_user_id').eq('did_id', did_id).maybeSingle();
      if (did) results.push(await recalcOne(supabase, did.did_id, did.owner_user_id));
    } else {
      const { data: dids } = await supabase.from('did_registry')
        .select('did_id, owner_user_id').limit(batch_limit);
      for (const d of dids ?? []) {
        try { results.push(await recalcOne(supabase, d.did_id, d.owner_user_id)); }
        catch (e: any) { results.push({ did_id: d.did_id, error: e.message }); }
      }
    }

    // Sau khi recalc TC, gọi auto-promote (fire-and-forget, không block response)
    try {
      const promoteUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/identity-did-auto-promote`;
      fetch(promoteUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
        },
        body: JSON.stringify(did_id ? { did_id } : { batch_limit: results.length }),
      }).catch(() => {});
    } catch { /* swallow */ }

    return new Response(JSON.stringify({ success: true, count: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
