// Wallet Reconciliation Cron — quét Father + toàn bộ user, backfill BTC/USDT/BNB thiếu
// Chạy mỗi 30' qua pg_cron; admin có thể gọi tay với JWT.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { moralisFetch } from "../_shared/moralisFetch.ts";
import { getExternalTxFilter } from "../_shared/externalTxFilter.ts";
import { satsToBtc } from "../_shared/btcAmount.ts";
import { dispatchBtcResolverShadowLog } from "../_shared/btcResolverShadowLog.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FATHER_ID = "4466cccf-6287-4a19-9b19-c2bd4d763f47";
const USDT_BSC = "0x55d398326f99059ff775485246999027b3197955";
const BSC_CHAIN_ID = 56;
const BTC_CHAIN_ID = 0; // sentinel
const MAX_WALLETS_PER_CHAIN = 15;
const BATCH_FLUSH_EVERY = 3;
const OLD_TX_CUTOFF_DAYS = 30; // bỏ qua tx cũ hơn 30 ngày để tránh backfill quá xa

interface Finding {
  chain: string;
  tx_hash?: string | null;
  address?: string | null;
  user_id?: string | null;
  action: "backfilled" | "skipped_internal_dup" | "skipped_external" | "skipped_old" | "error";
  payload: Record<string, unknown>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Chuẩn hoá địa chỉ BTC ĐÚNG RULE (mirror public.btc_normalize_address):
 * bech32 (bc1...) case-insensitive → lowercase; legacy Base58 (1.../3...) case-SENSITIVE
 * → chỉ trim, TUYỆT ĐỐI không lowercase (lowercase làm mất checksum ⇒ mempool.space trả 400
 * ⇒ bỏ sót quét, và nếu ghi vào DB thì hỏng dữ liệu vĩnh viễn).
 */
const btcNorm = (a: string | null | undefined): string => {
  const t = String(a ?? "").trim();
  return /^bc1[a-z0-9]+$/i.test(t) ? t.toLowerCase() : t;
};


// Chuyển raw wei (string nguyên không dấu) → chuỗi decimal theo số decimals của token.
// Dùng string ops để tránh sai số floating point khi giá trị lớn.
function weiToDecimal(weiStr: string, decimals: number): string {
  const s = String(weiStr ?? "0").trim().replace(/^-/, "");
  if (!s || s === "0") return "0";
  if (decimals <= 0) return s.replace(/^0+(?=\d)/, "");
  const pad = s.padStart(decimals + 1, "0");
  const intPart = pad.slice(0, -decimals).replace(/^0+(?=\d)/, "") || "0";
  const fracPart = pad.slice(-decimals).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

const USDT_BSC_DECIMALS = 18;
const BNB_DECIMALS = 18;

async function fetchJson(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(500 * (i + 1));
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const txFilter = await getExternalTxFilter(supabase);

  // Helper: insert nếu chưa có (idempotent qua check truớc, không dùng ON CONFLICT vì
  // PostgREST không nhận diện partial unique index).
  const insertTxIfMissing = async (row: any) => {
    const { data: exist } = await supabase.from("transactions")
      .select("id")
      .eq("tx_hash", row.tx_hash)
      .eq("user_id", row.user_id)
      .eq("from_address", row.from_address)
      .eq("to_address", row.to_address)
      .maybeSingle();
    if (exist) return { skipped: true, error: null };
    const { error } = await supabase.from("transactions").insert(row);
    if (error && error.code === "23505") return { skipped: true, error: null }; // race → unique index chặn
    return { skipped: false, error };
  };


  // Auth: phân biệt cron vs admin
  let triggeredBy: string | null = null;
  let trigger: "cron" | "manual" = "cron";
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
      const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (isAdmin) {
        triggeredBy = user.id;
        trigger = "manual";
      }
    }
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* cron có thể không gửi body */ }
  // ────────────────────────────────────────────────────────────────
  // BTC_FEATURE_FROZEN (03/09/2026): DỪNG nhánh BTC của cron đối soát.
  // Nhánh USDT (bep20_usdt) và BNB giữ nguyên hoạt động bình thường.
  // Lịch sử BTC cũ KHÔNG bị ẩn/xoá — chỉ ngừng quét/backfill BTC mới.
  // ────────────────────────────────────────────────────────────────
  const BTC_RECONCILE_DISABLED = true;
  const requestedChains: string[] = Array.isArray(body.chains) ? body.chains : ["btc", "bep20_usdt", "bnb"];
  const chains: string[] = BTC_RECONCILE_DISABLED
    ? requestedChains.filter((c) => c !== "btc")
    : requestedChains;
  if (BTC_RECONCILE_DISABLED && requestedChains.includes("btc")) {
    console.warn("[wallet-reconciliation-cron] BTC branch frozen (03/09/2026) — bỏ qua nhánh btc");
  }


