import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Bảo vệ endpoint quét treasury (rất tốn RPC + ghi DB):
 * chỉ cho phép cron (X-Cron-Secret) hoặc admin đã đăng nhập.
 */
async function requireCronOrAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET") || Deno.env.get("CRON_SECRET");
  const provided = req.headers.get("X-Cron-Secret") || req.headers.get("x-cron-secret");
  if (cronSecret && provided && provided === cronSecret) return { ok: true };

  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const token = authHeader.slice(7).trim();
  const client = createClient(Deno.env.get("SUPABASE_URL")!, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userErr } = await client.auth.getUser(token);
  if (userErr || !userData?.user) return { ok: false, status: 401, error: "Unauthorized" };

  const admin = createAdminClient() as any;
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userData.user.id, _role: "admin" });
  if (isAdmin !== true) return { ok: false, status: 403, error: "Forbidden: admin only" };
  return { ok: true };
}

const CAMLY_TOKEN = "0x0910320181889fefde0bb1ca63962b0a8882e413";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Fix 22/05/2026: trước đây trỏ nhầm sang profile "fun profile treasury"
// (ví 0xd0a262…). Ví treasury thật là funtreasury 0xa4967d…7da5d.
const TREASURY_ID = "733a0ca6-91e2-4513-a1a0-ce34fea484f8";

