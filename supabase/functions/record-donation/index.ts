// @ts-ignore Deno types
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DonationRequest {
  sender_id: string;
  recipient_id: string;
  amount: string;
  token_symbol: string;
  token_address: string | null;
  chain_id: number;
  tx_hash: string;
  message?: string;
  message_template?: string;
  post_id?: string;
  card_theme?: string;
  card_sound?: string;
}

function giftTokenLabel(symbol: string, chainId?: number | null): string {
  const s = (symbol || "UNKNOWN").toUpperCase();
  if (s === "BNB") return chainId === 97 ? "BNB (BSC Testnet)" : "BNB (BSC Chain)";
  return s;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: DonationRequest = await req.json();

    // ────────────────────────────────────────────────────────────────
    // BTC_FEATURE_FROZEN (03/09/2026) — ĐÓNG tạo giao dịch BTC mới.
    // Lịch sử BTC cũ KHÔNG bị ảnh hưởng (chỉ chặn ghi mới).
    // Mở lại: đặt BTC_NEW_TX_DISABLED = false ở đây + src/config/btcFeature.ts
    // ────────────────────────────────────────────────────────────────
    const BTC_NEW_TX_DISABLED = true;
    const isBtcRequest =
      body.chain_id === 0 ||
      String(body.token_symbol ?? "").toUpperCase() === "BTC" ||
      (typeof body.tx_hash === "string" && body.tx_hash.startsWith("btc-manual-"));
    if (BTC_NEW_TX_DISABLED && isBtcRequest) {
      console.warn(`[record-donation][BTC_FEATURE_FROZEN] rejected tx=${body.tx_hash} user=${user.id}`);
      return new Response(
        JSON.stringify({
          error: "BTC_FEATURE_FROZEN",
          message: "Tính năng đang bảo trì: hệ thống tạm ngừng ghi nhận giao dịch BTC mới. Lịch sử BTC cũ vẫn xem được đầy đủ.",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ────────────────────────────────────────────────────────────────
    // BTC_MANUAL_CONFIRM_LOCK (P0) — chặn ghi nhận thủ công "Tôi đã gửi xong".
    // Bật lại: app_settings.btc_manual_confirm_enabled = 'true'.
    // Luồng scanner/polling thật (tx_hash on-chain) KHÔNG bị ảnh hưởng.
    // ────────────────────────────────────────────────────────────────
    if (typeof body.tx_hash === "string" && body.tx_hash.startsWith("btc-manual-")) {
      const { data: manualEnabled } = await supabase.rpc("btc_manual_confirm_enabled");
      if (manualEnabled !== true) {
        console.warn(
          `[record-donation][BTC_MANUAL_LOCK] rejected tx=${body.tx_hash} user=${user.id}`,
        );
        return new Response(
          JSON.stringify({
            error: "BTC_MANUAL_CONFIRM_LOCKED",
            message:
              "Đang chờ xác nhận tự động từ blockchain, vui lòng đợi (thường vài phút tới ~1 giờ). Tính năng tự xác nhận thủ công đang tạm khoá.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }


    // Defense-in-depth: chain_id=0 hoặc tx_hash 'btc-manual-' luôn là BTC native.
    // Nếu client lỡ truyền BNB/BTCB (do bug auto-switch token cũ) → ép về BTC.
    if (
      (body.chain_id === 0 || (typeof body.tx_hash === "string" && body.tx_hash.startsWith("btc-manual-"))) &&
      body.token_symbol !== "BTC"
    ) {
      console.warn(`[record-donation] Normalizing token_symbol ${body.token_symbol} → BTC (chain_id=${body.chain_id}, tx=${body.tx_hash})`);
      body.token_symbol = "BTC";
      body.token_address = null;
      body.chain_id = 0;
    }

    if (!body.sender_id || !body.recipient_id || !body.amount || !body.tx_hash) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ────────────────────────────────────────────────────────────────
    // Token↔Chain validate — LOG-ONLY mode (24-48h shadow)
    // Sau khi log-only sạch, đổi cờ ENFORCE=true để reject cứng (trả 400).
    // Registry là SoT: (chain_id, lower(token_address) | NULL nếu native)
    //   phải match 1 record active + risk_level ∈ {trusted, allowed}.
    // ────────────────────────────────────────────────────────────────
    const REGISTRY_ENFORCE = false; // ⚠️ giữ false trong log-only window
    try {
      const symUpper = (body.token_symbol || "").toUpperCase();
      const addrLower = body.token_address ? body.token_address.toLowerCase() : null;
      let query = supabase
        .from("tokens_registry")
        .select("symbol, risk_level, is_active, token_address")
        .eq("chain_id", body.chain_id)
        .eq("is_active", true);
      query = addrLower
        ? query.eq("token_address", addrLower)
        : query.is("token_address", null).eq("symbol", symUpper);
      const { data: regRows, error: regErr } = await query.limit(2);
      const match = (regRows || []).find(
        (r) => r.risk_level === "trusted" || r.risk_level === "allowed",
      );
      if (regErr || !match) {
        const reason = regErr
          ? `registry_query_error:${regErr.message}`
          : (regRows && regRows.length > 0)
            ? `blocked_or_suspicious:${regRows[0].risk_level}`
            : "no_registry_match";
        console.warn(
          `[record-donation][REGISTRY_VALIDATE] miss reason=${reason} ` +
          `chain_id=${body.chain_id} token_symbol=${symUpper} ` +
          `token_address=${addrLower ?? "native"} tx=${body.tx_hash} ` +
          `sender=${body.sender_id} recipient=${body.recipient_id} amount=${body.amount}`,
        );
        // Fire-and-forget: ghi vào bảng cho cron aggregation.
        // TUYỆT ĐỐI không block flow donation — nuốt mọi lỗi.
        try {
          const numAmount = Number.parseFloat(body.amount);
          supabase.from("registry_validate_log").insert({
            reason,
            chain_id: body.chain_id,
            token_symbol: symUpper,
            token_address: addrLower,
            tx_hash: body.tx_hash,
            sender_wallet: body.sender_id,
            recipient_wallet: body.recipient_id,
            amount: Number.isFinite(numAmount) ? numAmount : null,
            extra: { enforce_mode: REGISTRY_ENFORCE, raw_registry_rows: regRows ?? [] },
          }).then(({ error: logErr }) => {
            if (logErr) console.error("[record-donation][REGISTRY_VALIDATE] log insert error:", logErr.message);
          });
        } catch (logCatch) {
          console.error("[record-donation][REGISTRY_VALIDATE] log insert threw:", logCatch);
        }
        if (REGISTRY_ENFORCE) {
          return new Response(
            JSON.stringify({
              error: "Token/chain not allowed by registry",
              reason,
              chain_id: body.chain_id,
              token_symbol: symUpper,
              token_address: addrLower,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    } catch (e) {
      // Log-only: KHÔNG chặn flow nếu registry check tự lỗi
      console.error("[record-donation][REGISTRY_VALIDATE] unexpected error:", e);
    }

    if (body.sender_id !== user.id) {
      // Allow admin recovery for stuck donations
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: "Sender does not match authenticated user" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log(`[record-donation] Admin ${user.id} recovering donation for sender ${body.sender_id}, tx: ${body.tx_hash}`);
    }

    // Sanity check: BTC amount cap (chống nhập sai data inflate UI)
    const numericAmount = parseFloat(body.amount);
    if (!isFinite(numericAmount) || numericAmount <= 0) {
      return new Response(
        JSON.stringify({ error: "Invalid amount" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (body.token_symbol === "BTC" && numericAmount > 1) {
      console.error(`[record-donation] BTC amount cap exceeded: ${numericAmount} from user ${user.id}, tx: ${body.tx_hash}`);
      return new Response(
        JSON.stringify({ error: `Số tiền BTC vượt giới hạn an toàn (${numericAmount} BTC). Liên hệ admin nếu hợp lệ.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (body.token_symbol === "BTC" && numericAmount > 0.1) {
      // Log warning vào audit_logs
      await supabase.from("audit_logs").insert({
        admin_id: user.id,
        target_user_id: body.recipient_id,
        action: "large_btc_donation",
        details: { amount: body.amount, tx_hash: body.tx_hash, recipient: body.recipient_id },
        reason: "BTC donation > 0.1 BTC",
      });
    }

    // Check sender profile status - block banned/on_hold users
    const { data: senderStatus } = await supabase
      .from("profiles")
      .select("reward_status, is_banned")
      .eq("id", user.id)
      .single();

    if (senderStatus?.is_banned) {
      return new Response(
        JSON.stringify({ error: "Tài khoản đã bị cấm. Không thể thực hiện giao dịch." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Note: on_hold/rejected only affects claim-reward, not donations
    // Donations are blockchain transactions that must be recorded for transparency

    // Check duplicate — dedup theo CẶP (tx_hash, recipient_id) để hỗ trợ FunDisperse
    // (1 tx blockchain chứa nhiều donation cho nhiều người nhận khác nhau).
    const { data: existingDonation } = await supabase
      .from("donations")
      .select("id")
      .eq("tx_hash", body.tx_hash)
      .eq("recipient_id", body.recipient_id)
      .maybeSingle();

    if (existingDonation) {
      return new Response(
        JSON.stringify({ error: "Transaction already recorded", donation: existingDonation }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate Light Score
    const amount = parseFloat(body.amount);
    const lightScoreEarned = Math.floor(amount / 100);

    // Create light_action
    let lightActionId = null;
    if (lightScoreEarned > 0) {
      const { data: lightAction } = await supabase
        .from("light_actions")
        .insert({
          user_id: body.sender_id,
          action_type: "donate",
          reference_type: body.post_id ? "post" : "profile",
          reference_id: body.post_id || body.recipient_id,
          content_preview: `Tặng ${body.amount} ${body.token_symbol} cho @${body.recipient_id.slice(0, 8)}`,
          base_reward: 50,
          quality_score: 1.0,
          impact_score: Math.min(5.0, 1 + amount / 1000),
          integrity_score: 1.0,
          unity_score: 80,
          light_score: lightScoreEarned * 10,
          mint_status: "pending",
          mint_amount: lightScoreEarned,
        })
        .select("id")
        .single();

      if (lightAction) lightActionId = lightAction.id;
    }

    // Derive chain_family: BTC always 'bitcoin', else 'evm'
    const chainFamily = body.token_symbol === "BTC" ? "bitcoin" : "evm";

    // Insert donation
    const { data: donation, error: insertError } = await supabase
      .from("donations")
      .insert({
        sender_id: body.sender_id,
        recipient_id: body.recipient_id,
        post_id: body.post_id || null,
        amount: body.amount,
        token_symbol: body.token_symbol,
        token_address: body.token_address,
        chain_id: body.chain_id,
        chain_family: chainFamily,
        tx_hash: body.tx_hash,
        message: body.message,
        message_template: body.message_template,
        status: "confirmed",
        light_score_earned: lightScoreEarned,
        light_action_id: lightActionId,
        confirmed_at: new Date().toISOString(),
        card_theme: body.card_theme || "celebration",
        card_sound: body.card_sound || "rich-1",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting donation:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to record donation", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Pet event: donation_sent (fire-and-forget)
    try {
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/pet-event-hook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))}`,
        },
        body: JSON.stringify({ user_id: body.sender_id, event: 'donation_sent' }),
      }).catch(() => null);
    } catch { /* ignore */ }

    // Mystery Box: gift_sent (fire-and-forget, idempotent theo tx_hash)
    try {
      const { grantMysteryBox } = await import('../_shared/grantMysteryBox.ts');
      grantMysteryBox({
        user_id: body.sender_id,
        source: 'gift_sent',
        source_ref_id: body.tx_hash ?? null,
      }).catch(() => null);
    } catch { /* ignore */ }

    // Create conversation & message
    let conversationId = null;
    let messageId = null;

    // Step 1: get recipient's conversation IDs as a plain array
    const { data: recipientConvs } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", body.recipient_id);

    const recipientConvIds = (recipientConvs || []).map((r: any) => r.conversation_id);

    // Step 2: find sender's conversations that overlap with recipient's
    const { data: existingConv } = recipientConvIds.length > 0
      ? await supabase
          .from("conversation_participants")
          .select("conversation_id")
          .eq("user_id", body.sender_id)
          .in("conversation_id", recipientConvIds)
      : { data: [] };

    if (existingConv && existingConv.length > 0) {
      for (const conv of existingConv) {
        const { data: convData } = await supabase
          .from("conversations")
          .select("id, type")
          .eq("id", conv.conversation_id)
          .eq("type", "direct")
          .single();
        if (convData) { conversationId = convData.id; break; }
      }
    }

    if (!conversationId) {
      const { data: newConv } = await supabase
        .from("conversations")
        .insert({ type: "direct" })
        .select("id")
        .single();
      if (newConv) {
        conversationId = newConv.id;
        await supabase.from("conversation_participants").insert([
          { conversation_id: conversationId, user_id: body.sender_id, role: "member" },
          { conversation_id: conversationId, user_id: body.recipient_id, role: "member" },
        ]);
      }
    }

    // Fetch senderProfile BEFORE conversation block - used for both message and gift post
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", body.sender_id)
      .single();

    if (conversationId) {
      const messageContent = `🎁 ${senderProfile?.username || "Người dùng"} đã tặng bạn ${amount.toLocaleString()} ${body.token_symbol}!\n\n${body.message ? `"${body.message}"\n\n` : ""}💰 TX: ${body.tx_hash.slice(0, 18)}...\n\n👉 Nhấn "Xem Card Chúc Mừng" để xem chi tiết!`;

      const { data: message } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          sender_id: body.sender_id,
          content: messageContent,
          media_urls: JSON.stringify([{
            type: "donation",
            donation_id: donation.id,
            amount: body.amount,
            token_symbol: body.token_symbol,
            tx_hash: body.tx_hash,
          }]),
        })
        .select("id")
        .single();

      if (message) {
        messageId = message.id;
        await supabase
          .from("donations")
          .update({ conversation_id: conversationId, message_id: messageId })
          .eq("id", donation.id);
      }
    }

    // Create gift celebration post on feed
    const { data: recipientProfileData } = await supabase
      .from("profiles")
      .select("username, display_name")
      .eq("id", body.recipient_id)
      .single();

    const recipientName = recipientProfileData?.display_name || recipientProfileData?.username || "User";
    const senderName = senderProfile?.username || "Người dùng";
    const tokenLabel = giftTokenLabel(body.token_symbol, body.chain_id);

    // Always create gift celebration post (even if recipient name not found)
    const postContent = `🎉 @${senderName} đã trao gửi ${amount.toLocaleString()} ${tokenLabel} cho @${recipientName} ❤️${body.message ? `\n\n"${body.message.slice(0, 120)}"` : ''}`;

    let postCreated = false;
    let giftPostId: string | null = null;
    const postPayload = {
      user_id: body.sender_id,
      content: postContent,
      post_type: "gift_celebration",
      tx_hash: body.tx_hash,
      gift_sender_id: body.sender_id,
      gift_recipient_id: body.recipient_id,
      gift_token: body.token_symbol,
      gift_amount: body.amount,
      gift_message: body.message || null,
      metadata: { chain_id: body.chain_id, chain_family: chainFamily },
      is_highlighted: true,
      highlight_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      visibility: "public",
      moderation_status: "approved",
    };

    // Retry up to 3 times with exponential backoff (200ms, 600ms, 1400ms)
    const maxAttempts = 3;
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { data: postData, error: postError } = await supabase
        .from("posts")
        .insert(postPayload)
        .select("id")
        .single();

      if (!postError && postData?.id) {
        postCreated = true;
        giftPostId = postData.id;
        lastError = null;
        if (attempt > 1) {
          console.log(`[record-donation] Post created on attempt ${attempt} for tx_hash: ${body.tx_hash}`);
        }
        break;
      }

      lastError = postError;
      console.error(`[record-donation] Post insert attempt ${attempt}/${maxAttempts} failed:`, postError?.message, "tx_hash:", body.tx_hash);

      if (attempt < maxAttempts) {
        const delayMs = 200 * Math.pow(3, attempt - 1); // 200, 600, 1800
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    if (!postCreated && lastError) {
      console.error(`[record-donation] CRITICAL: All ${maxAttempts} post insert attempts failed for tx_hash ${body.tx_hash}. Error: ${lastError.message}. Donation ID: ${donation.id}`);
    }

    // Link post to donation
    if (giftPostId) {
      await supabase
        .from("donations")
        .update({ post_id: giftPostId })
        .eq("id", donation.id);
    }

    // Notification
    await supabase.from("notifications").insert({
      user_id: body.recipient_id,
      actor_id: body.sender_id,
      post_id: giftPostId || body.post_id || null,
      type: "donation",
    });

    return new Response(
      JSON.stringify({
        success: true,
        donation: { id: donation.id, tx_hash: donation.tx_hash },
        light_score_earned: lightScoreEarned,
        conversation_id: conversationId,
        message_id: messageId,
        post_created: postCreated,
        post_id: giftPostId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in record-donation:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
