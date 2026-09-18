import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { moralisFetch, resetMoralisFailures, getMoralisFailures, isMoralisUnavailable } from "../_shared/moralisFetch.ts";
import { getExternalTxFilter } from "../_shared/externalTxFilter.ts";

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

interface MoralisTransfer {
  transaction_hash: string;
  from_address: string;
  to_address: string;
  value: string;
  token_decimals: string;
  token_symbol: string;
  token_name: string;
  address: string;
  block_timestamp: string;
  block_number: string;
}

/** Fetch transfers with deep paging (up to maxPages). Stop early if we hit known tx_hashes. */
async function fetchTransfersWithPaging(
  moralisBase: string,
  walletAddr: string,
  chain: string,
  moralisHeaders: Record<string, string>,
  knownTxHashes: Set<string>,
  maxPages = 5,
): Promise<MoralisTransfer[]> {
  const allTransfers: MoralisTransfer[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    let url = `${moralisBase}/${walletAddr}/erc20/transfers?chain=${chain}&limit=100&order=DESC`;
    if (cursor) url += `&cursor=${cursor}`;

    const res = await moralisFetch(url, { headers: moralisHeaders });
    if (!res.ok) { await res.text(); break; }

    const data = await res.json();
    const transfers: MoralisTransfer[] = data.result || [];
    if (transfers.length === 0) break;

    let hitKnown = false;
    for (const t of transfers) {
      if (knownTxHashes.has(t.transaction_hash)) { hitKnown = true; break; }
      allTransfers.push(t);
    }
    if (hitKnown) break;

    cursor = data.cursor || null;
    if (!cursor) break;
  }

  return allTransfers;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    resetMoralisFailures();
    const moralisApiKey = Deno.env.get("MORALIS_API_KEY");
    if (!moralisApiKey) {
      return new Response(JSON.stringify({ error: "MORALIS_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const adminClient = createAdminClient();
    const txFilter = await getExternalTxFilter(adminClient);

    // Get user's public_wallet_address
    const { data: profile } = await adminClient
      .from("profiles")
      .select("public_wallet_address, created_at")
      .eq("id", userId)
      .single();

    if (!profile?.public_wallet_address) {
      return new Response(
        JSON.stringify({ newTransfers: 0, message: "Bạn chưa thiết lập ví công khai" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const myWallet = profile.public_wallet_address.toLowerCase();

    // Get all profiles wallet map
    const { data: allProfiles } = await adminClient
      .from("profiles")
      .select("id, public_wallet_address, wallet_address, external_wallet_address, username, display_name")
      .not("public_wallet_address", "is", null);

    const walletToProfile = new Map<string, { id: string; username: string; display_name: string | null }>();
    for (const p of allProfiles || []) {
      if (p.public_wallet_address) {
        const profileData = { id: p.id, username: p.username, display_name: p.display_name };
        for (const raw of [p.public_wallet_address, p.wallet_address, p.external_wallet_address]) {
          if (raw) {
            const addr = raw.toLowerCase();
            if (!walletToProfile.has(addr)) walletToProfile.set(addr, profileData);
          }
        }
      }
    }

    // Pre-fetch known tx_hashes for early stopping
    const { data: recentDonations } = await adminClient
      .from("donations")
      .select("tx_hash")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    const knownTxHashes = new Set((recentDonations || []).map(d => d.tx_hash));

    // Deep paging: up to 5 pages per chain
    const moralisHeaders = { Accept: "application/json" };
    const moralisBase = "https://deep-index.moralis.io/api/v2.2";

    const [mainnetTransfers, testnetTransfers] = await Promise.all([
      fetchTransfersWithPaging(moralisBase, myWallet, "bsc", moralisHeaders, knownTxHashes, 5),
      fetchTransfersWithPaging(moralisBase, myWallet, "bsc+testnet", moralisHeaders, knownTxHashes, 5),
    ]);

    // Filter incoming + known tokens
    const incomingAll = [...mainnetTransfers, ...testnetTransfers].filter((t) => {
      const to = t.to_address?.toLowerCase();
      if (to !== myWallet) return false;
      const contract = t.address?.toLowerCase() || "";
      return !!KNOWN_TOKENS[contract] || contract === FUN_TOKEN_ADDRESS;
    });

    if (incomingAll.length === 0) {
      return new Response(
        JSON.stringify({ newTransfers: 0, provider_unavailable: isMoralisUnavailable(), provider_errors: getMoralisFailures(), message: isMoralisUnavailable() ? "Chưa quét được: nguồn dữ liệu on-chain tạm thời không truy cập được" : "Không tìm thấy giao dịch mới" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplicate against DB
    const txHashes = incomingAll.map(t => t.transaction_hash).filter(Boolean);
    const { data: existingDonations } = await adminClient
      .from("donations")
      .select("tx_hash")
      .in("tx_hash", txHashes);
    const existingSet = new Set((existingDonations || []).map(d => d.tx_hash));
    const newTransfers = incomingAll.filter(t => t.transaction_hash && !existingSet.has(t.transaction_hash));

    if (newTransfers.length === 0) {
      return new Response(
        JSON.stringify({ newTransfers: 0, provider_unavailable: isMoralisUnavailable(), provider_errors: getMoralisFailures(), message: isMoralisUnavailable() ? "Chưa quét được: nguồn dữ liệu on-chain tạm thời không truy cập được" : "Tất cả giao dịch đã được ghi nhận" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build donation records
    const donationsToInsert: Record<string, unknown>[] = [];

    for (const transfer of newTransfers) {
      const contractAddr = transfer.address?.toLowerCase() || "";
      const tokenInfo = KNOWN_TOKENS[contractAddr];
      const isFun = contractAddr === FUN_TOKEN_ADDRESS;

      let tokenSymbol = transfer.token_symbol || "UNKNOWN";
      let tokenDecimals = parseInt(transfer.token_decimals) || 18;
      if (tokenInfo) { tokenSymbol = tokenInfo.symbol; tokenDecimals = tokenInfo.decimals; }
      else if (isFun) { tokenSymbol = "FUN"; tokenDecimals = 18; }

      const rawValue = BigInt(transfer.value || "0");
      const divisor = BigInt(10 ** tokenDecimals);
      const intPart = rawValue / divisor;
      const fracPart = rawValue % divisor;
      const amount = `${intPart}.${fracPart.toString().padStart(tokenDecimals, "0")}`.replace(/\.?0+$/, "") || "0";

      // Skip transfers before user registration
      const txTime = new Date(transfer.block_timestamp).getTime();
      const regTime = new Date(profile.created_at).getTime();
      if (txTime < regTime) continue;

      const numAmount = parseFloat(amount);
      if (numAmount <= 0) continue;

      const senderAddr = transfer.from_address.toLowerCase();
      const senderProfile = walletToProfile.get(senderAddr);
      const isInternal = !!senderProfile;

      if (!isInternal) {
        const verdict = txFilter.check({
          tokenSymbol,
          amount: numAmount,
          senderAddress: senderAddr,
          chain: "bsc",
        });
        if (!verdict.ok) {
          await txFilter.log({
            tx_hash: transfer.transaction_hash,
            reason: verdict.reason || "rejected",
            token_symbol: tokenSymbol,
            amount: numAmount,
            sender_address: senderAddr,
            recipient_address: myWallet,
            chain: "bsc",
            source: "scan-my-incoming",
          });
          continue;
        }
      }

      donationsToInsert.push({
        sender_id: senderProfile?.id || null,
        sender_address: senderAddr,
        recipient_id: userId,
        amount,
        token_symbol: tokenSymbol,
        token_address: contractAddr,
        chain_id: isFun ? 97 : 56,
        tx_hash: transfer.transaction_hash,
        status: "confirmed",
        confirmed_at: transfer.block_timestamp,
        created_at: transfer.block_timestamp,
        is_external: !isInternal,
        card_theme: "celebration",
        card_sound: "rich-1",
        message: null,
        light_score_earned: 0,
        metadata: {
          sender_name: senderProfile?.display_name || senderProfile?.username || "Ví ngoài",
        },
      });
    }

    if (donationsToInsert.length === 0) {
      return new Response(
        JSON.stringify({ newTransfers: 0, provider_unavailable: isMoralisUnavailable(), provider_errors: getMoralisFailures(), message: isMoralisUnavailable() ? "Chưa quét được: nguồn dữ liệu on-chain tạm thời không truy cập được" : "Không có giao dịch token đã biết" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert donations
    const { data: insertedDonations, error: insertError } = await adminClient
      .from("donations")
      .insert(donationsToInsert)
      .select("id, tx_hash, sender_id, recipient_id, sender_address, amount, token_symbol");

    if (insertError) {
      console.error("Insert donations error:", insertError);
      throw new Error(`Failed to insert donations: ${insertError.message}`);
    }

    // Insert wallet_transfers
    const walletTransfers = donationsToInsert.map(d => ({
      user_id: userId,
      tx_hash: d.tx_hash as string,
      direction: "in",
      token_symbol: d.token_symbol as string,
      token_address: d.token_address as string,
      amount: d.amount as string,
      counterparty_address: d.sender_address as string,
      chain_id: d.chain_id as number,
      status: "confirmed",
      created_at: d.created_at as string,
    }));

    const wtTxHashes = walletTransfers.map(w => w.tx_hash);
    const { data: existingWt } = await adminClient
      .from("wallet_transfers")
      .select("tx_hash")
      .in("tx_hash", wtTxHashes);
    const existingWtSet = new Set((existingWt || []).map(w => w.tx_hash));
    const newWt = walletTransfers.filter(w => !existingWtSet.has(w.tx_hash));
    if (newWt.length > 0) {
      const { error: wtErr } = await adminClient.from("wallet_transfers").insert(newWt);
      if (wtErr) console.error("wallet_transfers insert error:", wtErr);
      else console.log(`Inserted ${newWt.length} wallet_transfers`);
    }

    // === Connector detect (fire-and-forget) ===
    try {
      const supaUrl = Deno.env.get("SUPABASE_URL")!;
      const svcKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
      for (const d of donationsToInsert) {
        fetch(`${supaUrl}/functions/v1/pplp-connector-detect`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${svcKey}` },
          body: JSON.stringify({
            tx_hash: d.tx_hash,
            chain: "BSC",
            token_symbol: d.token_symbol,
            amount: d.amount,
            from_address: d.sender_address,
            to_address: myWallet,
          }),
        }).catch(e => console.warn("connector-detect call failed:", e?.message ?? e));
      }
    } catch (e) {
      console.warn("connector hook error:", e);
    }

    // Create gift_celebration posts (loại giao dịch ví ngoài)
    const postsToInsert: Record<string, unknown>[] = [];
    for (const d of donationsToInsert) {
      const isExternal = d.is_external as boolean;
      // BỎ QUA giao dịch ví ngoài
      if (isExternal || !d.sender_id) continue;

      const senderProfile = walletToProfile.get((d.sender_address as string) || "");
      const senderName = senderProfile?.display_name || senderProfile?.username || "Người dùng";
      const recipientProfile = walletToProfile.get(myWallet);
      const recipientName = recipientProfile?.display_name || recipientProfile?.username || "Unknown";

      postsToInsert.push({
        user_id: d.sender_id as string,
        content: `${senderName} đã tặng ${d.amount} ${d.token_symbol} cho ${recipientName}`,
        post_type: "gift_celebration",
        tx_hash: d.tx_hash,
        gift_sender_id: d.sender_id,
        gift_recipient_id: userId,
        gift_token: d.token_symbol,
        gift_amount: String(d.amount),
        gift_message: null,
        is_highlighted: true,
        highlight_expires_at: null,
        visibility: "public",
        moderation_status: "approved",
        created_at: d.created_at,
        metadata: null,
      });
    }

    // Deduplicate posts
    const postTxHashes = postsToInsert.map(p => p.tx_hash as string).filter(Boolean);
    const { data: existingPosts } = await adminClient
      .from("posts")
      .select("tx_hash")
      .eq("post_type", "gift_celebration")
      .in("tx_hash", postTxHashes);
    const existingPostSet = new Set((existingPosts || []).map(p => p.tx_hash));
    const newPosts = postsToInsert.filter(p => !existingPostSet.has(p.tx_hash as string));

    const insertedPostsByTx = new Map<string, string>();
    if (newPosts.length > 0) {
      const { data: inserted, error: postErr } = await adminClient
        .from("posts")
        .insert(newPosts)
        .select("id, tx_hash");
      if (postErr) console.error("Post insert error:", postErr);
      else {
        for (const p of inserted || []) {
          insertedPostsByTx.set(p.tx_hash, p.id);
        }
        console.log(`Created ${newPosts.length} gift_celebration posts`);
      }
    }

    // Notifications
    const notificationsToInsert = donationsToInsert
      .filter(d => !existingPostSet.has(d.tx_hash as string))
      .map(d => ({
        user_id: userId,
        actor_id: (d.sender_id as string) || userId,
        post_id: insertedPostsByTx.get(d.tx_hash as string) || null,
        type: "donation",
        read: false,
      }));

    if (notificationsToInsert.length > 0) {
      const { error: notifErr } = await adminClient.from("notifications").insert(notificationsToInsert);
      if (notifErr) console.error("Notification insert error:", notifErr);
      else console.log(`Created ${notificationsToInsert.length} notifications`);
    }

    // Chat messages for internal donations
    for (const d of donationsToInsert) {
      if (existingPostSet.has(d.tx_hash as string)) continue;
      const senderId = d.sender_id as string;
      if (!senderId || senderId === userId) continue;

      try {
        const senderProf = walletToProfile.get((d.sender_address as string) || "");
        const senderName = senderProf?.display_name || senderProf?.username || "Unknown";
        const txHashShort = (d.tx_hash as string).substring(0, 10) + "...";

        const { data: existingConvs } = await adminClient
          .from("conversations")
          .select("id, conversation_participants!inner(user_id)")
          .eq("type", "direct");

        let conversationId: string | null = null;
        if (existingConvs) {
          for (const conv of existingConvs) {
            const parts = (conv.conversation_participants as { user_id: string }[]).map(p => p.user_id);
            if (parts.length === 2 && parts.includes(senderId) && parts.includes(userId)) {
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
              { conversation_id: conversationId, user_id: userId, role: "member" },
            ]);
          }
        }

        if (conversationId) {
          const msgContent = `🎁 ${senderName} đã tặng bạn ${d.amount} ${d.token_symbol}!\n💰 TX: ${txHashShort}`;
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
        console.error(`Chat error for tx ${d.tx_hash}:`, chatErr);
      }
    }

    // Piggyback BTC scan
    let btcNewTransfers = 0;
    try {
      const btcRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/scan-btc-transactions`, {
        method: "POST",
        headers: {
          Authorization: authHeader || "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      if (btcRes.ok) {
        const btcData = await btcRes.json();
        btcNewTransfers = btcData.newTransfers || 0;
      } else {
        await btcRes.text();
      }
    } catch (e) {
      console.error("BTC scan piggyback error:", e);
    }

    const totalNew = donationsToInsert.length + btcNewTransfers;

    const providerUnavailable = isMoralisUnavailable();
    const providerErrors = getMoralisFailures();

    return new Response(
      JSON.stringify({
        newTransfers: totalNew,
        provider_unavailable: providerUnavailable,
        provider_errors: providerErrors,
        message: providerUnavailable
          ? "Chưa quét được: nguồn dữ liệu on-chain tạm thời không truy cập được"
          : `Tìm thấy ${totalNew} giao dịch mới`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("scan-my-incoming error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
