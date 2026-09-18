import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Chống gửi trùng cùng cặp (from,to,type) trong N giờ
const DUP_WINDOW_HOURS = 24;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return j({ error: 'auth required' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return j({ error: 'unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const { from_did, to_did, attestation_type, weight = 0.5, evidence_ref } = await req.json();
    if (!from_did || !to_did || !attestation_type) return j({ error: 'missing fields' }, 400);
    if (from_did === to_did) return j({ error: 'cannot attest yourself' }, 400);

    // Verify from_did belongs to caller
    const { data: ownerDid } = await supabase.from('did_registry')
      .select('did_id').eq('owner_user_id', user.id).maybeSingle();
    if (!ownerDid || ownerDid.did_id !== from_did) return j({ error: 'from_did mismatch' }, 403);

    // Idempotency: nếu trong DUP_WINDOW_HOURS đã có attestation cùng cặp+type → trả về bản cũ
    const since = new Date(Date.now() - DUP_WINDOW_HOURS * 3600 * 1000).toISOString();
    const { data: existing } = await supabase.from('attestation_log')
      .select('*')
      .eq('from_did', from_did).eq('to_did', to_did)
      .eq('attestation_type', attestation_type)
      .eq('status', 'active')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    if (existing) {
      return j({ success: true, attestation: existing, already_exists: true });
    }

    const { data, error } = await supabase.from('attestation_log').insert({
      from_did, to_did, attestation_type,
      weight: Math.max(0, Math.min(1, Number(weight))),
      evidence_ref,
    }).select().single();
    if (error) throw error;

    await supabase.from('identity_events').insert({
      did_id: to_did, event_type: 'attestation_received',
      event_ref: data.id, tc_delta: 0.02, source: from_did,
      metadata: { attestation_type },
    });

    // Resolve owner of to_did để gửi notification
    const { data: toOwner } = await supabase.from('did_registry')
      .select('owner_user_id').eq('did_id', to_did).maybeSingle();

    if (toOwner?.owner_user_id && toOwner.owner_user_id !== user.id) {
      try {
        await supabase.from('notifications').insert({
          user_id: toOwner.owner_user_id,
          actor_id: user.id,
          type: 'attestation_received',
          read: false,
          metadata: {
            attestation_id: data.id,
            from_did,
            to_did,
            attestation_type,
            weight,
          },
        });
      } catch (e) {
        console.warn('[attestation] notify fail', e);
      }
    }

    // Recalc TC cho người nhận — fire-and-forget
    try {
      const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/identity-trust-engine`;
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
        },
        body: JSON.stringify({ did_id: to_did }),
      }).catch(() => {});
    } catch { /* swallow */ }

    return j({ success: true, attestation: data });
  } catch (e: any) {
    return j({ error: e.message }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
