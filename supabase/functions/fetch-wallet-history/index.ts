// READ-ONLY edge function.
// Quét lịch sử giao dịch on-chain từ nhiều địa chỉ ví ngoài (BSC + BTC).
// TUYỆT ĐỐI KHÔNG ghi vào donations / light_actions / posts / gift_celebration.
// Phase 1 hardening (2026-06-22): mọi token PHẢI khớp tokens_registry mới được trả về UI.
// Token unknown/blocked/spoof được ghi vào suspicious_wallet_events, KHÔNG show ở main history.
// Tham chiếu: mem://policy/external-wallet-no-gift-policy
//             mem://infrastructure/transaction-history-backfill-policy
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { moralisFetch } from "../_shared/moralisFetch.ts";
import { getExternalTxFilter } from "../_shared/externalTxFilter.ts";

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";
const MEMPOOL_BASE = "https://mempool.space/api";
const BLOCKSTREAM_BASE = "https://blockstream.info/api";

// ===== Registry guard (Phase 1) =====
interface RegistryEntry {
  chain_id: number;
  token_address: string | null; // lowercase or null for native
  symbol: string;
  name: string;
  decimals: number;
  risk_level: "trusted" | "allowed" | "suspicious" | "blocked";
  is_active: boolean;
}

interface SuspiciousRow {
  chain_id: number;
  network: string;
  watched_address: string;
  tx_hash: string;
  log_index: number | null;
  from_address: string | null;
  to_address: string | null;
  raw_token_address: string | null;
  raw_symbol: string | null;
  raw_decimals: number | null;
  raw_amount_wei: string | null;
  reason: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const sb = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

let registryCache: { at: number; rows: RegistryEntry[] } | null = null;
async function loadRegistry(): Promise<RegistryEntry[]> {
  const now = Date.now();
  if (registryCache && now - registryCache.at < 60_000) return registryCache.rows;
  if (!sb) return [];
  const { data, error } = await sb
    .from("tokens_registry")
    .select("chain_id,token_address,symbol,name,decimals,risk_level,is_active")
    .eq("is_active", true);
  if (error) {
    console.error("registry load error:", error.message);
    return registryCache?.rows || [];
  }
  const rows = (data || []) as RegistryEntry[];
  registryCache = { at: now, rows };
  return rows;
}

function lookupToken(
  registry: RegistryEntry[],
  chainId: number,
  tokenAddress: string | null,
): RegistryEntry | undefined {
  if (tokenAddress === null) {
    return registry.find((r) => r.chain_id === chainId && r.token_address === null);
  }
  const addr = tokenAddress.toLowerCase();
  return registry.find(
    (r) => r.chain_id === chainId && r.token_address && r.token_address.toLowerCase() === addr,
  );
}

async function flushSuspicious(rows: SuspiciousRow[]) {
  if (!sb || rows.length === 0) return;
  // Upsert theo unique index (chain_id, tx_hash, lower(watched_address), coalesce(lower(raw_token_address),'native'), coalesce(log_index,-1))
  // PostgREST không upsert được vì index có expression → dùng INSERT ... ON CONFLICT DO NOTHING qua RPC không có sẵn.
  // Đành insert từng cái và bỏ qua lỗi duplicate. Volume thấp (chỉ token lạ).
  for (const r of rows) {
    const { error } = await sb.from("suspicious_wallet_events").insert(r);
    if (error && !/duplicate key|unique/i.test(error.message)) {
      console.warn("suspicious insert warn:", error.message);
    }
  }
}

// PancakeSwap router whitelist (lowercase) — chỉ để đánh dấu category=swap
const SWAP_ROUTERS = new Set<string>([
  "0x10ed43c718714eb63d5aa57b78b54704e256024e", // PancakeSwap V2 Router
  "0x13f4ea83d0bd40e75c8222255bc855a974568dd4", // PancakeSwap V3 SmartRouter
  "0x1b81d678ffb9c0263b24a97847620c99d213eb14", // PancakeSwap V3 SwapRouter
]);

type ChainKey = "bsc" | "bsc_testnet" | "btc";

interface NormalizedTx {
  chain: ChainKey;
  category: "native" | "token" | "swap" | "nft";
  hash: string;
  timestamp: string; // ISO
  from: string;
  to: string;
  amount: string; // human string
  tokenSymbol: string;
  tokenDecimal?: string;
  tokenName?: string;
  status: "success" | "pending" | "failed";
  watchedAddress: string;
  watchedLabel?: string;
  // legacy fields preserved for backward compatibility với useWalletHistory cũ
  value?: string;
  gasUsed?: string;
  gasPrice?: string;
  isError?: string;
  txreceipt_status?: string;
  functionName?: string;
  _network?: "mainnet" | "testnet" | "bitcoin";
  _chainId?: number;
  _isIsoTimestamp?: boolean;
  timeStamp?: string;
}

interface SourceError {
  source: string;
  address: string;
  message: string;
}

function lc(s: string) {
  return (s || "").toLowerCase();
}

function categoryFor(to: string, isToken: boolean, isNft: boolean): NormalizedTx["category"] {
  if (isNft) return "nft";
  if (SWAP_ROUTERS.has(lc(to))) return "swap";
  if (isToken) return "token";
  return "native";
}

function fromWei(raw: string, decimals: number): string {
  try {
    const big = BigInt(raw || "0");
    if (decimals === 0) return big.toString();
    const s = big.toString().padStart(decimals + 1, "0");
    const head = s.slice(0, s.length - decimals);
    const tail = s.slice(s.length - decimals).replace(/0+$/, "");
    return tail ? `${head}.${tail}` : head;
  } catch {
    return "0";
  }
}

async function moralisFetchPage(
  _apiKey: string,
  url: string,
  errors: SourceError[],
  source: string,
  address: string,
): Promise<any[]> {
  try {
    const res = await moralisFetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text();
      errors.push({ source, address, message: `HTTP ${res.status}: ${txt.slice(0, 160)}` });
      return [];
    }
    const data = await res.json();
    return data.result || [];
  } catch (e: any) {
    errors.push({ source, address, message: e?.message || String(e) });
    return [];
  }
}

