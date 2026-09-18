// Xác nhận token reset + đặt mật khẩu mới. Body: { token, new_password }
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { token, new_password } = await req.json();
    if (!token || !new_password) {
      return new Response(JSON.stringify({ error: "Thiếu thông tin" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (String(new_password).length < 8) {
      return new Response(JSON.stringify({ error: "Mật khẩu tối thiểu 8 ký tự" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);

    const { data: row, error } = await admin.from("password_reset_tokens").select("*").eq("token", token).maybeSingle();
    if (error || !row) {
      return new Response(JSON.stringify({ error: "Liên kết không hợp lệ" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (row.used_at) {
      return new Response(JSON.stringify({ error: "Liên kết đã được sử dụng" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Liên kết đã hết hạn. Vui lòng yêu cầu mới." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(row.user_id, {
      password: String(new_password),
      email_confirm: true, // đảm bảo confirm luôn để user đăng nhập được
    });
    if (updErr) {
      console.error("[password-reset-confirm] updateUser:", updErr);
      return new Response(JSON.stringify({ error: "Không đặt được mật khẩu mới" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    await admin.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);

    return new Response(JSON.stringify({ success: true, email: row.email }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[password-reset-confirm] error:", err);
    return new Response(JSON.stringify({ error: "Lỗi hệ thống" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
