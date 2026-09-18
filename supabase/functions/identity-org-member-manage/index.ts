// Quản lý member: invite/remove/update_role
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

    const { action, org_did_id, member_did_id, role = 'member' } = await req.json();
    if (!org_did_id) return new Response(JSON.stringify({ error: 'org_did_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // Verify caller is admin/owner of org
    const { data: callerDid } = await supabase.from('did_registry').select('did_id').eq('owner_user_id', user.id).maybeSingle();
    if (!callerDid) return new Response(JSON.stringify({ error: 'Caller has no DID' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: callerMembership } = await supabase.from('org_members')
      .select('role').eq('org_did_id', org_did_id).eq('member_did_id', callerDid.did_id)
      .eq('status', 'active').maybeSingle();
    if (!callerMembership || !['owner', 'admin'].includes(callerMembership.role)) {
      return new Response(JSON.stringify({ error: 'Only owner/admin can manage members' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'invite') {
      if (!member_did_id) return new Response(JSON.stringify({ error: 'member_did_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      const { data: targetDid } = await supabase.from('did_registry').select('did_id').eq('did_id', member_did_id).maybeSingle();
      if (!targetDid) return new Response(JSON.stringify({ error: 'Target DID not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

      const { error } = await supabase.from('org_members').insert({
        org_did_id, member_did_id, role, status: 'pending', invited_by: callerDid.did_id,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'remove') {
      const { error } = await supabase.from('org_members').update({ status: 'removed', removed_at: new Date().toISOString() })
        .eq('org_did_id', org_did_id).eq('member_did_id', member_did_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'update_role') {
      if (callerMembership.role !== 'owner') {
        return new Response(JSON.stringify({ error: 'Only owner can change roles' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { error } = await supabase.from('org_members').update({ role })
        .eq('org_did_id', org_did_id).eq('member_did_id', member_did_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'accept') {
      // Member accepting invite
      const { error } = await supabase.from('org_members').update({ status: 'active' })
        .eq('org_did_id', org_did_id).eq('member_did_id', callerDid.did_id).eq('status', 'pending');
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
