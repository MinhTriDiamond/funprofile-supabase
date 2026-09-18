import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { moralisFetch } from "../_shared/moralisFetch.ts";

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";
const BSCSCAN_API = "https://api.bscscan.com/api";

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
  address: string;
  block_timestamp: string;
}

// ── BSCScan API (free, no key needed for basic) ──

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchTransfersViaBscScan(walletAddr: string): Promise<TokenTransfer[]> {
  const allTransfers: TokenTransfer[] = [];
  const maxPages = 5;
  
  for (let page = 1; page <= maxPages; page++) {
    const url = `${BSCSCAN_API}?module=account&action=tokentx&address=${walletAddr}&startblock=0&endblock=999999999&sort=desc&offset=1000&page=${page}`;
    console.log(`BSCScan page ${page} for ${walletAddr.slice(0, 10)}...`);

    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await delay(5500); // BSCScan free = 1 req/5s
      try {
        res = await fetch(url);
        if (res.ok) break;
        if (res.status === 429) { console.log("BSCScan rate limited, retrying..."); continue; }
        break;
      } catch (e) { console.error(`BSCScan fetch error attempt ${attempt}:`, e); }
    }
    if (!res || !res.ok) { console.error(`BSCScan failed after retries`); break; }

    const data = await res.json();
    if (data.status !== "1" || !Array.isArray(data.result) || data.result.length === 0) {
      console.log(`BSCScan page ${page}: ${data.message || 'no results'}`);
      break;
    }

    console.log(`BSCScan page ${page}: ${data.result.length} transfers`);
    for (const tx of data.result) {
      const tokenAddr = (tx.contractAddress || "").toLowerCase();
      if (!KNOWN_TOKENS[tokenAddr]) continue;
      allTransfers.push({
        transaction_hash: tx.hash,
        from_address: (tx.from || "").toLowerCase(),
        to_address: (tx.to || "").toLowerCase(),
        value: tx.value || "0",
        address: tokenAddr,
        block_timestamp: tx.timeStamp
          ? new Date(parseInt(tx.timeStamp) * 1000).toISOString()
          : new Date().toISOString(),
      });
    }

    if (data.result.length < 1000) break; // last page
    await delay(5500); // rate limit between pages
  }

  return allTransfers;
}

// ── Moralis ──

async function fetchTransfersViaMoralis(
  walletAddr: string, chain: string, moralisKey: string
): Promise<TokenTransfer[] | null> {
  const all: TokenTransfer[] = [];
  let cursor: string | null = null;
  let page = 0;
  do {
    const params = new URLSearchParams({ chain, limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const url = `${MORALIS_BASE}/${walletAddr}/erc20/transfers?${params}`;
    console.log(`Moralis page ${page}: ${url.slice(0, 80)}...`);
    const res = await moralisFetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      console.log(`Moralis error: ${res.status} ${res.statusText}`);
      if (res.status === 401 || res.status === 429) return null;
      break;
    }
    const data = await res.json();
    console.log(`Moralis page ${page}: ${(data.result || []).length} results`);
    all.push(...(data.result || []));
    cursor = data.cursor || null;
    page++;
  } while (cursor && page < 20);
  console.log(`Moralis total: ${all.length} transfers`);
  return all;
}

// ── BSC RPC fallback (eth_getLogs) ──

const BSC_RPC = "https://bsc-dataseed1.binance.org";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function fetchTransfersViaRpc(walletAddr: string): Promise<TokenTransfer[]> {
  const all: TokenTransfer[] = [];
  const paddedAddr = "0x000000000000000000000000" + walletAddr.slice(2);
  
  // Get latest block
  const latestRes = await fetch(BSC_RPC, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const latestData = await latestRes.json();
  const latestBlock = parseInt(latestData.result, 16);
  console.log(`BSC RPC: latest block ${latestBlock}`);

  // Scan known token contracts for transfers TO and FROM this address
  for (const [tokenAddr, tokenInfo] of Object.entries(KNOWN_TOKENS)) {
    for (const direction of ["in", "out"] as const) {
      const topics = [TRANSFER_TOPIC];
      if (direction === "in") {
        topics.push(null as any, paddedAddr);
      } else {
        topics.push(paddedAddr);
      }

      // Scan last ~2M blocks (~70 days on BSC)
      const fromBlock = Math.max(0, latestBlock - 2000000);
      const chunkSize = 500000;
      
      for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
        const end = Math.min(start + chunkSize - 1, latestBlock);
        try {
          const res = await fetch(BSC_RPC, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0", id: 1, method: "eth_getLogs",
              params: [{ fromBlock: "0x" + start.toString(16), toBlock: "0x" + end.toString(16), address: tokenAddr, topics }],
            }),
          });
          const data = await res.json();
          if (data.error) { console.log(`RPC error: ${data.error.message}`); continue; }
          const logs = data.result || [];
          
          for (const log of logs) {
            const from = "0x" + (log.topics[1] || "").slice(26).toLowerCase();
            const to = "0x" + (log.topics[2] || "").slice(26).toLowerCase();
            const value = BigInt(log.data || "0x0").toString();
            
            all.push({
              transaction_hash: log.transactionHash,
              from_address: from,
              to_address: to,
              value,
              address: tokenAddr,
              block_timestamp: new Date().toISOString(), // RPC doesn't give timestamp easily
            });
          }
          
          if (logs.length > 0) console.log(`RPC ${tokenInfo.symbol} ${direction}: ${logs.length} logs (blocks ${start}-${end})`);
        } catch (e) { console.error(`RPC fetch error:`, e); }
        await delay(200);
      }
    }
  }
  
  console.log(`BSC RPC total: ${all.length} transfers`);
  return all;
}

