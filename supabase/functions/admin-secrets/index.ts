// Admin Secrets Vault - quản lý app secrets nội bộ FUN.RICH
// SECURITY:
//   - Admin only (has_role check)
//   - KHÔNG có endpoint nào trả raw value
//   - Mọi hành động chỉ log {action, name, actor_id}
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NAME_RE = /^[A-Z][A-Z0-9_]{2,127}$/;
const MAX_VALUE_LEN = 24576;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const MASTER = Deno.env.get("APP_SECRETS_MASTER_KEY");

    if (!MASTER || MASTER.length < 16) {
      return json({ error: "Server misconfigured: master key missing" }, 500);
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub as string;

    const { data: isAdmin, error: roleErr } = await userClient.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr || !isAdmin) return json({ error: "Forbidden" }, 403);

    const svc = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    if (action === "list") {
      const { data, error } = await svc
        .from("app_secrets")
        .select("id, name, description, created_at, updated_at, created_by, updated_by")
        .order("name", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      console.log(JSON.stringify({ admin_secrets: "list", actor: userId, count: data?.length ?? 0 }));
      return json({
        ok: true,
        secrets: (data ?? []).map((r) => ({ ...r, configured: true })),
      });
    }

    if (action === "upsert") {
      const itemsRaw = Array.isArray(body?.items)
        ? body.items
        : body?.name
        ? [{ name: body.name, value: body.value, description: body.description }]
        : [];
      if (!itemsRaw.length) return json({ error: "No items" }, 400);

      const results: { name: string; ok: boolean; error?: string; result?: string }[] = [];

      for (const it of itemsRaw) {
        const name = String(it?.name ?? "").trim().toUpperCase();
        const value = typeof it?.value === "string" ? it.value : "";
        const desc = typeof it?.description === "string" ? it.description.slice(0, 500) : null;

        if (!NAME_RE.test(name)) {
          results.push({ name, ok: false, error: "Tên không hợp lệ (A-Z, 0-9, _; 3-128 ký tự)" });
          continue;
        }
        if (value.length < 1 || value.length > MAX_VALUE_LEN) {
          results.push({ name, ok: false, error: "Độ dài value không hợp lệ" });
          continue;
        }

        const { data: res, error } = await svc.rpc("app_secret_set", {
          _name: name,
          _value: value,
          _key: MASTER,
          _actor: userId,
          _description: desc,
        });
        if (error) {
          results.push({ name, ok: false, error: error.message });
          continue;
        }
        console.log(JSON.stringify({ admin_secrets: "upsert", actor: userId, name, result: res }));
        results.push({ name, ok: true, result: String(res) });
      }
      return json({ ok: true, results });
    }

    if (action === "delete") {
      const name = String(body?.name ?? "").trim().toUpperCase();
      if (!NAME_RE.test(name)) return json({ error: "Invalid name" }, 400);
      const { data: deleted, error } = await svc.rpc("app_secret_delete", {
        _name: name,
        _actor: userId,
      });
      if (error) return json({ error: error.message }, 500);
      console.log(JSON.stringify({ admin_secrets: "delete", actor: userId, name, deleted }));
      return json({ ok: true, deleted: !!deleted });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || "Internal error" }, 500);
  }
});
