import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { tx_hash, sender_id, recipient_id, amount, token_symbol, message } = await req.json();

    // ────────────────────────────────────────────────────────────────
    // BTC_FEATURE_FROZEN (03/09/2026) — ĐÓNG tạo giao dịch BTC mới.
    // Chặn cả khi function bị gọi trực tiếp. Lịch sử BTC cũ không bị ảnh hưởng.
    // ────────────────────────────────────────────────────────────────
    const BTC_NEW_TX_DISABLED = true;
    if (
      BTC_NEW_TX_DISABLED &&
      (String(token_symbol ?? "").toUpperCase() === "BTC" ||
        (typeof tx_hash === "string" && tx_hash.startsWith("btc-manual-")))
    ) {
      console.warn(`[manual-create-donation][BTC_FEATURE_FROZEN] rejected tx=${tx_hash}`);
      return new Response(
        JSON.stringify({
          error: "BTC_FEATURE_FROZEN",
          message: "Tính năng đang bảo trì: hệ thống tạm ngừng ghi nhận giao dịch BTC mới.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check if sender is banned
    const { data: senderBanCheck } = await adminClient
      .from('profiles').select('is_banned').eq('id', sender_id).maybeSingle();
    if (senderBanCheck?.is_banned) {
      return new Response(
        JSON.stringify({ error: 'Tài khoản người gửi đã bị cấm vĩnh viễn.' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    if (!tx_hash || !sender_id || !recipient_id || !amount || !token_symbol) {
      return new Response(
        JSON.stringify({ error: "tx_hash, sender_id, recipient_id, amount, token_symbol are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if donation already exists
    const { data: existing } = await adminClient
      .from("donations")
      .select("id")
      .eq("tx_hash", tx_hash)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: "Donation with this tx_hash already exists", existing_id: existing.id }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get profiles for content
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, username, display_name")
      .in("id", [sender_id, recipient_id]);

    const profileMap: Record<string, { username: string; display_name: string | null }> = {};
    for (const p of profiles || []) {
      profileMap[p.id] = { username: p.username, display_name: p.display_name };
    }

    const sender = profileMap[sender_id];
    const recipient = profileMap[recipient_id];

    if (!sender || !recipient) {
      return new Response(
        JSON.stringify({ error: "Sender or recipient profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Create donation
    const { data: donation, error: donErr } = await adminClient
      .from("donations")
      .insert({
        sender_id,
        recipient_id,
        amount: String(amount),
        token_symbol,
        tx_hash,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        chain_id: 56,
        card_theme: "celebration",
        card_sound: "rich-1",
        message: message || null,
        light_score_earned: 0,
      })
      .select("id")
      .single();

    if (donErr) throw new Error(`Failed to create donation: ${donErr.message}`);

    // 2. Create gift_celebration post
    const senderName = sender.display_name || sender.username;
    const recipientName = recipient.display_name || recipient.username;

    const { data: post, error: postErr } = await adminClient
      .from("posts")
      .insert({
        user_id: sender_id,
        content: `${senderName} đã tặng ${amount} ${token_symbol} cho ${recipientName}`,
        post_type: "gift_celebration",
        tx_hash,
        gift_sender_id: sender_id,
        gift_recipient_id: recipient_id,
        gift_token: token_symbol,
        gift_amount: String(amount),
        gift_message: message || null,
        is_highlighted: true,
        visibility: "public",
        moderation_status: "approved",
      })
      .select("id")
      .single();

    if (postErr) {
      console.error("Failed to create post:", postErr.message);
    }

    // 3. Update donation with post_id
    if (post?.id && donation?.id) {
      await adminClient
        .from("donations")
        .update({ post_id: post.id })
        .eq("id", donation.id);
    }

    // 4. Create notification
    if (sender_id !== recipient_id) {
      await adminClient
        .from("notifications")
        .insert({
          user_id: recipient_id,
          actor_id: sender_id,
          type: "donation",
          post_id: post?.id || null,
          read: false,
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        donation_id: donation?.id,
        post_id: post?.id || null,
        message: `Đã tạo donation + post cho @${sender.username} → @${recipient.username}: ${amount} ${token_symbol}`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("manual-create-donation error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
