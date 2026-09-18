import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { getExternalTxFilter } from "../_shared/externalTxFilter.ts";

/**
 * Moralis Streams Webhook — Nhận push notification realtime từ Moralis
 * khi có ERC20 transfer TO bất kỳ ví fun.rich nào.
 * Tạo donation + gift_celebration post + notification + chat message ngay lập tức.
 */

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18 },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { symbol: "BTCB", decimals: 18 },
  "0x0910320181889fefde0bb1ca63962b0a8882e413": { symbol: "CAMLY", decimals: 3 },
};

const FUN_TOKEN_ADDRESS = "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6";

const MIN_AMOUNTS: Record<string, number> = {
  USDT: 0.01,
  BTCB: 0.01,
  CAMLY: 1,
  FUN: 1,
};

function parseAmount(value: string, decimals: number): string {
  const rawValue = BigInt(value || "0");
  const divisor = BigInt(10 ** decimals);
  const intPart = rawValue / divisor;
  const fracPart = rawValue % divisor;
  return `${intPart}.${fracPart.toString().padStart(decimals, "0")}`.replace(/\.?0+$/, "") || "0";
}

/**
 * Verify Moralis webhook signature using HMAC SHA3-256.
 */
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const computed = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    return computed === signature.toLowerCase();
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  // Moralis sends a test webhook with empty body on stream creation — respond 200
  if (req.method === "GET") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const streamSecret = Deno.env.get("MORALIS_STREAM_SECRET");
    if (!streamSecret) {
      console.error("MORALIS_STREAM_SECRET not configured");
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();

    // Moralis sends x-signature header for verification
    const signature = req.headers.get("x-signature") || "";
    if (signature) {
      const valid = await verifySignature(rawBody, signature, streamSecret);
      if (!valid) {
        console.error("Invalid webhook signature");
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const payload = JSON.parse(rawBody);

    // Moralis Streams test webhook (confirmed = false, or empty erc20Transfers)
    if (payload.confirmed === false) {
      // Unconfirmed tx — skip, wait for confirmed
      return new Response(JSON.stringify({ message: "Skipping unconfirmed tx" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const erc20Transfers = payload.erc20Transfers || [];
    if (erc20Transfers.length === 0) {
      return new Response(JSON.stringify({ message: "No ERC20 transfers", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createAdminClient();
    const txFilter = await getExternalTxFilter(adminClient);

    // Load all profiles with wallets
    const { data: allProfiles } = await adminClient
      .from("profiles")
      .select("id, public_wallet_address, wallet_address, external_wallet_address, username, display_name")
      .not("public_wallet_address", "is", null);

    const walletToProfile = new Map<string, { id: string; username: string; display_name: string | null }>();
    for (const p of allProfiles || []) {
      for (const field of [p.public_wallet_address, p.wallet_address, p.external_wallet_address]) {
        if (field) {
          walletToProfile.set(field.toLowerCase(), {
            id: p.id,
            username: p.username,
            display_name: p.display_name,
          });
        }
      }
    }

    // Determine chain from payload
    const chainId = payload.chainId;
    const isBscTestnet = chainId === "0x61"; // 97
    const isBscMainnet = chainId === "0x38"; // 56
    const numericChainId = isBscTestnet ? 97 : 56;

    // Process each transfer
    const donationsToInsert: Record<string, unknown>[] = [];
    const transfersInfo: { donation: Record<string, unknown>; senderProfile: { id: string; username: string; display_name: string | null } | null; recipientProfile: { id: string; username: string; display_name: string | null } }[] = [];

    for (const transfer of erc20Transfers) {
      const toAddr = (transfer.to || "").toLowerCase();
      const fromAddr = (transfer.from || "").toLowerCase();
      const contractAddr = (transfer.contract || transfer.address || "").toLowerCase();
      const txHash = transfer.transactionHash || payload.txs?.[0]?.hash || "";

      // Only process if recipient is a fun.rich user
      const recipientProfile = walletToProfile.get(toAddr);
      if (!recipientProfile) continue;

      // Only process known tokens
      const tokenInfo = KNOWN_TOKENS[contractAddr];
      const isFun = contractAddr === FUN_TOKEN_ADDRESS;
      if (!tokenInfo && !isFun) continue;

      let tokenSymbol = "UNKNOWN";
      let tokenDecimals = 18;
      if (tokenInfo) {
        tokenSymbol = tokenInfo.symbol;
        tokenDecimals = tokenInfo.decimals;
      } else if (isFun) {
        tokenSymbol = "FUN";
        tokenDecimals = 18;
      }

      const rawValue = transfer.value || "0";
      const amount = parseAmount(rawValue, tokenDecimals);
      const numAmount = parseFloat(amount);

      if (numAmount <= 0) continue;

      const senderProfile = walletToProfile.get(fromAddr) || null;

      if (!senderProfile) {
        const verdict = txFilter.check({
          tokenSymbol,
          amount: numAmount,
          senderAddress: fromAddr,
          chain: "bsc",
        });
        if (!verdict.ok) {
          await txFilter.log({
            tx_hash: txHash,
            reason: verdict.reason || "rejected",
            token_symbol: tokenSymbol,
            amount: numAmount,
            sender_address: fromAddr,
            recipient_address: toAddr,
            chain: "bsc",
            source: "moralis-webhook",
          });
          continue;
        }
      }

      const donation = {
        sender_id: senderProfile?.id || null,
        sender_address: fromAddr,
        recipient_id: recipientProfile.id,
        amount,
        token_symbol: tokenSymbol,
        token_address: contractAddr,
        chain_id: isFun ? 97 : numericChainId,
        tx_hash: txHash,
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        is_external: !senderProfile,
        card_theme: "celebration",
        card_sound: "rich-1",
        message: null,
        light_score_earned: 0,
        metadata: {
          sender_name: senderProfile?.display_name || senderProfile?.username || "Ví ngoài",
          source: "moralis_webhook",
        },
      };

      donationsToInsert.push(donation);
      transfersInfo.push({ donation, senderProfile, recipientProfile });
    }

    if (donationsToInsert.length === 0) {
      return new Response(JSON.stringify({ message: "No matching transfers", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedup: check existing tx_hashes
    const txHashes = donationsToInsert.map(d => d.tx_hash as string).filter(Boolean);
    const [{ data: existingDonations }, { data: existingPosts }] = await Promise.all([
      adminClient.from("donations").select("tx_hash").in("tx_hash", txHashes),
      adminClient.from("posts").select("tx_hash").eq("post_type", "gift_celebration").in("tx_hash", txHashes),
    ]);

    const existingSet = new Set([
      ...(existingDonations || []).map(d => d.tx_hash),
      ...(existingPosts || []).map(p => p.tx_hash),
    ]);

    const newDonations = donationsToInsert.filter(d => !existingSet.has(d.tx_hash as string));
    const newTransfersInfo = transfersInfo.filter(t => !existingSet.has(t.donation.tx_hash as string));

    if (newDonations.length === 0) {
      return new Response(JSON.stringify({ message: "All transfers already recorded", processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert donations
    const { error: insertError } = await adminClient.from("donations").insert(newDonations);
    if (insertError) {
      console.error("Insert donations error:", insertError);
      throw new Error(`Failed to insert donations: ${insertError.message}`);
    }

    console.log(`[moralis-webhook] Inserted ${newDonations.length} donations`);

    // Create gift_celebration posts cho TẤT CẢ giao dịch (nội bộ + ví ngoài).
    // Giao dịch ví ngoài KHÔNG tính Light Score (không ghi light_actions ở scanner này).
    const postsToInsert = newTransfersInfo.map(t => {
      const isExternal = !!t.donation.is_external || !t.donation.sender_id;
      const senderName = t.senderProfile?.display_name || t.senderProfile?.username
        || (isExternal ? "Ví ngoài" : "Unknown");
      const recipientName = t.recipientProfile.display_name || t.recipientProfile.username || "Unknown";
      return {
        user_id: (t.donation.sender_id as string | null) || (t.donation.recipient_id as string),
        content: `${senderName} đã tặng ${t.donation.amount} ${t.donation.token_symbol} cho ${recipientName}`,
        post_type: "gift_celebration",
        tx_hash: t.donation.tx_hash,
        gift_sender_id: t.donation.sender_id,
        gift_recipient_id: t.donation.recipient_id,
        gift_token: t.donation.token_symbol,
        gift_amount: String(t.donation.amount),
        gift_message: null,
        is_highlighted: true,
        highlight_expires_at: null,
        visibility: "public",
        moderation_status: "approved",
        created_at: t.donation.created_at,
        metadata: isExternal
          ? { is_external: true, sender_address: t.donation.sender_address ?? null }
          : null,
      };
    });

    const allPosts = postsToInsert;
    const insertedPostsByTx = new Map<string, string>();

    if (allPosts.length > 0) {
      const { data: inserted, error: postErr } = await adminClient
        .from("posts")
        .insert(allPosts)
        .select("id, tx_hash");
      if (postErr) console.error("Post insert error:", postErr);
      else {
        for (const p of inserted || []) {
          insertedPostsByTx.set(p.tx_hash, p.id);
        }
        console.log(`[moralis-webhook] Created ${allPosts.length} gift_celebration posts`);
      }
    }

    // Create notifications for internal donations
    const notifications = newTransfersInfo
      .filter(t => t.donation.sender_id)
      .map(t => ({
        user_id: t.donation.recipient_id as string,
        actor_id: t.donation.sender_id as string,
        post_id: insertedPostsByTx.get(t.donation.tx_hash as string) || null,
        type: "donation",
        read: false,
      }));

    // Also create notifications for external donations (no actor_id)
    const externalNotifications = newTransfersInfo
      .filter(t => !t.donation.sender_id)
      .map(t => ({
        user_id: t.donation.recipient_id as string,
        actor_id: t.donation.recipient_id as string, // self-referencing for external
        post_id: insertedPostsByTx.get(t.donation.tx_hash as string) || null,
        type: "donation",
        read: false,
      }));

    const allNotifications = [...notifications, ...externalNotifications];
    if (allNotifications.length > 0) {
      const { error: notifErr } = await adminClient.from("notifications").insert(allNotifications);
      if (notifErr) console.error("Notification insert error:", notifErr);
      else console.log(`[moralis-webhook] Created ${allNotifications.length} notifications`);
    }

    // Send chat messages for internal donations
    for (const t of newTransfersInfo) {
      if (!t.donation.sender_id) continue;
      const senderId = t.donation.sender_id as string;
      const recipientId = t.donation.recipient_id as string;
      if (senderId === recipientId) continue;

      try {
        const senderName = t.senderProfile?.display_name || t.senderProfile?.username || "Unknown";
        const txHashShort = (t.donation.tx_hash as string).substring(0, 10) + "...";

        // Find existing direct conversation
        const { data: existingConvs } = await adminClient
          .from("conversations")
          .select("id, conversation_participants!inner(user_id)")
          .eq("type", "direct");

        let conversationId: string | null = null;
        if (existingConvs) {
          for (const conv of existingConvs) {
            const parts = (conv.conversation_participants as { user_id: string }[]).map(p => p.user_id);
            if (parts.length === 2 && parts.includes(senderId) && parts.includes(recipientId)) {
              conversationId = conv.id;
              break;
            }
          }
        }

        if (!conversationId) {
          const { data: newConv } = await adminClient
            .from("conversations")
            .insert({ type: "direct", created_by: senderId })
            .select("id")
            .single();
          if (newConv) {
            conversationId = newConv.id;
            await adminClient.from("conversation_participants").insert([
              { conversation_id: conversationId, user_id: senderId, role: "member" },
              { conversation_id: conversationId, user_id: recipientId, role: "member" },
            ]);
          }
        }

        if (conversationId) {
          const msgContent = `🎁 ${senderName} đã tặng bạn ${t.donation.amount} ${t.donation.token_symbol}!\n💰 TX: ${txHashShort}`;
          await adminClient.from("messages").insert({
            conversation_id: conversationId,
            sender_id: senderId,
            content: msgContent,
          });
          await adminClient.from("conversations").update({
            last_message_at: new Date().toISOString(),
            last_message_preview: msgContent.substring(0, 100),
          }).eq("id", conversationId);
        }
      } catch (chatErr) {
        console.error(`Chat message error for tx ${t.donation.tx_hash}:`, chatErr);
      }
    }

    return new Response(
      JSON.stringify({
        processed: newDonations.length,
        message: `Ghi nhận ${newDonations.length} giao dịch mới từ webhook`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("moralis-webhook error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
