// scanner-rpc-tick — Giai đoạn 2 (GHI donations/transactions từ RPC watermark)
//
// Thiết kế: docs/architecture/scanner-rpc-watermark-v1/DESIGN.md
// Nguồn: QuickNode (ưu tiên) + JSON-RPC công khai BSC + watermark theo block.
//
// 15/09/2026: Moralis Free bị pause hoàn toàn (mù dữ liệu từ 03/09) ⇒ bật ghi
// sớm theo quyết định của Cha. Ghi qua `_shared/ingestTransfer.ts` — cùng bộ
// policy với mọi đường backfill: idempotent (tx_hash, user_id), ví ngoài
// is_external + không gift post, swap_suspect chỉ lưu transactions.
// Cảnh báo admin (dedupe 6h) vẫn giữ để theo dõi các lệch còn lại.

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import {
  formatUnitsString,
  hexToBigInt,
  RpcRotator,
  toHexBlock,
} from "../_shared/rpcClient.ts";
import {
  type IngestClassification,
  ingestTransfer,
} from "../_shared/ingestTransfer.ts";
import {
  buildScannerAlertRows,
  SCANNER_ALERT_DEDUPE_MS,
  SCANNER_ALERT_SOURCE,
} from "../_shared/scannerAlert.ts";
import {
  addressToTopic,
  chunkTopics,
  scanSegmentAllBatches,
  WALLET_TOPIC_BATCH_SIZE,
} from "../_shared/walletTopicBatches.ts";

const TICK_MODE = "write_phase2";

const CHAIN_ID = 56;
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const REORG_BUFFER = 15;
// Span an toàn nhỏ nhất khi phải ghi gap (endpoint yếu nhất chỉ cho 25 block).
const GETLOGS_MAX_SPAN = 25;
// Tổng block xử lý / token / tick. Nhờ topic-filter, mỗi call phủ tới 5.000
// block trong <1s ⇒ đủ sức quét bù nhanh sau khi reset watermark.
const ERC20_CHUNK = 50000;

// Native BNB: BSC sinh ~40 block/phút ⇒ 2 phút/tick cần ≥80 block để theo kịp.
// 1.200 block/tick = 15x tốc độ sinh block; bù lag ~13.500 block trong ~12 tick
// (~25 phút) mà mỗi tick vẫn kết thúc <60s (đo: 50 block/call ≈0,94s, 3 song song).
const NATIVE_CHUNK = 1200;
const NATIVE_BATCH = 50;
const NATIVE_CONCURRENCY = 3;
const GAP_RETRY_LIMIT = 200;
const GAP_REASON_ERC20 = "erc20_getlogs_error";
// Ngân sách thời gian cho bước quét native. Hết ngân sách thì dừng quét, giữ
// watermark ở block liên tục cuối cùng và VẪN chạy tiếp bước đối chiếu + cảnh báo.
const NATIVE_BUDGET_MS = 55_000;



const TOKENS: Record<string, { symbol: string; decimals: number; min: string }> = {
  "0x55d398326f99059ff775485246999027b3197955": { symbol: "USDT", decimals: 18, min: "0.01" },
  "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { symbol: "BTCB", decimals: 18, min: "0.0001" },
  "0x0910320181889fefde0bb1ca63962b0a8882e413": { symbol: "CAMLY", decimals: 3, min: "1" },
  "0x39a1b047d5d143f8874888cfa1d30fb2ae6f0cd6": { symbol: "FUN", decimals: 18, min: "1" },
};

const TOKEN_ADDR_BY_SYMBOL: Record<string, string> = Object.fromEntries(
  Object.entries(TOKENS).map(([addr, meta]) => [meta.symbol, addr]),
);

interface Candidate {
  tx_hash: string;
  block: number;
  from: string;
  to: string;
  amount: string;
  symbol: string;
  source: "erc20" | "native";
}

function topicToAddress(topic: string): string {
  return ("0x" + topic.slice(-40)).toLowerCase();
}

