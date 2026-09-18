import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { moralisFetch } from "../_shared/moralisFetch.ts";

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

// Known tokens on BSC (lowercase)
const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0x0910320181889fefde0bb1ca63962b0a8882e413": { symbol: "CAMLY", decimals: 3 },
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18 },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { symbol: "BTCB", decimals: 18 },
  "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6": { symbol: "FUN", decimals: 18 },
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": { symbol: "WBNB", decimals: 18 },
};

interface TokenTransfer {
  transaction_hash: string;
  from_address: string;
  to_address: string;
  value: string;
  address: string; // token contract
  block_timestamp: string;
  token_symbol?: string;
  token_decimals?: number;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const moralisKey = Deno.env.get("MORALIS_API_KEY");
    if (!moralisKey) {
      return new Response(JSON.stringify({ error: "MORALIS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createAdminClient();
    const body = await req.json();
    const { user_id, wallet_address, chain = "0x38", chain_id = 56 } = body;

    // Resolve wallet address from user_id if not provided
    let walletAddr = wallet_address?.toLowerCase();
    let userId = user_id;

    if (!walletAddr && !userId) {
      return new Response(JSON.stringify({ error: "user_id or wallet_address required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!walletAddr && userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, public_wallet_address, wallet_address")
        .eq("id", userId)
        .single();
      if (!profile) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      walletAddr = (profile.public_wallet_address || profile.wallet_address || "").toLowerCase();
      if (!walletAddr) {
        return new Response(JSON.stringify({ error: "User has no wallet address" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!userId && walletAddr) {
      // Find user by wallet
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, public_wallet_address, wallet_address, external_wallet_address");
      const match = profiles?.find((p: any) =>
        [p.public_wallet_address, p.wallet_address, p.external_wallet_address]
          .some((a: string | null) => a?.toLowerCase() === walletAddr)
      );
      if (!match) {
        return new Response(JSON.stringify({ error: "No user found for this wallet" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = match.id;
    }

    console.log(`Backfilling swaps for user ${userId}, wallet ${walletAddr}, chain ${chain}`);

    // Fetch all ERC20 transfers from Moralis (paginate)
    const allTransfers: TokenTransfer[] = [];
    let cursor: string | null = null;
    let page = 0;
    const MAX_PAGES = 20;

    do {
      const params = new URLSearchParams({
        chain,
        limit: "100",
      });
      if (cursor) params.set("cursor", cursor);

      const url = `${MORALIS_BASE}/${walletAddr}/erc20/transfers?${params.toString()}`;
      console.log(`Fetching page ${page}: ${url}`);

      const res = await moralisFetch(url, {
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`Moralis error ${res.status}: ${errText}`);
        break;
      }

      const data = await res.json();
      const items = data.result || [];
      allTransfers.push(...items);

      cursor = data.cursor || null;
      page++;
    } while (cursor && page < MAX_PAGES);

    console.log(`Fetched ${allTransfers.length} total ERC20 transfers`);

    // Group transfers by transaction_hash
    const txGroups = new Map<string, TokenTransfer[]>();
    for (const t of allTransfers) {
      const hash = (t.transaction_hash || "").toLowerCase();
      if (!hash) continue;
      if (!txGroups.has(hash)) txGroups.set(hash, []);
      txGroups.get(hash)!.push(t);
    }

    // Detect swaps: tx with both OUT and IN transfers for known tokens
    const swaps: Array<{
      tx_hash: string;
      from_symbol: string;
      to_symbol: string;
      from_amount: number;
      to_amount: number;
      created_at: string;
    }> = [];

    for (const [txHash, transfers] of txGroups) {
      const outs: TokenTransfer[] = [];
      const ins: TokenTransfer[] = [];

      for (const t of transfers) {
        const tokenAddr = (t.address || "").toLowerCase();
        const tokenInfo = KNOWN_TOKENS[tokenAddr];
        if (!tokenInfo) continue;

        const from = (t.from_address || "").toLowerCase();
        const to = (t.to_address || "").toLowerCase();

        if (from === walletAddr) outs.push(t);
        if (to === walletAddr) ins.push(t);
      }

      // A swap has at least 1 out and 1 in of different tokens
      if (outs.length > 0 && ins.length > 0) {
        const outTransfer = outs[0];
        const inTransfer = ins[0];

        const outTokenAddr = (outTransfer.address || "").toLowerCase();
        const inTokenAddr = (inTransfer.address || "").toLowerCase();

        const outInfo = KNOWN_TOKENS[outTokenAddr];
        const inInfo = KNOWN_TOKENS[inTokenAddr];

        if (!outInfo || !inInfo) continue;
        if (outInfo.symbol === inInfo.symbol) continue; // not a swap

        const outAmount = Number(BigInt(outTransfer.value || "0")) / Math.pow(10, outInfo.decimals);
        const inAmount = Number(BigInt(inTransfer.value || "0")) / Math.pow(10, inInfo.decimals);

        // Map WBNB → BNB for display
        const fromSymbol = outInfo.symbol === "WBNB" ? "BNB" : outInfo.symbol;
        const toSymbol = inInfo.symbol === "WBNB" ? "BNB" : inInfo.symbol;

        swaps.push({
          tx_hash: txHash,
          from_symbol: fromSymbol,
          to_symbol: toSymbol,
          from_amount: outAmount,
          to_amount: inAmount,
          created_at: outTransfer.block_timestamp || new Date().toISOString(),
        });
      }
    }

    console.log(`Detected ${swaps.length} swap transactions`);

    if (swaps.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No swap transactions found",
        total_transfers: allTransfers.length,
        swaps_found: 0,
        inserted: 0,
        skipped: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check existing swap tx_hashes
    const txHashes = swaps.map((s) => s.tx_hash);
    const { data: existing } = await supabase
      .from("swap_transactions")
      .select("tx_hash")
      .in("tx_hash", txHashes);
    const existingSet = new Set((existing || []).map((e: any) => e.tx_hash));

    // Insert new swaps
    const toInsert = swaps
      .filter((s) => !existingSet.has(s.tx_hash))
      .map((s) => ({
        user_id: userId,
        tx_hash: s.tx_hash,
        from_symbol: s.from_symbol,
        to_symbol: s.to_symbol,
        from_amount: s.from_amount,
        to_amount: s.to_amount,
        chain_id: chain_id,
        status: "confirmed",
        created_at: s.created_at,
      }));

    let inserted = 0;
    const errors: string[] = [];

    // Insert in batches of 50
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabase.from("swap_transactions").insert(batch);
      if (error) {
        console.error(`Insert batch error:`, error.message);
        errors.push(error.message);
      } else {
        inserted += batch.length;
      }
    }

    const result = {
      success: true,
      user_id: userId,
      wallet: walletAddr,
      total_transfers: allTransfers.length,
      swaps_found: swaps.length,
      already_exists: existingSet.size,
      inserted,
      errors: errors.length > 0 ? errors : undefined,
      swaps: swaps.map((s) => ({
        tx_hash: s.tx_hash,
        swap: `${s.from_amount} ${s.from_symbol} → ${s.to_amount} ${s.to_symbol}`,
        date: s.created_at,
        new: !existingSet.has(s.tx_hash),
      })),
    };

    console.log(`Backfill complete: ${inserted} inserted, ${existingSet.size} skipped`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("backfill-swap-transactions error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
