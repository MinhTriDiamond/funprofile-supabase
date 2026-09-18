// Admin/governance resolve dispute
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDisputeResolve } from './validateResolveInput.ts';

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

    // Verify admin
    const { data: roles } = await supabase.from('user_roles')
      .select('role').eq('user_id', user.id).eq('role', 'admin');
    if (!roles || roles.length === 0) throw new Error('Cần role admin');

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      throw new Error('Dữ liệu yêu cầu không hợp lệ');
    }
    const parsedInput = validateDisputeResolve(rawBody);
    if (!parsedInput.ok) throw new Error(parsedInput.message);
    const { disputeId: dispute_id, decision, resolutionNote: resolution_note } = parsedInput;

    const { data: dispute } = await supabase.from('identity_disputes')
      .select('*').eq('id', dispute_id).maybeSingle();
    if (!dispute) throw new Error('Dispute not found');
    if (!['pending', 'under_review'].includes(dispute.status)) throw new Error('Đã giải quyết');

    // Apply revert if accepted
    if (decision === 'accepted') {
      switch (dispute.dispute_type) {
        case 'sbt_revoke':
        case 'sbt_freeze':
          await supabase.from('sbt_registry')
            .update({ status: 'active', revocation_reason: null })
            .eq('token_id', dispute.target_ref);
          break;
        case 'sybil_flag':
          await supabase.from('trust_profile')
            .update({ sybil_risk: 'low', fraud_risk: 'low' })
            .eq('did_id', dispute.did_id);
          break;
        case 'trust_penalty': {
          const { data: tp } = await supabase.from('trust_profile')
            .select('tc').eq('did_id', dispute.did_id).maybeSingle();
          const newTc = Math.min(1.5, Number(tp?.tc ?? 0.5) + 0.05);
          await supabase.from('trust_profile').update({ tc: newTc }).eq('did_id', dispute.did_id);
          break;
        }
        case 'did_demotion':
          // log only — admin manual restore via DID Registry tab
          break;
      }
      await supabase.from('identity_events').insert({
        did_id: dispute.did_id,
        event_type: 'dispute_accepted',
        event_ref: dispute_id,
        tc_delta: 0.05,
        risk_delta: -0.05,
        source: 'identity-dispute-resolve',
        metadata: { dispute_type: dispute.dispute_type, target_ref: dispute.target_ref },
      });
    } else {
      await supabase.from('identity_events').insert({
        did_id: dispute.did_id,
        event_type: 'dispute_rejected',
        event_ref: dispute_id,
        tc_delta: 0,
        risk_delta: 0,
        source: 'identity-dispute-resolve',
        metadata: { dispute_type: dispute.dispute_type, target_ref: dispute.target_ref },
      });
    }

    await supabase.from('identity_disputes').update({
      status: decision,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      resolution_note,
    }).eq('id', dispute_id);

    // Notify dispute owner
    try {
      const { data: didRow } = await supabase.from('did_registry')
        .select('owner_user_id').eq('did_id', dispute.did_id).maybeSingle();
      if (didRow?.owner_user_id) {
        await supabase.from('notifications').insert({
          user_id: didRow.owner_user_id,
          actor_id: user.id,
          type: 'dispute_resolved',
          read: false,
          metadata: {
            did_id: dispute.did_id,
            dispute_type: dispute.dispute_type,
            dispute_decision: decision,
            resolution_note,
          },
        });
      }
    } catch (e) {
      console.error('[dispute-resolve] notif insert failed:', e);
    }

    return new Response(JSON.stringify({ success: true, decision }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