async function scanEvmAddress(
  apiKey: string,
  address: string,
  chainHex: string,
  chainKey: ChainKey,
  chainId: number,
  limit: number,
  errors: SourceError[],
  registry: RegistryEntry[],
  suspicious: SuspiciousRow[],
  watchedLabel?: string,
  includeNft = false,
): Promise<NormalizedTx[]> {
  const base = `${MORALIS_BASE}/${address}`;
  const params = `chain=${chainHex}&limit=${limit}`;

  // NFT transfers chỉ gọi khi client chủ động yêu cầu (tab NFT) — tiết kiệm quota
  // Moralis: mỗi lần auto-refresh trước đây gọi thêm 1 call/ví/chain cho NFT.
  const [native, tokens, nfts] = await Promise.all([
    moralisFetchPage(apiKey, `${base}?${params}`, errors, `moralis:${chainKey}:native`, address),
    moralisFetchPage(apiKey, `${base}/erc20/transfers?${params}`, errors, `moralis:${chainKey}:token`, address),
    includeNft
      ? moralisFetchPage(apiKey, `${base}/nft/transfers?${params}`, errors, `moralis:${chainKey}:nft`, address)
      : Promise.resolve([] as any[]),
  ]);



  const out: NormalizedTx[] = [];
  const addrLc = lc(address);
  const networkLabel = chainId === 56 ? "mainnet" : "testnet";
  const networkSlug = chainId === 56 ? "bsc" : "bsc-testnet";

  // Native: bắt buộc khớp registry (chain_id, token_address=NULL)
  const nativeEntry = lookupToken(registry, chainId, null);
  for (const tx of native) {
    if (!nativeEntry || !["trusted", "allowed"].includes(nativeEntry.risk_level)) {
      suspicious.push({
        chain_id: chainId,
        network: networkSlug,
        watched_address: addrLc,
        tx_hash: tx.hash || "",
        log_index: null,
        from_address: tx.from_address || null,
        to_address: tx.to_address || null,
        raw_token_address: null,
        raw_symbol: chainId === 56 ? "BNB" : "tBNB",
        raw_decimals: 18,
        raw_amount_wei: tx.value || "0",
        reason: nativeEntry ? `blocked:${nativeEntry.risk_level}` : "native_not_in_registry",
      });
      continue;
    }
    const to = tx.to_address || "";
    const status: NormalizedTx["status"] = tx.receipt_status === "0" ? "failed" : "success";
    out.push({
      chain: chainKey,
      category: categoryFor(to, false, false),
      hash: tx.hash || "",
      timestamp: tx.block_timestamp || "",
      from: tx.from_address || "",
      to,
      amount: fromWei(tx.value || "0", nativeEntry.decimals),
      tokenSymbol: nativeEntry.symbol,
      tokenDecimal: String(nativeEntry.decimals),
      tokenName: nativeEntry.name,
      status,
      watchedAddress: addrLc,
      watchedLabel,
      value: tx.value || "0",
      gasUsed: tx.receipt_gas_used || "0",
      gasPrice: tx.gas_price || "0",
      isError: tx.receipt_status === "0" ? "1" : "0",
      txreceipt_status: tx.receipt_status || "1",
      functionName: tx.method_label || "",
      _network: networkLabel,
      _chainId: chainId,
      _isIsoTimestamp: true,
      timeStamp: tx.block_timestamp || "",
    });
  }

  // Token transfers: phải khớp (chain_id, lower(token_address))
  for (const tx of tokens) {
    const rawAddr: string | null = tx.address || tx.token_address || tx.contract_address || null;
    const logIdx = typeof tx.log_index === "number" ? tx.log_index : null;
    const entry = rawAddr ? lookupToken(registry, chainId, rawAddr) : undefined;
    const rawSym = tx.token_symbol || null;
    const rawDec = tx.token_decimals != null ? Number(tx.token_decimals) : null;

    if (!entry) {
      suspicious.push({
        chain_id: chainId,
        network: networkSlug,
        watched_address: addrLc,
        tx_hash: tx.transaction_hash || tx.hash || "",
        log_index: logIdx,
        from_address: tx.from_address || null,
        to_address: tx.to_address || null,
        raw_token_address: rawAddr ? rawAddr.toLowerCase() : null,
        raw_symbol: rawSym,
        raw_decimals: rawDec,
        raw_amount_wei: tx.value || "0",
        reason: "unknown_contract",
      });
      continue;
    }
    if (entry.risk_level === "blocked" || entry.risk_level === "suspicious" || !entry.is_active) {
      suspicious.push({
        chain_id: chainId,
        network: networkSlug,
        watched_address: addrLc,
        tx_hash: tx.transaction_hash || tx.hash || "",
        log_index: logIdx,
        from_address: tx.from_address || null,
        to_address: tx.to_address || null,
        raw_token_address: rawAddr ? rawAddr.toLowerCase() : null,
        raw_symbol: rawSym,
        raw_decimals: rawDec,
        raw_amount_wei: tx.value || "0",
        reason: `blocked:${entry.risk_level}`,
      });
      continue;
    }

    // Log mismatch (chỉ ghi nhận, vẫn hiển thị nhưng dùng metadata registry)
    if (rawSym && rawSym !== entry.symbol) {
      suspicious.push({
        chain_id: chainId,
        network: networkSlug,
        watched_address: addrLc,
        tx_hash: tx.transaction_hash || tx.hash || "",
        log_index: logIdx,
        from_address: tx.from_address || null,
        to_address: tx.to_address || null,
        raw_token_address: rawAddr ? rawAddr.toLowerCase() : null,
        raw_symbol: rawSym,
        raw_decimals: rawDec,
        raw_amount_wei: tx.value || "0",
        reason: "symbol_collision",
      });
    } else if (rawDec != null && rawDec !== entry.decimals) {
      suspicious.push({
        chain_id: chainId,
        network: networkSlug,
        watched_address: addrLc,
        tx_hash: tx.transaction_hash || tx.hash || "",
        log_index: logIdx,
        from_address: tx.from_address || null,
        to_address: tx.to_address || null,
        raw_token_address: rawAddr ? rawAddr.toLowerCase() : null,
        raw_symbol: rawSym,
        raw_decimals: rawDec,
        raw_amount_wei: tx.value || "0",
        reason: "decimals_mismatch",
      });
    }

    const to = tx.to_address || "";
    out.push({
      chain: chainKey,
      category: categoryFor(to, true, false),
      hash: tx.transaction_hash || "",
      timestamp: tx.block_timestamp || "",
      from: tx.from_address || "",
      to,
      amount: fromWei(tx.value || "0", entry.decimals),
      tokenSymbol: entry.symbol,
      tokenDecimal: String(entry.decimals),
      tokenName: entry.name,
      status: "success",
      watchedAddress: addrLc,
      watchedLabel,
      value: tx.value || "0",
      _network: networkLabel,
      _chainId: chainId,
      _isIsoTimestamp: true,
      timeStamp: tx.block_timestamp || "",
    });
  }

  // NFT transfers: không nằm trong scope fungible registry. Vẫn hiển thị với category=nft.
  for (const tx of nfts) {
    out.push({
      chain: chainKey,
      category: "nft",
      hash: tx.transaction_hash || "",
      timestamp: tx.block_timestamp || "",
      from: tx.from_address || "",
      to: tx.to_address || "",
      amount: String(tx.amount || "1"),
      tokenSymbol: tx.token_name || tx.contract_type || "NFT",
      tokenName: tx.token_name || undefined,
      status: "success",
      watchedAddress: addrLc,
      watchedLabel,
      _network: networkLabel,
      _chainId: chainId,
      _isIsoTimestamp: true,
      timeStamp: tx.block_timestamp || "",
    });
  }

  return out;
}