const RPC_ENDPOINTS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
  "https://bsc-dataseed4.binance.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed2.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
];

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function rpcCall(method: string, params: unknown[], rpcIdx = 0): Promise<any> {
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    const endpoint = RPC_ENDPOINTS[(rpcIdx + i) % RPC_ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      const data = await res.json();
      if (data.error) {
        console.log(`RPC ${endpoint} error: ${data.error.message}`);
        await delay(1000);
        continue;
      }
      return data.result;
    } catch (e) {
      console.log(`RPC ${endpoint} fetch error: ${e}`);
      await delay(500);
    }
  }
  return null;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const auth = await requireCronOrAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createAdminClient();
    
    // Get treasury wallet
    const { data: profile } = await supabase
      .from("profiles")
      .select("public_wallet_address")
      .eq("id", TREASURY_ID)
      .single();
    
    if (!profile?.public_wallet_address) {
      return new Response(JSON.stringify({ error: "Treasury has no wallet" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const walletAddr = profile.public_wallet_address.toLowerCase();
    const paddedAddr = "0x000000000000000000000000" + walletAddr.slice(2);
    
    console.log(`Scanning CAMLY transfers TO ${walletAddr}`);
    
    // Get latest block
    const latestBlock = parseInt(await rpcCall("eth_blockNumber", []) || "0x0", 16);
    console.log(`Latest block: ${latestBlock}`);
    
    // Scan from genesis to now in 10K block chunks
    // CAMLY incoming only: topic2 = treasury address
    const allLogs: any[] = [];
    const chunkSize = 10000;
    // Start from block 80000000 (~early Feb 2026) to save time
    const startBlock = 80000000;
    
    for (let from = startBlock; from <= latestBlock; from += chunkSize) {
      const to = Math.min(from + chunkSize - 1, latestBlock);
      const result = await rpcCall("eth_getLogs", [{
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
        address: CAMLY_TOKEN,
        topics: [TRANSFER_TOPIC, null, paddedAddr],
      }], Math.floor(from / chunkSize) % RPC_ENDPOINTS.length);
      
      if (result && result.length > 0) {
        console.log(`Found ${result.length} IN transfers in blocks ${from}-${to}`);
        allLogs.push(...result);
      }
      
      // Rate limit
      if ((from - startBlock) / chunkSize > 0 && (from - startBlock) / chunkSize % 3 === 0) {
        await delay(1000);
      }
    }
    
    console.log(`Total IN logs: ${allLogs.length}`);
    
    // Also scan OUT transfers
    const outLogs: any[] = [];
    for (let from = startBlock; from <= latestBlock; from += chunkSize) {
      const to = Math.min(from + chunkSize - 1, latestBlock);
      const result = await rpcCall("eth_getLogs", [{
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
        address: CAMLY_TOKEN,
        topics: [TRANSFER_TOPIC, paddedAddr, null],
      }], Math.floor(from / chunkSize) % RPC_ENDPOINTS.length);
      
      if (result && result.length > 0) {
        console.log(`Found ${result.length} OUT transfers in blocks ${from}-${to}`);
        outLogs.push(...result);
      }
      
      if ((from - startBlock) / chunkSize > 0 && (from - startBlock) / chunkSize % 3 === 0) {
        await delay(1000);
      }
    }
    
    console.log(`Total OUT logs: ${outLogs.length}`);
    
    // Parse and insert as wallet_transfers
    const transfers: any[] = [];
    
    for (const log of allLogs) {
      const fromAddr = "0x" + (log.topics[1] || "").slice(26).toLowerCase();
      const value = BigInt(log.data || "0x0");
      const amount = Number(value) / 1000; // CAMLY has 3 decimals
      
      transfers.push({
        user_id: TREASURY_ID,
        tx_hash: log.transactionHash.toLowerCase(),
        direction: "in",
        token_symbol: "CAMLY",
        token_address: CAMLY_TOKEN,
        amount,
        counterparty_address: fromAddr,
        chain_id: 56,
        status: "confirmed",
        created_at: new Date().toISOString(), // RPC doesn't give block timestamp easily
      });
    }
    
    for (const log of outLogs) {
      const toAddr = "0x" + (log.topics[2] || "").slice(26).toLowerCase();
      const value = BigInt(log.data || "0x0");
      const amount = Number(value) / 1000;
      
      transfers.push({
        user_id: TREASURY_ID,
        tx_hash: log.transactionHash.toLowerCase(),
        direction: "out",
        token_symbol: "CAMLY",
        token_address: CAMLY_TOKEN,
        amount,
        counterparty_address: toAddr,
        chain_id: 56,
        status: "confirmed",
        created_at: new Date().toISOString(),
      });
    }
    
    // Check existing
    const { data: existing } = await supabase
      .from("wallet_transfers")
      .select("tx_hash, direction")
      .eq("user_id", TREASURY_ID);
    const existingKeys = new Set((existing || []).map((e: any) => `${e.tx_hash}_${e.direction}`));
    
    // Also exclude donations
    const { data: donTxs } = await supabase
      .from("donations")
      .select("tx_hash")
      .or(`sender_id.eq.${TREASURY_ID},recipient_id.eq.${TREASURY_ID}`);
    const donSet = new Set((donTxs || []).map((d: any) => d.tx_hash?.toLowerCase()));
    
    const newTransfers = transfers.filter(t => 
      !existingKeys.has(`${t.tx_hash}_${t.direction}`) && !donSet.has(t.tx_hash)
    );
    
    console.log(`${newTransfers.length} new transfers to insert (${transfers.length} total, ${existingKeys.size} existing, ${donSet.size} donations)`);
    
    if (newTransfers.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: "No new transfers",
        in_count: allLogs.length,
        out_count: outLogs.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    
    // Insert
    let inserted = 0;
    const errors: string[] = [];
    for (let i = 0; i < newTransfers.length; i += 50) {
      const batch = newTransfers.slice(i, i + 50);
      const { error } = await supabase.from("wallet_transfers").insert(batch);
      if (error) errors.push(error.message); else inserted += batch.length;
    }
    
    return new Response(JSON.stringify({
      success: true,
      in_count: allLogs.length,
      out_count: outLogs.length,
      inserted,
      errors: errors.length > 0 ? errors : undefined,
      sample: newTransfers.slice(0, 5).map(t => ({
        tx: t.tx_hash.slice(0, 20),
        dir: t.direction,
        amount: t.amount,
      })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("scan-treasury error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
