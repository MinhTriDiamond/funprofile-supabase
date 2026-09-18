import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBrandedEmail } from "../_shared/resendClient.ts";

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
    const supabaseAnonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email } = await req.json();
    if (!email || typeof email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Rate limit: 3 per hour per user
    const rateLimitKey = `email_link:${user.id}`;
    const { data: rateData } = await adminClient.rpc('check_rate_limit', {
      p_key: rateLimitKey,
      p_limit: 3,
      p_window_ms: 3600000,
    });
    if (rateData && !rateData.allowed) {
      return new Response(JSON.stringify({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' }), {
        status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check email collision
    const { data: collisionData, error: collisionError } = await adminClient.rpc('check_email_collision', {
      p_email: normalizedEmail,
      p_exclude_user_id: user.id,
    });
    if (collisionError) {
      console.error('[EMAIL-LINK] Collision check error:', collisionError);
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (collisionData === true) {
      return new Response(JSON.stringify({ error: 'Email này đã được dùng cho tài khoản khác.' }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delete existing unused tokens for this user
    await adminClient
      .from('email_verification_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('is_used', false);

    // Generate secure token
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const { error: insertError } = await adminClient
      .from('email_verification_tokens')
      .insert({
        user_id: user.id,
        email: normalizedEmail,
        token,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('[EMAIL-LINK] Token insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create verification token' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Send email via shared Resend helper (logs to email_delivery_logs)
    const verifyUrl = `https://fun.rich/verify-email?token=${token}`;
    const html = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-radius: 16px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">🌟 FUN Ecosystem</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">Xác thực liên kết email</p>
          </div>
          <div style="padding: 40px 32px;">
            <h2 style="color: #f1f5f9; margin: 0 0 16px 0; font-size: 22px;">Xin chào! 👋</h2>
            <p style="color: #94a3b8; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">
              Bạn đã yêu cầu liên kết email <strong style="color: #10b981;">${normalizedEmail}</strong> với tài khoản FUN Ecosystem.
            </p>
            <p style="color: #94a3b8; margin: 0 0 24px 0; font-size: 16px; line-height: 1.6;">
              Nhấn nút bên dưới để xác thực. Liên kết hết hạn sau <strong style="color: #10b981;">30 phút</strong>.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 48px; border-radius: 12px; font-size: 18px; font-weight: 700;">✅ Xác thực email</a>
            </div>
            <p style="color: #64748b; margin: 24px 0 0 0; font-size: 13px; text-align: center;">
              Hoặc copy liên kết:<br/><span style="color: #94a3b8; word-break: break-all;">${verifyUrl}</span>
            </p>
          </div>
          <div style="background: rgba(0,0,0,0.3); padding: 24px 32px; text-align: center;">
            <p style="color: #475569; margin: 0; font-size: 11px;">© 2026 FUN Ecosystem. All rights reserved.</p>
          </div>
        </div>`;

    const sendRes = await sendBrandedEmail({
      to: normalizedEmail,
      subject: '🔗 Xác thực liên kết email - FUN Ecosystem',
      html,
      emailType: 'email_link_verification',
      redirectTo: verifyUrl,
      metadata: { flow: 'send-email-link-verification', user_id: user.id },
    });

    if (!sendRes.ok) {
      console.error('[EMAIL-LINK] send failed:', sendRes.error);
      return new Response(JSON.stringify({ error: 'Failed to send verification email' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[EMAIL-LINK] Verification email sent to ${normalizedEmail} for user ${user.id}`);

    return new Response(JSON.stringify({ success: true, message: 'Verification email sent' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[EMAIL-LINK] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
