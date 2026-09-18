import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { moralisFetch } from "../_shared/moralisFetch.ts";

/**
 * Backfill Love House: Quét toàn bộ lịch sử ERC20 transfers đến ví Love House
 * và ghi nhận donations bị thiếu. Chạy 1 lần (manual trigger).
 */

const LOVE_HOUSE_WALLET = "0x18e1e12c884687424a92b207b42e0befb7f6e1f6";
const LOVE_HOUSE_PROFILE_ID = "c75cd3ba-5466-4053-8815-e6fee8312e5a";

const TOKEN_CONTRACTS: Record<string, { symbol: string; decimals: number; chainId: number }> = {
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18, chainId: 56 },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { symbol: "BTCB", decimals: 18, chainId: 56 },
  "0x0910320181889fefde0bb1ca63962b0a8882e413": { symbol: "CAMLY", decimals: 3, chainId: 56 },
  "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6": { symbol: "FUN", decimals: 18, chainId: 97 },
};

const MIN_AMOUNTS: Record<string, number> = {
  USDT: 0.01, BTCB: 0.01, CAMLY: 1, FUN: 1,
};

interface MoralisTransfer {
  transaction_hash: string;
  from_address: string;
  to_address: string;
  value: string;
  block_timestamp: string;
  address: string;
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
    const moralisApiKey = Deno.env.get("MORALIS_API_KEY");
    if (!moralisApiKey) {
      return new Response(JSON.stringify({ error: "MORALIS_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createAdminClient();

    // 1. Load all profiles with any wallet
    const { data: allProfiles } = await adminClient
      .from("profiles")
      .select("id, public_wallet_address, wallet_address, external_wallet_address, username, display_name")
      .not("public_wallet_address", "is", null);

    const walletToProfile = new Map<string, { id: string; username: string; display_name: string | null }>();
    for (const p of allProfiles || []) {
      const profileData = { id: p.id, username: p.username, display_name: p.display_name };
      for (const raw of [p.public_wallet_address, p.wallet_address, p.external_wallet_address]) {
        if (raw) {
          const addr = raw.toLowerCase();
          if (!walletToProfile.has(addr)) walletToProfile.set(addr, profileData);
        }
      }
    }

    // 2. Fetch ERC20 transfers TO Love House wallet (paginated)
    const moralisHeaders = { Accept: "application/json" };
    const moralisBase = "https://deep-index.moralis.io/api/v2.2";
    const allTransfers: (MoralisTransfer & { _symbol: string; _decimals: number; _chainId: number })[] = [];

    for (const chain of ["bsc", "bsc%20testnet"]) {
      const chainId = chain === "bsc%20testnet" ? 97 : 56;
      let cursor: string | null = null;
      let page = 0;
      do {
        const url = `${moralisBase}/${LOVE_HOUSE_WALLET}/erc20/transfers?chain=${chain}&limit=100&order=DESC${cursor ? `&cursor=${cursor}` : ""}`;
        console.log(`Fetching page ${page} for chain ${chain}:`, url);
        const res = await moralisFetch(url, { headers: moralisHeaders });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`Moralis error ${res.status}:`, errText);
          break;
        }
        const data = await res.json();
        console.log(`Chain ${chain} page ${page}: ${(data.result || []).length} transfers, cursor: ${data.cursor ? 'yes' : 'no'}`);
        const transfers = (data.result || []) as MoralisTransfer[];
        for (const t of transfers) {
          if (t.to_address?.toLowerCase() === LOVE_HOUSE_WALLET) {
            const contractAddr = t.address?.toLowerCase() || "";
            const tokenInfo = TOKEN_CONTRACTS[contractAddr];
            if (tokenInfo) {
              allTransfers.push({ ...t, _symbol: tokenInfo.symbol, _decimals: tokenInfo.decimals, _chainId: tokenInfo.chainId });
            }
          }
        }
        cursor = data.cursor || null;
        page++;
        if (page > 20) break;
      } while (cursor);
    }
    
    console.log(`Total incoming transfers to Love House: ${allTransfers.length}`);

    if (allTransfers.length === 0) {
      return new Response(JSON.stringify({ message: "No incoming transfers found", newTransfers: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Dedup against existing
    const txHashes = [...new Set(allTransfers.map(t => t.transaction_hash).filter(Boolean))];
    const { data: existingDonations } = await adminClient
      .from("donations").select("tx_hash").in("tx_hash", txHashes);
    const existingSet = new Set((existingDonations || []).map(d => d.tx_hash));

    const newTransfers = allTransfers.filter(t => t.transaction_hash && !existingSet.has(t.transaction_hash));

    if (newTransfers.length === 0) {
      return new Response(JSON.stringify({ message: "All transfers already recorded", total: allTransfers.length, newTransfers: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Build donation records
    const donationsToInsert: Record<string, unknown>[] = [];
    for (const t of newTransfers) {
      const amount = parseAmount(t.value, t._decimals);
      const numAmount = parseFloat(amount);
      const minAmount = MIN_AMOUNTS[t._symbol] ?? 0.01;
      if (numAmount <= 0 || numAmount < minAmount) continue;

      const senderAddr = t.from_address.toLowerCase();
      const contractAddr = t.address?.toLowerCase() || "";
      const senderProfile = walletToProfile.get(senderAddr);

      donationsToInsert.push({
        sender_id: senderProfile?.id || null,
        sender_address: senderAddr,
        recipient_id: LOVE_HOUSE_PROFILE_ID,
        amount,
        token_symbol: t._symbol,
        token_address: contractAddr,
        chain_id: t._chainId,
        tx_hash: t.transaction_hash,
        status: "confirmed",
        confirmed_at: t.block_timestamp,
        created_at: t.block_timestamp,
        is_external: !senderProfile,
        card_theme: "celebration",
        card_sound: "rich-1",
        message: null,
        light_score_earned: 0,
        metadata: {
          sender_name: senderProfile?.display_name || senderProfile?.username || "Ví ngoài",
          auto_scanned: true,
          scanner: "backfill-love-house",
        },
      });
    }

    if (donationsToInsert.length === 0) {
      return new Response(JSON.stringify({ message: "No valid new donations", total: allTransfers.length, newTransfers: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Insert donations in batches
    let totalInserted = 0;
    for (let i = 0; i < donationsToInsert.length; i += 50) {
      const batch = donationsToInsert.slice(i, i + 50);
      const { error } = await adminClient.from("donations").insert(batch);
      if (error) { console.error("Insert error:", error); continue; }
      totalInserted += batch.length;
    }

    // 6. Create posts for new donations
    const postTxHashes = donationsToInsert.map(d => d.tx_hash as string).filter(Boolean);
    const { data: existingPosts } = await adminClient
      .from("posts").select("tx_hash").eq("post_type", "gift_celebration").in("tx_hash", postTxHashes);
    const existingPostSet = new Set((existingPosts || []).map(p => p.tx_hash));

    const postsToInsert = donationsToInsert
      .filter(d => !existingPostSet.has(d.tx_hash as string))
      .map(d => {
        const senderProfile = walletToProfile.get(d.sender_address as string);
        const senderName = senderProfile?.display_name || senderProfile?.username || "Ví ngoài";
        return {
          user_id: (d.sender_id as string) || LOVE_HOUSE_PROFILE_ID,
          content: `${senderName} đã tặng ${d.amount} ${d.token_symbol} cho Love House Ý Cha`,
          post_type: "gift_celebration",
          tx_hash: d.tx_hash,
          gift_sender_id: d.sender_id,
          gift_recipient_id: LOVE_HOUSE_PROFILE_ID,
          gift_token: d.token_symbol,
          gift_amount: String(d.amount),
          gift_message: null,
          is_highlighted: true,
          visibility: "public",
          moderation_status: "approved",
          created_at: d.created_at,
        };
      });

    if (postsToInsert.length > 0) {
      for (let i = 0; i < postsToInsert.length; i += 50) {
        const { error } = await adminClient.from("posts").insert(postsToInsert.slice(i, i + 50));
        if (error) console.error("Post insert error:", error);
      }
    }

    console.log(`Backfill Love House complete: ${totalInserted} donations, ${postsToInsert.length} posts`);
    return new Response(JSON.stringify({
      totalScanned: allTransfers.length,
      newTransfers: totalInserted,
      postsCreated: postsToInsert.length,
      message: `Backfill hoàn tất: ${totalInserted} giao dịch mới`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: unknown) {
    console.error("backfill-love-house error:", error);
    const msg = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
