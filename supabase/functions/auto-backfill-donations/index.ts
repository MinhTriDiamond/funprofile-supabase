import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PAGE_SIZE = 1000;
const BATCH_INSERT_SIZE = 100;

async function fetchAllConfirmedTransactions(adminClient: any) {
  const allTx: any[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: batch, error } = await adminClient
      .from("transactions")
      .select("id, user_id, tx_hash, from_address, to_address, amount, token_symbol, token_address, chain_id, created_at")
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch transactions: ${error.message}`);
    if (!batch || batch.length === 0) break;
    allTx.push(...batch);
    if (batch.length < PAGE_SIZE) hasMore = false;
    else offset += PAGE_SIZE;
  }
  return allTx;
}

async function fetchAllConfirmedDonations(adminClient: any) {
  const allDonations: any[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data: batch, error } = await adminClient
      .from("donations")
      .select("id, sender_id, recipient_id, amount, token_symbol, tx_hash, message, created_at")
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch donations: ${error.message}`);
    if (!batch || batch.length === 0) break;
    allDonations.push(...batch);
    if (batch.length < PAGE_SIZE) hasMore = false;
    else offset += PAGE_SIZE;
  }
  return allDonations;
}

function buildWalletAndProfileMaps(profiles: any[]) {
  const walletMap = new Map<string, string>();
  const profileMap = new Map<string, { username: string; display_name: string | null; avatar_url: string | null }>();
  for (const p of profiles) {
    profileMap.set(p.id, { username: p.username, display_name: p.display_name, avatar_url: p.avatar_url });
    if (p.wallet_address) walletMap.set(p.wallet_address.toLowerCase(), p.id);
    if (p.public_wallet_address) walletMap.set(p.public_wallet_address.toLowerCase(), p.id);
    if (p.external_wallet_address) walletMap.set(p.external_wallet_address.toLowerCase(), p.id);
  }
  return { walletMap, profileMap };
}

