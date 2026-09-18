import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SetPasswordRequest {
  token: string;
  new_password: string;
}

// Hash token for comparison
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Validate password strength
function validatePassword(password: string): { valid: boolean; message: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Mật khẩu phải có ít nhất 8 ký tự' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải có ít nhất 1 chữ hoa' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải có ít nhất 1 số' };
  }
  return { valid: true, message: 'OK' };
}

// Send webhook to source platform
async function sendWebhook(
  webhookUrl: string, 
  event: string, 
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Fun-Profile-Webhook': 'true',
      },
      body: JSON.stringify({ event, ...payload }),
    });
    console.log(`[sso-set-password] Webhook ${event} sent:`, response.status);
  } catch (error) {
    console.error(`[sso-set-password] Webhook ${event} failed:`, error);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: SetPasswordRequest = await req.json();
    const { token, new_password } = body;

    console.log('[sso-set-password] Received request');

    // Validate required fields
    if (!token || !new_password) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: token, new_password' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate password strength
    const passwordValidation = validatePassword(new_password);
    if (!passwordValidation.valid) {
      return new Response(
        JSON.stringify({ error: passwordValidation.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Hash the token for lookup
    const tokenHash = await hashToken(token);

    // Find pending provision
    const { data: provision, error: provisionError } = await supabase
      .from('pending_provisions')
      .select('*')
      .eq('password_token_hash', tokenHash)
      .eq('status', 'pending')
      .single();

    if (provisionError || !provision) {
      console.error('[sso-set-password] Invalid or used token:', provisionError);
      return new Response(
        JSON.stringify({ error: 'Link không hợp lệ hoặc đã được sử dụng' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check token expiry
    if (new Date(provision.token_expires_at) < new Date()) {
      // Mark as expired
      await supabase
        .from('pending_provisions')
        .update({ status: 'expired' })
        .eq('id', provision.id);

      return new Response(
        JSON.stringify({ error: 'Link đã hết hạn. Vui lòng liên hệ hỗ trợ.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update user password in Supabase Auth
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      provision.fun_profile_id,
      { password: new_password }
    );

    if (updateError) {
      console.error('[sso-set-password] Failed to update password:', updateError);
      return new Response(
        JSON.stringify({ error: 'Không thể cập nhật mật khẩu. Vui lòng thử lại.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sso-set-password] Password updated for user:', provision.fun_profile_id);

    // Mark provision as completed
    const { error: completeError } = await supabase
      .from('pending_provisions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', provision.id);

    if (completeError) {
      console.error('[sso-set-password] Failed to mark provision complete:', completeError);
    }

    // Update merge request status
    if (provision.merge_request_id) {
      const { error: mergeUpdateError } = await supabase
        .from('account_merge_requests')
        .update({
          status: 'completed',
          provision_status: 'password_set',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', provision.merge_request_id);

      if (mergeUpdateError) {
        console.error('[sso-set-password] Failed to update merge request:', mergeUpdateError);
      }
    }

    // Get user profile for webhook
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, full_name, avatar_url, fun_id')
      .eq('id', provision.fun_profile_id)
      .single();

    // Get OAuth client for webhook URL
    const { data: oauthClient } = await supabase
      .from('oauth_clients')
      .select('webhook_url')
      .eq('platform_name', provision.platform_id)
      .single();

    // Send merge_completed webhook
    if (oauthClient?.webhook_url) {
      await sendWebhook(oauthClient.webhook_url, 'merge_completed', {
        request_id: provision.merge_request_id,
        email: provision.email,
        fun_profile_id: provision.fun_profile_id,
        fun_id: profile?.fun_id || null,
        profile_data: {
          username: profile?.username,
          display_name: profile?.full_name,
          avatar_url: profile?.avatar_url,
        },
      });
    }

    console.log('[sso-set-password] Password set complete for:', provision.email);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mật khẩu đã được tạo thành công! Bạn có thể đăng nhập ngay.',
        email: provision.email,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sso-set-password] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
