import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { moralisFetch, resetMoralisFailures, getMoralisFailures, isMoralisUnavailable, reportMoralisUsage } from "../_shared/moralisFetch.ts";
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
  BNB: 0.001,
};

const NATIVE_BNB_SENTINEL = "__native_bnb__";

function giftTokenLabel(symbol: string, chainId?: number | null): string {
  const s = (symbol || "UNKNOWN").toUpperCase();
  if (s === "BNB") return chainId === 97 ? "BNB (BSC Testnet)" : "BNB (BSC Chain)";
  return s;
}

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

function parseAmount(value: string, decimals: number): string {
  const rawValue = BigInt(value || "0");
  const divisor = BigInt(10 ** decimals);
  const intPart = rawValue / divisor;
  const fracPart = rawValue % divisor;
  return `${intPart}.${fracPart.toString().padStart(decimals, "0")}`.replace(/\.?0+$/, "") || "0";
}

/**
 * Fetch transfers with deep paging (up to maxPages).
 * Khi gặp tx đã biết, KHÔNG dừng ngay: quét thêm 1 trang dự phòng (grace page)
 * vì Moralis index có thể trễ ⇒ giao dịch cũ xuất hiện muộn nằm sau tx đã biết.
 */
async function fetchTransfersWithPaging(
  moralisBase: string,
  walletAddr: string,
  chain: string,
  moralisHeaders: Record<string, string>,
  knownTxHashes: Set<string>,
  maxPages = 2,
): Promise<MoralisTransfer[]> {
  const allTransfers: MoralisTransfer[] = [];
  let cursor: string | null = null;
  let gracePagesLeft = 1;
  let hitKnown = false;

  for (let page = 0; page < maxPages; page++) {
    let url = `${moralisBase}/${walletAddr}/erc20/transfers?chain=${chain}&limit=50&order=DESC`;
    if (cursor) url += `&cursor=${cursor}`;

    const res = await moralisFetch(url, { headers: moralisHeaders });
    if (!res.ok) { await res.text(); break; }

    const data = await res.json();
    const transfers: MoralisTransfer[] = data.result || [];
    if (transfers.length === 0) break;

    for (const t of transfers) {
      if (knownTxHashes.has(t.transaction_hash)) { hitKnown = true; continue; }
      allTransfers.push(t);
    }

    cursor = data.cursor || null;
    if (!cursor) break;
    if (hitKnown) {
      if (gracePagesLeft <= 0) break;
      gracePagesLeft--;
    }
  }

  return allTransfers;
}


/** Fetch native BNB transactions from Moralis. Returns transfers shaped like ERC20 ones with sentinel address. */
async function fetchNativeBnbTxs(
  moralisBase: string,
  walletAddr: string,
  chain: string,
  moralisHeaders: Record<string, string>,
  knownTxHashes: Set<string>,
  maxPages = 1,
): Promise<MoralisTransfer[]> {
  const out: MoralisTransfer[] = [];
  let cursor: string | null = null;
  let gracePagesLeft = 1;
  let hitKnown = false;
  for (let page = 0; page < maxPages; page++) {
    let url = `${moralisBase}/${walletAddr}?chain=${chain}&limit=50&order=DESC&include=internal_transactions`;
    if (cursor) url += `&cursor=${cursor}`;
    const res = await moralisFetch(url, { headers: moralisHeaders });
    if (!res.ok) { await res.text(); break; }
    const data = await res.json();
    const txs: Array<Record<string, unknown>> = data.result || [];
    if (txs.length === 0) break;
    for (const tx of txs) {
      const hash = String(tx.hash || "");
      if (!hash) continue;
      // Moralis index có thể trễ ⇒ không dừng ngay khi gặp tx đã biết,
      // chỉ đánh dấu để giới hạn số trang dự phòng.
      if (knownTxHashes.has(hash)) { hitKnown = true; continue; }
      // Bỏ tx failed
      if (String(tx.receipt_status ?? "1") === "0") continue;
      // Bỏ tx value=0 (chỉ là contract call, không phải native transfer)
      const value = String(tx.value || "0");
      if (value === "0") continue;
      out.push({
        transaction_hash: hash,
        from_address: String(tx.from_address || ""),
        to_address: String(tx.to_address || ""),
        value,
        token_decimals: "18",
        token_symbol: "BNB",
        token_name: "BNB",
        address: NATIVE_BNB_SENTINEL,
        block_timestamp: String(tx.block_timestamp || ""),
        block_number: String(tx.block_number || ""),
      });
    }
    cursor = (data.cursor as string) || null;
    if (!cursor) break;
    if (hitKnown) {
      if (gracePagesLeft <= 0) break;
      gracePagesLeft--;
    }
  }

  return out;
}
/**
 * TẦNG ƯU TIÊN VÍ (biện pháp TẠM — Phương án 1, duyệt 20/08/2026)
 *
 * Tầng A = ví có giao dịch/donate trong 30 ngày (≈182/858 ví) → vòng quét 2h
 *          (cron `* /30`, 50 ví/lượt, 4 lượt/vòng).
 * Tầng B = phần còn lại (≈676 ví) → vòng quét 12h
 *          (cron `25 * * * *`, 62 ví/lượt, 12 lượt/vòng).
 * Tổng ≈ 10.554 call Moralis/ngày (trước: 14.400) ⇒ −27%.
 *
 * ĐIỀU KIỆN GỠ BỎ: khi `scanner-rpc-tick` sang Giai đoạn 2 (ghi thật) và chạy
 * đủ 7 ngày liên tục `missing_in_db = 0` + không còn `scanner_block_gaps` tồn
 * ⇒ giãn thêm hoặc TẮT HẲN 2 cron Moralis này (Moralis chỉ còn đối chiếu 1 lần/giờ).
 */
