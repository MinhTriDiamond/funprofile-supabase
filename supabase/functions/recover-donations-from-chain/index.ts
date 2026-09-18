// Recover missing donations by scanning BSC chain via public RPC.
// For each ERC20 Transfer involving the user's wallet where counterparty
// is another user in the system, insert a donations entry if not present.
//
// Usage (admin only):
//   POST { user_id, days?: 7, dry_run?: false }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number; address: string }> = {
  "0x0910320181889fefde0bb1ca63962b0a8882e413": { symbol: "CAMLY", decimals: 3, address: "0x0910320181889fefde0bb1ca63962b0a8882e413" },
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18, address: "0x55d398326f99059ff775485246999027b3197955" },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { symbol: "BTCB", decimals: 18, address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c" },
  "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6": { symbol: "FUN", decimals: 18, address: "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6" },
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": { symbol: "WBNB", decimals: 18, address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c" },
};

const RPC_ENDPOINTS = [
  "https://bsc.publicnode.com",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
];
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const START_CHUNK_SIZE = 1500;
const MIN_CHUNK_SIZE = 50;
const BSC_AVG_BLOCK_TIME_SEC = 3;

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function pad(addr: string) { return "0x000000000000000000000000" + addr.toLowerCase().replace(/^0x/, ""); }

async function rpcCall(method: string, params: unknown[]): Promise<any> {
  let lastErr: unknown = null;
  for (const url of RPC_ENDPOINTS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        });
        const data = await res.json();
        if (data.error) {
          lastErr = data.error;
          if (data.error.code === -32005 || /limit/i.test(data.error.message || "")) {
            await delay(300);
            continue;
          }
          break;
        }
        return data.result;
      } catch (e) {
        lastErr = e;
        await delay(200);
      }
    }
  }
  throw new Error(`RPC failed: ${JSON.stringify(lastErr)}`);
}

async function fetchLogsAdaptive(params: {
  tokenAddr: string;
  topics: (string | null)[];
  start: number;
  end: number;
  chunkSize?: number;
}): Promise<any[]> {
  const { tokenAddr, topics, start, end, chunkSize = START_CHUNK_SIZE } = params;
  const logs: any[] = [];

  for (let cursor = start; cursor <= end;) {
    const currentEnd = Math.min(cursor + chunkSize - 1, end);
    try {
      const result = await rpcCall("eth_getLogs", [{
        fromBlock: "0x" + cursor.toString(16),
        toBlock: "0x" + currentEnd.toString(16),
        address: tokenAddr,
        topics,
      }]);
      logs.push(...(result || []));
      cursor = currentEnd + 1;
      await delay(50);
    } catch (e) {
      const msg = String((e as Error).message || e);
      if ((/limit/i.test(msg) || msg.includes("-32005")) && chunkSize > MIN_CHUNK_SIZE) {
        const smallerChunk = Math.max(MIN_CHUNK_SIZE, Math.floor(chunkSize / 2));
        console.warn(`adaptive split ${cursor}-${currentEnd} => ${smallerChunk}:`, msg);
        const splitLogs = await fetchLogsAdaptive({ tokenAddr, topics, start: cursor, end: currentEnd, chunkSize: smallerChunk });
        logs.push(...splitLogs);
        cursor = currentEnd + 1;
        continue;
      }
      throw e;
    }
  }

  return logs;
}

interface Transfer {
  tx_hash: string;
  from: string;
  to: string;
  amount_raw: bigint;
  token_address: string;
  symbol: string;
  decimals: number;
  block_number: number;
}