/** So sánh chuỗi số thập phân không dùng float (tránh mất precision). */
function gteDecimal(a: string, b: string): boolean {
  const norm = (s: string) => {
    const [i, f = ""] = s.split(".");
    return [BigInt(i || "0"), (f + "0".repeat(18)).slice(0, 18)];
  };
  const [ai, af] = norm(a) as [bigint, string];
  const [bi, bf] = norm(b) as [bigint, string];
  if (ai !== bi) return ai > bi;
  return BigInt(af) >= BigInt(bf);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const started = Date.now();
  const rpc = new RpcRotator();
  const admin = createAdminClient();

  try {
    // 1. head + safe_head
    const headHex = await rpc.call("eth_blockNumber", []);
    const head = Number(hexToBigInt(headHex));
    const safeHead = head - REORG_BUFFER;
    if (!Number.isFinite(head) || safeHead <= 0) {
      throw new Error("không đọc được block head");
    }

    // 2. Ví hệ thống = ví khai báo ở profiles + VÍ CUSTODIAL (EVM).
    // Trước 20/08/2026 custodial_wallets KHÔNG được giám sát ⇒ khoảng trống phủ
    // sóng; nay gộp vào cùng đợt vá chia lô.
    const [{ data: profiles }, { data: custodial }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, username, public_wallet_address, wallet_address, external_wallet_address")
        .or(
          "public_wallet_address.not.is.null,wallet_address.not.is.null,external_wallet_address.not.is.null",
        ),
      admin
        .from("custodial_wallets")
        .select("user_id, wallet_address")
        .not("wallet_address", "is", null),
    ]);

    const walletToUser = new Map<string, { id: string; username: string }>();
    for (const p of profiles ?? []) {
      for (
        const w of [p.public_wallet_address, p.wallet_address, p.external_wallet_address]
      ) {
        if (typeof w === "string" && w.startsWith("0x")) {
          walletToUser.set(w.toLowerCase(), { id: p.id, username: p.username });
        }
      }
    }
    let custodialAdded = 0;
    for (const c of custodial ?? []) {
      const w = typeof c.wallet_address === "string" ? c.wallet_address.toLowerCase() : "";
      if (!w.startsWith("0x") || w.length !== 42) continue;
      if (walletToUser.has(w)) continue;
      walletToUser.set(w, { id: String(c.user_id), username: "custodial" });
      custodialAdded++;
    }
    console.log(
      `[scanner-rpc] stage=wallets t=${Date.now() - started}ms wallets=${walletToUser.size}`,
    );


    // 3. Watermarks hiện có
    const { data: marks } = await admin
      .from("scanner_watermarks")
      .select("source, token_address, last_block")
      .eq("chain_id", CHAIN_ID);

    const markMap = new Map<string, number>();
    for (const m of marks ?? []) {
      markMap.set(`${m.source}:${(m.token_address ?? "").toLowerCase()}`, Number(m.last_block));
    }

    const candidates: Candidate[] = [];
    const scanned: Record<string, { from: number; to: number }> = {};
    const gapBlocks: number[] = [];
    const erc20GapBlocks: number[] = [];
    // BẢN VÁ 2 — KHÔNG advance watermark ngay tại chỗ. Gom vào đây, chỉ đẩy mốc
    // SAU KHI đã đối chiếu DB + gửi cảnh báo admin thành công (mục 8b).
    // Lý do: nếu function bị kill/timeout giữa advance và đối chiếu, mốc đã nhảy
    // qua đoạn block chưa từng được đối chiếu ⇒ giao dịch thiếu biến mất vĩnh viễn.
    const pendingAdvances: {
      source: string;
      token_address: string | null;
      last_block: number;
    }[] = [];


    // 4. ERC-20 qua eth_getLogs — LỌC THEO VÍ HỆ THỐNG ở topics[2] (recipient).
    // Nhờ lọc này node công khai không còn "limit exceeded" ⇒ span tối đa của
    // endpoint (5.000 block với blxrbdn) thay vì 25. Span do rpcClient tự cắt
    // theo giới hạn thật từng endpoint; đoạn nào đọc lỗi được ghi vào
    // scanner_block_gaps và watermark KHÔNG nhảy qua.
    // Node công khai có trần số topic/filter (1.014 ví → "exceed max topics")
    // ⇒ chia lô ≤400 ví/call, gọi getLogs từng lô rồi gộp. Watermark chỉ advance
    // khi MỌI lô đều quét thành công cho khoảng block đó.
    const walletTopics = [...walletToUser.keys()].map(addressToTopic);
    const topicBatches = chunkTopics(walletTopics, WALLET_TOPIC_BATCH_SIZE);

    for (const [token, meta] of Object.entries(TOKENS)) {
      const last = markMap.get(`erc20:${token}`) ?? 0;
      const from = last > 0 ? last + 1 : Math.max(safeHead - ERC20_CHUNK, 1);
      if (from > safeHead) continue;
      const target = Math.min(from + ERC20_CHUNK - 1, safeHead);

      let cursor = from;
      let reached = from - 1;

      while (cursor <= target) {
        const seg = await scanSegmentAllBatches(
          topicBatches,
          cursor,
          target,
          (batch, f, t) =>
            rpc.getLogsCapped(
              { address: token, topics: [TRANSFER_TOPIC, null, batch] },
              f,
              t,
            ),
        );

        if (seg.reached === null) {
          // Bất kỳ lô nào lỗi ⇒ coi cả khoảng là chưa quét: ghi gap, dừng token.
          const segTo = Math.min(cursor + GETLOGS_MAX_SPAN - 1, target);
          for (let b = cursor; b <= segTo; b++) erc20GapBlocks.push(b);
          break;
        }

        for (const log of seg.logs) {
          const topics = log.topics as string[];
          if (!topics || topics.length < 3) continue;
          const toAddr = topicToAddress(topics[2]);
          if (!walletToUser.has(toAddr)) continue;
          const raw = hexToBigInt(String(log.data ?? "0x0"));
          const amount = formatUnitsString(raw, meta.decimals);
          if (!gteDecimal(amount, meta.min)) continue;
          candidates.push({
            tx_hash: String(log.transactionHash).toLowerCase(),
            block: Number(hexToBigInt(String(log.blockNumber))),
            from: topicToAddress(topics[1]),
            to: toAddr,
            amount,
            symbol: meta.symbol,
            source: "erc20",
          });
        }

        reached = seg.reached;
        cursor = seg.reached + 1;
      }


      if (reached >= from) {
        scanned[meta.symbol] = { from, to: reached };
        pendingAdvances.push({
          source: "erc20",
          token_address: token,
          last_block: reached,
        });
      }

    }
    console.log(
      `[scanner-rpc] stage=erc20 t=${Date.now() - started}ms candidates=${candidates.length}`,
    );






    // 5. Native BNB — đọc full block, batch 50 block/HTTP request, 3 batch song
    // song (đo thực tế: 50 block/call ≈ 0,94s ⇒ ~150 block/s). 1.200 block/tick
    // = 15x tốc độ sinh block BSC (~80 block/2 phút) ⇒ bù lag và còn biên rộng.
    {
      const last = markMap.get("native:") ?? 0;
      const from = last > 0 ? last + 1 : Math.max(safeHead - NATIVE_CHUNK, 1);
      const to = Math.min(from + NATIVE_CHUNK - 1, safeHead);
      let contiguous = from - 1;
      let stopAdvance = false; // một khi gặp block chưa đọc được, KHÔNG advance nữa

      // Danh sách lô theo đúng thứ tự block để giữ tính liên tục của watermark.
      const batchStarts: number[] = [];
      for (let s = from; s <= to; s += NATIVE_BATCH) batchStarts.push(s);

      for (let g = 0; g < batchStarts.length && !stopAdvance; g += NATIVE_CONCURRENCY) {
        if (Date.now() - started > NATIVE_BUDGET_MS) {
          console.log(
            `[scanner-rpc] native hết ngân sách ${NATIVE_BUDGET_MS}ms tại block ${batchStarts[g]}`,
          );
          break;
        }
        const group = batchStarts.slice(g, g + NATIVE_CONCURRENCY);
        const groups = group.map((start) => {
          const nums: number[] = [];
          for (let b = start; b < Math.min(start + NATIVE_BATCH, to + 1); b++) nums.push(b);
          return nums;
        });

        const settled = await Promise.all(
          groups.map(async (blockNums) => {
            try {
              const results = await rpc.batch(
                blockNums.map((b) => ({
                  method: "eth_getBlockByNumber",
                  params: [toHexBlock(b), true],
                })),
              );
              return { blockNums, results, failed: false };
            } catch (e) {
              console.error(`[scanner-rpc] batch block lỗi ${blockNums[0]}:`, e);
              // deno-lint-ignore no-explicit-any
              return { blockNums, results: [] as any[], failed: true };
            }
          }),
        );

        for (const part of settled) {
          if (part.failed) {
            gapBlocks.push(...part.blockNums);
            stopAdvance = true;
            continue;
          }
          for (let i = 0; i < part.blockNums.length; i++) {
            const blk = part.results[i];
            if (!blk || !Array.isArray(blk.transactions)) {
              gapBlocks.push(part.blockNums[i]);
              stopAdvance = true; // không đẩy watermark qua block chưa đọc được
              continue;
            }
            for (const tx of blk.transactions) {
              const toAddr = String(tx.to ?? "").toLowerCase();
              if (!toAddr || !walletToUser.has(toAddr)) continue;
              const raw = hexToBigInt(String(tx.value ?? "0x0"));
              if (raw === 0n) continue;
              const amount = formatUnitsString(raw, 18);
              if (!gteDecimal(amount, "0.001")) continue;
              candidates.push({
                tx_hash: String(tx.hash).toLowerCase(),
                block: part.blockNums[i],
                from: String(tx.from ?? "").toLowerCase(),
                to: toAddr,
                amount,
                symbol: "BNB",
                source: "native",
              });
            }
            if (!stopAdvance) contiguous = part.blockNums[i];
          }
        }
      }


      scanned["BNB"] = { from, to: contiguous };
      if (contiguous >= from) {
        pendingAdvances.push({
          source: "native",
          token_address: null,
          last_block: contiguous,
        });
      }

    }
    console.log(
      `[scanner-rpc] stage=native t=${Date.now() - started}ms candidates=${candidates.length}`,
    );



    // 6. Ghi hàng chờ block đọc lỗi (native + erc20 getLogs)
    const gapRows = [
      ...[...new Set(gapBlocks)].map((b) => ({
        chain_id: CHAIN_ID,
        block: b,
        reason: "null_from_node",
      })),
      ...[...new Set(erc20GapBlocks)].map((b) => ({
        chain_id: CHAIN_ID,
        block: b,
        reason: GAP_REASON_ERC20,
      })),
    ].slice(0, 1000);
    if (gapRows.length > 0) {
      await admin.from("scanner_block_gaps").upsert(gapRows, {
        onConflict: "chain_id,block",
        ignoreDuplicates: true,
      });
    }

    // 6b. Gap ERC-20 đã được watermark quét bù thành công ⇒ resolve.
    // Lấy mốc thấp nhất trong 4 token: chỉ resolve phần chắc chắn đã quét lại.
    const erc20Reached = Object.entries(TOKENS)
      .map(([, meta]) => scanned[meta.symbol]?.to)
      .filter((v): v is number => typeof v === "number");
    if (erc20Reached.length === Object.keys(TOKENS).length) {
      const minReached = Math.min(...erc20Reached);
      await admin
        .from("scanner_block_gaps")
        .update({ resolved_at: new Date().toISOString() })
        .eq("chain_id", CHAIN_ID)
        .eq("reason", GAP_REASON_ERC20)
        .is("resolved_at", null)
        .lte("block", minReached);
    }


    // 7. Retry block gap chưa resolve (chỉ gap native — gap ERC-20 do watermark
    // quét bù ở mục 4, không resolve bằng eth_getBlockByNumber).
    let gapsResolved = 0;
    const { data: pendingGaps } = await admin
      .from("scanner_block_gaps")
      .select("id, block")
      .eq("chain_id", CHAIN_ID)
      .neq("reason", GAP_REASON_ERC20)
      .is("resolved_at", null)
      .order("block", { ascending: true })
      .limit(GAP_RETRY_LIMIT);


    for (let i = 0; i < (pendingGaps?.length ?? 0); i += NATIVE_BATCH) {
      const slice = (pendingGaps ?? []).slice(i, i + NATIVE_BATCH);
      // deno-lint-ignore no-explicit-any
      let results: (any | null)[] = [];
      try {
        results = await rpc.batch(
          slice.map((g) => ({
            method: "eth_getBlockByNumber",
            params: [toHexBlock(Number(g.block)), true],
          })),
        );
      } catch (_) {
        break;
      }
      for (let j = 0; j < slice.length; j++) {
        const blk = results[j];
        if (!blk || !Array.isArray(blk.transactions)) {
          await admin
            .from("scanner_block_gaps")
            .update({ retries: 0 })
            .eq("id", slice[j].id);
          continue;
        }
        for (const tx of blk.transactions) {
          const toAddr = String(tx.to ?? "").toLowerCase();
          if (!toAddr || !walletToUser.has(toAddr)) continue;
          const raw = hexToBigInt(String(tx.value ?? "0x0"));
          if (raw === 0n) continue;
          candidates.push({
            tx_hash: String(tx.hash).toLowerCase(),
            block: Number(slice[j].block),
            from: String(tx.from ?? "").toLowerCase(),
            to: toAddr,
            amount: formatUnitsString(raw, 18),
            symbol: "BNB",
            source: "native",
          });
        }
        await admin
          .from("scanner_block_gaps")
          .update({ resolved_at: new Date().toISOString() })
          .eq("id", slice[j].id);
        gapsResolved++;
      }
    }

    console.log(`[scanner-rpc] stage=gapretry t=${Date.now() - started}ms`);

    // 8. Đối chiếu với DB rồi GHI phần còn thiếu (Giai đoạn 2)
    const hashes = [...new Set(candidates.map((c) => c.tx_hash))];

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

    const missing = candidates.filter((c) => !known.has(c.tx_hash));

    // Phát hiện nghi ngờ swap: cùng 1 tx_hash có ≥2 chân khác token ⇒ chỉ lưu
    // vết transactions, không tính quà tặng (policy chung của ingestTransfer).
    const symbolsByTx = new Map<string, Set<string>>();
    for (const c of missing) {
      const s = symbolsByTx.get(c.tx_hash) ?? new Set<string>();
      s.add(c.symbol);
      symbolsByTx.set(c.tx_hash, s);
    }

    let writtenTx = 0;
    let writtenDonation = 0;
    let ingestErrors = 0;
    for (const c of missing) {
      const recipient = walletToUser.get(c.to);
      const sender = walletToUser.get(c.from);
      const isSwapSuspect = (symbolsByTx.get(c.tx_hash)?.size ?? 0) > 1;
      const classification: IngestClassification = isSwapSuspect
        ? "swap_suspect"
        : sender
        ? "internal"
        : "external_in";
      try {
        const r = await ingestTransfer(admin, {
          tx_hash: c.tx_hash,
          block_number: c.block,
          from_address: c.from,
          to_address: c.to,
          token_symbol: c.symbol,
          token_address: TOKEN_ADDR_BY_SYMBOL[c.symbol] ?? null,
          amount_display: c.amount,
          usd_value: null,
          classification,
          matched_user_id: recipient?.id ?? null,
          sender_user_id: sender?.id ?? null,
          chain_id: CHAIN_ID,
        });
        if (r.transaction_written) writtenTx++;
        if (r.donation_written) writtenDonation++;
      } catch (e) {
        ingestErrors++;
        console.error(
          `[scanner-rpc] ingest lỗi tx ${c.tx_hash}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    if (missing.length > 0) {
      console.log(
        `[scanner-rpc] GHI ${missing.length} giao dịch thiếu: tx+${writtenTx} donations+${writtenDonation} lỗi=${ingestErrors}`,
      );
    }

    if (missing.length > 0) {
      console.log(
        `[scanner-rpc] LỆCH ${missing.length} giao dịch chưa có trong DB:`,
        JSON.stringify(missing.slice(0, 20)),
      );
      // Cảnh báo CHỦ ĐỘNG cho admin, dedupe 6h theo metadata->>source.
      // Bảng notifications chỉ có (user_id, actor_id, type, metadata) —
      // KHÔNG có title/content (bản cũ insert title/content nên lỗi âm thầm).
      const since = new Date(Date.now() - SCANNER_ALERT_DEDUPE_MS).toISOString();
      const { data: recent } = await admin
        .from("notifications")
        .select("id")
        .eq("type", "wallet_reconciliation_alert")
        .eq("metadata->>source", SCANNER_ALERT_SOURCE)
        .gte("created_at", since)
        .limit(1);
      if (!recent || recent.length === 0) {
        const { data: admins } = await admin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        const rows = buildScannerAlertRows(
          (admins ?? []).map((a) => String(a.user_id)),
          missing,
          candidates.length,
        );
        if (rows.length > 0) {
          const { error: notifErr } = await admin.from("notifications").insert(rows);
          if (notifErr) {
            console.error("[scanner-rpc] KHÔNG gửi được cảnh báo admin:", notifErr.message);
          } else {
            console.log(`[scanner-rpc] đã cảnh báo ${rows.length} admin`);
          }
        }
      }
    }

    // 8b. BẢN VÁ 2 — chỉ đẩy watermark SAU khi đối chiếu + cảnh báo đã xong.
    let watermarkAdvanced = false;
    for (const adv of pendingAdvances) {
      const { error: advErr } = await admin.rpc("scanner_watermark_advance", {
        p_chain_id: CHAIN_ID,
        p_source: adv.source,
        p_token_address: adv.token_address,
        p_last_block: adv.last_block,
        p_head_block: head,
      });
      if (advErr) {
        console.error(
          `[scanner-rpc] KHÔNG đẩy được watermark ${adv.source}:${adv.token_address ?? ""}:`,
          advErr.message,
        );
      } else {
        watermarkAdvanced = true;
      }
    }

    // 8c. BẢN VÁ 3 — ghi lịch sử tick để theo dõi độ ổn định (không bao giờ im lặng).
    const durationMs = Date.now() - started;
    const { error: tickErr } = await admin.from("scanner_tick_log").insert({
      chain_id: CHAIN_ID,
      mode: TICK_MODE,
      head_block: head,
      safe_head: safeHead,
      scanned_ranges: scanned,
      candidates: candidates.length,
      missing_in_db: missing.length,
      gap_blocks_added: [...new Set([...gapBlocks, ...erc20GapBlocks])].length,
      gaps_resolved: gapsResolved,
      watermark_advanced: watermarkAdvanced,
      wallets_tracked: walletToUser.size,
      rpc_healthy: rpc.healthy().length,
      rpc_endpoint_stats: rpc.endpointStats(),
      duration_ms: durationMs,
      ok: true,
    });
    if (tickErr) console.error("[scanner-rpc] không ghi được tick log:", tickErr.message);

    return new Response(
      JSON.stringify({
        ok: true,
        mode: TICK_MODE,
        head_block: head,
        safe_head: safeHead,
        scanned_ranges: scanned,
        wallets_tracked: walletToUser.size,
        custodial_wallets_added: custodialAdded,
        wallet_topic_batches: topicBatches.length,

        candidates: candidates.length,
        missing_in_db: missing.length,
        missing_sample: missing.slice(0, 20),
        gap_blocks_added: [...new Set(gapBlocks)].length,
        gaps_resolved: gapsResolved,
        watermark_advanced: watermarkAdvanced,
        rpc_healthy: rpc.healthy().length,
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[scanner-rpc] thất bại:", msg);
    try {
      await admin.from("scanner_tick_log").insert({
        chain_id: CHAIN_ID,
        mode: TICK_MODE,
        rpc_endpoint_stats: rpc.endpointStats(),
        duration_ms: Date.now() - started,
        ok: false,
        error_message: msg.slice(0, 500),
      });
    } catch (_) {
      // không để lỗi ghi log che lấp lỗi gốc
    }

    return new Response(
      JSON.stringify({
        ok: false,
        provider_unavailable: rpc.allDead(),
        error: msg,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
