// Xác nhận token signup -> set email_confirm:true. Body: { token }
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Thiếu token" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!);

    const { data: row, error } = await admin.from("email_confirm_tokens").select("*").eq("token", token).maybeSingle();
    if (error || !row) {
      return new Response(JSON.stringify({ error: "Liên kết không hợp lệ" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (row.used_at) {
      return new Response(JSON.stringify({ error: "Liên kết đã được sử dụng" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return new Response(JSON.stringify({ error: "Liên kết đã hết hạn. Vui lòng đăng ký lại hoặc yêu cầu gửi lại email." }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(row.user_id, { email_confirm: true });
    if (updErr) {
      console.error("[signup-confirm] updateUser:", updErr);
      return new Response(JSON.stringify({ error: "Không cập nhật được trạng thái email" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    await admin.from("email_confirm_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);

    return new Response(JSON.stringify({ success: true, email: row.email }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[signup-confirm] error:", err);
    return new Response(JSON.stringify({ error: "Lỗi hệ thống" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
