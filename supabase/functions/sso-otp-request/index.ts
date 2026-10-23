import { createClient } from "npm:@supabase/supabase-js@2";
import { sendBrandedEmail } from "../_shared/resendClient.ts";
import { otpEmailHtml } from "../_shared/emailTemplates.ts";
import { checkTurnstile, CAPTCHA_ERROR_MESSAGE } from "../_shared/turnstile.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Database-backed rate limiting for OTP requests
// SECURITY FIX: Uses persistent rate limiting instead of in-memory (which resets on cold start)
const OTP_RATE_LIMIT = 3; // max 3 OTP requests per hour per identifier
const OTP_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour window

async function checkDatabaseRateLimit(supabase: any, identifier: string): Promise<{ allowed: boolean; remaining: number }> {
  const rateLimitKey = `otp_request:${identifier.toLowerCase()}`;
  
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: rateLimitKey,
      p_limit: OTP_RATE_LIMIT,
      p_window_ms: OTP_RATE_WINDOW_MS
    });
    
    if (error) {
      console.error('[OTP-REQUEST] Rate limit check failed:', error);
      // Fail open but log - don't block legitimate users due to DB issues
      return { allowed: true, remaining: OTP_RATE_LIMIT };
    }
    
    return { 
      allowed: data?.allowed ?? true, 
      remaining: data?.remaining ?? OTP_RATE_LIMIT 
    };
  } catch (err) {
    console.error('[OTP-REQUEST] Rate limit exception:', err);
    return { allowed: true, remaining: OTP_RATE_LIMIT };
  }
}

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { identifier, type = 'email', captcha_token } = await req.json();

    // CAPTCHA (Cloudflare Turnstile): chi ep buoc khi da dat TURNSTILE_SECRET_KEY
    const captchaError = await checkTurnstile(captcha_token);
    if (captchaError) {
      return new Response(
        JSON.stringify({ success: false, error: CAPTCHA_ERROR_MESSAGE }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role (needed for rate limiting)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Database-backed rate limiting - SECURITY FIX
    if (identifier) {
      const rateLimit = await checkDatabaseRateLimit(supabase, identifier);
      if (!rateLimit.allowed) {
        console.warn(`[OTP-REQUEST] Rate limit exceeded for: ${identifier}`);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Too many OTP requests. Please wait before trying again (max 3 per hour).',
            retry_after_seconds: 3600
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`[OTP-REQUEST] Processing request for: ${identifier}, type: ${type}`);

    if (!identifier) {
      return new Response(
        JSON.stringify({ success: false, error: 'Identifier is required (email or phone)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    if (type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(identifier)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid email format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Supabase client already created above for rate limiting

    // Generate OTP and expiry (10 minutes)
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Delete any existing unused OTP for this identifier
    await supabase
      .from('otp_codes')
      .delete()
      .eq('identifier', identifier.toLowerCase())
      .eq('is_used', false);

    // Store OTP in database
    const { error: insertError } = await supabase
      .from('otp_codes')
      .insert({
        identifier: identifier.toLowerCase(),
        code: otp,
        type: type,
        expires_at: expiresAt,
        is_used: false,
        attempts: 0,
        max_attempts: 5
      });

    if (insertError) {
      console.error('[OTP-REQUEST] Failed to store OTP:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to generate OTP' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send OTP via shared resendClient (logs to email_delivery_logs, masks recipient, no OTP in logs)
    const sendResult = await sendBrandedEmail({
      to: identifier,
      subject: "🔐 Mã xác thực OTP của bạn - FUN Ecosystem",
      html: otpEmailHtml({ otp }),
      emailType: "sso_otp",
      metadata: { flow: "sso-otp-request", type },
    });
    const emailSent = sendResult.ok;
    if (!emailSent) {
      console.error('[OTP-REQUEST] sendBrandedEmail failed:', sendResult.error);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        message: emailSent ? `OTP sent to ${identifier}` : 'OTP generated (email delivery pending)',
        email_sent: emailSent,
        expires_in_seconds: 600
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[OTP-REQUEST] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
