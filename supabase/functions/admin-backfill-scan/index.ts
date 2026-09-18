// admin-backfill-scan — worker quét bù theo yêu cầu admin (KHÔNG ghi dữ liệu).
//
// Tái sử dụng 100% lõi quét của `scanner-rpc-tick`:
// - `_shared/rpcClient.ts`  : RpcRotator + getLogsCapped (tự cắt span theo endpoint)
// - `_shared/walletTopicBatches.ts` : chia lô ≤400 ví/call + all-or-nothing
// - `_shared/scanCore.ts`   : TOKENS/min dust/phân loại (không copy hằng số)
//
// Watermark của job là `cursor_block` RIÊNG trong `admin_backfill_jobs` —
// KHÔNG đụng `scanner_watermarks` của cron sản xuất. Lô ví lỗi ⇒ ghi
// `scanner_block_gaps`, cursor KHÔNG advance.

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { requireUser } from "../_shared/httpAuth.ts";
import {
  formatUnitsString,
  hexToBigInt,
  RpcRotator,
  toHexBlock,
} from "../_shared/rpcClient.ts";
import {
  addressToTopic,
  chunkTopics,
  scanSegmentAllBatches,
  WALLET_TOPIC_BATCH_SIZE,
} from "../_shared/walletTopicBatches.ts";
import {
  CHAIN_ID,
  classifyCandidates,
  estimateBlockAt,
  NATIVE_DECIMALS,
  type RawCandidate,
  TOKENS,
  topicToAddress,
  TRANSFER_TOPIC,
} from "../_shared/scanCore.ts";

const LEASE_NAME = "admin-backfill-job";
const LEASE_TTL_SECONDS = 900;
const ERC20_BLOCKS_PER_INVOKE = 50_000;
const NATIVE_BLOCKS_PER_INVOKE = 1_200;
const NATIVE_BATCH = 50;
const NATIVE_CONCURRENCY = 3;
const GETLOGS_MIN_SPAN = 25;
const MAX_CANDIDATES = 5_000;
const GAP_REASON = "admin_backfill_getlogs_error";

