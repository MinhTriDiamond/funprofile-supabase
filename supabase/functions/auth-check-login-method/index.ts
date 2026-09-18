// auth-check-login-method
// Thay thế lời gọi RPC trực tiếp `check_login_method` từ trang đăng nhập.
// Public (không cần JWT — dùng ở màn hình đăng nhập) nhưng có rate-limit theo IP
// để chống enumeration email: 10 lần/phút/IP.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Body không hợp lệ" }, 400);
    }
    const email = String((payload as { email?: unknown } | null)?.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json({ error: "Email không hợp lệ" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: rl } = await admin.rpc("check_rate_limit", {
      p_key: `check_login_method:${clientIp(req)}`,
      p_limit: RATE_LIMIT,
      p_window_ms: WINDOW_MS,
    });
    if (rl && (rl as { allowed?: boolean }).allowed === false) {
      return json(
        { error: "rate_limited", message: "Bạn thử quá nhiều lần. Vui lòng đợi khoảng 1 phút rồi thử lại." },
        429,
      );
    }

    const { data, error } = await admin.rpc("check_login_method", { p_email: email });
    if (error) {
      console.error("[auth-check-login-method] rpc error:", error.message);
      return json({ error: "Internal error" }, 500);
    }

    return json((data as Record<string, unknown>) ?? { exists: false });
  } catch (err) {
    console.error("[auth-check-login-method] unexpected:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
