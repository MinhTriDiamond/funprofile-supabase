import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchBtcResolverShadowLog } from "../_shared/btcResolverShadowLog.ts";
import { btcNormalizeAddress } from '../_shared/btcAddress.ts';

const MEMPOOL_API = "https://mempool.space/api";
const BTC_CHAIN_ID = 0;
const BTC_DECIMALS = 8;
const MIN_CONFIRMATIONS = 1;

interface MempoolTx {
  txid: string;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
  vin: Array<{
    prevout?: {
      scriptpubkey_address?: string;
      value?: number;
    };
  }>;
  vout: Array<{
    scriptpubkey_address?: string;
    value?: number;
  }>;
  fee?: number;
}

/** Normalize BTC address for comparison — bech32 lowercase, legacy giữ nguyên case. */
function normalizeBtcAddr(addr: string | undefined): string {
  return btcNormalizeAddress(addr);
}

/** Parse sender address from vin (Phase 1: use first input) */
function parseSender(tx: MempoolTx): string | null {
  if (!tx.vin || tx.vin.length === 0) return null;
  return tx.vin[0]?.prevout?.scriptpubkey_address || null;
}

/** 
 * Parse recipient outputs (exclude change back to sender).
 * Returns list of {address, valueSat} for outputs NOT going back to sender.
 */
function parseRecipientOutputs(tx: MempoolTx, senderAddr: string | null): Array<{ address: string; valueSat: number }> {
  const senderNorm = normalizeBtcAddr(senderAddr || "");
  const results: Array<{ address: string; valueSat: number }> = [];
  
  for (const vout of tx.vout) {
    const addr = vout.scriptpubkey_address;
    if (!addr) continue;
    // Skip change outputs (going back to sender)
    if (normalizeBtcAddr(addr) === senderNorm) continue;
    results.push({ address: addr, valueSat: vout.value || 0 });
  }
  
  return results;
}

/** Convert satoshis to BTC string */
function satsToBtc(sats: number): string {
  const btc = sats / 1e8;
  if (btc === 0) return "0";
  return btc.toFixed(8).replace(/\.?0+$/, "") || "0";
}

/** Sleep helper */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch tx history for a BTC address from Mempool.space (with retry on 429).
 *  fullHistory=true paginates via /txs/chain/{last_txid} up to MAX_PAGES * 25 tx. */
