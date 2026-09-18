import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyClientSecret } from '../_shared/clientAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MergeRequestBody {
  client_id: string;
  client_secret: string;
  email: string;
  source_user_id?: string;
  source_username?: string;
  platform_data?: Record<string, unknown>;
}

// Generate secure random token
function generateToken(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join('');
}

// Hash token for storage
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
    console.log(`[sso-merge-request] Webhook ${event} sent:`, response.status);
  } catch (error) {
    console.error(`[sso-merge-request] Webhook ${event} failed:`, error);
  }
}

// Send welcome email with set password link
async function sendWelcomeEmail(
  email: string,
  displayName: string,
  token: string,
  platformData: Record<string, unknown>
): Promise<boolean> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) {
    console.error('[sso-merge-request] RESEND_API_KEY not configured');
    return false;
  }

  const funProfileOrigin = Deno.env.get('FUN_PROFILE_ORIGIN') || 'https://fun.rich';
  const setPasswordUrl = `${funProfileOrigin}/set-password?token=${token}`;

  const camlyBalance = platformData.camly_balance || 0;
  const reputationScore = platformData.reputation_score || 0;
  const isVerified = platformData.is_verified === true;

  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chào mừng đến FUN Ecosystem</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 16px 16px 0 0; padding: 32px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Chào mừng đến FUN Ecosystem!</h1>
    </div>
    
    <div style="background: white; border-radius: 0 0 16px 16px; padding: 32px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
      <p style="font-size: 18px; color: #1f2937; margin-bottom: 24px;">
        Xin chào <strong>${displayName || 'bạn'}</strong>!
      </p>
      
      <p style="color: #4b5563; line-height: 1.6;">
        Tài khoản của bạn trên <strong>Fun Farm</strong> đã được liên kết với hệ thống <strong>Fun-ID</strong> thống nhất.
      </p>
      
      <div style="background: #f0fdf4; border-left: 4px solid #10b981; padding: 16px; margin: 24px 0; border-radius: 0 8px 8px 0;">
        <p style="margin: 0; color: #166534; font-weight: 600;">Fun-ID là "hộ chiếu số" cho phép bạn truy cập TẤT CẢ các nền tảng:</p>
        <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #15803d;">
          <li>✅ Fun Farm - Mạng xã hội nông nghiệp</li>
          <li>✅ Fun Academy - Học tập online</li>
          <li>✅ Fun Money - Quản lý tài chính</li>
          <li>✅ Fun Wallet - Ví điện tử</li>
          <li>✅ Và nhiều hơn nữa...</li>
        </ul>
      </div>
      
      <div style="background: #fef3c7; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <h3 style="margin: 0 0 12px 0; color: #92400e;">📊 Dữ liệu từ Fun Farm:</h3>
        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
          <div style="background: white; padding: 12px 16px; border-radius: 8px; flex: 1; min-width: 120px;">
            <div style="font-size: 24px; font-weight: bold; color: #d97706;">${Number(camlyBalance).toLocaleString()}</div>
            <div style="color: #78716c; font-size: 14px;">CAMLY</div>
          </div>
          <div style="background: white; padding: 12px 16px; border-radius: 8px; flex: 1; min-width: 120px;">
            <div style="font-size: 24px; font-weight: bold; color: #059669;">${reputationScore}/100</div>
            <div style="color: #78716c; font-size: 14px;">Điểm uy tín</div>
          </div>
          <div style="background: white; padding: 12px 16px; border-radius: 8px; flex: 1; min-width: 120px;">
            <div style="font-size: 24px; font-weight: bold; color: ${isVerified ? '#059669' : '#9ca3af'};">${isVerified ? '✓' : '○'}</div>
            <div style="color: #78716c; font-size: 14px;">${isVerified ? 'Đã xác minh' : 'Chưa xác minh'}</div>
          </div>
        </div>
      </div>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${setPasswordUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);">
          TẠO MẬT KHẨU
        </a>
      </div>
      
      <p style="color: #9ca3af; font-size: 14px; text-align: center;">
        ⏰ Link này có hiệu lực trong <strong>24 giờ</strong>.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">
      
      <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 0;">
        FUN Ecosystem Team<br>
        <em>"Một linh hồn - Một danh tính"</em>
      </p>
    </div>
  </div>
