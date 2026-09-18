import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

/**
 * Admin-only one-shot: xóa các post gift_celebration trùng tx_hash
 * (giữ bản có created_at nhỏ nhất, id nhỏ nhất). Chạy batch để tránh statement timeout.
 */
Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const admin = createAdminClient();

    // Authn: caller phải là admin
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid auth" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalDeleted = 0;
    let rounds = 0;
    const BATCH_HASHES = 25;

    while (rounds < 100) {
      rounds++;

      // Lấy 25 tx_hash đang còn trùng
      const { data: dupHashes, error: dupErr } = await admin.rpc("__noop__", {}).then(
        () => admin.from("posts").select("tx_hash").limit(0)
      ).catch(() => ({ data: null, error: null }));
      // không dùng rpc — thay bằng SELECT thông thường
      const { data: hashes, error: hErr } = await admin
        .from("posts")
        .select("tx_hash")
        .eq("post_type", "gift_celebration")
        .not("tx_hash", "is", null);
      if (hErr || !hashes) break;

      // Group client-side: hash → count
      const counts = new Map<string, number>();
      for (const r of hashes as { tx_hash: string }[]) {
        const k = (r.tx_hash || "").toLowerCase();
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      const dupBatch = Array.from(counts.entries())
        .filter(([_, c]) => c > 1)
        .map(([h]) => h)
        .slice(0, BATCH_HASHES);

      if (dupBatch.length === 0) break;

      for (const h of dupBatch) {
        // Lấy toàn bộ post cùng tx_hash, sort, giữ row đầu, xóa các row còn lại
        const { data: rows } = await admin
          .from("posts")
          .select("id, created_at")
          .eq("post_type", "gift_celebration")
          .ilike("tx_hash", h)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true });
        if (!rows || rows.length <= 1) continue;
        const victimIds = rows.slice(1).map(r => r.id);
        const { error: delErr } = await admin
          .from("posts")
          .delete()
          .in("id", victimIds);
        if (!delErr) totalDeleted += victimIds.length;
      }
    }

    // Backfill donations.post_id (best-effort, một mẻ nhỏ)
    let postIdLinked = 0;
    {
      const { data: orphanDonations } = await admin
        .from("donations")
        .select("id, tx_hash")
        .is("post_id", null)
        .not("tx_hash", "is", null)
        .limit(2000);
      if (orphanDonations) {
        for (const d of orphanDonations as { id: string; tx_hash: string }[]) {
          const { data: postRow } = await admin
            .from("posts")
            .select("id")
            .eq("post_type", "gift_celebration")
            .ilike("tx_hash", d.tx_hash.toLowerCase())
            .limit(1)
            .maybeSingle();
          if (postRow?.id) {
            await admin.from("donations").update({ post_id: postRow.id }).eq("id", d.id);
            postIdLinked++;
          }
        }
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      rounds,
      duplicates_deleted: totalDeleted,
      donations_linked: postIdLinked,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