async function fetchBtcTxHistory(address: string, fullHistory = false): Promise<MempoolTx[]> {
  const all: MempoolTx[] = [];
  let lastTxid: string | null = null;
  let pages = 0;
  const MAX_PAGES = fullHistory ? 40 : 1; // 40 * 25 = 1000 tx max

  while (pages < MAX_PAGES) {
    const url = lastTxid
      ? `${MEMPOOL_API}/address/${address}/txs/chain/${lastTxid}`
      : `${MEMPOOL_API}/address/${address}/txs`;
    let pageTxs: MempoolTx[] | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url);
        if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
        if (!res.ok) { console.error(`Mempool API error for ${address}: ${res.status}`); return all; }
        pageTxs = await res.json();
        break;
      } catch (err) {
        console.error(`Mempool fetch error for ${address} (attempt ${attempt + 1}):`, err);
        await sleep(800);
      }
    }
    if (!pageTxs || pageTxs.length === 0) break;
    all.push(...pageTxs);
    if (!fullHistory || pageTxs.length < 25) break;
    lastTxid = pageTxs[pageTxs.length - 1].txid;
    pages++;
    await sleep(400);
  }
  return all;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // Auth: support both user-initiated (Bearer token) and cron (no auth)
    const authHeader = req.headers.get("Authorization");
    let requestUserId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData } = await anonClient.auth.getUser(token);
      requestUserId = userData?.user?.id || null;
    }

    // Parse body for explicit target_user_id (cho phép admin/cron target 1 user cụ thể)
    let bodyTargetUserId: string | null = null;
    let fullHistory = false;
    try {
      if (req.headers.get("content-type")?.includes("application/json")) {
        const body = await req.json();
        if (body && typeof body.target_user_id === "string") {
          bodyTargetUserId = body.target_user_id;
        }
        if (body && body.full_history === true) fullHistory = true;
      }
    } catch { /* ignore */ }

    const adminClient = createAdminClient();

    // Get all profiles with btc_address
    let profileQuery = adminClient
      .from("profiles")
      .select("id, btc_address, username, display_name, avatar_url, created_at")
      .not("btc_address", "is", null);

    // Priority: explicit body target > authenticated user > all
    const effectiveTarget = bodyTargetUserId || requestUserId;
    if (effectiveTarget) {
      profileQuery = profileQuery.eq("id", effectiveTarget);
    }



    const { data: profiles, error: profileError } = await profileQuery;
    if (profileError) throw new Error(`Profile query error: ${profileError.message}`);
    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ scanned: 0, newTransfers: 0, message: "Không có user nào có địa chỉ BTC" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build BTC address → profile map
    const btcToProfile = new Map<string, { id: string; username: string; display_name: string | null; avatar_url: string | null; created_at: string }>();
    for (const p of profiles) {
      if (p.btc_address) {
        const castProfile = p as typeof p & { btc_address: string };
        btcToProfile.set(normalizeBtcAddr(castProfile.btc_address), {
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          avatar_url: p.avatar_url,
          created_at: p.created_at,
        });
      }
    }

    // Also load ALL btc addresses for counterparty mapping
    if (!effectiveTarget) {
      // Already have all profiles
    } else {
      const { data: allBtcProfiles } = await adminClient
        .from("profiles")
        .select("id, btc_address, username, display_name, avatar_url, created_at")
        .not("btc_address", "is", null);
      for (const p of allBtcProfiles || []) {
        if (p.btc_address) {
          const castP = p as typeof p & { btc_address: string };
          const key = normalizeBtcAddr(castP.btc_address);
          if (!btcToProfile.has(key)) {
            btcToProfile.set(key, {
              id: p.id,
              username: p.username,
              display_name: p.display_name,
              avatar_url: p.avatar_url,
              created_at: p.created_at,
            });
          }
        }
      }
    }

    // Load HD aux addresses ĐÃ XÁC MINH (verified=true). Aux do heuristic tự sinh
    // (hd_change_auto/hd_change_out/hd_input_back) KHÔNG được dùng để gán sender/recipient,
    // tránh tái diễn sự cố gán nhầm (mem://infrastructure/btc-aux-misattribution-2026-06-12).
    const { data: auxRows } = await adminClient
      .from("profile_btc_aux_addresses")
      .select("user_id, address")
      .eq("verified", true);
    const auxByUser = new Map<string, string[]>();
    const userProfileById = new Map<string, { id: string; username: string; display_name: string | null; avatar_url: string | null; created_at: string; btc_address?: string | null }>();
    for (const p of profiles) userProfileById.set(p.id, p);
    // Cũng load profile gốc cho aux user nằm ngoài current batch
    const missingUserIds = Array.from(new Set((auxRows || [])
      .map(r => r.user_id as string)
      .filter(id => !userProfileById.has(id))));
    if (missingUserIds.length > 0) {
      const { data: extraProfiles } = await adminClient
        .from("profiles")
        .select("id, btc_address, username, display_name, avatar_url, created_at")
        .in("id", missingUserIds);
      for (const p of extraProfiles || []) userProfileById.set(p.id, p);
    }
    for (const row of auxRows || []) {
      const addr = normalizeBtcAddr(row.address as string);
      if (!addr) continue;
      const owner = userProfileById.get(row.user_id as string);
      if (!owner) continue;
      if (!btcToProfile.has(addr)) {
        btcToProfile.set(addr, {
          id: owner.id,
          username: owner.username,
          display_name: owner.display_name,
          avatar_url: owner.avatar_url,
          created_at: owner.created_at,
        });
      }
      const list = auxByUser.get(row.user_id as string) || [];
      list.push(row.address as string);
      auxByUser.set(row.user_id as string, list);
    }

    let totalNewTransfers = 0;

    // Process each profile (batch 10 at a time to respect rate limits)
    const batchSize = 10;
    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);

      for (const profile of batch) {
        if (!profile.btc_address) continue;
        const castProfile = profile as typeof profile & { btc_address: string };
        const myAddr = normalizeBtcAddr(castProfile.btc_address);
        const userRegTime = new Date(profile.created_at).getTime();

        // Throttle: Mempool free tier ~3 req/s → 350ms giữa các user
        await sleep(350);

        // Fetch tx history cho địa chỉ chính + mọi địa chỉ HD aux đã học của user.
        // Hợp nhất theo txid để không xử lý trùng.
        const allAddrsToScan = [castProfile.btc_address, ...(auxByUser.get(profile.id) || [])];
        const seenTxIds = new Set<string>();
        const txs: MempoolTx[] = [];
        const myAddrSet = new Set<string>(allAddrsToScan.map(a => normalizeBtcAddr(a)));
        for (const addr of allAddrsToScan) {
          const t = await fetchBtcTxHistory(addr, fullHistory);
          for (const tx of t) {
            if (seenTxIds.has(tx.txid)) continue;
            seenTxIds.add(tx.txid);
            txs.push(tx);
          }
          await sleep(250);
        }
        if (txs.length === 0) continue;

        // Filter: confirmed. Khi fullHistory=true, KHÔNG lọc theo userRegTime
        // để backfill được mọi giao dịch quá khứ trên on-chain.
        const confirmedTxs = txs.filter(tx => {
          if (!tx.status.confirmed) return false;
          if (!tx.status.block_time) return false;
          if (fullHistory) return true;
          const txTime = tx.status.block_time * 1000;
          return txTime >= userRegTime;
        });

        if (confirmedTxs.length === 0) continue;

        // Check existing tx_hashes for THIS user (allow same tx_hash for different recipients)
        const txIds = confirmedTxs.map(tx => tx.txid);
        const { data: existingDonations } = await adminClient
          .from("donations")
          .select("tx_hash, recipient_id")
          .in("tx_hash", txIds);
        // Build set of "tx_hash__recipient_id" to allow multi-recipient
        const existingDonationKeys = new Set(
          (existingDonations || []).map(d => `${d.tx_hash}__${d.recipient_id}`)
        );
        // Also track which tx_hashes have ANY record for this user as sender
        const existingSenderKeys = new Set(
          (existingDonations || [])
            .filter(d => d.recipient_id === profile.id)
            .map(d => d.tx_hash)
        );

        // Don't filter newTxs by existingSet — filter per-output instead
        const newTxs = confirmedTxs;

        const donationsToInsert: Record<string, unknown>[] = [];
        const walletTransfersToInsert: Record<string, unknown>[] = [];

        for (const tx of newTxs) {
          const senderAddr = parseSender(tx);
          const senderNorm = normalizeBtcAddr(senderAddr || "");
          const recipientOutputs = parseRecipientOutputs(tx, senderAddr);
          const feeSats = tx.fee || 0;
          const blockTime = tx.status.block_time ? new Date(tx.status.block_time * 1000).toISOString() : new Date().toISOString();

          // Sender check: dùng TOÀN BỘ input addresses thay vì chỉ vin[0]
          // để tránh "ví ngoài" giả khi ví HD gom từ nhiều input của cùng user.
          const allVinAddrs = new Set<string>();
          for (const v of tx.vin) {
            const a = normalizeBtcAddr(v.prevout?.scriptpubkey_address);
            if (a) allVinAddrs.add(a);
          }
          const isSender = Array.from(allVinAddrs).some(a => myAddrSet.has(a));

          // Shadow-log (Phase 2, chỉ quan sát): so sánh gán sender hiện tại (map btcToProfile)
          // với resolver mới, 1 lần/tx (không lặp theo output).
          if (senderAddr) {
            dispatchBtcResolverShadowLog(adminClient, {
              address: senderAddr,
              rawAddressLegacySide: senderAddr,
              callSite: "scan-btc-transactions:sender",
              legacyUserId: btcToProfile.get(senderNorm)?.id ?? null,
              legacySource: "btcToProfile",
              idempotencyKey: `scan-btc-transactions:sender:${tx.txid}:${senderNorm}`,
              createdBy: "scan-btc-transactions",
              eventAt: blockTime,
              txHash: tx.txid,
            });
          }

          // === HD AUTO-DISCOVERY ĐÃ TẮT (12/06/2026) ===
          // Trước đây heuristic hd_change_auto/hd_input_back tự gán địa chỉ lạ thành "ví của user",
          // gây sự cố hiển thị sai sender/recipient trong lịch sử BTC (xem audit
          // btc_aux_misattribution_audit_20260612). Hiện chỉ chấp nhận aux verified=true
          // do user/admin xác nhận thủ công. KHÔNG còn auto-insert ở scanner.


          for (const output of recipientOutputs) {
            const recipientNorm = normalizeBtcAddr(output.address);
            const isRecipient = myAddrSet.has(recipientNorm);

            // Skip if user is neither sender nor recipient of this output
            if (!isSender && !isRecipient) continue;

            const matchedSenderProfile = btcToProfile.get(senderNorm);
            const matchedRecipientProfile = btcToProfile.get(recipientNorm);

            dispatchBtcResolverShadowLog(adminClient, {
              address: output.address,
              rawAddressLegacySide: output.address,
              callSite: "scan-btc-transactions:recipient",
              legacyUserId: matchedRecipientProfile?.id ?? null,
              legacySource: "btcToProfile",
              idempotencyKey: `scan-btc-transactions:recipient:${tx.txid}:${recipientNorm}`,
              createdBy: "scan-btc-transactions",
              eventAt: blockTime,
              txHash: tx.txid,
            });

            // Skip if this specific tx_hash + recipient already exists in DB
            const donationDedupKey = `${tx.txid}__${matchedRecipientProfile?.id || ""}`;
            if (existingDonationKeys.has(donationDedupKey)) continue;

            const amount = satsToBtc(output.valueSat);
            const numAmount = parseFloat(amount);

            // Skip dust amounts
            if (numAmount < 0.00001) continue;

            // Skip change-to-self (sender và recipient cùng 1 user → đây là output change của ví HD,
            // không phải donation/transfer thật sự).
            if (matchedSenderProfile && matchedRecipientProfile && matchedSenderProfile.id === matchedRecipientProfile.id) continue;

            const isRecognizedByFun = !!matchedSenderProfile && !!matchedRecipientProfile;

            // Determine direction for wallet_transfers
            const direction = isSender ? "out" : "in";
            const counterpartyAddr = isSender ? output.address : (senderAddr || "");

            // Create donation record (for FUN-recognized transfers)
            if (isRecognizedByFun) {
              donationsToInsert.push({
                sender_id: matchedSenderProfile!.id,
                sender_address: senderAddr,
                recipient_id: matchedRecipientProfile!.id,
                recipient_address: output.address,
                amount,
                token_symbol: "BTC",
                token_address: null,
                chain_id: BTC_CHAIN_ID,
                chain_family: "bitcoin",
                tx_hash: tx.txid,
                status: "confirmed",
                confirmed_at: blockTime,
                created_at: blockTime,
                is_external: false,
                fee: satsToBtc(feeSats),
                confirmations: MIN_CONFIRMATIONS,
                block_height: tx.status.block_height || null,
                card_theme: "celebration",
                card_sound: "rich-1",
                message: null,
                light_score_earned: 0,
                metadata: {
                  chain_family: "bitcoin",
                  sender_name: matchedSenderProfile!.display_name || matchedSenderProfile!.username,
                  recipient_name: matchedRecipientProfile!.display_name || matchedRecipientProfile!.username,
                },
              });
            } else if (isRecipient && matchedRecipientProfile && !matchedSenderProfile) {
              // External wallet → FUN user: create donation with is_external: true
              donationsToInsert.push({
                sender_id: null,
                sender_address: senderAddr,
                recipient_id: matchedRecipientProfile.id,
                recipient_address: output.address,
                amount,
                token_symbol: "BTC",
                token_address: null,
                chain_id: BTC_CHAIN_ID,
                chain_family: "bitcoin",
                tx_hash: tx.txid,
                status: "confirmed",
                confirmed_at: blockTime,
                created_at: blockTime,
                is_external: true,
                fee: satsToBtc(feeSats),
                confirmations: MIN_CONFIRMATIONS,
                block_height: tx.status.block_height || null,
                card_theme: "celebration",
                card_sound: "rich-1",
                message: null,
                light_score_earned: 0,
                metadata: {
                  chain_family: "bitcoin",
                  is_external: true,
                  sender_address: senderAddr,
                  sender_name: "Ví ngoài",
                  recipient_name: matchedRecipientProfile.display_name || matchedRecipientProfile.username,
                },
              });
            }

            // Create wallet_transfer record for history.
            // QUY TẮC (cập nhật 11/06/2026):
            // - Nếu CẢ sender VÀ recipient đều là user nội bộ FUN (`isRecognizedByFun`)
            //   thì donation đã thay thế đầy đủ — KHÔNG ghi wallet_transfer (tránh
            //   trùng lặp + tránh badge "Ví ngoài" sai cho lệnh nội bộ → nội bộ,
            //   ví dụ các tx BTC từ ví FATHER `bc1qgxf7...`).
            // - Khi user là sender mà recipient là ví ngoài: KHÔNG ghi (output này
            //   thường là change-address của ví HD → cộng nhầm số đã gửi).
            // - Khi user là recipient nhận từ ví ngoài: GHI `in` để có lịch sử
            //   "Nhận ví ngoài".
            const shouldRecordTransfer = isRecipient && !isRecognizedByFun;
            if (shouldRecordTransfer) {
              walletTransfersToInsert.push({
                user_id: profile.id,
                tx_hash: tx.txid,
                direction,
                token_symbol: "BTC",
                token_address: null,
                amount,
                counterparty_address: counterpartyAddr,
                chain_id: BTC_CHAIN_ID,
                chain_family: "bitcoin",
                fee: satsToBtc(feeSats),
                confirmations: MIN_CONFIRMATIONS,
                status: "confirmed",
                created_at: blockTime,
              });
            }
          }
        }

        // Insert donations
        if (donationsToInsert.length > 0) {
          // Deduplicate by tx_hash + recipient_id (one TX can have multiple recipients)
          const dedupKey = (d: Record<string, unknown>) => `${d.tx_hash}__${d.recipient_id}`;
          const dedupedDonations = Array.from(
            new Map(donationsToInsert.map(d => [dedupKey(d), d])).values()
          );

          const { data: inserted, error: insertErr } = await adminClient
            .from("donations")
            .insert(dedupedDonations)
            .select("id, tx_hash, sender_id, recipient_id, amount, token_symbol");

          if (insertErr) {
            console.error("BTC donations insert error:", insertErr);
          } else {
            totalNewTransfers += (inserted || []).length;
            console.log(`Inserted ${(inserted || []).length} BTC donations for user ${profile.username}`);

            // Create gift_celebration posts cho cả nội bộ và ví ngoài (ví ngoài KHÔNG tính Light Score)
            const postsToInsert: Record<string, unknown>[] = [];
            for (const d of dedupedDonations) {
              const isExternal = (d as Record<string, unknown>).is_external as boolean;
              const senderId = d.sender_id as string | null;

              const senderName = (d.metadata as Record<string, unknown>)?.sender_name
                || (isExternal || !senderId ? "Ví ngoài" : "Unknown");
              const recipientName = (d.metadata as Record<string, unknown>)?.recipient_name || "Unknown";

              const baseMeta = (d.metadata as Record<string, unknown>) || { chain_family: "bitcoin" };
              const meta = (isExternal || !senderId)
                ? { ...baseMeta, is_external: true, sender_address: (d as Record<string, unknown>).sender_address ?? null }
                : baseMeta;

              postsToInsert.push({
                user_id: senderId || (d.recipient_id as string),
                content: `🎉 ${senderName} đã trao gửi ${d.amount} BTC cho ${recipientName} ❤️`,
                post_type: "gift_celebration",
                tx_hash: d.tx_hash,
                gift_sender_id: senderId,
                gift_recipient_id: d.recipient_id,
                gift_token: "BTC",
                gift_amount: String(d.amount),
                gift_message: null,
                is_highlighted: true,
                highlight_expires_at: null,
                visibility: "public",
                moderation_status: "approved",
                created_at: d.created_at,
                metadata: meta,
              });
            }

            // Deduplicate posts by tx_hash + recipient
            const postDedupKey = (p: Record<string, unknown>) => `${p.tx_hash}__${p.gift_recipient_id}`;
            const dedupedPostsToInsert = Array.from(
              new Map(postsToInsert.map(p => [postDedupKey(p), p])).values()
            );
            const postTxHashes = dedupedPostsToInsert.map(p => p.tx_hash as string).filter(Boolean);
            if (postTxHashes.length > 0) {
              const { data: existingPosts } = await adminClient
                .from("posts")
                .select("tx_hash, gift_recipient_id")
                .eq("post_type", "gift_celebration")
                .in("tx_hash", postTxHashes);
              const existingPostSet = new Set((existingPosts || []).map(p => `${p.tx_hash}__${p.gift_recipient_id}`));
              const newPosts = dedupedPostsToInsert.filter(p => !existingPostSet.has(postDedupKey(p)));

              // Map (tx_hash + recipient_id) -> post_id (NEW + EXISTING) để cập nhật donations.post_id
              const postIdByKey = new Map<string, string>();
              // Pre-load existing posts với id để có thể link ngược
              const { data: existingPostRows } = await adminClient
                .from("posts")
                .select("id, tx_hash, gift_recipient_id")
                .eq("post_type", "gift_celebration")
                .in("tx_hash", postTxHashes);
              for (const p of existingPostRows || []) {
                postIdByKey.set(`${p.tx_hash}__${p.gift_recipient_id}`, p.id);
              }

              if (newPosts.length > 0) {
                const { data: insertedPosts, error: postErr } = await adminClient
                  .from("posts")
                  .insert(newPosts)
                  .select("id, tx_hash, gift_recipient_id");
                if (postErr) console.error("BTC post insert error:", postErr);
                else {
                  for (const p of insertedPosts || []) {
                    postIdByKey.set(`${p.tx_hash}__${p.gift_recipient_id}`, p.id);
                  }
                  console.log(`Created ${newPosts.length} BTC gift_celebration posts`);
                }
              }

              // Backfill donations.post_id để các UI dựa vào link donation→post hoạt động đúng
              for (const d of dedupedDonations) {
                const key = `${d.tx_hash}__${d.recipient_id}`;
                const postId = postIdByKey.get(key);
                if (!postId) continue;
                await adminClient
                  .from("donations")
                  .update({ post_id: postId })
                  .eq("tx_hash", d.tx_hash as string)
                  .eq("recipient_id", d.recipient_id as string)
                  .is("post_id", null);
              }

              // Notifications
              const notificationsToInsert = dedupedDonations
                .filter(d => !existingPostSet.has(d.tx_hash as string) && d.recipient_id && d.sender_id)
                .map(d => ({
                  user_id: d.recipient_id as string,
                  actor_id: d.sender_id as string,
                  post_id: postIdByKey.get(`${d.tx_hash}__${d.recipient_id}`) || null,
                  type: "donation",
                  read: false,
                }));

              // For external donations (no sender_id), create notification with recipient as actor
              const externalNotifications = dedupedDonations
                .filter(d => !existingPostSet.has(d.tx_hash as string) && d.recipient_id && !d.sender_id)
                .map(d => ({
                  user_id: d.recipient_id as string,
                  actor_id: d.recipient_id as string,
                  post_id: postIdByKey.get(`${d.tx_hash}__${d.recipient_id}`) || null,
                  type: "donation",
                  read: false,
                }));
              notificationsToInsert.push(...externalNotifications);

              if (notificationsToInsert.length > 0) {
                const { error: notifErr } = await adminClient.from("notifications").insert(notificationsToInsert);
                if (notifErr) console.error("BTC notification error:", notifErr);
              }

              // Auto chat messages
              for (const d of dedupedDonations) {
                if (existingPostSet.has(d.tx_hash as string)) continue;
                const senderId = d.sender_id as string;
                const recipientId = d.recipient_id as string;
                if (!senderId || !recipientId || senderId === recipientId) continue;

                try {
                  const senderName = (d.metadata as Record<string, unknown>)?.sender_name || "Unknown";
                  const txHashShort = (d.tx_hash as string).substring(0, 10) + "...";

                  // Find or create conversation
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
                    const msgContent = `🎁 ${senderName} đã tặng bạn ${d.amount} BTC trên mạng Bitcoin!\n₿ TX: ${txHashShort}\n🔗 https://mempool.space/tx/${d.tx_hash}`;
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
                  console.error(`BTC chat error for tx ${d.tx_hash}:`, chatErr);
                }
              }
            }
          }
        }

        // Insert wallet_transfers (dedup by tx_hash + user_id + direction)
        if (walletTransfersToInsert.length > 0) {
          const wtTxHashes = walletTransfersToInsert.map(w => w.tx_hash as string);
          const { data: existingWt } = await adminClient
            .from("wallet_transfers")
            .select("tx_hash, direction")
            .in("tx_hash", wtTxHashes)
            .eq("user_id", profile.id);
          const existingWtSet = new Set((existingWt || []).map(w => `${w.tx_hash}__${w.direction}`));
          const newWt = walletTransfersToInsert.filter(w => !existingWtSet.has(`${w.tx_hash}__${w.direction}`));

          if (newWt.length > 0) {
            const { error: wtErr } = await adminClient.from("wallet_transfers").insert(newWt);
            if (wtErr) console.error("BTC wallet_transfers error:", wtErr);
            else console.log(`Inserted ${newWt.length} BTC wallet_transfers for ${profile.username}`);

            // === Connector detect (BTC, fire-and-forget, only "in" direction) ===
            try {
              const supaUrl = Deno.env.get("SUPABASE_URL")!;
              const svcKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
              for (const w of newWt) {
                if ((w as any).direction !== "in") continue;
                fetch(`${supaUrl}/functions/v1/pplp-connector-detect`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": `Bearer ${svcKey}` },
                  body: JSON.stringify({
                    tx_hash: (w as any).tx_hash,
                    chain: "BTC",
                    token_symbol: "BTC",
                    amount: (w as any).amount,
                    from_address: (w as any).counterparty_address,
                    to_address: (profile as any).btc_native_address ?? (profile as any).custodial_wallet_address ?? "",
                  }),
                }).catch(e => console.warn("connector-detect BTC call failed:", e?.message ?? e));
              }
            } catch (e) {
              console.warn("connector hook BTC error:", e);
            }
          }
        }

        // Small delay between users to respect rate limits
        await new Promise(r => setTimeout(r, 200));
      }
    }

    return new Response(
      JSON.stringify({
        scanned: profiles.length,
        newTransfers: totalNewTransfers,
        message: totalNewTransfers > 0
          ? `Tìm thấy ${totalNewTransfers} giao dịch BTC mới`
          : "Không có giao dịch BTC mới",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("scan-btc-transactions error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
