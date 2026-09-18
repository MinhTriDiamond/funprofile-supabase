import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResendWebhookBody {
  request_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: hasAdminRole } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!hasAdminRole) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ResendWebhookBody = await req.json();
    const { request_id } = body;

    if (!request_id) {
      return new Response(
        JSON.stringify({ error: 'Missing request_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sso-resend-webhook] Resending for request:', request_id);

    // Get merge request
    const { data: mergeRequest, error: fetchError } = await supabase
      .from('account_merge_requests')
      .select('*')
      .eq('id', request_id)
      .single();

    if (fetchError || !mergeRequest) {
      return new Response(
        JSON.stringify({ error: 'Merge request not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mergeRequest.status !== 'completed') {
      return new Response(
        JSON.stringify({ error: 'Can only resend for completed requests' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const funProfileOrigin = Deno.env.get('FUN_PROFILE_ORIGIN') || 'https://fun-profile.lovable.app';
    let webhookSent = false;
    let emailSent = false;

    // Send webhook
    try {
      const { data: client } = await supabase
        .from('oauth_clients')
        .select('webhook_url, client_secret')
        .eq('platform_name', mergeRequest.source_platform)
        .single();

      if (client?.webhook_url) {
        // Get profile data
        let profileData = null;
        if (mergeRequest.target_user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url, full_name, fun_id')
            .eq('id', mergeRequest.target_user_id)
            .single();
          
          if (profile) {
            profileData = {
              username: profile.username,
              avatar_url: profile.avatar_url,
              full_name: profile.full_name,
              fun_id: profile.fun_id
            };
          }
        }

        const webhookPayload = {
          event: 'merge_completed',
          request_id: mergeRequest.id,
          email: mergeRequest.email,
          source_user_id: mergeRequest.source_user_id,
          fun_profile_id: mergeRequest.target_user_id,
          merge_type: mergeRequest.merge_type,
          platform_data_imported: Object.keys(mergeRequest.platform_data || {}).length > 0,
          timestamp: new Date().toISOString(),
          profile_data: profileData,
          resent: true
        };

        const payloadString = JSON.stringify(webhookPayload);
        
        // Create signature
        let signature = '';
        if (client.client_secret) {
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(client.client_secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadString));
          signature = Array.from(new Uint8Array(sig))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        }

        console.log('[sso-resend-webhook] Sending webhook to:', client.webhook_url);

        const response = await fetch(client.webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Fun-Profile-Webhook': 'true',
            'X-Fun-Signature': signature
          },
          body: payloadString
        });

        if (response.ok) {
          webhookSent = true;
          console.log('[sso-resend-webhook] Webhook sent successfully');
        } else {
          console.error('[sso-resend-webhook] Webhook failed:', response.status);
        }
      }
    } catch (webhookError) {
      console.error('[sso-resend-webhook] Webhook error:', webhookError);
    }

    // Send email based on merge_type
    try {
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        const displayName = mergeRequest.source_username || 'bạn';
        
        if (mergeRequest.merge_type === 'farm_only') {
          // Email cho farm_only user - chuyên nghiệp, tránh spam filters
          const plainText = `Xin chào ${displayName}!

Tài khoản FUN ID của bạn đã được tạo thành công.

Email đăng nhập: ${mergeRequest.email}

Bạn có thể đăng nhập qua Fun Farm hoặc sử dụng tính năng "Quên mật khẩu" để đặt mật khẩu mới tại: ${funProfileOrigin}/set-password

Trân trọng,
FUN Profile Team

---
FUN Profile - Một sản phẩm của FUN Ecosystem
Email này được gửi tự động, vui lòng không trả lời.`;

          await resend.emails.send({
            from: 'FUN Ecosystem <noreply@fun.rich>',
            to: [mergeRequest.email],
            subject: 'Tài khoản FUN ID của bạn đã sẵn sàng',
            text: plainText,
            headers: {
              'X-Entity-Ref-ID': mergeRequest.id
            },
            tags: [
              { name: 'category', value: 'transactional' },
              { name: 'type', value: 'welcome' }
            ],
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <span style="display: none; max-height: 0; overflow: hidden;">Đăng nhập ngay để khám phá FUN Profile</span>
  
  <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; padding-bottom: 24px; border-bottom: 1px solid #eee;">
      <h1 style="color: #4F46E5; margin: 0; font-size: 24px; font-weight: 600;">FUN Profile</h1>
    </div>
    
    <div style="padding: 32px 0;">
      <h2 style="color: #333; margin: 0 0 16px 0; font-size: 20px;">Chào mừng ${displayName}!</h2>
      
      <p style="margin: 0 0 24px 0; color: #555;">Tài khoản FUN ID của bạn đã được tạo thành công.</p>
      
      <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 0 0 24px 0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;"><strong>Email đăng nhập:</strong></p>
        <p style="margin: 0; font-size: 16px; color: #4F46E5;">${mergeRequest.email}</p>
      </div>
      
      <p style="margin: 0 0 24px 0; color: #555;">Bạn có thể đăng nhập qua Fun Farm hoặc đặt mật khẩu mới:</p>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${funProfileOrigin}/set-password" 
           style="background: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500; font-size: 16px;">
          Đặt mật khẩu
        </a>
      </div>
      
      <p style="margin: 0; color: #888; font-size: 14px;">
        Nếu bạn không yêu cầu tạo tài khoản này, vui lòng bỏ qua email này.
      </p>
    </div>
    
    <div style="border-top: 1px solid #eee; padding-top: 24px; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #888; font-size: 12px;">FUN Profile - Một sản phẩm của FUN Ecosystem</p>
      <p style="margin: 0; color: #aaa; font-size: 12px;">Email này được gửi tự động, vui lòng không trả lời.</p>
    </div>
  </div>
</body>
</html>
            `
          });
        } else {
          // Email cho both_exist user
          const plainText = `Xin chào ${displayName}!

Tài khoản ${mergeRequest.source_platform} của bạn đã được liên kết thành công với FUN Profile.

Bạn có thể đăng nhập vào FUN Profile bằng email: ${mergeRequest.email}

Truy cập FUN Profile tại: ${funProfileOrigin}

Trân trọng,
FUN Profile Team

---
FUN Profile - Một sản phẩm của FUN Ecosystem
Email này được gửi tự động, vui lòng không trả lời.`;

          await resend.emails.send({
            from: 'FUN Ecosystem <noreply@fun.rich>',
            to: [mergeRequest.email],
            subject: 'Tài khoản của bạn đã được liên kết thành công',
            text: plainText,
            headers: {
              'X-Entity-Ref-ID': mergeRequest.id
            },
            tags: [
              { name: 'category', value: 'transactional' },
              { name: 'type', value: 'account_linked' }
            ],
            html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
  <span style="display: none; max-height: 0; overflow: hidden;">Tài khoản của bạn đã được liên kết với FUN Profile</span>
  
  <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="text-align: center; padding-bottom: 24px; border-bottom: 1px solid #eee;">
      <h1 style="color: #10B981; margin: 0; font-size: 24px; font-weight: 600;">FUN Profile</h1>
    </div>
    
    <div style="padding: 32px 0;">
      <h2 style="color: #333; margin: 0 0 16px 0; font-size: 20px;">Chào mừng ${displayName}!</h2>
      
      <p style="margin: 0 0 24px 0; color: #555;">
        Tài khoản <strong>${mergeRequest.source_platform}</strong> của bạn đã được liên kết thành công với FUN Profile.
      </p>
      
      <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin: 0 0 24px 0;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;"><strong>Email đăng nhập:</strong></p>
        <p style="margin: 0; font-size: 16px; color: #10B981;">${mergeRequest.email}</p>
      </div>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${funProfileOrigin}" 
           style="background: #10B981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500; font-size: 16px;">
          Truy cập FUN Profile
        </a>
      </div>
    </div>
    
    <div style="border-top: 1px solid #eee; padding-top: 24px; text-align: center;">
      <p style="margin: 0 0 8px 0; color: #888; font-size: 12px;">FUN Profile - Một sản phẩm của FUN Ecosystem</p>
      <p style="margin: 0; color: #aaa; font-size: 12px;">Email này được gửi tự động, vui lòng không trả lời.</p>
    </div>
  </div>
</body>
</html>
            `
          });
        }
        
        emailSent = true;
        console.log('[sso-resend-webhook] Email sent to:', mergeRequest.email);
      }
    } catch (emailError) {
      console.error('[sso-resend-webhook] Email error:', emailError);
    }

    // Update webhook_sent status
    if (webhookSent) {
      await supabase
        .from('account_merge_requests')
        .update({
          webhook_sent: true,
          webhook_sent_at: new Date().toISOString()
        })
        .eq('id', request_id);
    }

    // Log the action
    await supabase.from('audit_logs').insert({
      admin_id: user.id,
      action: 'RESEND_MERGE_WEBHOOK',
      target_user_id: mergeRequest.target_user_id,
      details: {
        request_id,
        webhook_sent: webhookSent,
        email_sent: emailSent
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        webhook_sent: webhookSent,
        email_sent: emailSent
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sso-resend-webhook] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
