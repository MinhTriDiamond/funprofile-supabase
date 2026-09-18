/**
 * stream-webhook-register (admin-only)
 *
 * Đăng ký notification URL cho Cloudflare Stream và trả về secret HMAC.
 * Secret này CHỈ hiển thị 1 lần — admin phải copy và cập nhật vào
 * `CLOUDFLARE_STREAM_WEBHOOK_SECRET` trong Lovable Cloud.
 *
 * Methods:
 *   POST                        -> PUT subscription (set notificationUrl), trả về { secret, notificationUrl }
 *   POST body {action:"test"}   -> Gửi payload mẫu đã ký HMAC tới stream-webhook, trả kết quả xác thực
 *   GET                         -> Trả về subscription hiện tại (không kèm secret)
 *   DELETE                      -> Xoá subscription
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function streamToken(): string | null {
  return Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN') || Deno.env.get('CLOUDFLARE_STREAM_TOKEN');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } }, auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    // Admin check
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
    if (!isAdmin) return json({ error: 'Forbidden — admin only' }, 403);

    const accountId = Deno.env.get('CLOUDFLARE_STREAM_ACCOUNT_ID') ?? Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const token = streamToken();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Chấp nhận test action ngay cả khi thiếu Cloudflare config (test chỉ cần secret HMAC).
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));

      if (body?.action === 'test') {
        const secret = Deno.env.get('CLOUDFLARE_STREAM_WEBHOOK_SECRET') || Deno.env.get('CLOUDFLARE_WEBHOOK_SECRET');
        if (!secret) {
          return json({
            ok: false,
            hmacVerified: false,
            reason: 'missing_secret',
            message: 'CLOUDFLARE_STREAM_WEBHOOK_SECRET chưa được cấu hình trong Lovable Cloud.',
          }, 400);
        }

        const samplePayload = {
          notificationName: 'video.live_input.disconnected',
          liveInput: '00000000000000000000000000000000',
          eventType: 'stream-live-input.disconnected',
          created: new Date().toISOString(),
          meta: { source: 'stream-webhook-register/test' },
        };
        const rawBody = JSON.stringify(samplePayload);
        const time = String(Math.floor(Date.now() / 1000));

        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign'],
        );
        const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${time}.${rawBody}`));
        const sig1 = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');

        const targetUrl = body.targetUrl || `${supabaseUrl}/functions/v1/stream-webhook`;
        const started = Date.now();
        const r = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Webhook-Signature': `time=${time},sig1=${sig1}`,
          },
          body: rawBody,
        });
        const elapsedMs = Date.now() - started;
        const respText = await r.text();
        let respJson: unknown = null;
        try { respJson = JSON.parse(respText); } catch { /* ignore */ }

        const hmacVerified = r.status !== 401;
        return json({
          ok: true,
          hmacVerified,
          status: r.status,
          elapsedMs,
          targetUrl,
          samplePayload,
          response: respJson ?? respText.slice(0, 500),
          message: hmacVerified
            ? 'HMAC hợp lệ. Webhook xác thực chữ ký thành công (payload mẫu có thể bị bỏ qua vì liveInput không tồn tại — điều này bình thường).'
            : 'HMAC KHÔNG khớp. Kiểm tra lại giá trị CLOUDFLARE_STREAM_WEBHOOK_SECRET đã lưu.',
        });
      }
    }

    if (!accountId || !token) return json({ error: 'Missing Cloudflare Stream configuration' }, 500);
    const subUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/webhook`;

    if (req.method === 'GET') {
      const r = await fetch(subUrl, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json().catch(() => null);
      return json({ status: r.status, data });
    }

    if (req.method === 'DELETE') {
      const r = await fetch(subUrl, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json().catch(() => null);
      return json({ status: r.status, data });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const notificationUrl = body.notificationUrl || `${supabaseUrl}/functions/v1/stream-webhook`;

      const r = await fetch(subUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationUrl }),
      });
      const data = await r.json().catch(() => null);

      if (!r.ok || !data?.success) {
        return json({ error: 'Cloudflare PUT failed', status: r.status, detail: data }, 502);
      }

      const secret = data?.result?.secret;
      const savedUrl = data?.result?.notificationUrl;
      return json({
        ok: true,
        notificationUrl: savedUrl,
        secret,
        instruction: 'Copy "secret" và cập nhật vào CLOUDFLARE_STREAM_WEBHOOK_SECRET trong Lovable Cloud secrets. Secret này chỉ hiển thị 1 lần!',
      });
    }

    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('stream-webhook-register error:', error);
    return json({ error: message }, 500);
  }
});
