// Quản lý identity_links: add / verify / revoke
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_TYPES = ['wallet', 'social', 'device', 'organization'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );
    const auth = req.headers.get('Authorization');
    if (!auth) return j({ error: 'unauthorized' }, 401);
    const { data: { user } } = await supabase.auth.getUser(auth.replace('Bearer ', ''));
    if (!user) return j({ error: 'unauthorized' }, 401);

    const { action, link_id, link_type, link_value, metadata = {} } = await req.json();
    const { data: did } = await supabase.from('did_registry').select('did_id').eq('owner_user_id', user.id).maybeSingle();
    if (!did) return j({ error: 'DID not found' }, 400);

    if (action === 'add') {
      if (!ALLOWED_TYPES.includes(link_type)) return j({ error: 'invalid link_type' }, 400);
      if (!link_value) return j({ error: 'link_value required' }, 400);

      // Wallet auto-verified nếu khớp với custodial_wallets / external_wallets của user
      let verification_state = 'unverified';
      let verified_at: string | null = null;
      if (link_type === 'wallet') {
        const { data: w } = await supabase.from('custodial_wallets')
          .select('wallet_address').eq('user_id', user.id)
          .ilike('wallet_address', link_value).maybeSingle();
        if (w) { verification_state = 'verified'; verified_at = new Date().toISOString(); }
      }

      const { data, error } = await supabase.from('identity_links').insert({
        did_id: did.did_id, link_type, link_value, verification_state, verified_at, metadata,
      }).select().single();
      if (error) throw error;

      // Log identity event
      await supabase.from('identity_events').insert({
        did_id: did.did_id, event_type: `link_${link_type}_added`,
        event_ref: data.id, source: 'identity-link-manage',
        tc_delta: verification_state === 'verified' ? 0.02 : 0,
      });

      return j({ success: true, link: data });
    }

    if (action === 'revoke') {
      if (!link_id) return j({ error: 'link_id required' }, 400);
      const { error } = await supabase.from('identity_links')
        .update({ verification_state: 'revoked' })
        .eq('id', link_id).eq('did_id', did.did_id);
      if (error) throw error;
      await supabase.from('identity_events').insert({
        did_id: did.did_id, event_type: 'link_revoked', event_ref: link_id,
        source: 'identity-link-manage', tc_delta: -0.01,
      });
      return j({ success: true });
    }

    return j({ error: 'unknown action' }, 400);
  } catch (e: any) {
    return j({ error: e.message }, 500);
  }
});

function j(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}