async function scanBtcAddress(
  address: string,
  limit: number,
  errors: SourceError[],
  registry: RegistryEntry[],
  suspicious: SuspiciousRow[],
  watchedLabel?: string,
): Promise<NormalizedTx[]> {
  const btcEntry = lookupToken(registry, 0, null);
  // Nếu registry chưa seed BTC → fail-safe coi như không hợp lệ
  if (!btcEntry || !["trusted", "allowed"].includes(btcEntry.risk_level)) {
    suspicious.push({
      chain_id: 0,
      network: "bitcoin",
      watched_address: address,
      tx_hash: "registry-missing",
      log_index: null,
      from_address: null,
      to_address: null,
      raw_token_address: null,
      raw_symbol: "BTC",
      raw_decimals: 8,
      raw_amount_wei: null,
      reason: "native_not_in_registry",
    });
    return [];
  }

  let raw: any[] | null = null;
  try {
    const r = await fetch(`${MEMPOOL_BASE}/address/${address}/txs`);
    if (r.ok) raw = await r.json();
    else throw new Error(`mempool ${r.status}`);
  } catch (e1) {
    try {
      const r2 = await fetch(`${BLOCKSTREAM_BASE}/address/${address}/txs`);
      if (r2.ok) raw = await r2.json();
      else throw new Error(`blockstream ${r2.status}`);
    } catch (e2: any) {
      errors.push({
        source: "btc",
        address,
        message: `Mempool fail (${(e1 as any)?.message}); Blockstream fail (${e2?.message})`,
      });
      return [];
    }
  }

  const out: NormalizedTx[] = [];
  const addrLc = address; // BTC giữ nguyên case
  for (const tx of (raw || []).slice(0, limit)) {
    const status = tx.status?.confirmed ? "success" : "pending";
    const ts = tx.status?.block_time
      ? new Date(tx.status.block_time * 1000).toISOString()
      : new Date().toISOString();

    let inputSum = 0;
    let outputSum = 0;
    let fromAddr = "";
    let toAddr = "";
    let isSend = false;

    for (const vin of tx.vin || []) {
      const a = vin.prevout?.scriptpubkey_address;
      const v = Number(vin.prevout?.value || 0);
      if (a === address) {
        inputSum += v;
        isSend = true;
      }
      if (!fromAddr && a) fromAddr = a;
    }
    for (const vout of tx.vout || []) {
      const a = vout.scriptpubkey_address;
      const v = Number(vout.value || 0);
      if (a === address) outputSum += v;
      if (a && a !== address && !toAddr) toAddr = a;
    }

    const net = isSend ? inputSum - outputSum : outputSum;
    if (net === 0) continue;
    const btc = (net / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");

    out.push({
      chain: "btc",
      category: "native",
      hash: tx.txid,
      timestamp: ts,
      from: isSend ? address : fromAddr,
      to: isSend ? toAddr : address,
      amount: btc || "0",
      tokenSymbol: btcEntry.symbol,
      tokenDecimal: String(btcEntry.decimals),
      tokenName: btcEntry.name,
      status,
      watchedAddress: addrLc,
      watchedLabel,
      _network: "bitcoin",
      _chainId: 0,
      _isIsoTimestamp: true,
      timeStamp: ts,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const body = await req.json().catch(() => ({}));
    // Backward compatible: single `address` HOẶC mới `addresses`/`wallets`
    const singleAddress: string | undefined = body.address;
    const addressesInput: string[] = Array.isArray(body.addresses) ? body.addresses : [];
    const wallets: Array<{ address: string; chain: ChainKey; label?: string }> = Array.isArray(body.wallets)
      ? body.wallets
      : [];
    const action: "txlist" | "tokentx" | "all" = body.action || "all";
    const limit = Math.min(Math.max(Number(body.limit || body.offset || 25), 1), 100);
    // Mặc định CHỈ mainnet (tiết kiệm quota Moralis). Client muốn xem testnet phải
    // gửi tường minh network:'testnet' | 'both' (vd dev/QA), không nằm trong auto-refresh.
    const networkArg: "mainnet" | "testnet" | "both" = body.network || "mainnet";
    // NFT chỉ quét khi client chủ động bật (tab NFT).
    const includeNft: boolean = body.includeNft === true;


    const targets: Array<{ address: string; chain: ChainKey; label?: string }> = [...wallets];
    const pushEvm = (a: string, label?: string) => {
      if (!a) return;
      targets.push({ address: lc(a), chain: "bsc", label });
    };
    if (singleAddress) pushEvm(singleAddress);
    for (const a of addressesInput) pushEvm(a);

    if (targets.length === 0) {
      return new Response(JSON.stringify({ error: "address(es) required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("MORALIS_API_KEY") || "";
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "MORALIS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errors: SourceError[] = [];
    const all: NormalizedTx[] = [];
    const suspicious: SuspiciousRow[] = [];
    const registry = await loadRegistry();

    await Promise.all(
      targets.map(async (t) => {
        if (t.chain === "btc") {
          const r = await scanBtcAddress(t.address, limit, errors, registry, suspicious, t.label);
          all.push(...r);
          return;
        }
        // EVM
        if (networkArg !== "testnet") {
          const r = await scanEvmAddress(apiKey, t.address, "0x38", "bsc", 56, limit, errors, registry, suspicious, t.label, includeNft);
          all.push(...r);
        }
        if (networkArg === "testnet" || networkArg === "both") {
          const r = await scanEvmAddress(apiKey, t.address, "0x61", "bsc_testnet", 97, limit, errors, registry, suspicious, t.label, includeNft);
          all.push(...r);
        }

      }),
    );

    // Filter by action nếu request cũ (txlist/tokentx)
    let filtered = all;
    if (action === "txlist") filtered = all.filter((t) => t.category === "native" || t.category === "swap");
    else if (action === "tokentx") filtered = all.filter((t) => t.category === "token");

    // Anti-dust/spam: apply token_ingest_filters + blacklist (chỉ áp cho mainnet BSC/BTC).
    // NFT & testnet giữ nguyên (không cấu hình). Log ngầm vào external_tx_filter_log.
    let dustBlocked = 0;
    try {
      const extFilter = await getExternalTxFilter(sb ?? undefined);
      const kept: NormalizedTx[] = [];
      for (const tx of filtered) {
        if (tx.chain === "bsc_testnet" || tx.category === "nft") {
          kept.push(tx);
          continue;
        }
        const chainKey = tx.chain === "btc" ? "btc" : "bsc";
        const verdict = extFilter.check({
          tokenSymbol: tx.tokenSymbol,
          amount: tx.amount,
          senderAddress: tx.from,
          chain: chainKey,
        });
        if (verdict.ok) {
          kept.push(tx);
        } else {
          dustBlocked++;
          extFilter.log({
            tx_hash: tx.hash,
            reason: verdict.reason || "unknown",
            token_symbol: tx.tokenSymbol,
            amount: tx.amount,
            sender_address: tx.from,
            recipient_address: tx.to,
            chain: chainKey,
            source: "fetch-wallet-history",
          });
        }
      }
      filtered = kept;
    } catch (e) {
      console.warn("external filter error:", (e as any)?.message || e);
    }

    // Dedupe (hash + watchedAddress + tokenSymbol + amount) — tránh trùng do nhiều chain query
    const seen = new Set<string>();
    const dedup: NormalizedTx[] = [];
    for (const tx of filtered) {
      const key = `${tx.chain}:${tx.hash}:${tx.watchedAddress}:${tx.tokenSymbol}:${tx.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dedup.push(tx);
    }

    dedup.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const sliced = dedup.slice(0, limit * Math.max(targets.length, 1));

    // Ghi suspicious + scan metrics vào DB ở background — không chặn response
    const chains = Array.from(new Set(targets.map((t) => t.chain)));
    const metricsRow = {
      scanned_addresses: targets.length,
      verified_count: sliced.length,
      suspicious_count: suspicious.length,
      registry_size: registry.length,
      chains,
    };
    const bgWork = async () => {
      try {
        if (suspicious.length > 0) await flushSuspicious(suspicious);
        if (sb) {
          const { error } = await sb.from("wallet_scan_metrics").insert(metricsRow);
          if (error) console.warn("metrics insert warn:", error.message);
        }
      } catch (e) {
        console.warn("bg work err", (e as any)?.message || e);
      }
    };
    // @ts-ignore EdgeRuntime
    (globalThis as any).EdgeRuntime?.waitUntil
      ? (globalThis as any).EdgeRuntime.waitUntil(bgWork())
      : bgWork();

    return new Response(
      JSON.stringify({
        result: sliced,
        total: sliced.length,
        errors,
        suspicious_count: suspicious.length,
        verified_count: sliced.length,
        registry_size: registry.length,
        lastSyncAt: new Date().toISOString(),
        scanned: targets.length,
        dust_blocked: dustBlocked,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=15",
        },
      },
    );
  } catch (err: any) {
    console.error("fetch-wallet-history error:", err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
