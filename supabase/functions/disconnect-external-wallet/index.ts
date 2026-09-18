import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[DISCONNECT-WALLET] Request from user: ${user.id}`);

    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check banned status
    const { data: banCheck } = await supabase
      .from('profiles').select('is_banned').eq('id', user.id).single();
    if (banCheck?.is_banned) {
      return new Response(
        JSON.stringify({ error: 'Tài khoản đã bị cấm vĩnh viễn.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check feature flag - block disconnect when wallet changes disabled
    const { data: config } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'WALLET_CHANGE_DISABLED')
      .single();

    if (config?.value?.enabled) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: config.value.message || 'Tạm khóa thay đổi ví để nâng cấp bảo mật.' 
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('external_wallet_address, claim_freeze_until, wallet_risk_status')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile.external_wallet_address) {
      return new Response(
        JSON.stringify({ success: false, error: 'No external wallet connected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if blocked
    if (profile.wallet_risk_status === 'blocked') {
      return new Response(
        JSON.stringify({ success: false, error: 'Tài khoản bị khóa do thay đổi ví quá nhiều. Liên hệ Admin.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const disconnectedAddress = profile.external_wallet_address;

    // Record in wallet_history
    await supabase.from('wallet_history')
      .update({ is_active: false, ended_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Update profile
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        external_wallet_address: null,
        wallet_address: null,
        default_wallet_type: 'none',
      })
      .eq('id', user.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to disconnect wallet' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      admin_id: user.id,
      action: 'WALLET_DISCONNECT',
      target_user_id: user.id,
      reason: 'user',
      details: { disconnected_wallet: disconnectedAddress },
    });

    console.log('[DISCONNECT-WALLET] Disconnected:', disconnectedAddress);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'External wallet disconnected',
        disconnected_address: disconnectedAddress
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[DISCONNECT-WALLET] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
