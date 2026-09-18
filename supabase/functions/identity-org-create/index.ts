// Tạo Organization DID + org_profile + thêm owner làm member
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

    const { display_name, legal_name, domain, website, description, logo_url, org_type = 'general' } = await req.json();
    if (!display_name) return new Response(JSON.stringify({ error: 'display_name required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Lấy DID của owner (user)
    const { data: ownerDid } = await supabase.from('did_registry').select('did_id').eq('owner_user_id', user.id).maybeSingle();
    if (!ownerDid) return new Response(JSON.stringify({ error: 'Owner DID not found' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Tạo Org DID mới
    const orgDidId = `did:fun:org:${crypto.randomUUID()}`;
    const { error: didErr } = await supabase.from('did_registry').insert({
      did_id: orgDidId,
      owner_user_id: user.id,
      entity_type: 'organization',
      did_level: 'L1',
      status: 'basic',
      metadata: { org_type, created_via: 'identity-org-create' },
    });
    if (didErr) throw didErr;

    // Tạo org_profile
    const { error: orgErr } = await supabase.from('org_profile').insert({
      did_id: orgDidId,
      display_name, legal_name, domain, website, description, logo_url, org_type,
    });
    if (orgErr) throw orgErr;

    // Thêm owner làm member
    await supabase.from('org_members').insert({
      org_did_id: orgDidId,
      member_did_id: ownerDid.did_id,
      role: 'owner',
      status: 'active',
    });

    // Trust profile cho org
    await supabase.from('trust_profile').insert({
      did_id: orgDidId, tc: 0.50, trust_tier: 'T1',
      verification_strength: 0.30, behavior_stability: 0.50, social_trust: 0.30,
      onchain_credibility: 0.20, historical_cleanliness: 1.0, risk_factor: 1.0,
      sybil_risk: 'low', fraud_risk: 'low',
    });

    return new Response(JSON.stringify({ success: true, did_id: orgDidId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
