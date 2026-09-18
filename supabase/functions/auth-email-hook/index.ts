// SAFE STUB — Plan B: FUN Profile tự gửi email auth qua Resend qua các edge function riêng
// (auth-signup-send-confirm, password-reset-request, ...). Không dùng Supabase Auth Send Email Hook.
// File này giữ lại để tránh lỗi nếu Lovable Cloud tự wire hook. Nó CHỈ trả 200 và không gửi gì.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  console.log("[auth-email-hook] noop stub hit (Plan B: dùng auth-signup-send-confirm / password-reset-request thay thế)");
  return new Response(JSON.stringify({ success: true, noop: true }), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" },
  });
});
