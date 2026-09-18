import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";

/**
 * scan-wallet-recover
 * ----------------------------------------------------------------------
 * Per-wallet recovery scanner — dùng BSCScan API (free, không cần Moralis
 * vì free-plan-daily quota bị hết). Quét tokentx N ngày cho từng ví,
 * upsert idempotent vào `donations`.
 *
 * - KHÔNG tạo `gift_celebration` post (giữ external-wallet-no-gift-policy
 *   và để cron `backfill-donations-to-transactions` lo phần `transactions`).
 * - KHÔNG cộng Light Score.
 * - Idempotent theo (lower(tx_hash), recipient_id).
 *
 * Body:
 *   { wallets?: string[], all_users?: boolean, days?: number, batch_size?: number }
 */

const BSCSCAN_API = "https://api.bscscan.com/api";

const KNOWN_TOKENS: Record<string, { symbol: string; decimals: number; chainId: number }> = {
  "0x0910320181889fefde0bb1ca63962b0a8882e413": { symbol: "CAMLY", decimals: 3, chainId: 56 },
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT",  decimals: 18, chainId: 56 },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { symbol: "BTCB",  decimals: 18, chainId: 56 },
};

const MIN_AMOUNTS: Record<string, number> = {
  USDT: 0.01,
  BTCB: 0.000001,
  CAMLY: 1,
};

interface BscTokenTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  timeStamp: string;
}

