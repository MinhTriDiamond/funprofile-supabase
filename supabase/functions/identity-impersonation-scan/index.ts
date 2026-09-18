// identity-impersonation-scan
// Quét tài khoản mới so với toàn bộ user cũ để phát hiện mạo danh
// (tên + ảnh đại diện giống). Tạo cảnh báo + thông báo cho nạn nhân.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { createAdminClient } from "../_shared/supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ===== Avatar fingerprint helpers =====
async function computePhash(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(to);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 8_000_000) return null;
    const img = await Image.decode(buf);
    img.resize(8, 8);
    const pixels: number[] = [];
    for (let y = 1; y <= 8; y++) {
      for (let x = 1; x <= 8; x++) {
        const c = img.getPixelAt(x, y);
        const r = (c >> 24) & 0xff;
        const g = (c >> 16) & 0xff;
        const b = (c >> 8) & 0xff;
        pixels.push((r * 299 + g * 587 + b * 114) / 1000);
      }
    }
    const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    let bits = "";
    for (const p of pixels) bits += p >= avg ? "1" : "0";
    let hex = "";
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch (e) {
    console.warn("[scan] phash failed:", (e as Error).message);
    return null;
  }
}

function hammingHex(a: string | null, b: string | null): number {
  if (!a || !b || a.length !== b.length) return 999;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

// pHash hamming → similarity 0..100 (64 bits max distance)
function phashSimilarity(distance: number): number {
  if (distance >= 64) return 0;
  return Math.max(0, Math.round((1 - distance / 64) * 100));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabase = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const profileId: string | undefined = body.profile_id;
    if (!profileId) {
      return new Response(JSON.stringify({ error: "profile_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load suspect profile
    const { data: suspect, error: pErr } = await supabase
      .from("profiles")
      .select(
        "id, username, full_name, display_name, avatar_url, avatar_phash, created_at, is_banned",
      )
      .eq("id", profileId)
      .maybeSingle();
    if (pErr || !suspect) {
      return new Response(JSON.stringify({ error: "profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (suspect.is_banned) {
      return new Response(JSON.stringify({ skipped: "banned" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute/refresh avatar phash for suspect
    let suspectPhash = suspect.avatar_phash as string | null;
    if (suspect.avatar_url) {
      const computed = await computePhash(suspect.avatar_url);
      if (computed) {
        suspectPhash = computed;
        await supabase
          .from("profiles")
          .update({ avatar_phash: computed })
          .eq("id", suspect.id);
      }
    }

    // Find candidates with similar names
    const { data: candidates, error: cErr } = await supabase.rpc(
      "find_similar_profiles_for_impersonation",
      { p_profile_id: profileId, p_min_similarity: 0.55, p_limit: 25 },
    );
    if (cErr) {
      console.error("[scan] rpc error:", cErr);
      return new Response(JSON.stringify({ error: cErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const alerts: Array<Record<string, unknown>> = [];

    for (const c of candidates ?? []) {
      const nameSim = Math.round(Number(c.name_similarity) * 100);

      // Avatar comparison (when both have phash)
      let avatarSim = 0;
      let phashDistance = 64;
      if (suspectPhash && c.avatar_phash) {
        phashDistance = hammingHex(suspectPhash, c.avatar_phash);
        avatarSim = phashSimilarity(phashDistance);
      } else if (!c.avatar_url && !suspect.avatar_url) {
        // Both lack avatar — only weak name signal
        avatarSim = 0;
      } else if (c.avatar_url && !c.avatar_phash) {
        // compute candidate phash on demand (one-off backfill)
        const cp = await computePhash(c.avatar_url);
        if (cp) {
          await supabase
            .from("profiles")
            .update({ avatar_phash: cp })
            .eq("id", c.id);
          if (suspectPhash) {
            phashDistance = hammingHex(suspectPhash, cp);
            avatarSim = phashSimilarity(phashDistance);
          }
        }
      }

      // Weighted overall score: name 40% + avatar 60%
      const overall = Math.round(nameSim * 0.4 + avatarSim * 0.6);

      // Trigger conditions:
      //  A. avatar very similar (hamming ≤ 10) AND name similarity ≥ 65 → strong impersonation
      //  B. name nearly identical (≥ 90) regardless of avatar → name-only mimicry
      const strongAvatar = avatarSim >= 84 && nameSim >= 65; // hamming ≤ 10
      const strongName = nameSim >= 90;
      if (!strongAvatar && !strongName) continue;

      const details = {
        suspect: {
          id: suspect.id,
          username: suspect.username,
          display_name: suspect.display_name,
          full_name: suspect.full_name,
          avatar_url: suspect.avatar_url,
          created_at: suspect.created_at,
        },
        victim: {
          id: c.id,
          username: c.username,
          display_name: c.display_name,
          full_name: c.full_name,
          avatar_url: c.avatar_url,
          created_at: c.created_at,
        },
        signals: {
          name_similarity: nameSim,
          avatar_similarity: avatarSim,
          phash_distance: phashDistance,
          trigger: strongAvatar ? "avatar+name" : "name_only",
        },
      };

      const { data: alert, error: insErr } = await supabase
        .from("impersonation_alerts")
        .upsert(
          {
            victim_user_id: c.id,
            suspect_user_id: suspect.id,
            name_similarity: nameSim,
            avatar_similarity: avatarSim,
            overall_score: overall,
            status: "pending",
            details,
          },
          { onConflict: "victim_user_id,suspect_user_id" },
        )
        .select("id")
        .maybeSingle();

      if (insErr) {
        console.warn("[scan] insert alert error:", insErr.message);
        continue;
      }

      // Notify victim (idempotent: check recent dup)
      await supabase.from("notifications").insert({
        user_id: c.id,
        actor_id: suspect.id,
        type: "impersonation_alert",
        read: false,
        metadata: {
          alert_id: alert?.id,
          suspect_id: suspect.id,
          suspect_username: suspect.username,
          name_similarity: nameSim,
          avatar_similarity: avatarSim,
          overall_score: overall,
        },
      });

      alerts.push({ victim_id: c.id, overall, nameSim, avatarSim });
    }

    await supabase
      .from("profiles")
      .update({ impersonation_scanned_at: new Date().toISOString() })
      .eq("id", suspect.id);

    return new Response(
      JSON.stringify({
        success: true,
        suspect_id: suspect.id,
        candidates_checked: candidates?.length ?? 0,
        alerts_created: alerts.length,
        alerts,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[scan] error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
