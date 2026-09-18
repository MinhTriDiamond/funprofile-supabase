import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyMessage } from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

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

    // Service role client (used throughout)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check banned status
    const { data: banCheck } = await supabase
      .from('profiles').select('is_banned').eq('id', user.id).single();
    if (banCheck?.is_banned) {
      return new Response(
        JSON.stringify({ success: false, error: 'Tài khoản đã bị cấm vĩnh viễn.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { wallet_address, signature, message } = await req.json();
    
    if (!wallet_address || !signature || !message) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedAddress = wallet_address.toLowerCase();
    console.log(`[CONNECT-WALLET] User: ${user.id}, wallet: ${normalizedAddress}`);

    // Verify signature
    try {
      const recoveredAddress = verifyMessage(message, signature) as string;
      if (!recoveredAddress || recoveredAddress.toLowerCase() !== normalizedAddress) {
        await supabase.from('account_activity_logs').insert({
          user_id: user.id,
          action: 'wallet_link_failed',
          details: { wallet: normalizedAddress, reason: 'signature_mismatch' },
        });
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch {
      await supabase.from('account_activity_logs').insert({
        user_id: user.id,
        action: 'wallet_link_failed',
        details: { wallet: normalizedAddress, reason: 'invalid_signature_format' },
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid signature format' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get current profile for old wallet
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('external_wallet_address, public_wallet_address, wallet_address')
      .eq('id', user.id)
      .single();

    const oldWallet = currentProfile?.external_wallet_address || currentProfile?.public_wallet_address || currentProfile?.wallet_address;
    const isFirstWallet = !oldWallet || oldWallet === '';

    // If this is the FIRST wallet connection (no existing wallet), allow freely
    if (isFirstWallet) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          external_wallet_address: normalizedAddress,
          wallet_address: normalizedAddress,
          public_wallet_address: normalizedAddress,
          wallet_risk_status: 'normal',
        })
        .eq('id', user.id);

      if (updateError) {
        await supabase.from('account_activity_logs').insert({
          user_id: user.id,
          action: 'wallet_link_failed',
          details: { wallet: normalizedAddress, reason: 'db_error' },
        });
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to connect wallet' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Record in wallet history + activity log
      await Promise.all([
        supabase.from('wallet_history').insert({
          user_id: user.id,
          wallet_address: normalizedAddress,
          is_active: true,
          change_reason: 'first_connect',
          ip_address: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip'),
          user_agent: req.headers.get('user-agent'),
        }),
        supabase.from('account_activity_logs').insert({
          user_id: user.id,
          action: 'wallet_link_succeeded',
          details: { wallet: normalizedAddress, type: 'first_connect' },
        }),
      ]);

      console.log('[CONNECT-WALLET] First wallet connected:', normalizedAddress);
      return new Response(
        JSON.stringify({ success: true, message: 'Wallet connected', wallet_address: normalizedAddress }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If same wallet, just return success
    if (oldWallet && oldWallet.toLowerCase() === normalizedAddress) {
      return new Response(
        JSON.stringify({ success: true, message: 'Wallet already connected', wallet_address: normalizedAddress }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // WALLET CHANGE: Use secure process_wallet_change function
    const { data: result, error: rpcError } = await supabase.rpc('process_wallet_change', {
      p_user_id: user.id,
      p_new_wallet: normalizedAddress,
      p_old_wallet: oldWallet || null,
      p_reason: 'user',
      p_ip: req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip'),
      p_user_agent: req.headers.get('user-agent'),
    });

    if (rpcError) {
      console.error('[CONNECT-WALLET] RPC error:', rpcError);
      await supabase.from('account_activity_logs').insert({
        user_id: user.id,
        action: 'wallet_link_failed',
        details: { wallet: normalizedAddress, old_wallet: oldWallet, reason: 'rpc_error' },
      });
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to process wallet change' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!result?.success) {
      const statusMap: Record<string, number> = {
        'WALLET_CHANGE_DISABLED': 403,
        'COOLDOWN_ACTIVE': 429,
        'WALLET_BLACKLISTED': 403,
        'WALLET_IN_USE': 409,
      };
      const status = statusMap[result?.error] || 400;

      await supabase.from('account_activity_logs').insert({
        user_id: user.id,
        action: 'wallet_link_failed',
        details: { wallet: normalizedAddress, old_wallet: oldWallet, error_code: result?.error },
      });

      return new Response(
        JSON.stringify({
          success: false,
          error: result?.error || 'Unknown error',
          error_code: result?.error,
          message: result?.message || 'Không thể đổi ví',
          next_change_at: result?.next_change_at,
        }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log success
    await supabase.from('account_activity_logs').insert({
      user_id: user.id,
      action: 'wallet_link_succeeded',
      details: { wallet: normalizedAddress, old_wallet: oldWallet, risk_status: result.risk_status },
    });

    // Notify admins if risk elevated
    if (result.risk_status && result.risk_status !== 'normal' && result.risk_status !== 'watch') {
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (admins && admins.length > 0) {
        const notifications = admins.map((a: any) => ({
          user_id: a.user_id,
          actor_id: user.id,
          type: 'admin_wallet_change_abuse',
          read: false,
        }));
        await supabase.from('notifications').insert(notifications);
      }
    }

    console.log(`[CONNECT-WALLET] Wallet changed: ${oldWallet} -> ${normalizedAddress}, risk: ${result.risk_status}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Wallet connected successfully',
        wallet_address: normalizedAddress,
        risk_status: result.risk_status,
        freeze_until: result.freeze_until,
        warning: result.risk_status !== 'normal' 
          ? 'Tài khoản đang được kiểm tra bảo mật do thay đổi ví. Chức năng rút thưởng sẽ tạm khóa trong thời gian kiểm tra.'
          : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CONNECT-WALLET] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
