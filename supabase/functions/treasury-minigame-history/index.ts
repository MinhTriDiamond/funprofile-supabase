import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let source = "all", status_filter = "", date_range = "30d", page = 1, limit = 30;
    try {
      const body = await req.json();
      source = body.source || "all";
      status_filter = body.status_filter || "";
      date_range = body.date_range || "30d";
      page = body.page || 1;
      limit = Math.min(body.limit || 30, 100);
    } catch { /* defaults */ }

    let sinceIso: string | null = null;
    if (date_range !== "all") {
      const days = date_range === "7d" ? 7 : date_range === "30d" ? 30 : 90;
      sinceIso = new Date(Date.now() - days * 86400_000).toISOString();
    }

    // Fetch both sources (no pagination at DB level — small data, merge then paginate)
    async function fetchPetShop() {
      let q = admin.from("pet_shop_orders").select(
        "id, user_id, cosmetic_id, price_camly, tx_hash, status, from_address, created_at, confirmed_at, expires_at, failure_reason"
      ).order("created_at", { ascending: false }).limit(2000);
      if (status_filter) q = q.eq("status", status_filter);
      if (sinceIso) q = q.gte("created_at", sinceIso);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    }
    async function fetchMystery() {
      let q = admin.from("mystery_box_orders").select(
        "id, user_id, box_def_id, box_code, price_camly, tx_hash, status, from_address, created_at, confirmed_at, expires_at, failure_reason"
      ).order("created_at", { ascending: false }).limit(2000);
      if (status_filter) q = q.eq("status", status_filter);
      if (sinceIso) q = q.gte("created_at", sinceIso);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    }

    const [petRaw, boxRaw] = await Promise.all([
      source === "mystery_box" ? Promise.resolve([]) : fetchPetShop(),
      source === "pet_shop" ? Promise.resolve([]) : fetchMystery(),
    ]);

    const cosmeticIds = [...new Set(petRaw.map((o: any) => o.cosmetic_id).filter(Boolean))];
    const boxIds = [...new Set(boxRaw.map((o: any) => o.box_def_id).filter(Boolean))];
    const userIds = [...new Set([...petRaw, ...boxRaw].map((o: any) => o.user_id).filter(Boolean))];

    const [cosmetics, boxes, profiles] = await Promise.all([
      cosmeticIds.length
        ? admin.from("pet_cosmetics_catalog").select("id, name_vi, slug").in("id", cosmeticIds)
        : Promise.resolve({ data: [] }),
      boxIds.length
        ? admin.from("mystery_box_definitions").select("id, name_vi, code").in("id", boxIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? admin.from("profiles").select("id, username, full_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
    ]);

    const cosmeticMap: Record<string, any> = {};
    (cosmetics.data || []).forEach((c: any) => { cosmeticMap[c.id] = c; });
    const boxMap: Record<string, any> = {};
    (boxes.data || []).forEach((b: any) => { boxMap[b.id] = b; });
    const profileMap: Record<string, any> = {};
    (profiles.data || []).forEach((p: any) => { profileMap[p.id] = p; });

    type Row = {
      id: string; source: "pet_shop" | "mystery_box"; user_id: string;
      username: string | null; full_name: string | null;
      item_name: string; item_code: string | null;
      price_camly: number; tx_hash: string | null; status: string;
      from_address: string | null; created_at: string; confirmed_at: string | null;
      expires_at: string | null; failure_reason: string | null;
    };

    const merged: Row[] = [];
    petRaw.forEach((o: any) => {
      const c = cosmeticMap[o.cosmetic_id];
      const p = profileMap[o.user_id];
      merged.push({
        id: o.id, source: "pet_shop", user_id: o.user_id,
        username: p?.username || null, full_name: p?.full_name || null,
        item_name: c?.name_vi || c?.slug || "—", item_code: c?.slug || null,
        price_camly: Number(o.price_camly || 0), tx_hash: o.tx_hash, status: o.status,
        from_address: o.from_address, created_at: o.created_at,
        confirmed_at: o.confirmed_at, expires_at: o.expires_at, failure_reason: o.failure_reason,
      });
    });
    boxRaw.forEach((o: any) => {
      const b = boxMap[o.box_def_id];
      const p = profileMap[o.user_id];
      merged.push({
        id: o.id, source: "mystery_box", user_id: o.user_id,
        username: p?.username || null, full_name: p?.full_name || null,
        item_name: b?.name_vi || b?.code || o.box_code || "—", item_code: b?.code || o.box_code,
        price_camly: Number(o.price_camly || 0), tx_hash: o.tx_hash, status: o.status,
        from_address: o.from_address, created_at: o.created_at,
        confirmed_at: o.confirmed_at, expires_at: o.expires_at, failure_reason: o.failure_reason,
      });
    });

    merged.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    const total = merged.length;
    const confirmed = merged.filter(r => r.status === "confirmed").length;
    const revenue_camly = merged
      .filter(r => r.status === "confirmed")
      .reduce((sum, r) => sum + r.price_camly, 0);

    const offset = (page - 1) * limit;
    const paged = merged.slice(offset, offset + limit);

    return new Response(JSON.stringify({
      orders: paged,
      summary: { total, confirmed, revenue_camly },
      total_count: total,
      page, limit,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("treasury-minigame-history error:", err);
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
