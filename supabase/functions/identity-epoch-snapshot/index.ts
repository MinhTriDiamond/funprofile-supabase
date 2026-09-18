// Daily epoch snapshot — DID level, TC, tier, sybil_risk, SBT count, DIB hash
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const epoch_id = new Date().toISOString().slice(0, 10);
    const { data: dids } = await supabase.from('did_registry').select('did_id, did_level, owner_user_id');
    let count = 0;
    for (const d of dids ?? []) {
      const { data: tp } = await supabase.from('trust_profile').select('*').eq('did_id', d.did_id).maybeSingle();
      const { count: sbtCount } = await supabase.from('sbt_registry')
        .select('*', { count: 'exact', head: true }).eq('did_id', d.did_id).eq('status', 'active');

      const dib_hash = await sha256(JSON.stringify({
        did: d.did_id, level: d.did_level, tc: tp?.tc, tier: tp?.trust_tier,
        sbt_count: sbtCount ?? 0, ts: epoch_id,
      }));

      await supabase.from('dib_profile').update({
        identity_vault_hash: await sha256(d.did_id + d.did_level),
        trust_vault_hash: await sha256(JSON.stringify(tp ?? {})),
        reputation_vault_hash: await sha256(d.did_id + (sbtCount ?? 0)),
        last_snapshot_at: new Date().toISOString(),
        snapshot_epoch: epoch_id,
      }).eq('did_id', d.did_id);

      await supabase.from('identity_epoch_snapshots').upsert({
        did_id: d.did_id, epoch_id,
        did_level: d.did_level,
        tc: tp?.tc ?? 0.5,
        trust_tier: tp?.trust_tier ?? 'T0',
        sybil_risk: tp?.sybil_risk ?? 'low',
        active_sbt_count: sbtCount ?? 0,
        dib_state_root_hash: dib_hash,
      }, { onConflict: 'did_id,epoch_id' });
      count++;
    }

    return new Response(JSON.stringify({ success: true, epoch_id, snapshots: count }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
