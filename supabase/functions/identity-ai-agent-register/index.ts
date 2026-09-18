// Đăng ký AI Agent với operator DID bắt buộc
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

    const {
      display_name, description, model_name, model_version,
      capabilities = [], autonomy_level = 'supervised',
      audit_log_url, api_endpoint, organization_did_id,
    } = await req.json();
    if (!display_name) return new Response(JSON.stringify({ error: 'display_name required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Operator = user hiện tại (bắt buộc human accountability)
    const { data: operatorDid } = await supabase.from('did_registry').select('did_id, did_level').eq('owner_user_id', user.id).maybeSingle();
    if (!operatorDid) return new Response(JSON.stringify({ error: 'Operator must have a DID' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Yêu cầu operator >= L2 để register AI agent
    if (!['L2', 'L3', 'L4'].includes(operatorDid.did_level)) {
      return new Response(JSON.stringify({ error: 'Operator must be L2 or higher to register AI agent' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Tạo AI agent DID
    const agentDidId = `did:fun:ai:${crypto.randomUUID()}`;
    const { error: didErr } = await supabase.from('did_registry').insert({
      did_id: agentDidId,
      owner_user_id: user.id,
      entity_type: 'ai_agent',
      did_level: 'L1',
      status: 'basic',
      metadata: { operator_did: operatorDid.did_id, model_name, autonomy_level },
    });
    if (didErr) throw didErr;

    const { error: aErr } = await supabase.from('ai_agent_profile').insert({
      did_id: agentDidId,
      display_name, description, model_name, model_version,
      operator_did_id: operatorDid.did_id,
      organization_did_id,
      capabilities, autonomy_level,
      audit_log_url, api_endpoint,
      status: 'pending',
    });
    if (aErr) throw aErr;

    // Trust profile thấp ban đầu (phải build trust qua actions)
    await supabase.from('trust_profile').insert({
      did_id: agentDidId, tc: 0.40, trust_tier: 'T0',
      verification_strength: 0.40, behavior_stability: 0.30, social_trust: 0.10,
      onchain_credibility: 0.10, historical_cleanliness: 1.0, risk_factor: 0.9,
      sybil_risk: 'low', fraud_risk: 'low',
    });

    return new Response(JSON.stringify({ success: true, did_id: agentDidId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
