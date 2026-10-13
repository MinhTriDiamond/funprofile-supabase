import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { moralisFetch, resetMoralisFailures, getMoralisFailures, isMoralisUnavailable, reportMoralisUsage } from "../_shared/moralisFetch.ts";
import { getExternalTxFilter } from "../_shared/externalTxFilter.ts";

/**
 * Fast-scan donations: Quét theo TOKEN CONTRACT thay vì từng ví.
 * Chỉ cần 8 API calls (4 token × 2 chain) thay vì 1054 calls.
 * Chạy mỗi 1 phút qua pg_cron.
 */

const TOKEN_CONTRACTS: { address: string; symbol: string; decimals: number; chains: string[] }[] = [
  { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT", decimals: 18, chains: ["bsc"] },
  { address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", symbol: "BTCB", decimals: 18, chains: ["bsc"] },
  { address: "0x0910320181889fefde0bb1ca63962b0a8882e413", symbol: "CAMLY", decimals: 3, chains: ["bsc"] },
  { address: "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6", symbol: "FUN", decimals: 18, chains: ["bsc testnet"] },
];

const MIN_AMOUNTS: Record<string, number> = {
  USDT: 0.01,
  BTCB: 0.01,
  CAMLY: 1,
  FUN: 1,
};

interface MoralisTransfer {
  transaction_hash: string;
  from_address: string;
  to_address: string;
  value: string;
  block_timestamp: string;
}

function parseAmount(value: string, decimals: number): string {
  const raw = BigInt(value || "0");
  const divisor = BigInt(10 ** decimals);
  const intPart = raw / divisor;
  const fracPart = raw % divisor;
  return `${intPart}.${fracPart.toString().padStart(decimals, "0")}`.replace(/\.?0+$/, "") || "0";
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    resetMoralisFailures();
    const moralisApiKey = Deno.env.get("MORALIS_API_KEY");
    if (!moralisApiKey) {
      // Moralis đã tắt theo quyết định chỉ dùng Alchemy (13/10/2026) — bỏ qua êm, không báo lỗi 500.
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "moralis_disabled", newTransfers: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createAdminClient();
    const txFilter = await getExternalTxFilter(adminClient);

    // 1. Load all fun.rich wallets
    // Lấy mọi profile có ÍT NHẤT 1 cột ví NOT NULL (không chỉ public_wallet_address).
    const { data: allProfiles } = await adminClient
      .from("profiles")
      .select("id, public_wallet_address, wallet_address, external_wallet_address, username, display_name, created_at")
      .or("public_wallet_address.not.is.null,wallet_address.not.is.null,external_wallet_address.not.is.null");

    if (!allProfiles || allProfiles.length === 0) {
      return new Response(JSON.stringify({ message: "No profiles with wallets", newTransfers: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build wallet → profile lookup from ALL wallet fields
    const walletToProfile = new Map<string, { id: string; username: string; display_name: string | null; created_at: string }>();
    const walletSet = new Set<string>();
    for (const p of allProfiles) {
      const profileData = { id: p.id, username: p.username, display_name: p.display_name, created_at: p.created_at };
      const addrs = [p.public_wallet_address, p.wallet_address, p.external_wallet_address].filter(Boolean);
      for (const raw of addrs) {
        const addr = (raw as string).toLowerCase();
        if (!walletToProfile.has(addr)) {
          walletToProfile.set(addr, profileData);
        }
        walletSet.add(addr);
      }
    }

    // 2. Fetch transfers for ALL token contracts in parallel
    const moralisHeaders = { Accept: "application/json" };
    const moralisBase = "https://deep-index.moralis.io/api/v2.2";

    const MAX_PAGES = 2; // 2 × 100 = 200 transfers/token/lần. Cron giãn 1→3 phút
    // ⇒ vẫn phủ đủ lượng transfer giữa 2 lần quét, tiết kiệm ~80% quota Moralis.

    async function fetchTokenTransfers(token: typeof TOKEN_CONTRACTS[0], chain: string) {
      const chainParam = chain === "bsc testnet" ? "bsc%20testnet" : chain;
      const chainId = chain === "bsc testnet" ? 97 : 56;
      const allTransfers: MoralisTransfer[] = [];
      let cursor: string | null = null;

      for (let page = 0; page < MAX_PAGES; page++) {
        try {
          // Moralis v2.2: transfers theo contract token = /erc20/{address}/transfers
          // (endpoint cũ `/{address}/transfers` trả 404 → scanner hỏng âm thầm)
          const url = `${moralisBase}/erc20/${token.address}/transfers?chain=${chainParam}&limit=100&order=DESC${cursor ? `&cursor=${cursor}` : ""}`;
          const res = await moralisFetch(url, { headers: moralisHeaders });
          if (!res.ok) { await res.text(); break; }
          const data = await res.json();
          const transfers = (data.result || []) as MoralisTransfer[];
          allTransfers.push(...transfers);
          cursor = data.cursor || null;
          if (!cursor || transfers.length < 100) break;
        } catch {
          break;
        }
      }

      return { symbol: token.symbol, decimals: token.decimals, contractAddr: token.address, chainId, transfers: allTransfers };
    }

    const fetchPromises = TOKEN_CONTRACTS.flatMap(token =>
      token.chains.map(chain => fetchTokenTransfers(token, chain))
    );

    const results = await Promise.all(fetchPromises);

    // Ghi nhận số call Moralis + báo động admin khi quota gần cạn (mọi call đã xong ở đây)
    await reportMoralisUsage(adminClient, "fast-scan-donations");

    // 3. Filter: only transfers TO fun.rich wallets
    const candidateTransfers: {
      transfer: MoralisTransfer;
      symbol: string;
      decimals: number;
      contractAddr: string;
      chainId: number;
    }[] = [];

    for (const r of results) {
      for (const t of r.transfers) {
        const toAddr = t.to_address?.toLowerCase();
        if (toAddr && walletSet.has(toAddr)) {
          candidateTransfers.push({ transfer: t, symbol: r.symbol, decimals: r.decimals, contractAddr: r.contractAddr, chainId: r.chainId });
        }
      }
    }

    if (candidateTransfers.length === 0) {
      console.log("Fast-scan: no relevant transfers found");
      return new Response(JSON.stringify({ newTransfers: 0, provider_unavailable: isMoralisUnavailable(), provider_errors: getMoralisFailures(), message: isMoralisUnavailable() ? "Chưa quét được: nguồn dữ liệu on-chain tạm thời không truy cập được" : "Không có giao dịch mới" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Dedup against existing donations + posts
    const txHashes = [...new Set(candidateTransfers.map(c => c.transfer.transaction_hash).filter(Boolean))];
    const [{ data: existingDonations }, { data: existingPosts }] = await Promise.all([
      adminClient.from("donations").select("tx_hash").in("tx_hash", txHashes),
      adminClient.from("posts").select("tx_hash").eq("post_type", "gift_celebration").in("tx_hash", txHashes),
    ]);

    const existingSet = new Set([
      ...(existingDonations || []).map(d => d.tx_hash),
      ...(existingPosts || []).map(p => p.tx_hash),
    ]);

    const newTransfers = candidateTransfers.filter(c => c.transfer.transaction_hash && !existingSet.has(c.transfer.transaction_hash));

    if (newTransfers.length === 0) {
      console.log("Fast-scan: all transfers already recorded");
      return new Response(JSON.stringify({ newTransfers: 0, provider_unavailable: isMoralisUnavailable(), provider_errors: getMoralisFailures(), message: isMoralisUnavailable() ? "Chưa quét được: nguồn dữ liệu on-chain tạm thời không truy cập được" : "Tất cả giao dịch đã được ghi nhận" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Build donation records
    const donationsToInsert: Record<string, unknown>[] = [];
    for (const { transfer, symbol, decimals, contractAddr, chainId } of newTransfers) {
      const amount = parseAmount(transfer.value, decimals);
      const numAmount = parseFloat(amount);
      if (numAmount <= 0) continue;

      const senderAddr = transfer.from_address.toLowerCase();
      const recipientAddr = transfer.to_address.toLowerCase();
      const senderProfile = walletToProfile.get(senderAddr);
      const recipientProfile = walletToProfile.get(recipientAddr);
      if (!recipientProfile) continue;

      // Skip transfers before recipient registration
      const txTime = new Date(transfer.block_timestamp).getTime();
      const regTime = new Date(recipientProfile.created_at).getTime();
      if (txTime < regTime) continue;

      if (!senderProfile) {
        const verdict = txFilter.check({
          tokenSymbol: symbol,
          amount: numAmount,
          senderAddress: senderAddr,
          chain: "bsc",
        });
        if (!verdict.ok) {
          await txFilter.log({
            tx_hash: transfer.transaction_hash,
            reason: verdict.reason || "rejected",
            token_symbol: symbol,
            amount: numAmount,
            sender_address: senderAddr,
            recipient_address: recipientAddr,
            chain: "bsc",
            source: "fast-scan-donations",
          });
          continue;
        }
      }

      donationsToInsert.push({
        sender_id: senderProfile?.id || null,
        sender_address: senderAddr,
        recipient_id: recipientProfile.id,
        amount,
        token_symbol: symbol,
        token_address: contractAddr,
        chain_id: chainId,
        tx_hash: transfer.transaction_hash,
        status: "confirmed",
        confirmed_at: transfer.block_timestamp,
        created_at: transfer.block_timestamp,
        is_external: !senderProfile,
        card_theme: "celebration",
        card_sound: "rich-1",
        message: null,
        light_score_earned: 0,
        metadata: {
          sender_name: senderProfile?.display_name || senderProfile?.username || "Ví ngoài",
          auto_scanned: true,
          scanner: "fast-scan",
        },
      });
    }

    if (donationsToInsert.length === 0) {
      return new Response(JSON.stringify({ newTransfers: 0, provider_unavailable: isMoralisUnavailable(), provider_errors: getMoralisFailures(), message: isMoralisUnavailable() ? "Chưa quét được: nguồn dữ liệu on-chain tạm thời không truy cập được" : "Không có giao dịch hợp lệ mới" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Insert donations
    let totalInserted = 0;
    const postsToInsert: Record<string, unknown>[] = [];
    const internalDonations: Record<string, unknown>[] = [];

    for (let i = 0; i < donationsToInsert.length; i += 50) {
      const batch = donationsToInsert.slice(i, i + 50);
      const { error: insertError } = await adminClient.from("donations").insert(batch);
      if (insertError) {
        console.error("Insert error:", insertError);
        continue;
      }
      totalInserted += batch.length;

      for (const d of batch) {
        const senderId = d.sender_id as string | null;
        const recipientId = d.recipient_id as string;
        const isExternal = d.is_external as boolean;

        const senderProfile = walletToProfile.get((d.sender_address as string) || "");
        const recipientProfile = walletToProfile.get(
          [...walletToProfile.entries()].find(([, v]) => v.id === recipientId)?.[0] || ""
        );

        const senderName = senderProfile?.display_name || senderProfile?.username
          || (isExternal || !senderId ? "Ví ngoài" : "Người dùng");
        const recipientName = recipientProfile?.display_name || recipientProfile?.username || "Unknown";

        // Cho phép gift_celebration cho ví ngoài (KHÔNG tính Light Score)
        postsToInsert.push({
          user_id: senderId || recipientId,
          content: `${senderName} đã tặng ${d.amount} ${d.token_symbol} cho ${recipientName}`,
          post_type: "gift_celebration",
          tx_hash: d.tx_hash,
          gift_sender_id: senderId,
          gift_recipient_id: recipientId,
          gift_token: d.token_symbol,
          gift_amount: String(d.amount),
          gift_message: null,
          is_highlighted: true,
          highlight_expires_at: null,
          visibility: "public",
          moderation_status: "approved",
          created_at: d.created_at,
          metadata: (isExternal || !senderId)
            ? { is_external: true, sender_address: d.sender_address ?? null }
            : null,
        });

        if (recipientId) {
          internalDonations.push(d);
        }
      }
    }

    // 7. Insert posts + notifications + chat messages
    if (postsToInsert.length > 0) {
      const postTxHashes = postsToInsert.map(p => p.tx_hash as string).filter(Boolean);
      const { data: existingPostsCheck } = await adminClient
        .from("posts").select("tx_hash").eq("post_type", "gift_celebration").in("tx_hash", postTxHashes);
      const existingPostSet = new Set((existingPostsCheck || []).map(p => p.tx_hash));
      const newPosts = postsToInsert.filter(p => !existingPostSet.has(p.tx_hash as string));

      const insertedPostsByTx = new Map<string, string>();
      for (let i = 0; i < newPosts.length; i += 50) {
        const batch = newPosts.slice(i, i + 50);
        const { data: inserted, error: postErr } = await adminClient.from("posts").insert(batch).select("id, tx_hash");
        if (postErr) console.error("Post insert error:", postErr);
        else {
          for (const p of inserted || []) insertedPostsByTx.set(p.tx_hash, p.id);
        }
      }

      // Back-link donations.post_id (fix lỗi UI link gãy)
      if (insertedPostsByTx.size > 0) {
        for (const [txHash, postId] of insertedPostsByTx) {
          await adminClient.from("donations").update({ post_id: postId }).ilike("tx_hash", txHash).is("post_id", null);
        }
      }

      // Notifications
      const notifs = internalDonations
        .filter(d => !existingPostSet.has(d.tx_hash as string))
        .map(d => ({
          user_id: d.recipient_id as string,
          actor_id: d.sender_id as string,
          post_id: insertedPostsByTx.get(d.tx_hash as string) || null,
          type: "donation",
          read: false,
        }));

      if (notifs.length > 0) {
        for (let i = 0; i < notifs.length; i += 50) {
          const { error } = await adminClient.from("notifications").insert(notifs.slice(i, i + 50));
          if (error) console.error("Notif error:", error);
        }
      }

      // Chat messages for internal donations
      for (const d of internalDonations) {
        if (existingPostSet.has(d.tx_hash as string)) continue;
        const senderId = d.sender_id as string;
        const recipientId = d.recipient_id as string;
        if (senderId === recipientId) continue;

        try {
          const senderProfile = walletToProfile.get((d.sender_address as string) || "");
          const senderName = senderProfile?.display_name || senderProfile?.username || "Unknown";
          const txShort = (d.tx_hash as string).substring(0, 10) + "...";

          // Find or create direct conversation
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
              .from("conversations").insert({ type: "direct", created_by: senderId }).select("id").single();
            if (newConv) {
              conversationId = newConv.id;
              await adminClient.from("conversation_participants").insert([
                { conversation_id: conversationId, user_id: senderId, role: "member" },
                { conversation_id: conversationId, user_id: recipientId, role: "member" },
              ]);
            }
          }

          if (conversationId) {
            const msgContent = `🎁 ${senderName} đã tặng bạn ${d.amount} ${d.token_symbol}!\n💰 TX: ${txShort}`;
            await adminClient.from("messages").insert({ conversation_id: conversationId, sender_id: senderId, content: msgContent });
            await adminClient.from("conversations").update({
              last_message_at: new Date().toISOString(),
              last_message_preview: msgContent.substring(0, 100),
            }).eq("id", conversationId);
          }
        } catch (chatErr) {
          console.error(`Chat error for tx ${d.tx_hash}:`, chatErr);
        }
      }
    }

    console.log(`Fast-scan complete: ${totalInserted} new donations`);
    const providerUnavailable = isMoralisUnavailable();
    return new Response(JSON.stringify({
      newTransfers: totalInserted,
      candidatesFound: candidateTransfers.length,
      provider_unavailable: providerUnavailable,
      provider_errors: getMoralisFailures(),
      message: providerUnavailable
        ? "Quét KHÔNG đầy đủ: nguồn dữ liệu on-chain lỗi"
        : `Tìm thấy ${totalInserted} giao dịch mới`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("fast-scan-donations error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
