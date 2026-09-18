import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FUNTREASURY_ID = "733a0ca6-91e2-4513-a1a0-ce34fea484f8";
const FUNTREASURY_WALLET = "0xa4967da72d012151950627483285c3042957da5d";
const CAMLY_TOKEN = "0x0910320181889fefde0bb1ca63962b0a8882e413";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const RPC_ENDPOINTS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
  "https://bsc-dataseed4.binance.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed2.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
];

async function rpcCall(method: string, params: unknown[]): Promise<any> {
  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const data = await res.json();
      if (data.error) continue;
      if (data.result !== undefined && data.result !== null) return data.result;
    } catch (_) { /* try next */ }
  }
  return null;
}

// CAMLY: 3 decimals — use string BigInt
function formatCamlyAmount(rawHex: string): string {
  const v = BigInt(rawHex || "0x0");
  const whole = v / 1000n;
  const frac = v % 1000n;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(3, "0").replace(/0+$/, "")}`;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!,
    );

    const body = await req.json().catch(() => ({}));
    const txHashes: string[] = Array.isArray(body?.tx_hashes) ? body.tx_hashes : [];
    if (txHashes.length === 0) {
      return new Response(JSON.stringify({ error: "tx_hashes required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paddedTreasury = "0x000000000000000000000000" + FUNTREASURY_WALLET.slice(2).toLowerCase();
    const results: any[] = [];
    let insertedTreasury = 0;
    let insertedSender = 0;
    let skipped = 0;

    for (const rawHash of txHashes) {
      const txHash = rawHash.toLowerCase().trim();
      try {
        const receipt = await rpcCall("eth_getTransactionReceipt", [txHash]);
        if (!receipt) {
          results.push({ tx_hash: txHash, status: "not_found_onchain" });
          continue;
        }
        if (receipt.status !== "0x1") {
          results.push({ tx_hash: txHash, status: "tx_failed_onchain" });
          continue;
        }

        // Find Transfer log to funtreasury
        const log = (receipt.logs || []).find((l: any) =>
          l.address?.toLowerCase() === CAMLY_TOKEN &&
          l.topics?.[0]?.toLowerCase() === TRANSFER_TOPIC &&
          l.topics?.[2]?.toLowerCase() === paddedTreasury
        );
        if (!log) {
          results.push({ tx_hash: txHash, status: "no_camly_to_treasury" });
          continue;
        }

        const fromAddr = ("0x" + log.topics[1].slice(26)).toLowerCase();
        const amount = formatCamlyAmount(log.data);

        // Block timestamp
        const block = await rpcCall("eth_getBlockByNumber", [receipt.blockNumber, false]);
        const tsSec = block?.timestamp ? parseInt(block.timestamp, 16) : Math.floor(Date.now() / 1000);
        const createdAt = new Date(tsSec * 1000).toISOString();

        // Lookup sender profile by wallet
        const { data: senderProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("wallet_address", fromAddr)
          .maybeSingle();

        // Insert for funtreasury (idempotent)
        const { data: existingTreasury } = await supabase
          .from("transactions")
          .select("id")
          .eq("tx_hash", txHash)
          .eq("user_id", FUNTREASURY_ID)
          .maybeSingle();

        if (!existingTreasury) {
          const { error: errT } = await supabase.from("transactions").insert({
            user_id: FUNTREASURY_ID,
            tx_hash: txHash,
            from_address: fromAddr,
            to_address: FUNTREASURY_WALLET,
            amount,
            token_symbol: "CAMLY",
            token_address: CAMLY_TOKEN,
            chain_id: 56,
            status: "confirmed",
            created_at: createdAt,
          });
          if (errT) {
            results.push({ tx_hash: txHash, status: "insert_treasury_failed", error: errT.message });
            continue;
          }
          insertedTreasury++;
        } else {
          skipped++;
        }

        // Insert for sender if mapped to a user
        if (senderProfile?.id) {
          const { data: existingSender } = await supabase
            .from("transactions")
            .select("id")
            .eq("tx_hash", txHash)
            .eq("user_id", senderProfile.id)
            .maybeSingle();
          if (!existingSender) {
            const { error: errS } = await supabase.from("transactions").insert({
              user_id: senderProfile.id,
              tx_hash: txHash,
              from_address: fromAddr,
              to_address: FUNTREASURY_WALLET,
              amount,
              token_symbol: "CAMLY",
              token_address: CAMLY_TOKEN,
              chain_id: 56,
              status: "confirmed",
              created_at: createdAt,
            });
            if (!errS) insertedSender++;
          }
        }

        results.push({
          tx_hash: txHash,
          status: "ok",
          from: fromAddr,
          amount,
          sender_user: senderProfile?.id ?? null,
          created_at: createdAt,
        });
      } catch (e) {
        results.push({ tx_hash: txHash, status: "error", error: String(e) });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: txHashes.length,
      inserted_treasury: insertedTreasury,
      inserted_sender: insertedSender,
      skipped,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
