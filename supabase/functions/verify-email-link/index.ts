import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { token } = await req.json();
    if (!token || typeof token !== 'string') {
      return new Response(JSON.stringify({ error: 'Token is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Look up token
    const { data: tokenData, error: tokenError } = await adminClient
      .from('email_verification_tokens')
      .select('*')
      .eq('token', token)
      .eq('is_used', false)
      .single();

    if (tokenError || !tokenData) {
      return new Response(JSON.stringify({ error: 'Token không hợp lệ hoặc đã được sử dụng.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check expiry
    if (new Date(tokenData.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Token đã hết hạn. Vui lòng yêu cầu lại.' }), {
        status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check email collision one more time
    const { data: collisionData } = await adminClient.rpc('check_email_collision', {
      p_email: tokenData.email,
      p_exclude_user_id: tokenData.user_id,
    });
    if (collisionData === true) {
      return new Response(JSON.stringify({ error: 'Email này đã được dùng cho tài khoản khác.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update user email via admin API
    const { error: updateError } = await adminClient.auth.admin.updateUserById(tokenData.user_id, {
      email: tokenData.email,
      email_confirm: true,
    });

    if (updateError) {
      console.error('[VERIFY-EMAIL] Admin update error:', updateError);
      return new Response(JSON.stringify({ error: 'Không thể cập nhật email. Vui lòng thử lại.' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark token as used
    await adminClient
      .from('email_verification_tokens')
      .update({ is_used: true })
      .eq('id', tokenData.id);

    // Update profile: sync email and unlock account_status if needed
    const { data: profile } = await adminClient
      .from('profiles')
      .select('account_status')
      .eq('id', tokenData.user_id)
      .single();

    // Prepare update payload
    const profileUpdate: Record<string, string> = {
      email: tokenData.email, // Sync email to profiles table
    };
    if (profile?.account_status === 'limited') {
      profileUpdate.account_status = 'active';
    }

    await adminClient
      .from('profiles')
      .update(profileUpdate)
      .eq('id', tokenData.user_id);

    // Log activity
    await adminClient.from('account_activity_logs').insert({
      user_id: tokenData.user_id,
      action: 'email_linked',
      details: { email: tokenData.email },
    });

    console.log(`[VERIFY-EMAIL] Email ${tokenData.email} linked to user ${tokenData.user_id}`);

    return new Response(JSON.stringify({ success: true, email: tokenData.email }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[VERIFY-EMAIL] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