const TIER_ACTIVE_DAYS = 30;
const TIER_BATCH: Record<string, number> = { A: 50, B: 62, all: 50 };
const TIER_CURSOR_KEY: Record<string, string> = {
  A: "auto_scan_cursor_tier_a",
  B: "auto_scan_cursor_tier_b",
  all: "auto_scan_cursor",
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    let tier = "all";
    try {
      const body = await req.json();
      const raw = String(body?.tier ?? "all").toUpperCase();
      if (raw === "A" || raw === "B") tier = raw;
    } catch (_) { /* không có body ⇒ chế độ legacy quét toàn bộ */ }
    resetMoralisFailures();
    const moralisApiKey = Deno.env.get("MORALIS_API_KEY");
    if (!moralisApiKey) {
      return new Response(JSON.stringify({ error: "MORALIS_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createAdminClient();
    const txFilter = await getExternalTxFilter(adminClient);

    const { data: allProfiles } = await adminClient
      .from("profiles")
      .select("id, public_wallet_address, wallet_address, external_wallet_address, username, display_name, created_at")
      .or("public_wallet_address.not.is.null,wallet_address.not.is.null,external_wallet_address.not.is.null");

    if (!allProfiles || allProfiles.length === 0) {
      return new Response(JSON.stringify({ message: "No profiles with wallets", newTransfers: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build wallet → profile map (all 3 wallet fields)
    const walletToProfile = new Map<string, { id: string; username: string; display_name: string | null; created_at: string }>();
    const allWalletAddresses: string[] = [];
    for (const p of allProfiles) {
      if (p.public_wallet_address) {
        const profileData = { id: p.id, username: p.username, display_name: p.display_name, created_at: p.created_at };
        const pubAddr = p.public_wallet_address.toLowerCase();
        walletToProfile.set(pubAddr, profileData);
        allWalletAddresses.push(pubAddr);
        // Map other wallet fields for sender identification
        for (const raw of [p.wallet_address, p.external_wallet_address]) {
          if (raw) {
            const addr = raw.toLowerCase();
            if (!walletToProfile.has(addr)) walletToProfile.set(addr, profileData);
          }
        }
      }
    }

    // Lọc theo tầng ưu tiên (xem chú thích TẦNG ƯU TIÊN VÍ ở đầu file)
    let tierWallets = allWalletAddresses;
    if (tier !== "all") {
      const sinceIso = new Date(Date.now() - TIER_ACTIVE_DAYS * 86400_000).toISOString();
      const activeIds = new Set<string>();
      const [txRows, recvRows, sendRows] = await Promise.all([
        adminClient.from("transactions").select("user_id").gte("created_at", sinceIso),
        adminClient.from("donations").select("recipient_id").gte("created_at", sinceIso),
        adminClient.from("donations").select("sender_id").gte("created_at", sinceIso),
      ]);
      for (const r of txRows.data ?? []) if (r.user_id) activeIds.add(String(r.user_id));
      for (const r of recvRows.data ?? []) if (r.recipient_id) activeIds.add(String(r.recipient_id));
      for (const r of sendRows.data ?? []) if (r.sender_id) activeIds.add(String(r.sender_id));

      tierWallets = allWalletAddresses.filter((addr) => {
        const p = walletToProfile.get(addr);
        const isActive = !!p && activeIds.has(p.id);
        return tier === "A" ? isActive : !isActive;
      });
    }

    // Batch cursor (mỗi tầng có con trỏ riêng ⇒ chuyển đổi cơ chế không bỏ sót ví:
    // con trỏ mới bắt đầu từ 0 nên mỗi tầng được phủ đủ trong 1 vòng đầu tiên)
    const BATCH_SIZE = TIER_BATCH[tier] ?? 50;
    const cursorKey = TIER_CURSOR_KEY[tier] ?? "auto_scan_cursor";
    const { data: cursorData } = await adminClient
      .from("app_settings")
      .select("value")
      .eq("key", cursorKey)
      .maybeSingle();

    let startIndex = 0;
    if (cursorData?.value) {
      startIndex = parseInt(cursorData.value as string) || 0;
      if (startIndex >= tierWallets.length) startIndex = 0;
    }

    const endIndex = Math.min(startIndex + BATCH_SIZE, tierWallets.length);
    const walletsToScan = tierWallets.slice(startIndex, endIndex);
    const nextCursor = endIndex >= tierWallets.length ? 0 : endIndex;

    console.log(
      `Scanning tier ${tier}: wallets ${startIndex}-${endIndex} of ${tierWallets.length} (tổng ${allWalletAddresses.length})`,
    );

    const moralisHeaders = { Accept: "application/json" };
    const moralisBase = "https://deep-index.moralis.io/api/v2.2";

    let totalNewTransfers = 0;
    const allDonationsToInsert: Record<string, unknown>[] = [];

    // Parallel scan batches of 5 wallets
    const PARALLEL_SIZE = 5;
    for (let bi = 0; bi < walletsToScan.length; bi += PARALLEL_SIZE) {
      const parallelBatch = walletsToScan.slice(bi, bi + PARALLEL_SIZE);
      const results = await Promise.allSettled(parallelBatch.map(async (walletAddr) => {
        const recipientProfile = walletToProfile.get(walletAddr);
        if (!recipientProfile) return [];

        // Pre-fetch known tx_hashes for this recipient to enable early stopping
        const { data: recentDonations } = await adminClient
          .from("donations")
          .select("tx_hash")
          .eq("recipient_id", recipientProfile.id)
          .order("created_at", { ascending: false })
          .limit(100);
        const knownTxHashes = new Set((recentDonations || []).map(d => d.tx_hash));

        // Tối ưu quota Moralis (18/08/2026): chỉ quét MAINNET ở đây.
        // Nhánh testnet đã bỏ — token duy nhất dùng testnet là FUN (0x39a1...cd6)
        // và đã có scanner riêng `fast-scan-donations` quét theo contract FUN
        // trên bsc testnet. Native BNB testnet chưa từng sinh donation nào qua
        // scanner (15 dòng chain_id=97 token BNB đều là record-donation in-app).
        // Paging: ERC20 2 trang, native 1 trang (+1 trang dự phòng khi gặp tx đã biết).
        const [mainnetTransfers, nativeMainnet] = await Promise.all([
          fetchTransfersWithPaging(moralisBase, walletAddr, "bsc", moralisHeaders, knownTxHashes, 2),
          fetchNativeBnbTxs(moralisBase, walletAddr, "bsc", moralisHeaders, knownTxHashes, 1),
        ]);

        const allTransfers = [...mainnetTransfers, ...nativeMainnet];


        // Filter incoming + known tokens (gồm native BNB sentinel)
        const incoming = allTransfers.filter((t) => {
          const to = t.to_address?.toLowerCase();
          if (to !== walletAddr) return false;
          const contract = t.address?.toLowerCase() || "";
          if (contract === NATIVE_BNB_SENTINEL) return true;
          return !!KNOWN_TOKENS[contract] || contract === FUN_TOKEN_ADDRESS;
        });
        if (incoming.length === 0) return [];

        // Deduplicate against DB
        const txHashes = incoming.map(t => t.transaction_hash).filter(Boolean);
        const { data: existingDonations } = await adminClient
          .from("donations")
          .select("tx_hash")
          .in("tx_hash", txHashes);
        const existingSet = new Set((existingDonations || []).map(d => d.tx_hash));
        const newTransfers = incoming.filter(t => t.transaction_hash && !existingSet.has(t.transaction_hash));

        const donations: Record<string, unknown>[] = [];
        for (const transfer of newTransfers) {
          const contractAddr = transfer.address?.toLowerCase() || "";
          const isNative = contractAddr === NATIVE_BNB_SENTINEL;
          const tokenInfo = KNOWN_TOKENS[contractAddr];
          const isFun = contractAddr === FUN_TOKEN_ADDRESS;
          let tokenSymbol = transfer.token_symbol || "UNKNOWN";
          let tokenDecimals = parseInt(transfer.token_decimals) || 18;
          if (isNative) { tokenSymbol = "BNB"; tokenDecimals = 18; }
          else if (tokenInfo) { tokenSymbol = tokenInfo.symbol; tokenDecimals = tokenInfo.decimals; }
          else if (isFun) { tokenSymbol = "FUN"; tokenDecimals = 18; }

          // Skip transfers before recipient registration
          const txTime = new Date(transfer.block_timestamp).getTime();
          const regTime = new Date(recipientProfile.created_at).getTime();
          if (txTime < regTime) continue;

          const amount = parseAmount(transfer.value, tokenDecimals);
          const numAmount = parseFloat(amount);
          if (numAmount <= 0) continue;

          const senderAddr = transfer.from_address.toLowerCase();
          const senderProfile = walletToProfile.get(senderAddr);

          // External-wallet spam filter (Angel policy 05/07/2026)
          if (!senderProfile) {
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
                recipient_address: recipientProfile.public_wallet_address || recipientProfile.wallet_address,
                chain: "bsc",
                source: "auto-scan-donations",
              });
              continue;
            }
          }

          donations.push({
            sender_id: senderProfile?.id || null,
            sender_address: senderAddr,
            recipient_id: recipientProfile.id,
            amount,
            token_symbol: tokenSymbol,
            token_address: isNative ? null : contractAddr,
            chain_id: isFun ? 97 : 56,
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
            },
          });
        }
        return donations;
      }));

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.length > 0) {
          allDonationsToInsert.push(...r.value);
        } else if (r.status === "rejected") {
          console.error("Parallel scan error:", r.reason);
        }
      }
    }

    // Insert donations + wallet_transfers + posts + notifications + chat
    if (allDonationsToInsert.length > 0) {
      const postsToInsert: Record<string, unknown>[] = [];
      const donationsForNotify: Record<string, unknown>[] = [];

      for (let i = 0; i < allDonationsToInsert.length; i += 50) {
        const batch = allDonationsToInsert.slice(i, i + 50);
        const { error: insertError } = await adminClient.from("donations").insert(batch);
        if (insertError) {
          console.error("Insert donations error:", insertError);
          continue;
        }
        totalNewTransfers += batch.length;

        // Insert wallet_transfers for each donation
        const walletTransfers = batch.map(d => ({
          user_id: d.recipient_id as string,
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

        // Deduplicate wallet_transfers
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

        for (const d of batch) {
          const recipientId = d.recipient_id as string | null;
          if (!recipientId) continue;

          const senderId = d.sender_id as string | null;
          const isExternal = d.is_external as boolean;

          const senderProf = walletToProfile.get((d.sender_address as string) || "");
          const recipientProf = walletToProfile.get(
            allWalletAddresses.find(w => walletToProfile.get(w)?.id === recipientId) || ""
          );

          const senderName = senderProf?.display_name || senderProf?.username
            || (isExternal || !senderId ? "Ví ngoài" : "Người dùng");
          const recipientName = recipientProf?.display_name || recipientProf?.username || "Unknown";
          const tokenLabel = giftTokenLabel(String(d.token_symbol || ""), Number(d.chain_id || 56));

          // Cho phép tạo gift_celebration cho cả giao dịch ví ngoài (KHÔNG tính Light Score)
          postsToInsert.push({
            user_id: senderId || recipientId,
            content: `${senderName} đã tặng ${d.amount} ${tokenLabel} cho ${recipientName}`,
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
              ? { is_external: true, sender_address: d.sender_address ?? null, chain_id: d.chain_id ?? null }
              : { chain_id: d.chain_id ?? null },
          });

          donationsForNotify.push(d);
        }
      }

      // Insert posts (deduplicated)
      if (postsToInsert.length > 0) {
        const postTxHashes = postsToInsert.map(p => p.tx_hash as string).filter(Boolean);
        const { data: existingPosts } = await adminClient
          .from("posts")
          .select("tx_hash")
          .eq("post_type", "gift_celebration")
          .in("tx_hash", postTxHashes);

        const existingPostSet = new Set((existingPosts || []).map(p => p.tx_hash));
        const newPosts = postsToInsert.filter(p => !existingPostSet.has(p.tx_hash as string));

        const insertedPostsByTx = new Map<string, string>();
        for (let i = 0; i < newPosts.length; i += 50) {
          const batch = newPosts.slice(i, i + 50);
          const { data: inserted, error: postErr } = await adminClient
            .from("posts")
            .insert(batch)
            .select("id, tx_hash");
          if (postErr) console.error("Post insert error:", postErr);
          else {
            console.log(`Created ${batch.length} gift_celebration posts`);
            for (const p of inserted || []) {
              insertedPostsByTx.set(p.tx_hash, p.id);
            }
          }
        }

        // Back-link donations.post_id (fix UI link gãy)
        if (insertedPostsByTx.size > 0) {
          for (const [txHash, postId] of insertedPostsByTx) {
            await adminClient.from("donations").update({ post_id: postId }).ilike("tx_hash", txHash).is("post_id", null);
          }
        }

        // Notifications
        const notificationsToInsert = donationsForNotify
          .filter(d => !existingPostSet.has(d.tx_hash as string))
          .map(d => ({
            user_id: d.recipient_id as string,
            actor_id: (d.sender_id as string) || (d.recipient_id as string),
            post_id: insertedPostsByTx.get(d.tx_hash as string) || null,
            type: "donation",
            read: false,
          }));

        if (notificationsToInsert.length > 0) {
          for (let i = 0; i < notificationsToInsert.length; i += 50) {
            const batch = notificationsToInsert.slice(i, i + 50);
            const { error: notifErr } = await adminClient.from("notifications").insert(batch);
            if (notifErr) console.error("Notification insert error:", notifErr);
            else console.log(`Created ${batch.length} notifications`);
          }
        }

        // Chat messages for internal donations
        for (const d of donationsForNotify) {
          if (existingPostSet.has(d.tx_hash as string)) continue;
          const senderId = d.sender_id as string;
          const recipientId = d.recipient_id as string;
          if (!senderId || !recipientId || senderId === recipientId) continue;

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
      }
    }

    // Update cursor
    await adminClient
      .from("app_settings")
      .upsert({ key: cursorKey, value: String(nextCursor) }, { onConflict: "key" });

    // Piggyback BTC scan
    let btcNewTransfers = 0;
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!;
      const btcRes = await fetch(`${supabaseUrl}/functions/v1/scan-btc-transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
        body: JSON.stringify({}),
      });
      if (btcRes.ok) {
        const btcData = await btcRes.json();
        btcNewTransfers = btcData?.newTransfers || 0;
        console.log(`BTC piggyback scan: ${btcNewTransfers} new transfers`);
      }
    } catch (btcErr) {
      console.error("BTC piggyback scan error:", btcErr);
    }

    console.log(`Auto-scan complete: ${totalNewTransfers} EVM + ${btcNewTransfers} BTC new transfers, next cursor: ${nextCursor}`);

    // Ghi nhận số call Moralis + báo động admin khi quota gần cạn
    await reportMoralisUsage(adminClient, "auto-scan-donations");

    const providerUnavailable = isMoralisUnavailable();
    const providerErrors = getMoralisFailures();
    if (providerUnavailable) {
      console.error(
        `[auto-scan-donations] PROVIDER UNAVAILABLE — ${providerErrors.length} lỗi Moralis, kết quả quét KHÔNG đầy đủ`,
      );
      // Báo động admin — tối đa 1 lần / 6 giờ để không spam chuông
      try {
        const { data: admins } = await adminClient
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const sinceIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        for (const a of admins ?? []) {
          const { data: recent } = await adminClient
            .from("notifications")
            .select("id")
            .eq("user_id", a.user_id)
            .eq("type", "wallet_reconciliation_alert")
            .gte("created_at", sinceIso)
            .limit(1);
          if (recent && recent.length > 0) continue;
          await adminClient.from("notifications").insert({
            user_id: a.user_id,
            type: "wallet_reconciliation_alert",
            title: "Scanner on-chain KHÔNG quét được",
            content: `Nguồn dữ liệu on-chain trả lỗi ${providerErrors[0]?.status ?? "?"} (${providerErrors[0]?.body?.slice(0, 120) ?? ""}). Giao dịch mới có thể bị bỏ sót cho tới khi khôi phục.`,
          });
        }
      } catch (notifyErr) {
        console.error("[auto-scan-donations] notify admin failed:", notifyErr);
      }
    }

    return new Response(
      JSON.stringify({
        newTransfers: totalNewTransfers,
        walletsScanned: walletsToScan.length,
        nextCursor,
        provider_unavailable: providerUnavailable,
        provider_errors: providerErrors,
        message: providerUnavailable
          ? `Quét KHÔNG đầy đủ: nguồn dữ liệu on-chain lỗi (${providerErrors[0]?.status ?? "?"}), chỉ ghi được ${totalNewTransfers} giao dịch`
          : `Quét ${walletsToScan.length} ví, tìm thấy ${totalNewTransfers} giao dịch mới`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("auto-scan-donations error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
