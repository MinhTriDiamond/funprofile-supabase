// Submit a dispute (appeal SBT/sybil/penalty)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateDisputeSubmit } from './validateDisputeInput.ts';

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

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      throw new Error('Dữ liệu yêu cầu không hợp lệ');
    }
    const parsed = validateDisputeSubmit(rawBody);
    if (!parsed.ok) throw new Error(parsed.message);
    const { disputeType: dispute_type, targetRef: target_ref, reason, evidence } = parsed;

    const { data: did } = await supabase.from('did_registry')
      .select('did_id').eq('owner_user_id', user.id).maybeSingle();
    if (!did) throw new Error('Chưa có DID');

    // Cooldown 7d/cùng target
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: prev } = await supabase.from('identity_disputes')
      .select('id').eq('did_id', did.did_id).eq('dispute_type', dispute_type).eq('target_ref', target_ref)
      .gte('created_at', since).maybeSingle();
    if (prev) throw new Error('Đã có dispute cho mục này trong 7 ngày qua');

    // Max 3 pending
    const { count } = await supabase.from('identity_disputes')
      .select('*', { count: 'exact', head: true })
      .eq('did_id', did.did_id).in('status', ['pending', 'under_review']);
    if ((count ?? 0) >= 3) throw new Error('Tối đa 3 dispute pending cùng lúc');

    // Auto under_review nếu T2+
    const { data: tp } = await supabase.from('trust_profile')
      .select('trust_tier').eq('did_id', did.did_id).maybeSingle();
    const initialStatus = ['T2', 'T3', 'T4'].includes(tp?.trust_tier ?? 'T0') ? 'under_review' : 'pending';

    const { data, error } = await supabase.from('identity_disputes').insert({
      did_id: did.did_id, dispute_type, target_ref, reason, evidence, status: initialStatus,
    }).select().single();
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, dispute: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
