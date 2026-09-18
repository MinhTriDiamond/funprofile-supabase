// @ts-ignore Deno types
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!
    );

    // Parse optional days param (default 7)
    let days = 7;
    let dryRun = false;
    try {
      const body = await req.json();
      if (typeof body?.days === "number" && body.days > 0) days = body.days;
      if (body?.dry_run === true) dryRun = true;
    } catch {
      // no body
    }

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch confirmed internal donations in window
    const { data: donations, error: donErr } = await supabase
      .from("donations")
      .select("id, sender_id, recipient_id, amount, token_symbol, tx_hash, message, created_at, post_id, is_external, status")
      .gte("created_at", since)
      .eq("status", "confirmed")
      .not("sender_id", "is", null)
      .not("recipient_id", "is", null)
      .or("is_external.is.null,is_external.eq.false")
      .order("created_at", { ascending: false });

    if (donErr) throw new Error(`Failed to fetch donations: ${donErr.message}`);
    if (!donations || donations.length === 0) {
      return new Response(JSON.stringify({ message: "No donations in window", days, since }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Find which tx_hashes already have a gift_celebration post
    const txHashes = donations.map((d: any) => d.tx_hash).filter(Boolean);
    const existingTx = new Set<string>();
    const BATCH = 100;
    for (let i = 0; i < txHashes.length; i += BATCH) {
      const slice = txHashes.slice(i, i + BATCH);
      const { data: posts } = await supabase
        .from("posts")
        .select("tx_hash")
        .eq("post_type", "gift_celebration")
        .in("tx_hash", slice);
      for (const p of posts || []) {
        if (p.tx_hash) existingTx.add(p.tx_hash);
      }
    }

    const missing = donations.filter((d: any) => d.tx_hash && !existingTx.has(d.tx_hash));

    if (missing.length === 0) {
      return new Response(
        JSON.stringify({
          message: "No missing posts",
          days, since,
          donations_scanned: donations.length,
          missing: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Fetch profiles for content
    const userIds = Array.from(new Set(missing.flatMap((d: any) => [d.sender_id, d.recipient_id])));
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", userIds);

    const profileMap = new Map<string, { username: string; display_name: string | null }>();
    for (const p of profiles || []) {
      profileMap.set(p.id, { username: p.username, display_name: p.display_name });
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({
          dry_run: true,
          days, since,
          donations_scanned: donations.length,
          would_create: missing.length,
          tx_hashes: missing.map((d: any) => d.tx_hash),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Insert posts one-by-one and link to donation
    const created: string[] = [];
    const failed: { tx_hash: string; error: string }[] = [];

    for (const d of missing) {
      const sender = profileMap.get(d.sender_id);
      const recipient = profileMap.get(d.recipient_id);
      const senderName = sender?.display_name || sender?.username || "Người dùng";
      const recipientName = recipient?.display_name || recipient?.username || "User";
      const amountNum = parseFloat(d.amount);
      const amountDisplay = isFinite(amountNum) ? amountNum.toLocaleString() : d.amount;

      const content = `🎉 @${senderName} đã trao gửi ${amountDisplay} ${d.token_symbol} cho @${recipientName} ❤️${d.message ? `\n\n"${String(d.message).slice(0, 120)}"` : ""}`;

      const { data: post, error: postErr } = await supabase
        .from("posts")
        .insert({
          user_id: d.sender_id,
          content,
          post_type: "gift_celebration",
          tx_hash: d.tx_hash,
          gift_sender_id: d.sender_id,
          gift_recipient_id: d.recipient_id,
          gift_token: d.token_symbol,
          gift_amount: d.amount,
          gift_message: d.message || null,
          is_highlighted: true,
          highlight_expires_at: null,
          visibility: "public",
          moderation_status: "approved",
          created_at: d.created_at,
        })
        .select("id")
        .single();

      if (postErr || !post?.id) {
        failed.push({ tx_hash: d.tx_hash, error: postErr?.message || "unknown" });
        console.error(`[backfill] Failed for ${d.tx_hash}:`, postErr?.message);
        continue;
      }

      created.push(d.tx_hash);

      // Link post to donation if not linked
      if (!d.post_id) {
        await supabase.from("donations").update({ post_id: post.id }).eq("id", d.id);
      }

      // Notification (skip self-donations)
      if (d.sender_id !== d.recipient_id) {
        await supabase.from("notifications").insert({
          user_id: d.recipient_id,
          actor_id: d.sender_id,
          post_id: post.id,
          type: "donation",
          read: false,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        days, since,
        donations_scanned: donations.length,
        missing_found: missing.length,
        posts_created: created.length,
        posts_failed: failed.length,
        created_tx_hashes: created,
        failed_details: failed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[backfill-missing-gift-posts] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