// ── Main ──

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const moralisKey = Deno.env.get("MORALIS_API_KEY");
    const supabase = createAdminClient();
    const body = await req.json();
    const { user_id, wallet_address, chain = "0x38", chain_id = 56 } = body;
    let userId = user_id;

    let walletAddresses: string[] = [];
    if (wallet_address) walletAddresses = [wallet_address.toLowerCase().trim()];

    if (!walletAddresses.length && !userId) {
      return new Response(JSON.stringify({ error: "user_id or wallet_address required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userId && !walletAddresses.length) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, public_wallet_address, wallet_address, external_wallet_address")
        .eq("id", userId).single();
      if (!profile) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const addrs = new Set<string>();
      for (const f of ["public_wallet_address", "wallet_address", "external_wallet_address"]) {
        const v = (profile as any)[f]?.toLowerCase().trim();
        if (v && v.startsWith("0x") && v.length === 42) addrs.add(v);
      }
      if (addrs.size === 0) {
        const ta = Deno.env.get("TREASURY_WALLET_ADDRESS")?.toLowerCase().trim();
        if (ta) addrs.add(ta);
      }
      walletAddresses = Array.from(addrs);
      if (!walletAddresses.length) {
        return new Response(JSON.stringify({ error: "User has no wallet address" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!userId && walletAddresses.length) {
      const { data: profiles } = await supabase
        .from("profiles").select("id, public_wallet_address, wallet_address, external_wallet_address");
      const wa = walletAddresses[0];
      const match = profiles?.find((p: any) =>
        [p.public_wallet_address, p.wallet_address, p.external_wallet_address]
          .some((a: string | null) => a?.toLowerCase().trim() === wa)
      );
      if (!match) {
        return new Response(JSON.stringify({ error: "No user found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = match.id;
    }

    console.log(`Backfill user ${userId}, wallets: [${walletAddresses.join(", ")}]`);

    const allTransfers: TokenTransfer[] = [];
    for (const wa of walletAddresses) {
      let transfers: TokenTransfer[] | null = null;
      if (moralisKey) {
        console.log(`Trying Moralis for ${wa.slice(0, 10)}...`);
        transfers = await fetchTransfersViaMoralis(wa, chain, moralisKey);
      }
      if (transfers === null || transfers.length === 0) {
        console.log(`Trying BSCScan for ${wa.slice(0, 10)}...`);
        const bscTransfers = await fetchTransfersViaBscScan(wa);
        if (bscTransfers.length > 0) {
          transfers = bscTransfers;
        }
      }
      if (transfers === null || transfers.length === 0) {
        console.log(`Trying BSC RPC fallback for ${wa.slice(0, 10)}...`);
        transfers = await fetchTransfersViaRpc(wa);
      }
      allTransfers.push(...(transfers || []));
    }

    console.log(`Total: ${allTransfers.length} transfers`);

    // Exclude existing
    const { data: donTxs } = await supabase.from("donations").select("tx_hash")
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
    const { data: swpTxs } = await supabase.from("swap_transactions").select("tx_hash").eq("user_id", userId);
    const { data: exTxs } = await supabase.from("wallet_transfers").select("tx_hash, direction, token_symbol").eq("user_id", userId);

    const donH = new Set((donTxs || []).map((d: any) => d.tx_hash?.toLowerCase()));
    const swpH = new Set((swpTxs || []).map((s: any) => s.tx_hash?.toLowerCase()));
    const exKeys = new Set((exTxs || []).map((t: any) => `${t.tx_hash?.toLowerCase()}_${t.direction}_${t.token_symbol}`));

    const walletSet = new Set(walletAddresses);
    const txGroups = new Map<string, TokenTransfer[]>();
    for (const t of allTransfers) {
      const h = (t.transaction_hash || "").toLowerCase();
      if (!h) continue;
      if (!txGroups.has(h)) txGroups.set(h, []);
      txGroups.get(h)!.push(t);
    }
    const swapOnChain = new Set<string>();
    for (const [h, txs] of txGroups) {
      let o = false, i = false;
      for (const t of txs) {
        if (!KNOWN_TOKENS[(t.address || "").toLowerCase()]) continue;
        if (walletSet.has((t.from_address || "").toLowerCase())) o = true;
        if (walletSet.has((t.to_address || "").toLowerCase())) i = true;
      }
      if (o && i) swapOnChain.add(h);
    }

    const newTransfers: any[] = [];
    for (const t of allTransfers) {
      const txH = (t.transaction_hash || "").toLowerCase();
      if (!txH || donH.has(txH) || swpH.has(txH) || swapOnChain.has(txH)) continue;
      const tAddr = (t.address || "").toLowerCase();
      const ti = KNOWN_TOKENS[tAddr];
      if (!ti) continue;
      const from = (t.from_address || "").toLowerCase();
      const to = (t.to_address || "").toLowerCase();
      let dir: string, cp: string;
      if (walletSet.has(from) && !walletSet.has(to)) { dir = "out"; cp = to; }
      else if (walletSet.has(to) && !walletSet.has(from)) { dir = "in"; cp = from; }
      else continue;
      const sym = ti.symbol === "WBNB" ? "BNB" : ti.symbol;
      if (exKeys.has(`${txH}_${dir}_${sym}`)) continue;
      newTransfers.push({
        tx_hash: txH, direction: dir, token_symbol: sym, token_address: tAddr,
        amount: Number(BigInt(t.value || "0")) / Math.pow(10, ti.decimals),
        counterparty_address: cp, created_at: t.block_timestamp || new Date().toISOString(),
      });
    }

    console.log(`${newTransfers.length} new transfers`);

    if (newTransfers.length === 0) {
      return new Response(JSON.stringify({
        success: true, message: "No new transfers", total_erc20: allTransfers.length, inserted: 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const toInsert = newTransfers.map((t: any) => ({
      user_id: userId, tx_hash: t.tx_hash, direction: t.direction,
      token_symbol: t.token_symbol, token_address: t.token_address,
      amount: t.amount, counterparty_address: t.counterparty_address,
      chain_id, status: "confirmed", created_at: t.created_at,
    }));

    let inserted = 0;
    const errors: string[] = [];
    for (let i = 0; i < toInsert.length; i += 50) {
      const batch = toInsert.slice(i, i + 50);
      const { error } = await supabase.from("wallet_transfers").insert(batch);
      if (error) errors.push(error.message); else inserted += batch.length;
    }

    console.log(`Done: ${inserted} inserted`);
    return new Response(JSON.stringify({
      success: true, user_id: userId, wallets: walletAddresses,
      total_erc20: allTransfers.length, transfers_found: newTransfers.length, inserted,
      errors: errors.length > 0 ? errors : undefined,
      transfers: newTransfers.map((t: any) => ({
        tx_hash: t.tx_hash, direction: t.direction,
        detail: `${t.amount} ${t.token_symbol} ${t.direction === 'in' ? '← ' : '→ '}${t.counterparty_address.slice(0, 10)}...`,
      })),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("backfill error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