async function scanTransfersForWallet(
  walletAddr: string,
  fromBlock: number,
  toBlock: number,
): Promise<Transfer[]> {
  const padded = pad(walletAddr);
  const out: Transfer[] = [];

  for (const tokenAddr of Object.keys(KNOWN_TOKENS)) {
    const tInfo = KNOWN_TOKENS[tokenAddr];
    for (const direction of ["out", "in"] as const) {
      // out: from = wallet → topics[1] = padded
      // in:  to   = wallet → topics[2] = padded
      const topics: (string | null)[] =
        direction === "out"
          ? [TRANSFER_TOPIC, padded, null]
          : [TRANSFER_TOPIC, null, padded];
      try {
        const logs = await fetchLogsAdaptive({ tokenAddr, topics, start: fromBlock, end: toBlock });
        for (const log of logs || []) {
          if (!log?.topics || log.topics.length < 3) continue;
          const from = "0x" + log.topics[1].slice(26).toLowerCase();
          const to = "0x" + log.topics[2].slice(26).toLowerCase();
          const valueHex = log.data || "0x0";
          const amount_raw = BigInt(valueHex);
          out.push({
            tx_hash: log.transactionHash.toLowerCase(),
            from, to,
            amount_raw,
            token_address: tokenAddr,
            symbol: tInfo.symbol === "WBNB" ? "BNB" : tInfo.symbol,
            decimals: tInfo.decimals,
            block_number: parseInt(log.blockNumber, 16),
          });
        }
      } catch (e) {
        console.warn(`scan error ${tInfo.symbol} ${direction} blocks ${fromBlock}-${toBlock}:`, (e as Error).message);
      }
    }
  }

  // Dedup by (tx_hash, token, from, to)
  const seen = new Set<string>();
  const dedup: Transfer[] = [];
  for (const t of out) {
    const k = `${t.tx_hash}|${t.token_address}|${t.from}|${t.to}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(t);
  }
  return dedup;
}

async function getBlockTimestamp(blockNumber: number): Promise<string> {
  try {
    const block = await rpcCall("eth_getBlockByNumber", ["0x" + blockNumber.toString(16), false]);
    if (block?.timestamp) {
      return new Date(parseInt(block.timestamp, 16) * 1000).toISOString();
    }
  } catch (_e) { /* ignore */ }
  return new Date().toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = (Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))!;
    const admin = createClient(supabaseUrl, serviceKey);

    // Auth: caller must be admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, (Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY'))!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleRow } = await admin
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "forbidden", error_description: "admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { user_id, days = 7, dry_run = false } = body as { user_id?: string; days?: number; dry_run?: boolean };
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's wallets
    const { data: profile } = await admin
      .from("profiles")
      .select("id, public_wallet_address, wallet_address, external_wallet_address, username, display_name")
      .eq("id", user_id).single();
    if (!profile) {
      return new Response(JSON.stringify({ error: "user not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const wallets = new Set<string>();
    for (const f of ["public_wallet_address", "wallet_address", "external_wallet_address"]) {
      const v = (profile as any)[f]?.toLowerCase().trim();
      if (v && v.startsWith("0x") && v.length === 42) wallets.add(v);
    }
    if (wallets.size === 0) {
      return new Response(JSON.stringify({ error: "user has no wallet" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Compute block range — nâng trần lên ~365 ngày (≈ 10.5M blocks BSC)
    const latestHex = await rpcCall("eth_blockNumber", []);
    const latest = parseInt(latestHex, 16);
    const daysCapped = Math.max(1, Math.min(365, Number(days) || 7));
    const blocksBack = Math.min(Math.ceil((daysCapped * 24 * 3600) / BSC_AVG_BLOCK_TIME_SEC), 11_000_000);
    const fromBlock = Math.max(0, latest - blocksBack);
    console.log(`[recover] user=${user_id} wallets=${[...wallets].join(",")} blocks ${fromBlock}-${latest} (${days}d)`);

    // Scan
    const allTransfers: Transfer[] = [];
    for (const w of wallets) {
      const list = await scanTransfersForWallet(w, fromBlock, latest);
      allTransfers.push(...list);
    }
    console.log(`[recover] found ${allTransfers.length} transfers on-chain`);

    // Filter: counterparty must be another user in system
    const counterparties = new Set<string>();
    for (const t of allTransfers) {
      const cp = wallets.has(t.from) ? t.to : t.from;
      if (!wallets.has(cp)) counterparties.add(cp);
    }
    const cpList = [...counterparties];
    const { data: cpProfiles } = cpList.length
      ? await admin
        .from("profiles")
        .select("id, username, display_name, public_wallet_address, wallet_address, external_wallet_address")
        .or(cpList.map((a) => `public_wallet_address.eq.${a},wallet_address.eq.${a},external_wallet_address.eq.${a}`).join(","))
      : { data: [] as any[] };
    const walletToUser = new Map<string, { id: string; username: string; display_name: string | null }>();
    for (const p of (cpProfiles || []) as any[]) {
      for (const f of ["public_wallet_address", "wallet_address", "external_wallet_address"]) {
        const v = p[f]?.toLowerCase().trim();
        if (v) walletToUser.set(v, { id: p.id, username: p.username, display_name: p.display_name });
      }
    }

    // Existing donations + transfers
    const txHashes = [...new Set(allTransfers.map((t) => t.tx_hash))];
    const { data: existingDon } = txHashes.length
      ? await admin.from("donations").select("tx_hash, sender_id, recipient_id, token_symbol")
        .in("tx_hash", txHashes)
      : { data: [] as any[] };
    const donKey = new Set((existingDon || []).map((d: any) =>
      `${d.tx_hash?.toLowerCase()}|${d.sender_id}|${d.recipient_id}|${d.token_symbol}`));

    // Build donation candidates (counterparty is another user)
    // và external-transfer candidates (counterparty là ví ngoài)
    type DonationCand = {
      kind: "donation";
      tx_hash: string; sender_id: string; recipient_id: string;
      sender_address: string; recipient_address: string;
      amount: string; token_symbol: string; token_address: string;
      block_number: number; counterparty_username: string;
    };
    type TransferCand = {
      kind: "transfer";
      tx_hash: string; user_id: string; direction: "in" | "out";
      counterparty_address: string;
      amount: string; token_symbol: string; token_address: string;
      block_number: number;
    };
    type Candidate = DonationCand | TransferCand;

    // Existing wallet_transfers (để dedup)
    const { data: existingWt } = txHashes.length
      ? await admin.from("wallet_transfers")
        .select("tx_hash, user_id, direction, token_symbol")
        .in("tx_hash", txHashes)
      : { data: [] as any[] };
    const wtKey = new Set((existingWt || []).map((t: any) =>
      `${t.tx_hash?.toLowerCase()}|${t.user_id}|${t.direction}|${t.token_symbol}`));

    const candidates: Candidate[] = [];
    for (const t of allTransfers) {
      const isOut = wallets.has(t.from);
      const cpAddr = isOut ? t.to : t.from;
      const cpUser = walletToUser.get(cpAddr);
      const amountStr = (Number(t.amount_raw) / Math.pow(10, t.decimals)).toString();

      if (cpUser) {
        const senderId = isOut ? user_id : cpUser.id;
        const recipientId = isOut ? cpUser.id : user_id;
        const senderAddr = isOut ? t.from : cpAddr;
        const recipientAddr = isOut ? cpAddr : t.to;
        const key = `${t.tx_hash}|${senderId}|${recipientId}|${t.symbol}`;
        if (donKey.has(key)) continue;
        candidates.push({
          kind: "donation",
          tx_hash: t.tx_hash, sender_id: senderId, recipient_id: recipientId,
          sender_address: senderAddr, recipient_address: recipientAddr,
          amount: amountStr, token_symbol: t.symbol, token_address: t.token_address,
          block_number: t.block_number,
          counterparty_username: cpUser.username || cpUser.display_name || cpAddr.slice(0, 10),
        });
      } else {
        // Ví ngoài → wallet_transfers
        const direction: "in" | "out" = isOut ? "out" : "in";
        const wKey = `${t.tx_hash}|${user_id}|${direction}|${t.symbol}`;
        if (wtKey.has(wKey)) continue;
        candidates.push({
          kind: "transfer",
          tx_hash: t.tx_hash, user_id, direction,
          counterparty_address: cpAddr,
          amount: amountStr, token_symbol: t.symbol, token_address: t.token_address,
          block_number: t.block_number,
        });
      }
    }

    const donCount = candidates.filter(c => c.kind === "donation").length;
    const transferCount = candidates.filter(c => c.kind === "transfer").length;
    console.log(`[recover] ${donCount} donations + ${transferCount} external transfers to recover`);

    if (dry_run || candidates.length === 0) {
      return new Response(JSON.stringify({
        success: true, dry_run, user_id, wallets: [...wallets],
        block_range: { from: fromBlock, to: latest, days: daysCapped },
        on_chain_transfers: allTransfers.length,
        missing_donations: donCount,
        missing_transfers: transferCount,
        candidates: candidates.map((c) => c.kind === "donation" ? {
          tx_hash: c.tx_hash, amount: c.amount, token: c.token_symbol,
          counterparty: c.counterparty_username,
          direction: c.sender_id === user_id ? "sent" : "received",
        } : {
          tx_hash: c.tx_hash, amount: c.amount, token: c.token_symbol,
          counterparty: c.counterparty_address,
          direction: c.direction === "out" ? "sent" : "received",
        }),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Insert with timestamps
    const inserted: any[] = [];
    const errors: string[] = [];
    for (const c of candidates) {
      try {
        const ts = await getBlockTimestamp(c.block_number);
        if (c.kind === "donation") {
          const { error } = await admin.from("donations").insert({
            sender_id: c.sender_id, recipient_id: c.recipient_id,
            amount: c.amount, token_symbol: c.token_symbol,
            token_address: c.token_address, chain_id: 56,
            tx_hash: c.tx_hash, status: "confirmed",
            message: null, light_score_earned: 0,
            card_theme: "celebration", card_sound: "rich-1",
            sender_address: c.sender_address,
            is_external: false,
            created_at: ts, confirmed_at: ts,
            metadata: { recovered: true, recovered_at: new Date().toISOString(), source: "recover-donations-from-chain" },
          });
          if (error) {
            if ((error as any).code === "23505") {
              console.log(`[recover] duplicate donation skip ${c.tx_hash}`);
            } else {
              errors.push(`${c.tx_hash}: ${error.message}`);
            }
          } else {
            inserted.push({
              kind: "donation",
              tx_hash: c.tx_hash, amount: c.amount, token: c.token_symbol,
              counterparty: c.counterparty_username,
              direction: c.sender_id === user_id ? "sent" : "received",
            });
          }
        } else {
          // wallet_transfers
          const { error } = await admin.from("wallet_transfers").insert({
            user_id: c.user_id,
            tx_hash: c.tx_hash,
            direction: c.direction,
            token_symbol: c.token_symbol,
            token_address: c.token_address,
            amount: c.amount,
            counterparty_address: c.counterparty_address,
            chain_id: 56,
            chain_family: "evm",
            status: "confirmed",
            created_at: ts,
          });
          if (error) {
            if ((error as any).code === "23505") {
              console.log(`[recover] duplicate transfer skip ${c.tx_hash}`);
            } else {
              errors.push(`${c.tx_hash}: ${error.message}`);
            }
          } else {
            inserted.push({
              kind: "transfer",
              tx_hash: c.tx_hash, amount: c.amount, token: c.token_symbol,
              counterparty: c.counterparty_address,
              direction: c.direction === "out" ? "sent" : "received",
            });
          }
        }
      } catch (e) {
        errors.push(`${c.tx_hash}: ${(e as Error).message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true, user_id, wallets: [...wallets],
      block_range: { from: fromBlock, to: latest, days: daysCapped },
      on_chain_transfers: allTransfers.length,
      candidates_total: candidates.length,
      inserted_count: inserted.length,
      errors_count: errors.length,
      inserted, errors: errors.slice(0, 10),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("recover error:", err);
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
