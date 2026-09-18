import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { moralisFetch } from "../_shared/moralisFetch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Known tokens on BSC with contract addresses (lowercase)
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x0910320181889fefde0bb1ca63962b0a8882e413": { symbol: "CAMLY", decimals: 3 },
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18 },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { symbol: "BTCB", decimals: 18 },
  "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6": { symbol: "FUN", decimals: 18 },
};

// ERC20 Transfer event topic0
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

interface TransferEvent {
  token_address: string;
  token_symbol: string;
  token_decimals: number;
  from_address: string;
  to_address: string;
  amount: string;
}

async function fetchTxFromMoralis(txHash: string, moralisKey: string): Promise<{ transfers: TransferEvent[]; block_timestamp: string | null }> {
  // Try BSC mainnet first
  for (const chain of ["0x38", "0x61"]) {
    try {
      const url = `https://deep-index.moralis.io/api/v2.2/transaction/${txHash}/verbose?chain=${chain}`;
      const res = await moralisFetch(url, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      
      if (!data.logs || data.logs.length === 0) continue;
      
      const transfers: TransferEvent[] = [];
      const blockTimestamp = data.block_timestamp || null;
      
      for (const log of data.logs) {
        if (log.topic0?.toLowerCase() !== TRANSFER_TOPIC) continue;
        if (!log.topic1 || !log.topic2) continue;
        
        const tokenAddr = log.address?.toLowerCase();
        const tokenInfo = KNOWN_TOKENS[tokenAddr];
        if (!tokenInfo) continue;
        
        const fromAddr = "0x" + log.topic1.slice(26).toLowerCase();
        const toAddr = "0x" + log.topic2.slice(26).toLowerCase();
        const rawAmount = BigInt(log.data || "0");
        const amount = Number(rawAmount) / Math.pow(10, tokenInfo.decimals);
        
        transfers.push({
          token_address: tokenAddr,
          token_symbol: tokenInfo.symbol,
          token_decimals: tokenInfo.decimals,
          from_address: fromAddr,
          to_address: toAddr,
          amount: String(amount),
        });
      }
      
      if (transfers.length > 0) {
        return { transfers, block_timestamp: blockTimestamp };
      }
    } catch (e) {
      console.error(`Moralis error for ${txHash} on chain ${chain}:`, e);
    }
  }
  return { transfers: [], block_timestamp: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const moralisKey = Deno.env.get("MORALIS_API_KEY");
    if (!moralisKey) throw new Error("MORALIS_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { tx_hashes, sender_address } = await req.json();

    if (!tx_hashes || !Array.isArray(tx_hashes) || !sender_address) {
      return new Response(
        JSON.stringify({ error: "tx_hashes (array) and sender_address required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find sender profile
    const senderLower = sender_address.toLowerCase();
    const { data: allProfiles } = await adminClient
      .from("profiles")
      .select("id, username, display_name, avatar_url, wallet_address, public_wallet_address, external_wallet_address");

    if (!allProfiles) throw new Error("Failed to fetch profiles");

    // Build wallet -> profile map
    const walletMap = new Map<string, { id: string; username: string; display_name: string | null }>();
    let senderProfile: { id: string; username: string; display_name: string | null } | null = null;

    for (const p of allProfiles) {
      const info = { id: p.id, username: p.username, display_name: p.display_name };
      const addrs = [p.wallet_address, p.public_wallet_address, p.external_wallet_address];
      for (const addr of addrs) {
        if (addr) {
          const lower = addr.toLowerCase();
          walletMap.set(lower, info);
          if (lower === senderLower) senderProfile = info;
        }
      }
    }

    if (!senderProfile) {
      return new Response(
        JSON.stringify({ error: `Sender profile not found for ${sender_address}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check existing donations
    const { data: existingDonations } = await adminClient
      .from("donations")
      .select("tx_hash")
      .in("tx_hash", tx_hashes);
    const existingSet = new Set((existingDonations || []).map((d) => d.tx_hash));

    const results: any[] = [];
    let created = 0, skipped = 0, errors = 0;

    for (const txHash of tx_hashes) {
      if (existingSet.has(txHash)) {
        results.push({ tx_hash: txHash, status: "skipped", reason: "already exists" });
        skipped++;
        continue;
      }

      try {
        const { transfers, block_timestamp } = await fetchTxFromMoralis(txHash, moralisKey);
        
        if (transfers.length === 0) {
          results.push({ tx_hash: txHash, status: "error", reason: "no ERC20 transfers found" });
          errors++;
          continue;
        }

        // Process each transfer in the tx (usually 1)
        for (const transfer of transfers) {
          // Only process if sender matches
          if (transfer.from_address !== senderLower) continue;

          const recipientProfile = walletMap.get(transfer.to_address);
          if (!recipientProfile) {
            results.push({ tx_hash: txHash, status: "error", reason: `recipient not found: ${transfer.to_address}` });
            errors++;
            continue;
          }

          const confirmedAt = block_timestamp ? new Date(block_timestamp).toISOString() : new Date().toISOString();
          const senderName = senderProfile.display_name || senderProfile.username;
          const recipientName = recipientProfile.display_name || recipientProfile.username;

          // 1. Create donation
          const { data: donation, error: donErr } = await adminClient
            .from("donations")
            .insert({
              sender_id: senderProfile.id,
              recipient_id: recipientProfile.id,
              amount: transfer.amount,
              token_symbol: transfer.token_symbol,
              token_address: transfer.token_address,
              tx_hash: txHash,
              status: "confirmed",
              confirmed_at: confirmedAt,
              created_at: confirmedAt,
              chain_id: 56,
              card_theme: "celebration",
              card_sound: "rich-1",
              message: null,
              light_score_earned: 0,
            })
            .select("id")
            .single();

          if (donErr) {
            results.push({ tx_hash: txHash, status: "error", reason: donErr.message });
            errors++;
            continue;
          }

          // 2. Create gift_celebration post
          const { data: post } = await adminClient
            .from("posts")
            .insert({
              user_id: senderProfile.id,
              content: `${senderName} đã tặng ${transfer.amount} ${transfer.token_symbol} cho ${recipientName}`,
              post_type: "gift_celebration",
              tx_hash: txHash,
              gift_sender_id: senderProfile.id,
              gift_recipient_id: recipientProfile.id,
              gift_token: transfer.token_symbol,
              gift_amount: transfer.amount,
              gift_message: null,
              is_highlighted: true,
              visibility: "public",
              moderation_status: "approved",
              created_at: confirmedAt,
            })
            .select("id")
            .single();

          // 3. Link post to donation
          if (post?.id && donation?.id) {
            await adminClient
              .from("donations")
              .update({ post_id: post.id })
              .eq("id", donation.id);
          }

          // 4. Create notification
          if (senderProfile.id !== recipientProfile.id) {
            await adminClient.from("notifications").insert({
              user_id: recipientProfile.id,
              actor_id: senderProfile.id,
              type: "donation",
              post_id: post?.id || null,
              read: false,
              created_at: confirmedAt,
            });
          }

          results.push({
            tx_hash: txHash,
            status: "created",
            donation_id: donation?.id,
            post_id: post?.id,
            amount: transfer.amount,
            token: transfer.token_symbol,
            recipient: recipientProfile.username,
            confirmed_at: confirmedAt,
          });
          created++;
        }
      } catch (e) {
        results.push({ tx_hash: txHash, status: "error", reason: e.message });
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        total_processed: tx_hashes.length,
        created,
        skipped,
        errors,
        sender: senderProfile.username,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("backfill-tx-donations error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