async function findMissingPostTxHashes(adminClient: any, donationTxHashes: string[]) {
  const existingPostTxHashes = new Set<string>();
  const batchSize = 100;
  for (let i = 0; i < donationTxHashes.length; i += batchSize) {
    const batch = donationTxHashes.slice(i, i + batchSize);
    const { data: existingPosts } = await adminClient
      .from("posts")
      .select("tx_hash")
      .eq("post_type", "gift_celebration")
      .in("tx_hash", batch);
    for (const p of existingPosts || []) {
      if (p.tx_hash) existingPostTxHashes.add(p.tx_hash);
    }
  }
  return existingPostTxHashes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    let mode = "backfill";
    try {
      const body = await req.json();
      if (body?.mode) mode = body.mode;
    } catch {
      // No body = default backfill mode
    }

    // 1. Get ALL confirmed transactions (paginated)
    const allTx = await fetchAllConfirmedTransactions(adminClient);

    // 2. Check which tx_hashes already have donations (paginated in small batches to avoid 1000-row limit)
    const txHashes = allTx.map((t) => t.tx_hash).filter(Boolean);
    const existingDonationSet = new Set<string>();
    const LOOKUP_BATCH = 100;
    for (let i = 0; i < txHashes.length; i += LOOKUP_BATCH) {
      const batch = txHashes.slice(i, i + LOOKUP_BATCH);
      const { data: existingDonations } = await adminClient
        .from("donations")
        .select("tx_hash")
        .in("tx_hash", batch);
      for (const d of existingDonations || []) {
        if (d.tx_hash) existingDonationSet.add(d.tx_hash);
      }
    }

    const missingDonationTx = allTx.filter((t) => t.tx_hash && !existingDonationSet.has(t.tx_hash));

    // 3. Build wallet_address -> profile map (expanded) — PAGINATED to bypass 1000-row cap
    const allProfiles: any[] = [];
    {
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data: batch, error } = await adminClient
          .from("profiles")
          .select("id, username, display_name, avatar_url, wallet_address, public_wallet_address, external_wallet_address")
          .order("id", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new Error(`Failed to fetch profiles: ${error.message}`);
        if (!batch || batch.length === 0) break;
        allProfiles.push(...batch);
        if (batch.length < PAGE_SIZE) hasMore = false;
        else offset += PAGE_SIZE;
      }
    }
    console.log(`[auto-backfill] Loaded ${allProfiles.length} profiles (paginated)`);

    const { walletMap, profileMap } = buildWalletAndProfileMaps(allProfiles);

    // 4. Find missing gift_celebration posts
    const allDonations = await fetchAllConfirmedDonations(adminClient);
    const donationTxHashes = allDonations.map((d) => d.tx_hash).filter(Boolean);
    const existingPostTxHashes = await findMissingPostTxHashes(adminClient, donationTxHashes);

    const missingPostDonations = allDonations.filter(
      (d) => d.tx_hash && d.sender_id && d.recipient_id && !existingPostTxHashes.has(d.tx_hash)
    );

    // ============ SCAN_ONLY MODE ============
    if (mode === "scan_only") {
      const missingDonationsList = missingDonationTx.map((tx) => {
        const recipientId = tx.to_address ? walletMap.get(tx.to_address.toLowerCase()) : null;
        const senderInfo = profileMap.get(tx.user_id);
        const recipientInfo = recipientId ? profileMap.get(recipientId) : null;
        return {
          tx_hash: tx.tx_hash, from_address: tx.from_address, to_address: tx.to_address,
          amount: tx.amount, token_symbol: tx.token_symbol, chain_id: tx.chain_id,
          created_at: tx.created_at, sender_username: senderInfo?.username || "Unknown",
          recipient_username: recipientInfo?.username || null, recipient_id: recipientId || null,
          missing_type: "donation", can_recover: !!recipientId,
        };
      });

      const missingPostsList = missingPostDonations.map((d) => {
        const senderInfo = profileMap.get(d.sender_id);
        const recipientInfo = profileMap.get(d.recipient_id);
        return {
          tx_hash: d.tx_hash, amount: d.amount, token_symbol: d.token_symbol,
          created_at: d.created_at, sender_username: senderInfo?.username || "Unknown",
          recipient_username: recipientInfo?.username || "Unknown",
          missing_type: "post", can_recover: true,
        };
      });

      return new Response(
        JSON.stringify({
          mode: "scan_only", total_scanned: allTx.length,
          missing_donations: missingDonationsList, missing_posts: missingPostsList,
          summary: {
            missing_donations_count: missingDonationsList.length,
            recoverable_donations: missingDonationsList.filter((d) => d.can_recover).length,
            unrecoverable_donations: missingDonationsList.filter((d) => !d.can_recover).length,
            missing_posts_count: missingPostsList.length,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============ BACKFILL MODE (default) ============
    if (allTx.length === 0) {
      const postsResult = await backfillGiftCelebrationPosts(adminClient, missingPostDonations, profileMap);
      return new Response(JSON.stringify({
        message: "No transactions to check", inserted: 0, ...postsResult,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create donation records + notifications
    const toInsert: any[] = [];
    const notifications: any[] = [];
    const skipped: string[] = [];

    for (const tx of missingDonationTx) {
      const recipientId = tx.to_address ? walletMap.get(tx.to_address.toLowerCase()) : null;
      if (!recipientId) { skipped.push(tx.tx_hash); continue; }

      toInsert.push({
        sender_id: tx.user_id, recipient_id: recipientId,
        amount: tx.amount, token_symbol: tx.token_symbol,
        token_address: tx.token_address || null, chain_id: tx.chain_id || 56,
        tx_hash: tx.tx_hash, status: "confirmed", confirmed_at: tx.created_at,
        card_theme: "celebration", card_sound: "rich-1", message: null, light_score_earned: 0,
      });

      if (tx.user_id && recipientId && tx.user_id !== recipientId) {
        notifications.push({ user_id: recipientId, actor_id: tx.user_id, type: "donation", read: false });
      }
    }

    // Insert donations one by one with upsert to avoid batch failures
    let insertedCount = 0;
    let errorCount = 0;
    for (const record of toInsert) {
      // Skip self-donation (violates no_self_donation constraint)
      if (record.sender_id === record.recipient_id) {
        skipped.push(record.tx_hash);
        continue;
      }
      const { error: insertError } = await adminClient
        .from("donations")
        .upsert(record, { onConflict: 'tx_hash', ignoreDuplicates: true });
      if (insertError) {
        errorCount++;
        console.error(`Insert error for ${record.tx_hash}:`, insertError.message);
      } else {
        insertedCount++;
      }
    }

    // Batch insert notifications
    if (notifications.length > 0) {
      for (let i = 0; i < notifications.length; i += BATCH_INSERT_SIZE) {
        const batch = notifications.slice(i, i + BATCH_INSERT_SIZE);
        await adminClient.from("notifications").insert(batch);
      }
    }

    // Re-fetch missing posts after new donations inserted
    const updatedDonations = await fetchAllConfirmedDonations(adminClient);
    const updatedDonTxHashes = updatedDonations.map((d) => d.tx_hash).filter(Boolean);
    const updatedPostTxSet = await findMissingPostTxHashes(adminClient, updatedDonTxHashes);
    const updatedMissingPosts = updatedDonations.filter(
      (d) => d.tx_hash && d.sender_id && d.recipient_id && !updatedPostTxSet.has(d.tx_hash)
    );

    const postsResult = await backfillGiftCelebrationPosts(adminClient, updatedMissingPosts, profileMap);

    console.log(`[auto-backfill] Scanned: ${allTx.length}, Missing: ${missingDonationTx.length}, Inserted: ${insertedCount}, Errors: ${errorCount}, Skipped: ${skipped.length}, Posts created: ${postsResult.posts_created}`);

    return new Response(
      JSON.stringify({
        inserted: insertedCount, errors: errorCount, skipped: skipped.length,
        scanned: allTx.length, missing: missingDonationTx.length, ...postsResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("auto-backfill-donations error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function backfillGiftCelebrationPosts(
  adminClient: any,
  missingDonations: any[],
  profileMap: Map<string, { username: string; display_name: string | null; avatar_url: string | null }>
) {
  if (!missingDonations || missingDonations.length === 0) {
    return { posts_created: 0, posts_details: [] };
  }

  const postsToInsert: any[] = [];
  const postsDetails: any[] = [];

  for (const d of missingDonations) {
    const sender = profileMap.get(d.sender_id);
    const recipient = profileMap.get(d.recipient_id);
    if (!sender || !recipient) continue;

    const senderName = sender.display_name || sender.username;
    const recipientName = recipient.display_name || recipient.username;

    postsToInsert.push({
      user_id: d.sender_id,
      content: `${senderName} đã tặng ${d.amount} ${d.token_symbol} cho ${recipientName}`,
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
    });

    postsDetails.push({
      tx_hash: d.tx_hash, sender: sender.username, recipient: recipient.username,
      amount: d.amount, token: d.token_symbol,
    });
  }

  let postsCreated = 0;
  for (let i = 0; i < postsToInsert.length; i += BATCH_INSERT_SIZE) {
    const batch = postsToInsert.slice(i, i + BATCH_INSERT_SIZE);
    const { error: postErr } = await adminClient.from("posts").insert(batch);
    if (postErr) {
      console.error(`Failed to insert gift_celebration posts batch (offset ${i}):`, postErr.message);
    } else {
      postsCreated += batch.length;
    }
  }

  return { posts_created: postsCreated, posts_details: postsDetails };
}
