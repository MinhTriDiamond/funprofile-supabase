// Initiate recovery: 4 method (primary/wallet_backup/guardian/governance)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) throw new Error('Unauthorized');
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);
    const { data: { user } } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: auth } } }
    ).auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { method, target_did_id, evidence = {} } = await req.json();
    const validMethods = ['primary', 'wallet_backup', 'guardian', 'governance'];
    if (!validMethods.includes(method)) throw new Error('Invalid method');
    if (!target_did_id) throw new Error('target_did_id required');

    // Verify ownership OR governance method allowed for L3+
    const { data: did } = await supabase.from('did_registry')
      .select('did_id, owner_user_id, did_level').eq('did_id', target_did_id).maybeSingle();
    if (!did) throw new Error('DID not found');

    const isOwner = did.owner_user_id === user.id;
    if (!isOwner && method !== 'governance') throw new Error('Not owner');
    if (method === 'governance' && !['L3', 'L4'].includes(did.did_level)) {
      throw new Error('Governance recovery only for L3+');
    }

    // Cooldown: 24h since last recovery
    const { data: last } = await supabase.from('identity_recovery_log')
      .select('created_at, cooldown_until').eq('did_id', target_did_id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (last?.cooldown_until && new Date(last.cooldown_until) > new Date()) {
      throw new Error(`Đang trong cooldown đến ${last.cooldown_until}`);
    }

    // Max 3 recovery / 30d
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { count } = await supabase.from('identity_recovery_log')
      .select('*', { count: 'exact', head: true })
      .eq('did_id', target_did_id).gte('created_at', since);
    if ((count ?? 0) >= 3) throw new Error('Vượt giới hạn 3 lần recovery / 30 ngày');

    const isMajor = method === 'guardian' || method === 'governance';
    const cooldown = new Date(Date.now() + 24 * 3600000).toISOString();
    const freezeUntil = isMajor ? new Date(Date.now() + 7 * 86400000).toISOString() : null;

    const { data: rec, error } = await supabase.from('identity_recovery_log').insert({
      did_id: target_did_id,
      method,
      status: method === 'primary' ? 'completed' : 'pending',
      cooldown_until: cooldown,
      freeze_mint_until: freezeUntil,
      metadata: { evidence, initiated_by: user.id, requires_attestations: method === 'guardian' ? 2 : method === 'governance' ? 3 : 0 },
    }).select().single();
    if (error) throw error;

    // Log identity_event with risk_delta
    await supabase.from('identity_events').insert({
      did_id: target_did_id,
      event_type: `recovery_initiated_${method}`,
      event_ref: rec.id,
      risk_delta: isMajor ? 0.1 : 0.05,
      tc_delta: 0,
      source: 'identity-recovery-initiate',
      metadata: { method },
    });

    // Notification cho owner
    try {
      await supabase.from('notifications').insert({
        user_id: did.owner_user_id,
        actor_id: user.id,
        type: 'recovery_initiated',
        read: false,
        metadata: {
          did_id: target_did_id,
          recovery_method: method,
          recovery_id: rec.id,
        },
      });
    } catch (e) {
      console.error('[recovery-initiate] notif insert failed:', e);
    }

    return new Response(JSON.stringify({ success: true, recovery_id: rec.id, status: rec.status, requires_attestations: rec.metadata.requires_attestations, cooldown_until: cooldown }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
