// Guardian/governance attest a pending recovery
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

    const { recovery_id, decision } = await req.json();
    if (!recovery_id || !['approve', 'deny'].includes(decision)) throw new Error('Invalid input');

    const { data: rec } = await supabase.from('identity_recovery_log')
      .select('*').eq('id', recovery_id).maybeSingle();
    if (!rec) throw new Error('Recovery not found');
    if (rec.status !== 'pending') throw new Error('Already resolved');

    // Verify attestor is active guardian (for guardian method) or admin (for governance)
    const attestorDid = (await supabase.from('did_registry')
      .select('did_id').eq('owner_user_id', user.id).maybeSingle()).data?.did_id;
    if (!attestorDid) throw new Error('Attestor has no DID');

    const method = rec.method;
    if (method === 'guardian') {
      const { data: g } = await supabase.from('identity_guardians')
        .select('id').eq('did_id', rec.did_id).eq('guardian_did_id', attestorDid).eq('status', 'active').maybeSingle();
      if (!g) throw new Error('Bạn không phải guardian active của tài khoản này');
    } else if (method === 'governance') {
      const { data: roles } = await supabase.from('user_roles')
        .select('role').eq('user_id', user.id).eq('role', 'admin');
      if (!roles || roles.length === 0) throw new Error('Cần role admin');
    }

    // Tăng đếm attestation
    const meta = rec.metadata as any;
    const attestations = (meta?.attestations ?? []) as Array<{ did: string; decision: string; at: string }>;
    if (attestations.find((a) => a.did === attestorDid)) throw new Error('Bạn đã attest rồi');
    attestations.push({ did: attestorDid, decision, at: new Date().toISOString() });
    const required = meta?.requires_attestations ?? 2;
    const approved = attestations.filter((a) => a.decision === 'approve').length;
    const denied = attestations.filter((a) => a.decision === 'deny').length;

    let newStatus = 'pending';
    if (approved >= required) newStatus = 'completed';
    else if (denied > attestations.length / 2) newStatus = 'denied';

    await supabase.from('identity_recovery_log').update({
      status: newStatus,
      metadata: { ...meta, attestations },
    }).eq('id', recovery_id);

    if (newStatus === 'completed') {
      await supabase.from('identity_events').insert({
        did_id: rec.did_id,
        event_type: 'recovery_completed',
        event_ref: recovery_id,
        risk_delta: 0,
        tc_delta: 0,
        source: 'identity-recovery-attest',
        metadata: { method, attestations },
      });
    }

    return new Response(JSON.stringify({ success: true, status: newStatus, approved, required }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