function jsonRes(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const admin = createAdminClient();
  const rpc = new RpcRotator();
  const started = Date.now();
  let leaseToken = "";

  try {
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.job_id ?? "");
    if (!jobId) return jsonRes({ ok: false, error: "thiếu job_id" }, 400);

    // 1. Xác thực admin THẬT trong code (không chỉ dựa RLS).
    const user = await requireUser(req);
    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (isAdmin !== true) {
      return jsonRes({ ok: false, error: "Chỉ admin được quét backfill" }, 403);
    }

    // 2. Single-flight — resource riêng, không khoá chéo pplp-auto-submit.
    leaseToken = `${jobId}:${crypto.randomUUID()}`;
    const { data: leaseOk } = await admin.rpc("job_acquire_lease", {
      p_job_name: LEASE_NAME,
      p_owner_token: leaseToken,
      p_ttl_seconds: LEASE_TTL_SECONDS,
    });
    if (leaseOk !== true) {
      return jsonRes({ ok: false, error: "Đang có job backfill khác chạy" }, 409);
    }

    const { data: job, error: jobErr } = await admin
      .from("admin_backfill_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (jobErr || !job) return jsonRes({ ok: false, error: "không tìm thấy job" }, 404);
    if (!["queued", "scanning"].includes(String(job.status))) {
      return jsonRes({ ok: false, error: `job đang ở trạng thái ${job.status}` }, 409);
    }

    // 3. head + quy đổi thời gian → block (chỉ lần đầu)
    const head = Number(hexToBigInt(await rpc.call("eth_blockNumber", [])));
    if (!Number.isFinite(head) || head <= 0) throw new Error("không đọc được block head");

    let fromBlock = job.from_block === null ? null : Number(job.from_block);
    let toBlock = job.to_block === null ? null : Number(job.to_block);
    if (fromBlock === null || toBlock === null) {
      const nowMs = Date.now();
      fromBlock = estimateBlockAt(head, nowMs, new Date(job.from_ts).getTime());
      toBlock = estimateBlockAt(head, nowMs, new Date(job.to_ts).getTime());
      await admin
        .from("admin_backfill_jobs")
        .update({ from_block: fromBlock, to_block: toBlock, status: "scanning" })
        .eq("id", jobId);
    }
    const cursorStart = job.cursor_block === null ? fromBlock : Number(job.cursor_block) + 1;
    if (cursorStart > toBlock) {
      await admin
        .from("admin_backfill_jobs")
        .update({ status: "preview_ready", progress_pct: 100 })
        .eq("id", jobId);
      return jsonRes({ ok: true, job_id: jobId, status: "preview_ready", note: "đã quét xong" });
    }

    // 4. Tập ví trong phạm vi
    const [{ data: profiles }, { data: custodial }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, public_wallet_address, wallet_address, external_wallet_address")
        .or(
          "public_wallet_address.not.is.null,wallet_address.not.is.null,external_wallet_address.not.is.null",
        ),
      admin
        .from("custodial_wallets")
        .select("user_id, wallet_address")
        .not("wallet_address", "is", null),
    ]);

    const walletToUser = new Map<string, string>();
    for (const p of profiles ?? []) {
      for (const w of [p.public_wallet_address, p.wallet_address, p.external_wallet_address]) {
        if (typeof w === "string" && w.startsWith("0x") && w.length === 42) {
          walletToUser.set(w.toLowerCase(), String(p.id));
        }
      }
    }
    for (const c of custodial ?? []) {
      const w = typeof c.wallet_address === "string" ? c.wallet_address.toLowerCase() : "";
      if (w.startsWith("0x") && w.length === 42 && !walletToUser.has(w)) {
        walletToUser.set(w, String(c.user_id));
      }
    }

    const systemWallets = new Set(walletToUser.keys());
    const scopeWallets: string[] = job.scope === "all"
      ? [...systemWallets]
      : (job.wallets ?? []).map((w: string) => w.toLowerCase());
    if (scopeWallets.length === 0) throw new Error("không có ví nào trong phạm vi");

    const topicBatches = chunkTopics(scopeWallets.map(addressToTopic), WALLET_TOPIC_BATCH_SIZE);
    const scopeSet = new Set(scopeWallets);

    const raws: RawCandidate[] = [];
    const gapBlocks: number[] = [];

    // 5. ERC-20 qua eth_getLogs (topics[2] = recipient), chia lô ví
    const erc20To = Math.min(cursorStart + ERC20_BLOCKS_PER_INVOKE - 1, toBlock);
    let erc20Reached: number | null = null;

    for (const [token, meta] of Object.entries(TOKENS)) {
      let cursor = cursorStart;
      let reached = cursorStart - 1;
      while (cursor <= erc20To) {
        const seg = await scanSegmentAllBatches(
          topicBatches,
          cursor,
          erc20To,
          (batch, f, t) =>
            rpc.getLogsCapped({ address: token, topics: [TRANSFER_TOPIC, null, batch] }, f, t),
        );
        if (seg.reached === null) {
          const segTo = Math.min(cursor + GETLOGS_MIN_SPAN - 1, erc20To);
          for (let b = cursor; b <= segTo; b++) gapBlocks.push(b);
          break;
        }
        for (const log of seg.logs) {
          const topics = log.topics as string[];
          if (!topics || topics.length < 3) continue;
          const toAddr = topicToAddress(topics[2]);
          if (!scopeSet.has(toAddr)) continue;
          const raw = hexToBigInt(String(log.data ?? "0x0"));
          raws.push({
            tx_hash: String(log.transactionHash).toLowerCase(),
            log_index: Number(hexToBigInt(String(log.logIndex ?? "0x0"))),
            block_number: Number(hexToBigInt(String(log.blockNumber))),
            from_address: topicToAddress(topics[1]),
            to_address: toAddr,
            token_symbol: meta.symbol,
            token_address: token,
            amount_raw: raw.toString(),
            amount_display: formatUnitsString(raw, meta.decimals),
          });
        }
        reached = seg.reached;
        cursor = seg.reached + 1;
      }
      // Chỉ advance tới mốc mà MỌI token đều quét xong.
      erc20Reached = erc20Reached === null ? reached : Math.min(erc20Reached, reached);
    }

    // 6. Native BNB — đọc full block, batch 50, song song 3
    const nativeTo = Math.min(cursorStart + NATIVE_BLOCKS_PER_INVOKE - 1, toBlock);
    let nativeContiguous = cursorStart - 1;
    {
      let stop = false;
      const starts: number[] = [];
      for (let s = cursorStart; s <= nativeTo; s += NATIVE_BATCH) starts.push(s);
      for (let g = 0; g < starts.length && !stop; g += NATIVE_CONCURRENCY) {
        const groups = starts.slice(g, g + NATIVE_CONCURRENCY).map((start) => {
          const nums: number[] = [];
          for (let b = start; b < Math.min(start + NATIVE_BATCH, nativeTo + 1); b++) nums.push(b);
          return nums;
        });
        const settled = await Promise.all(groups.map(async (blockNums) => {
          try {
            const results = await rpc.batch(
              blockNums.map((b) => ({
                method: "eth_getBlockByNumber",
                params: [toHexBlock(b), true],
              })),
            );
            return { blockNums, results, failed: false };
          } catch (_e) {
            // deno-lint-ignore no-explicit-any
            return { blockNums, results: [] as any[], failed: true };
          }
        }));
        for (const part of settled) {
          if (part.failed) {
            gapBlocks.push(...part.blockNums);
            stop = true;
            continue;
          }
          for (let i = 0; i < part.blockNums.length; i++) {
            const blk = part.results[i];
            if (!blk || !Array.isArray(blk.transactions)) {
              gapBlocks.push(part.blockNums[i]);
              stop = true;
              continue;
            }
            for (const tx of blk.transactions) {
              const toAddr = String(tx.to ?? "").toLowerCase();
              if (!toAddr || !scopeSet.has(toAddr)) continue;
              const raw = hexToBigInt(String(tx.value ?? "0x0"));
              if (raw === 0n) continue;
              raws.push({
                tx_hash: String(tx.hash).toLowerCase(),
                log_index: 0,
                block_number: part.blockNums[i],
                from_address: String(tx.from ?? "").toLowerCase(),
                to_address: toAddr,
                token_symbol: "BNB",
                token_address: null,
                amount_raw: raw.toString(),
                amount_display: formatUnitsString(raw, NATIVE_DECIMALS),
              });
            }
            if (!stop) nativeContiguous = part.blockNums[i];
          }
        }
      }
    }

    // 7. Ghi gap (không advance qua block đọc lỗi)
    if (gapBlocks.length > 0) {
      await admin.from("scanner_block_gaps").upsert(
        [...new Set(gapBlocks)].slice(0, 1000).map((b) => ({
          chain_id: CHAIN_ID,
          block: b,
          reason: GAP_REASON,
        })),
        { onConflict: "chain_id,block", ignoreDuplicates: true },
      );
    }

    // 8. Đối chiếu DB theo tx_hash + phân loại
    const hashes = [...new Set(raws.map((r) => r.tx_hash))];
    const known = new Set<string>();
    for (let i = 0; i < hashes.length; i += 100) {
      const slice = hashes.slice(i, i + 100);
      const [d, t] = await Promise.all([
        admin.from("donations").select("tx_hash").in("tx_hash", slice),
        admin.from("transactions").select("tx_hash").in("tx_hash", slice),
      ]);
      for (const r of d.data ?? []) known.add(String(r.tx_hash).toLowerCase());
      for (const r of t.data ?? []) known.add(String(r.tx_hash).toLowerCase());
    }
    const classified = classifyCandidates(raws, systemWallets, known);

    // 9. Giá USD từ token_price_history THẬT — không có giá ⇒ NULL (pending)
    const priceBySymbol = new Map<string, number>();
    const symbols = [...new Set(classified.map((c) => c.token_symbol))];
    if (symbols.length > 0) {
      const { data: prices } = await admin
        .from("token_price_history")
        .select("symbol, price_usd, date")
        .in("symbol", symbols)
        .order("date", { ascending: false })
        .limit(200);
      for (const p of prices ?? []) {
        if (!priceBySymbol.has(String(p.symbol))) {
          priceBySymbol.set(String(p.symbol), Number(p.price_usd));
        }
      }
    }

    const rows = classified.map((c) => {
      const price = priceBySymbol.get(c.token_symbol);
      const usd = price === undefined
        ? null
        : Number((Number(c.amount_display) * price).toFixed(6));
      return {
        job_id: jobId,
        tx_hash: c.tx_hash,
        log_index: c.log_index,
        block_number: c.block_number,
        from_address: c.from_address,
        to_address: c.to_address,
        token_symbol: c.token_symbol,
        token_address: c.token_address,
        amount_raw: c.amount_raw,
        amount_display: c.amount_display,
        usd_value: usd,
        classification: c.classification,
        matched_user_id: walletToUser.get(c.to_address) ?? null,
        // Mặc định tick: chỉ nội bộ + ví ngoài. swap/dust/đã có ⇒ không tick.
        selected: c.classification === "internal" || c.classification === "external_in",
        skip_reason: c.skip_reason,
      };
    });

    if (rows.length > 0) {
      await admin.from("admin_backfill_candidates").upsert(rows, {
        onConflict: "job_id,tx_hash,log_index",
        ignoreDuplicates: true,
      });
    }

    // 10. Advance cursor — chỉ tới mốc mà CẢ ERC20 và native đều xong
    const erc20Ok = erc20Reached ?? cursorStart - 1;
    const newCursor = Math.min(erc20Ok, nativeContiguous);
    const advanced = newCursor >= cursorStart;

    const { count: total } = await admin
      .from("admin_backfill_candidates")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId);

    if ((total ?? 0) > MAX_CANDIDATES) {
      await admin
        .from("admin_backfill_jobs")
        .update({
          status: "failed",
          error: `Vượt trần ${MAX_CANDIDATES} candidate — hãy thu nhỏ phạm vi hoặc khoảng thời gian`,
        })
        .eq("id", jobId);
      return jsonRes({ ok: false, error: "vượt trần candidate", candidates: total }, 200);
    }

    const cursorFinal = advanced ? newCursor : (job.cursor_block ?? null);
    const done = advanced && newCursor >= toBlock;
    const pct = Math.max(
      0,
      Math.min(100, Math.round((((cursorFinal ?? fromBlock) - fromBlock + 1) / (toBlock - fromBlock + 1)) * 100)),
    );

    const stats: Record<string, number> = {};
    for (const r of rows) stats[r.classification] = (stats[r.classification] ?? 0) + 1;

    await admin
      .from("admin_backfill_jobs")
      .update({
        cursor_block: cursorFinal,
        progress_pct: done ? 100 : pct,
        status: done ? "preview_ready" : "scanning",
        stats: { ...(job.stats ?? {}), ...stats, total_candidates: total ?? 0 },
      })
      .eq("id", jobId);

    return jsonRes({
      ok: true,
      job_id: jobId,
      status: done ? "preview_ready" : "scanning",
      scanned_from: cursorStart,
      cursor_block: cursorFinal,
      to_block: toBlock,
      progress_pct: done ? 100 : pct,
      wallets_in_scope: scopeWallets.length,
      wallet_topic_batches: topicBatches.length,
      candidates_added: rows.length,
      gap_blocks_added: [...new Set(gapBlocks)].length,
      cursor_advanced: advanced,
      duration_ms: Date.now() - started,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /Authorization|Unauthorized|Token/i.test(msg) ? 401 : 500;
    console.error("[admin-backfill-scan] lỗi:", msg);
    return jsonRes({ ok: false, error: msg }, status);
  } finally {
    if (leaseToken) {
      await admin.rpc("job_release_lease", {
        p_job_name: LEASE_NAME,
        p_owner_token: leaseToken,
      }).catch(() => {});
    }
  }
});
