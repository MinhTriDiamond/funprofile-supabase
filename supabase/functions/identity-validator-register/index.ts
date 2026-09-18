// Đăng ký Validator (admin-only)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    const auth = req.headers.get('Authorization');
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const { data: { user } } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Check admin
    const { data: isAdmin } = await supabase.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { target_user_id, display_name, description, website, contact_email, stake_amount = 0, min_stake_required = 1000 } = await req.json();
    if (!target_user_id || !display_name) return new Response(JSON.stringify({ error: 'target_user_id and display_name required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Check target có DID
    const { data: existing } = await supabase.from('did_registry').select('did_id, entity_type').eq('owner_user_id', target_user_id).maybeSingle();

    let validatorDidId: string;
    if (existing && existing.entity_type === 'validator') {
      validatorDidId = existing.did_id;
    } else {
      // Tạo validator DID mới (riêng biệt với personal DID)
      validatorDidId = `did:fun:validator:${crypto.randomUUID()}`;
      const { error: didErr } = await supabase.from('did_registry').insert({
        did_id: validatorDidId,
        owner_user_id: target_user_id,
        entity_type: 'validator',
        did_level: 'L2',
        status: 'verified',
        metadata: { created_via: 'identity-validator-register' },
      });
      if (didErr) throw didErr;
    }

    const { error: vErr } = await supabase.from('validator_profile').insert({
      did_id: validatorDidId,
      display_name, description, website, contact_email,
      stake_amount, min_stake_required,
      status: stake_amount >= min_stake_required ? 'active' : 'pending',
      stake_started_at: stake_amount > 0 ? new Date().toISOString() : null,
    });
    if (vErr) throw vErr;

    // Trust profile cho validator (cao hơn user thường)
    await supabase.from('trust_profile').upsert({
      did_id: validatorDidId, tc: 0.80, trust_tier: 'T2',
      verification_strength: 0.70, behavior_stability: 0.70, social_trust: 0.50,
      onchain_credibility: 0.60, historical_cleanliness: 1.0, risk_factor: 1.0,
      sybil_risk: 'low', fraud_risk: 'low',
    });

    return new Response(JSON.stringify({ success: true, did_id: validatorDidId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