function parseAmount(value: string, decimals: number): string {
  const raw = BigInt(value || "0");
  const divisor = BigInt(10) ** BigInt(decimals);
  const intPart = raw / divisor;
  const fracPart = raw % divisor;
  const fracStr = fracPart.toString().padStart(decimals, "0").replace(/0+$/, "");
  return fracStr ? `${intPart}.${fracStr}` : `${intPart}`;
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

/**
 * BSCScan tokentx: trả tất cả token transfers in/out của ví, sort DESC.
 * Free tier ~5 req/s; an toàn để 1 req/giây giữa các ví.
 */
async function fetchTokenTxBscScan(wallet: string, cutoffSec: number, apiKey: string | null): Promise<BscTokenTx[]> {
  const out: BscTokenTx[] = [];
  const MAX_PAGES = 5; // 5 × 1000 = 5.000 tx (đủ cho 60-90 ngày user thường)
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${BSCSCAN_API}?module=account&action=tokentx&address=${wallet}` +
      `&startblock=0&endblock=999999999&sort=desc&offset=1000&page=${page}` +
      (apiKey ? `&apikey=${apiKey}` : "");

    let data: { status?: string; message?: string; result?: BscTokenTx[] } | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 429) { await delay(5500); continue; }
          break;
        }
        data = await res.json();
        if (data && (data.status === "0") && (data.message || "").includes("rate limit")) {
          await delay(5500); continue;
        }
        break;
      } catch (_e) {
        await delay(2000);
      }
    }
    if (!data || data.status !== "1" || !Array.isArray(data.result) || data.result.length === 0) {
      break;
    }
    let crossedCutoff = false;
    for (const tx of data.result) {
      const tsSec = parseInt(tx.timeStamp || "0", 10);
      if (tsSec < cutoffSec) { crossedCutoff = true; continue; }
      out.push(tx);
    }
    if (data.result.length < 1000 || crossedCutoff) break;
    // BSCScan no-key = 1 req/5s. With key ~5 req/s, vẫn để 1.2s cho an toàn.
    await delay(apiKey ? 1200 : 5500);
  }
  return out;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const apiKey = Deno.env.get("BSCSCAN_API_KEY") || null;

    const body = await req.json().catch(() => ({})) as {
      wallets?: string[]; all_users?: boolean; days?: number; batch_size?: number;
    };
    const days = Math.min(Math.max(body.days ?? 30, 1), 180);
    const batchSize = Math.min(Math.max(body.batch_size ?? 200, 1), 1000);
    const cutoffSec = Math.floor((Date.now() - days * 86400_000) / 1000);

    const admin = createAdminClient();

    // Resolve wallets
    let walletsToScan: string[] = [];
    if (Array.isArray(body.wallets) && body.wallets.length > 0) {
      walletsToScan = body.wallets.map(w => (w || "").toLowerCase()).filter(w => /^0x[0-9a-f]{40}$/.test(w));
    } else if (body.all_users) {
      const { data: rows } = await admin
        .from("profiles")
        .select("public_wallet_address, wallet_address, external_wallet_address")
        .limit(batchSize);
      const set = new Set<string>();
      for (const r of rows || []) {
        for (const a of [r.public_wallet_address, r.wallet_address, r.external_wallet_address]) {
          const s = (a as string | null | undefined)?.toLowerCase();
          if (s && /^0x[0-9a-f]{40}$/.test(s)) set.add(s);
        }
      }
      walletsToScan = [...set];
    } else {
      return new Response(JSON.stringify({ error: "Provide 'wallets':[] or 'all_users':true" }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (walletsToScan.length === 0) {
      return new Response(JSON.stringify({ scanned: 0, inserted: 0, message: "No wallets" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Profile lookup
    const { data: allProfiles } = await admin
      .from("profiles")
      .select("id, username, display_name, public_wallet_address, wallet_address, external_wallet_address, created_at");
    const walletToProfile = new Map<string, { id: string; username: string; display_name: string | null; created_at: string }>();
    for (const p of allProfiles || []) {
      const data = { id: p.id, username: p.username, display_name: p.display_name, created_at: p.created_at };
      for (const a of [p.public_wallet_address, p.wallet_address, p.external_wallet_address]) {
        const s = (a as string | null | undefined)?.toLowerCase();
        if (s && !walletToProfile.has(s)) walletToProfile.set(s, data);
      }
    }

    // Fetch tokentx for each wallet (sequential — BSCScan free rate-limited)
    const rawTransfers: BscTokenTx[] = [];
    const errors: { wallet: string; error: string }[] = [];
    for (const w of walletsToScan) {
      try {
        const items = await fetchTokenTxBscScan(w, cutoffSec, apiKey);
        console.log(`BSCScan ${w}: ${items.length} tokentx (cutoff ${days}d)`);
        rawTransfers.push(...items);
      } catch (e) {
        errors.push({ wallet: w, error: (e as Error).message });
      }
    }

    // Dedup by (tx_hash, from, to, value, contract)
    const seen = new Set<string>();
    const unique: BscTokenTx[] = [];
    for (const t of rawTransfers) {
      const k = `${t.hash}|${t.contractAddress}|${t.from}|${t.to}|${t.value}`;
      if (seen.has(k)) continue;
      seen.add(k);
      unique.push(t);
    }

    // Filter known tokens
    const candidates: { t: BscTokenTx; symbol: string; decimals: number; chainId: number; contract: string }[] = [];
    let skippedUnknownToken = 0;
    for (const t of unique) {
      const contract = (t.contractAddress || "").toLowerCase();
      const tok = KNOWN_TOKENS[contract];
      if (!tok) { skippedUnknownToken++; continue; }
      candidates.push({ t, symbol: tok.symbol, decimals: tok.decimals, chainId: tok.chainId, contract });
    }

    // Idempotency check
    const txHashes = [...new Set(candidates.map(c => c.t.hash.toLowerCase()))];
    const { data: existing } = txHashes.length > 0
      ? await admin.from("donations").select("tx_hash, recipient_id").in("tx_hash", txHashes)
      : { data: [] as { tx_hash: string; recipient_id: string }[] };
    const existingSet = new Set((existing || []).map(e => `${e.tx_hash.toLowerCase()}|${e.recipient_id}`));

    const toInsert: Record<string, unknown>[] = [];
    let skippedNoRecipient = 0, skippedMinAmount = 0, skippedDup = 0, skippedBeforeReg = 0;

    for (const { t, symbol, decimals, chainId, contract } of candidates) {
      const senderAddr = t.from.toLowerCase();
      const recipientAddr = t.to.toLowerCase();
      const recipientProfile = walletToProfile.get(recipientAddr);
      if (!recipientProfile) { skippedNoRecipient++; continue; }
      const senderProfile = walletToProfile.get(senderAddr);

      const amount = parseAmount(t.value, decimals);
      const numAmount = parseFloat(amount);
      const minAmt = MIN_AMOUNTS[symbol] ?? 0.01;
      if (numAmount <= 0 || numAmount < minAmt) { skippedMinAmount++; continue; }

      const dedupKey = `${t.hash.toLowerCase()}|${recipientProfile.id}`;
      if (existingSet.has(dedupKey)) { skippedDup++; continue; }
      existingSet.add(dedupKey);

      const tsMs = parseInt(t.timeStamp, 10) * 1000;
      const blockIso = new Date(tsMs).toISOString();
      const regTime = new Date(recipientProfile.created_at).getTime();
      if (tsMs < regTime) { skippedBeforeReg++; continue; }

      toInsert.push({
        sender_id: senderProfile?.id ?? null,
        sender_address: senderAddr,
        recipient_id: recipientProfile.id,
        amount,
        token_symbol: symbol,
        token_address: contract,
        chain_id: chainId,
        tx_hash: t.hash,
        status: "confirmed",
        confirmed_at: blockIso,
        created_at: blockIso,
        is_external: !senderProfile,
        card_theme: "celebration",
        card_sound: "rich-1",
        message: null,
        light_score_earned: 0,
        metadata: {
          sender_name: senderProfile?.display_name || senderProfile?.username || "Ví ngoài",
          auto_scanned: true,
          scanner: "scan-wallet-recover",
        },
      });
    }

    let inserted = 0;
    const insertErrors: string[] = [];
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error, count } = await admin.from("donations").insert(batch, { count: "exact" });
      if (error) {
        insertErrors.push(error.message);
        for (const row of batch) {
          const { error: e2 } = await admin.from("donations").insert(row);
          if (!e2) inserted++;
        }
      } else {
        inserted += count ?? batch.length;
      }
    }

    const summary = {
      scanned_wallets: walletsToScan.length,
      days,
      raw_tokentx: rawTransfers.length,
      unique_tokentx: unique.length,
      known_token_candidates: candidates.length,
      inserted,
      skipped: {
        unknown_token: skippedUnknownToken,
        no_recipient: skippedNoRecipient,
        below_min_amount: skippedMinAmount,
        duplicate: skippedDup,
        before_registration: skippedBeforeReg,
      },
      errors: errors.slice(0, 20),
      insert_errors: insertErrors.slice(0, 5),
    };
    console.log("scan-wallet-recover result:", JSON.stringify(summary));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal server error";
    console.error("scan-wallet-recover error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
