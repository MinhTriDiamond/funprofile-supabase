// Issue SBT theo issuance_rules
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
    const { did_id, sbt_type, issuer = 'system', evidence_hash, metadata = {} } = await req.json();

    if (!did_id || !sbt_type) {
      return new Response(JSON.stringify({ error: 'did_id and sbt_type required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: rule } = await supabase.from('sbt_issuance_rules')
      .select('*').eq('sbt_type', sbt_type).maybeSingle();
    if (!rule || !rule.is_active) {
      return new Response(JSON.stringify({ error: 'rule not found or inactive' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: existing } = await supabase.from('sbt_registry')
      .select('token_id').eq('did_id', did_id).eq('sbt_type', sbt_type).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ success: true, existed: true, token_id: existing.token_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: minted, error } = await supabase.from('sbt_registry').insert({
      did_id,
      sbt_category: rule.category,
      sbt_type,
      issuer,
      evidence_hash,
      trust_weight: rule.trust_weight,
      privacy_level: rule.privacy_level,
      metadata,
    }).select().single();
    if (error) throw error;

    // Record event
    await supabase.from('identity_events').insert({
      did_id,
      event_type: 'sbt_issued',
      event_ref: minted.token_id,
      tc_delta: rule.tc_impact,
      source: issuer,
      metadata: { sbt_type, category: rule.category },
    });

    // Notification: cần resolve owner_user_id từ did_id
    try {
      const { data: didRow } = await supabase.from('did_registry')
        .select('owner_user_id').eq('did_id', did_id).maybeSingle();
      if (didRow?.owner_user_id) {
        await supabase.from('notifications').insert({
          user_id: didRow.owner_user_id,
          actor_id: didRow.owner_user_id,
          type: 'sbt_issued',
          read: false,
          metadata: { did_id, sbt_type, sbt_category: rule.category, token_id: minted.token_id },
        });
      }
    } catch (e) {
      console.error('[sbt-issue] notif insert failed:', e);
    }

    return new Response(JSON.stringify({ success: true, sbt: minted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