  // Tạo run cha
  const { data: runRow, error: runErr } = await supabase
    .from("wallet_reconciliation_runs")
    .insert({ chain: "all", trigger, triggered_by: triggeredBy, status: "running" })
    .select("id")
    .single();
  if (runErr) {
    console.error("create run failed", runErr);
    return new Response(JSON.stringify({ ok: false, error: runErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const runId = runRow.id;

  // Hàm chạy nền — trả response ngay rồi tiếp tục quét để né edge timeout
  const work = async () => {


  const findings: Finding[] = [];
  let totalScanned = 0;
  let totalFound = 0;
  let totalBackfilled = 0;
  let totalErrors = 0;

  // Lấy mapping cho phân loại nội bộ/ngoại
  const { data: btcOwners } = await supabase
    .from("profiles")
    .select("id, btc_address")
    .not("btc_address", "is", null)
    .limit(5000);
  const { data: btcAux } = await supabase
    .from("profile_btc_aux_addresses")
    .select("user_id, address, verified")
    .eq("verified", true)
    .limit(5000);
  const { data: evmOwners } = await supabase
    .from("profiles")
    .select("id, wallet_address")
    .not("wallet_address", "is", null)
    .limit(5000);

  const btcMap = new Map<string, string>(); // address -> user_id
  for (const p of btcOwners ?? []) if (p.btc_address) btcMap.set(btcNorm(p.btc_address), p.id);
  for (const a of btcAux ?? []) if (a.address) btcMap.set(btcNorm(a.address), a.user_id);
  const evmMap = new Map<string, string>();
  for (const p of evmOwners ?? []) if (p.wallet_address) evmMap.set(p.wallet_address.toLowerCase(), p.id);

  const cutoffMs = Date.now() - OLD_TX_CUTOFF_DAYS * 86400000;

  // Ưu tiên Father (main+aux) đầu tiên, rồi rotate phần còn lại theo cửa sổ 30'
  const rotate = <T,>(arr: T[], n: number) => arr.length <= n ? arr : (() => {
    const offset = Math.floor(Date.now() / 1_800_000) % arr.length;
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(arr[(offset + i) % arr.length]);
    return out;
  })();
  const fatherBtcAddrs = (btcAux ?? []).filter(a => a.user_id === FATHER_ID).map(a => btcNorm(a.address));
  const fatherMainBtc = (btcOwners ?? []).find(p => p.id === FATHER_ID)?.btc_address ? btcNorm((btcOwners ?? []).find(p => p.id === FATHER_ID)!.btc_address) : undefined;
  if (fatherMainBtc) fatherBtcAddrs.unshift(fatherMainBtc);
  const otherBtcAddrs = Array.from(btcMap.keys()).filter(a => !fatherBtcAddrs.includes(a));
  const btcQueue = [...fatherBtcAddrs, ...rotate(otherBtcAddrs, Math.max(0, MAX_WALLETS_PER_CHAIN - fatherBtcAddrs.length))];

  const flushProgress = async () => {
    await supabase.from("wallet_reconciliation_runs").update({
      wallets_scanned: totalScanned, txs_found: totalFound, txs_backfilled: totalBackfilled, errors: totalErrors,
    }).eq("id", runId);
  };

  // ============ BTC ============
  if (chains.includes("btc")) {
    let i = 0;
    for (const addr of btcQueue) {
      totalScanned++; i++;
      try {
        const txs = await fetchJson(`https://mempool.space/api/address/${addr}/txs`);
        await sleep(120);
        for (const tx of txs ?? []) {
          const blockTime = tx.status?.block_time ? tx.status.block_time * 1000 : Date.now();
          if (blockTime < cutoffMs) continue;

          const txHash = tx.txid as string;
          const fromAddr = btcNorm(tx.vin?.[0]?.prevout?.scriptpubkey_address);
          // duyệt từng vout liên quan address này
          for (const vout of tx.vout ?? []) {
            try {
            const toAddr = btcNorm(vout.scriptpubkey_address);
            if (toAddr !== addr) continue;
            const recipientUserId = btcMap.get(toAddr);
            const senderUserId = btcMap.get(fromAddr);

            // Shadow-log (Phase 2, chỉ quan sát) — bắt buộc dispatch (không await) vì
            // vòng lặp này có thể tới hàng nghìn lần gọi/1 run (MAX_WALLETS_PER_CHAIN × txs × vout).
            const blockTimeIso = new Date(blockTime).toISOString();
            dispatchBtcResolverShadowLog(supabase, {
              address: toAddr,
              rawAddressLegacySide: toAddr,
              callSite: "wallet-reconciliation-cron:recipient",
              legacyUserId: recipientUserId ?? null,
              legacySource: "btcMap",
              idempotencyKey: `wallet-reconciliation-cron:recipient:${tx.txid}:${toAddr}`,
              createdBy: "wallet-reconciliation-cron",
              eventAt: blockTimeIso,
              txHash: tx.txid,
            });
            if (fromAddr) {
              dispatchBtcResolverShadowLog(supabase, {
                address: fromAddr,
                rawAddressLegacySide: fromAddr,
                callSite: "wallet-reconciliation-cron:sender",
                legacyUserId: senderUserId ?? null,
                legacySource: "btcMap",
                idempotencyKey: `wallet-reconciliation-cron:sender:${tx.txid}:${fromAddr}`,
                createdBy: "wallet-reconciliation-cron",
                eventAt: blockTimeIso,
                txHash: tx.txid,
              });
            }

            if (!recipientUserId) continue;
            // amountSats: giữ nguyên satoshi cho log/finding (payload.amount_sats).
            // amountBtc:  giá trị đã convert sang BTC canonical string, dùng cho INSERT
            //             vào transactions.amount / donations.amount (field lưu BTC, không sat).
            // KHÔNG được dùng amountSats cho field `amount` của transactions/donations.
            const amountSats = String(vout.value ?? "0");
            const amountBtc = satsToBtc(amountSats);
            totalFound++;

            // INSERT recipient side
            const recRow = {
              user_id: recipientUserId,
              tx_hash: txHash,
              from_address: fromAddr,
              to_address: toAddr,
              amount: amountBtc,
              token_symbol: "BTC",
              chain_id: BTC_CHAIN_ID,
              status: tx.status?.confirmed ? "confirmed" : "pending",
              created_at: new Date(blockTime).toISOString(),
            };
            const { error: recErr } = await insertTxIfMissing(recRow);
            if (recErr) { totalErrors++; findings.push({ chain: "btc", tx_hash: txHash, address: toAddr, user_id: recipientUserId, action: "error", payload: { side: "recipient", err: recErr.message } }); continue; }

            // INSERT sender side nếu nội bộ
            if (senderUserId && senderUserId !== recipientUserId) {
              await insertTxIfMissing({ ...recRow, user_id: senderUserId });
            }


            // Donation nếu sender nội bộ và chưa có
            if (senderUserId) {
              const { data: existDon } = await supabase
                .from("donations").select("id").eq("tx_hash", txHash).maybeSingle();
              if (!existDon) {
                await supabase.from("donations").insert({
                  sender_id: senderUserId,
                  recipient_id: recipientUserId,
                  amount: amountBtc,
                  token_symbol: "BTC",
                  chain_id: BTC_CHAIN_ID,
                  chain_family: "btc",
                  tx_hash: txHash,
                  status: "confirmed",
                  sender_address: fromAddr,
                  recipient_address: toAddr,
                  is_external: false,
                  leaderboard_eligibility: "internal",
                  confirmed_at: new Date(blockTime).toISOString(),
                  metadata: { source: "wallet-reconciliation-cron", run_id: runId },
                });
              }
              findings.push({ chain: "btc", tx_hash: txHash, address: toAddr, user_id: recipientUserId, action: "backfilled", payload: { from: fromAddr, amount_sats: amountSats, amount_btc: amountBtc, internal: true } });
            } else {
              findings.push({ chain: "btc", tx_hash: txHash, address: toAddr, user_id: recipientUserId, action: "backfilled", payload: { from: fromAddr, amount_sats: amountSats, amount_btc: amountBtc, internal: false } });
            }
            totalBackfilled++;
            } catch (voutErr) {
              // Fail-safe tầng job: 1 vout dị dạng (helper throw / insert lỗi bất thường)
              // KHÔNG được giết cả tx/address. Log finding rồi tiếp vout kế.
              totalErrors++;
              const reason = voutErr instanceof Error && /satsToBtc/.test(voutErr.message)
                ? "invalid_amount_format"
                : "vout_processing_error";
              findings.push({
                chain: "btc",
                tx_hash: txHash,
                address: addr,
                action: "error",
                payload: {
                  reason,
                  raw_value: vout?.value ?? null,
                  err: voutErr instanceof Error ? voutErr.message : String(voutErr),
                },
              });
            }
          }

        }
      } catch (e) {
        totalErrors++;
        findings.push({ chain: "btc", address: addr, action: "error", payload: { err: e instanceof Error ? e.message : String(e) } });
      }
      if (i % BATCH_FLUSH_EVERY === 0) await flushProgress();
    }
  }



  // ============ BEP-20 USDT + BNB native ============
  const fatherEvm = (evmOwners ?? []).find(p => p.id === FATHER_ID)?.wallet_address?.toLowerCase();
  const otherEvm = Array.from(evmMap.keys()).filter(a => a !== fatherEvm);
  const evmQueue = [...(fatherEvm ? [fatherEvm] : []), ...rotate(otherEvm, Math.max(0, MAX_WALLETS_PER_CHAIN - (fatherEvm ? 1 : 0)))];
  const moralisKey = Deno.env.get("MORALIS_API_KEY");

  if ((chains.includes("bep20_usdt") || chains.includes("bnb")) && moralisKey) {
    let j = 0;
    for (const addr of evmQueue) {
      totalScanned++; j++;

      try {
        // BEP-20 USDT
        if (chains.includes("bep20_usdt")) {
          const url = `https://deep-index.moralis.io/api/v2.2/${addr}/erc20/transfers?chain=bsc&limit=25&token_addresses%5B0%5D=${USDT_BSC}`;
          const res = await moralisFetch(url, { headers: { accept: "application/json" } });
          if (res.ok) {
            const data = await res.json();
            for (const tr of data.result ?? []) {
              const blockTime = new Date(tr.block_timestamp).getTime();
              if (blockTime < cutoffMs) continue;
              // CHỐT CHẶN: chỉ xử lý đúng contract USDT BSC, bỏ qua mọi token khác Moralis có thể trả về.
              const trAddr = String(tr.address ?? "").toLowerCase();
              if (trAddr !== USDT_BSC) {
                findings.push({ chain: "bep20_usdt", tx_hash: (tr.transaction_hash as string)?.toLowerCase() ?? null, address: addr, action: "skipped_external", payload: { reason: "not_usdt_contract", got: trAddr } });
                continue;
              }
              const txHash = (tr.transaction_hash as string).toLowerCase();
              const fromAddr = (tr.from_address as string).toLowerCase();
              const toAddr = (tr.to_address as string).toLowerCase();
              const ownerId = evmMap.get(addr);
              if (!ownerId) continue;
              const counterpartId = evmMap.get(fromAddr === addr ? toAddr : fromAddr);
              const amountWei = String(tr.value ?? "0");
              const amountDecimal = weiToDecimal(amountWei, USDT_BSC_DECIMALS);
              totalFound++;

              const verdict = txFilter.check({
                tokenSymbol: "USDT",
                amount: amountDecimal,
                senderAddress: fromAddr,
                chain: "bsc",
              });
              if (!verdict.ok) {
                await txFilter.log({
                  tx_hash: txHash,
                  reason: verdict.reason || "rejected",
                  token_symbol: "USDT",
                  amount: amountDecimal,
                  sender_address: fromAddr,
                  recipient_address: toAddr,
                  chain: "bsc",
                  source: "wallet-reconciliation-cron",
                });
                findings.push({ chain: "bep20_usdt", tx_hash: txHash, address: addr, user_id: ownerId, action: "skipped_external", payload: { reason: verdict.reason || "rejected", amount: amountDecimal } });
                continue;
              }

              const row = {
                user_id: ownerId,
                tx_hash: txHash,
                from_address: fromAddr,
                to_address: toAddr,
                amount: amountDecimal,
                token_symbol: "USDT",
                token_address: USDT_BSC,
                chain_id: BSC_CHAIN_ID,
                status: "confirmed",
                created_at: new Date(blockTime).toISOString(),
              };
              const { error } = await insertTxIfMissing(row);
              if (error) { totalErrors++; findings.push({ chain: "bep20_usdt", tx_hash: txHash, address: addr, user_id: ownerId, action: "error", payload: { err: error.message } }); continue; }

              // donation nếu cả 2 nội bộ + chưa có
              if (counterpartId && fromAddr !== toAddr) {
                const senderId = evmMap.get(fromAddr);
                const recipientId = evmMap.get(toAddr);
                if (senderId && recipientId) {
                  const { data: existDon } = await supabase.from("donations").select("id").eq("tx_hash", txHash).maybeSingle();
                  if (!existDon) {
                    await supabase.from("donations").insert({
                      sender_id: senderId, recipient_id: recipientId, amount: amountDecimal,
                      token_symbol: "USDT", token_address: USDT_BSC, chain_id: BSC_CHAIN_ID, chain_family: "evm",
                      tx_hash: txHash, status: "confirmed", sender_address: fromAddr, recipient_address: toAddr,
                      is_external: false, leaderboard_eligibility: "internal",
                      confirmed_at: new Date(blockTime).toISOString(),
                      metadata: { source: "wallet-reconciliation-cron", run_id: runId },
                    });
                  }
                }
              }
              findings.push({ chain: "bep20_usdt", tx_hash: txHash, address: addr, user_id: ownerId, action: "backfilled", payload: { from: fromAddr, to: toAddr, amount: amountDecimal } });
              totalBackfilled++;
            }
          }
          await sleep(150);
        }

        // BNB native
        if (chains.includes("bnb")) {
          const url = `https://deep-index.moralis.io/api/v2.2/${addr}?chain=bsc&limit=25`;
          const res = await moralisFetch(url, { headers: { accept: "application/json" } });
          if (res.ok) {
            const data = await res.json();
            for (const tr of data.result ?? []) {
              const blockTime = new Date(tr.block_timestamp).getTime();
              if (blockTime < cutoffMs) continue;
              if (!tr.value || tr.value === "0") continue;
              const txHash = (tr.hash as string).toLowerCase();
              const fromAddr = (tr.from_address as string).toLowerCase();
              const toAddr = (tr.to_address as string).toLowerCase();
              const ownerId = evmMap.get(addr);
              if (!ownerId) continue;
              const amountWei = String(tr.value);
              const amountDecimal = weiToDecimal(amountWei, BNB_DECIMALS);
              totalFound++;

              const verdict = txFilter.check({
                tokenSymbol: "BNB",
                amount: amountDecimal,
                senderAddress: fromAddr,
                chain: "bsc",
              });
              if (!verdict.ok) {
                await txFilter.log({
                  tx_hash: txHash,
                  reason: verdict.reason || "rejected",
                  token_symbol: "BNB",
                  amount: amountDecimal,
                  sender_address: fromAddr,
                  recipient_address: toAddr,
                  chain: "bsc",
                  source: "wallet-reconciliation-cron",
                });
                findings.push({ chain: "bnb", tx_hash: txHash, address: addr, user_id: ownerId, action: "skipped_external", payload: { reason: verdict.reason || "rejected", amount: amountDecimal } });
                continue;
              }

              const row = {
                user_id: ownerId,
                tx_hash: txHash,
                from_address: fromAddr,
                to_address: toAddr,
                amount: amountDecimal,
                token_symbol: "BNB",
                chain_id: BSC_CHAIN_ID,
                status: "confirmed",
                created_at: new Date(blockTime).toISOString(),
              };
              const { error } = await insertTxIfMissing(row);
              if (error) { totalErrors++; findings.push({ chain: "bnb", tx_hash: txHash, address: addr, user_id: ownerId, action: "error", payload: { err: error.message } }); continue; }

              findings.push({ chain: "bnb", tx_hash: txHash, address: addr, user_id: ownerId, action: "backfilled", payload: { from: fromAddr, to: toAddr, amount: amountDecimal } });
              totalBackfilled++;
            }
          }
          await sleep(150);
        }
      } catch (e) {
        totalErrors++;
        findings.push({ chain: "evm", address: addr, action: "error", payload: { err: e instanceof Error ? e.message : String(e) } });
      }
      if (j % BATCH_FLUSH_EVERY === 0) await flushProgress();
    }

  } else if ((chains.includes("bep20_usdt") || chains.includes("bnb")) && !moralisKey) {
    findings.push({ chain: "evm", action: "error", payload: { err: "MORALIS_API_KEY not configured" } });
    totalErrors++;
  }

  // Ghi findings theo lô 500
  for (let i = 0; i < findings.length; i += 500) {
    const batch = findings.slice(i, i + 500).map((f) => ({ ...f, run_id: runId }));
    if (batch.length) await supabase.from("wallet_reconciliation_findings").insert(batch);
  }

  // Cập nhật run
  await supabase.from("wallet_reconciliation_runs").update({
    wallets_scanned: totalScanned,
    txs_found: totalFound,
    txs_backfilled: totalBackfilled,
    errors: totalErrors,
    status: totalErrors > 0 && totalBackfilled === 0 ? "failed" : "done",
    finished_at: new Date().toISOString(),
    notes: `Father ID ${FATHER_ID} included; chains=${chains.join(",")}`,
  }).eq("id", runId);

    // Notify admin — CHỈ khi có backfill thật, hoặc lỗi vượt ngưỡng (bỏ qua rate-limit lẻ tẻ).
    // Dedupe theo 24h: nếu admin còn thông báo chưa đọc thì gộp metadata thay vì chèn dòng mới.
    const ERROR_ALERT_THRESHOLD = 20;
    if (totalBackfilled > 0 || totalErrors >= ERROR_ALERT_THRESHOLD) {
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      for (const a of admins ?? []) {
        const { data: existing } = await supabase
          .from("notifications")
          .select("id, metadata")
          .eq("user_id", a.user_id)
          .eq("type", "wallet_reconciliation_alert")
          .eq("read", false)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const prev = (existing?.metadata ?? {}) as Record<string, unknown>;
        const metadata = {
          run_id: runId,
          runs: Number(prev.runs ?? 0) + 1,
          wallets_scanned: Number(prev.wallets_scanned ?? 0) + totalScanned,
          txs_backfilled: Number(prev.txs_backfilled ?? 0) + totalBackfilled,
          errors: Number(prev.errors ?? 0) + totalErrors,
          updated_at: new Date().toISOString(),
        };

        if (existing?.id) {
          await supabase.from("notifications")
            .update({ metadata, created_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("notifications").insert({
            user_id: a.user_id,
            actor_id: a.user_id,
            type: "wallet_reconciliation_alert",
            post_id: null,
            metadata,
          });
        }
      }
    }

  }; // end work()

  // Chạy đồng bộ trong giới hạn ~60s gateway; rotate ví đảm bảo quét toàn user qua nhiều run.
  await work();

  return new Response(JSON.stringify({
    ok: true, run_id: runId, trigger, triggered_by: triggeredBy,
    wallets_scanned: totalScanned, txs_found: totalFound, txs_backfilled: totalBackfilled, errors: totalErrors,
  }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});