</body>
</html>
  `;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'FUN Ecosystem <noreply@fun.rich>',
        to: [email],
        subject: '🎉 Chào mừng đến FUN Ecosystem! Tạo mật khẩu để bắt đầu',
        html: emailHtml,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[sso-merge-request] Email send failed:', errorText);
      return false;
    }

    console.log('[sso-merge-request] Welcome email sent to:', email);
    return true;
  } catch (error) {
    console.error('[sso-merge-request] Email send error:', error);
    return false;
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

    const body: MergeRequestBody = await req.json();
    const { client_id, client_secret, email, source_user_id, source_username, platform_data } = body;

    console.log('[sso-merge-request] Received request:', { client_id, email, source_user_id });

    // Validate required fields
    if (!client_id || !client_secret || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: client_id, client_secret, email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify OAuth client (hash-compare, hỗ trợ bcrypt + plaintext legacy)
    const { data: oauthClient, error: clientError } = await supabase
      .from('oauth_clients')
      .select('client_id, client_name, is_active, platform_name, webhook_url, client_secret')
      .eq('client_id', client_id)
      .eq('is_active', true)
      .single();

    if (
      clientError ||
      !oauthClient ||
      !(await verifyClientSecret(oauthClient.client_secret, client_secret))
    ) {
      console.error('[sso-merge-request] Invalid client credentials:', clientError);
      return new Response(
        JSON.stringify({ error: 'Invalid client credentials' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sso-merge-request] Client verified:', oauthClient.client_name);

    const emailLower = email.toLowerCase();

    // Check if email exists by querying profiles table joined with auth
    // First, try to find user in auth.users by listing and filtering
    let existingUser = null;
    let page = 1;
    const perPage = 1000;
    let foundUser = false;

    // Paginate through all users to find the email
    while (!foundUser) {
      const { data: userListData, error: userListError } = await supabase.auth.admin.listUsers({
        page: page,
        perPage: perPage,
      });

      if (userListError) {
        console.error('[sso-merge-request] Error checking users:', userListError);
        return new Response(
          JSON.stringify({ error: 'Failed to check existing users' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Search for the email in current page
      const foundInPage = userListData.users.find(
        (u) => u.email?.toLowerCase() === emailLower
      );

      if (foundInPage) {
        existingUser = foundInPage;
        foundUser = true;
        console.log('[sso-merge-request] Found existing user:', existingUser.id);
      } else if (userListData.users.length < perPage) {
        // No more users to check
        break;
      } else {
        page++;
      }
    }

    // Check for existing pending request
    const { data: existingRequest } = await supabase
      .from('account_merge_requests')
      .select('id, status')
      .eq('email', emailLower)
      .eq('source_platform', oauthClient.platform_name || client_id)
      .in('status', ['pending', 'approved', 'provisioned'])
      .single();

    if (existingRequest) {
      console.log('[sso-merge-request] Existing request found:', existingRequest);
      return new Response(
        JSON.stringify({
          error: 'Merge request already exists',
          request_id: existingRequest.id,
          status: existingRequest.status
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine merge type and handle accordingly
    let mergeType: 'both_exist' | 'farm_only';
    let targetUserId: string | null = null;
    let autoProvisioned = false;
    let provisionStatus: string | null = null;

    if (existingUser) {
      // Email exists in Fun Profile - standard merge flow
      mergeType = 'both_exist';
      targetUserId = existingUser.id;
      console.log('[sso-merge-request] User exists in Fun Profile:', targetUserId);
    } else {
      // Email only exists in source platform - AUTO-PROVISION
      mergeType = 'farm_only';
      autoProvisioned = true;
      provisionStatus = 'pending_password_set';
      console.log('[sso-merge-request] AUTO-PROVISION: Creating new user for:', emailLower);

      // Generate random password for initial creation
      const tempPassword = generateToken(32);
      
      // Create user in Supabase Auth
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: emailLower,
        password: tempPassword,
        email_confirm: true, // Auto-confirm email since it's verified on Fun Farm
        user_metadata: {
          full_name: platform_data?.display_name || '',
          avatar_url: platform_data?.avatar_url || '',
          registered_from: oauthClient.platform_name || client_id,
        },
      });

      if (createError || !newUser.user) {
        console.error('[sso-merge-request] Failed to create user:', createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create user account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      targetUserId = newUser.user.id;
      console.log('[sso-merge-request] User created:', targetUserId);

      // Update profile with platform data
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: platform_data?.display_name || null,
          avatar_url: platform_data?.avatar_url || null,
          registered_from: oauthClient.platform_name || client_id,
          law_of_light_accepted: platform_data?.law_of_light_accepted === true,
          law_of_light_accepted_at: platform_data?.law_of_light_accepted === true ? new Date().toISOString() : null,
        })
        .eq('id', targetUserId);

      if (profileError) {
        console.error('[sso-merge-request] Failed to update profile:', profileError);
      }

      // Store platform data
      const { error: platformDataError } = await supabase
        .from('platform_user_data')
        .upsert({
          user_id: targetUserId,
          client_id: client_id,
          data: platform_data || {},
          synced_at: new Date().toISOString(),
          last_sync_mode: 'merge_provision',
          sync_count: 1,
        }, { onConflict: 'user_id,client_id' });

      if (platformDataError) {
        console.error('[sso-merge-request] Failed to store platform data:', platformDataError);
      }

      // Generate password reset token
      const passwordToken = generateToken(64);
      const tokenHash = await hashToken(passwordToken);
      const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Store in pending_provisions
      const { error: provisionError } = await supabase
        .from('pending_provisions')
        .insert({
          email: emailLower,
          fun_profile_id: targetUserId,
          platform_id: oauthClient.platform_name || client_id,
          platform_user_id: source_user_id || null,
          platform_data: platform_data || {},
          password_token_hash: tokenHash,
          token_expires_at: tokenExpires.toISOString(),
          status: 'pending',
        });

      if (provisionError) {
        console.error('[sso-merge-request] Failed to create provision record:', provisionError);
      }

      // Send welcome email
      const displayName = (platform_data?.display_name as string) || source_username || '';
      await sendWelcomeEmail(emailLower, displayName, passwordToken, platform_data || {});

      // Send webhook to source platform
      if (oauthClient.webhook_url) {
        await sendWebhook(oauthClient.webhook_url, 'account_provisioned', {
          request_id: null, // Will be set after merge request creation
          email: emailLower,
          fun_profile_id: targetUserId,
          status: 'pending_password_set',
          message: 'Account created. Waiting for user to set password.',
        });
      }
    }

    // Create merge request
    const { data: mergeRequest, error: insertError } = await supabase
      .from('account_merge_requests')
      .insert({
        email: emailLower,
        source_platform: oauthClient.platform_name || client_id,
        source_user_id: source_user_id || null,
        source_username: source_username || null,
        target_platform: 'fun_profile',
        target_user_id: targetUserId,
        platform_data: platform_data || {},
        merge_type: mergeType,
        status: autoProvisioned ? 'provisioned' : 'pending',
        auto_provisioned: autoProvisioned,
        provision_status: provisionStatus,
      })
      .select('id, status, merge_type, created_at, auto_provisioned, provision_status')
      .single();

    if (insertError) {
      console.error('[sso-merge-request] Error creating merge request:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create merge request' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update pending_provisions with merge_request_id
    if (autoProvisioned && mergeRequest) {
      await supabase
        .from('pending_provisions')
        .update({ merge_request_id: mergeRequest.id })
        .eq('email', emailLower);

      // Re-send webhook with request_id
      if (oauthClient.webhook_url) {
        await sendWebhook(oauthClient.webhook_url, 'account_provisioned', {
          request_id: mergeRequest.id,
          email: emailLower,
          fun_profile_id: targetUserId,
          status: 'pending_password_set',
          message: 'Account created. Waiting for user to set password.',
        });
      }
    }

    console.log('[sso-merge-request] Merge request created:', mergeRequest);

    return new Response(
      JSON.stringify({
        success: true,
        request_id: mergeRequest.id,
        merge_type: mergeRequest.merge_type,
        status: mergeRequest.status,
        auto_provisioned: mergeRequest.auto_provisioned,
        provision_status: mergeRequest.provision_status,
        fun_profile_id: autoProvisioned ? targetUserId : undefined,
        message: autoProvisioned 
          ? 'Account created. Welcome email sent to user for password setup.'
          : mergeType === 'both_exist' 
            ? 'User exists on both platforms. Admin review required.'
            : 'User only exists on source platform. Admin will create new account.',
        created_at: mergeRequest.created_at
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sso-merge-request] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
