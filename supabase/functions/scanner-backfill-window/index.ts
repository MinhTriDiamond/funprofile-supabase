// scanner-backfill-window — BƯỚC A của backfill vùng mù (CHỈ PREVIEW, KHÔNG ghi tài chính).
//
// Khác `admin-backfill-scan` (đi đường `eth_getLogs`, chậm): function này dùng
// `alchemy_getAssetTransfers` — 1 lượt gọi/ví cho TOÀN vùng mù, gộp ERC20 + native BNB.
//
// Bất biến:
// - Chỉ ghi `admin_backfill_jobs` + `admin_backfill_candidates` (bảng Preview).
//   TUYỆT ĐỐI không chạm `donations` / `transactions` / `wallet_transfers`.
// - Không đụng `scanner_watermarks` của cron sản xuất.
// - Số tiền đọc từ `rawContract.value` (hex) → BigInt string. KHÔNG dùng trường
//   `value` (float) của Alchemy.
// - Địa chỉ luôn lowercase. Phân loại dùng chung `scanCore.classifyCandidates`.
//
// POST { job_id, wallets_per_invoke? } — gọi lặp tới khi status = preview_ready.
import { corsHeaders, createAdminClient, json, requireUser } from "../_shared/httpAuth.ts";
import { alchemyUrl, formatUnitsString } from "../_shared/rpcClient.ts";
import {
  classifyCandidates,
  type RawCandidate,
  TOKENS,
} from "../_shared/scanCore.ts";

const DEFAULT_WALLETS_PER_INVOKE = 120;
const MAX_PAGES_PER_WALLET = 10;
const NATIVE_DECIMALS = 18;

interface AlchemyTransfer {
  hash: string;
  blockNum: string;
  from: string;
  to: string | null;
  asset: string | null;
  category: string;
  uniqueId: string;
  rawContract: { address: string | null; decimal: string | null; value: string | null };
}

async function fetchTransfers(
  url: string,
  wallet: string,
  fromBlock: string,
  toBlock: string,
): Promise<AlchemyTransfer[]> {
  const out: AlchemyTransfer[] = [];
  let pageKey: string | undefined;
  for (let page = 0; page < MAX_PAGES_PER_WALLET; page++) {
    const params: Record<string, unknown> = {
      fromBlock,
      toBlock,
      toAddress: wallet,
      category: ["erc20", "external"],
      excludeZeroValue: true,
      maxCount: "0x3e8",
      order: "asc",
    };
    if (pageKey) params.pageKey = pageKey;
    // Alchemy giới hạn CU/giây ⇒ thử lại có giãn cách khi 429 / rate limit.
    let res: Response | null = null;
    let body: { error?: { message?: string; code?: number }; result?: unknown } | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alchemy_getAssetTransfers", params: [params] }),
      });
      body = await res.json().catch(() => null);
      const msg = String(body?.error?.message ?? "");
      const rateLimited = res.status === 429 || body?.error?.code === 429 || /rate limit|capacity|compute unit/i.test(msg);
      if (!rateLimited) break;
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
    if (!res || !res.ok || body?.error) {
      throw new Error(
        `alchemy_getAssetTransfers lỗi (${res?.status ?? 0}): ${JSON.stringify(body?.error ?? {}).slice(0, 200)}`,
      );
    }
    const result = body?.result as { transfers?: AlchemyTransfer[]; pageKey?: string } | null;
    out.push(...(result?.transfers ?? []));
    pageKey = result?.pageKey;
    if (!pageKey) break;
  }
  return out;
}

/** uniqueId dạng `<hash>:log:497` hoặc `<hash>:external` → log_index ổn định. */
function logIndexOf(t: AlchemyTransfer): number {
  const m = /:log:(\d+)$/.exec(t.uniqueId ?? "");
  return m ? Number(m[1]) : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createAdminClient();
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.job_id ?? "");
    if (!jobId) return json({ ok: false, error: "thiếu job_id" }, 400);
    const perInvoke = Math.min(300, Number(body?.wallets_per_invoke ?? DEFAULT_WALLETS_PER_INVOKE));

    // 1. Chỉ admin thật (kiểm tra trong code, không chỉ dựa RLS)
    const user = await requireUser(req);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin !== true) return json({ ok: false, error: "Chỉ admin được chạy Preview backfill" }, 403);

    const url = alchemyUrl();
    if (!url) return json({ ok: false, error: "thiếu ALCHEMY_BSC_RPC_URL" }, 500);

    const { data: job } = await admin.from("admin_backfill_jobs").select("*").eq("id", jobId).maybeSingle();
    if (!job) return json({ ok: false, error: "không tìm thấy job" }, 404);
    if (!["queued", "scanning"].includes(String(job.status))) {
      return json({ ok: false, error: `job đang ở trạng thái ${job.status}` }, 409);
    }
    if (job.from_block === null || job.to_block === null) {
      return json({ ok: false, error: "job phải có from_block + to_block (chốt mốc trước)" }, 400);
    }
    const fromBlock = "0x" + Number(job.from_block).toString(16);
    const toBlock = "0x" + Number(job.to_block).toString(16);

    // 2. Danh sách ví hệ thống (giống scanner-rpc-tick)
    const [{ data: profiles }, { data: custodial }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, username, public_wallet_address, wallet_address, external_wallet_address")
        .or(
          "public_wallet_address.not.is.null,wallet_address.not.is.null,external_wallet_address.not.is.null",
        ),
      admin.from("custodial_wallets").select("user_id, wallet_address").not("wallet_address", "is", null),
    ]);
    const walletToUser = new Map<string, string>();
    for (const p of profiles ?? []) {
      for (const w of [p.public_wallet_address, p.wallet_address, p.external_wallet_address]) {
        if (typeof w === "string" && w.startsWith("0x")) walletToUser.set(w.toLowerCase(), p.id as string);
      }
    }
    for (const c of custodial ?? []) {
      const w = typeof c.wallet_address === "string" ? c.wallet_address.toLowerCase() : "";
      if (w.startsWith("0x") && !walletToUser.has(w)) walletToUser.set(w, String(c.user_id));
    }

    const scopeWallets = Array.isArray(job.wallets) && job.wallets.length > 0
      ? (job.wallets as string[]).map((w) => w.toLowerCase())
      : [...walletToUser.keys()];
    const allWallets = scopeWallets.slice().sort();

    const stats = (job.stats ?? {}) as Record<string, number>;
    const offset = Number(stats.wallet_offset ?? 0);
    const slice = allWallets.slice(offset, offset + perInvoke);
    if (slice.length === 0) {
      await admin.from("admin_backfill_jobs")
        .update({ status: "preview_ready", progress_pct: 100 })
        .eq("id", jobId);
      return json({ ok: true, status: "preview_ready", wallets_done: offset });
    }
    if (job.status === "queued") {
      await admin.from("admin_backfill_jobs").update({ status: "scanning" }).eq("id", jobId);
    }

    // 3. Quét: 1 lượt gọi/ví (gộp erc20 + native), phân trang khi cần
    const raws: RawCandidate[] = [];
    let calls = 0;
    let walletErrors = 0;
    for (const w of slice) {
      let transfers: AlchemyTransfer[] = [];
      try {
        transfers = await fetchTransfers(url, w, fromBlock, toBlock);
        calls++;
      } catch (e) {
        walletErrors++;
        console.error(`[backfill-window] ví ${w} lỗi:`, (e as Error).message);
        continue;
      }
      for (const t of transfers) {
        const to = (t.to ?? "").toLowerCase();
        if (!walletToUser.has(to)) continue;
        const tokenAddr = t.rawContract?.address ? t.rawContract.address.toLowerCase() : null;
        const isNative = t.category === "external" || tokenAddr === null;
        const meta = tokenAddr ? TOKENS[tokenAddr] : undefined;
        if (!isNative && !meta) continue; // token rác / ngoài danh mục
        const rawHex = t.rawContract?.value ?? "0x0";
        let rawValue: bigint;
        try {
          rawValue = BigInt(rawHex);
        } catch {
          continue;
        }
        if (rawValue === 0n) continue;
        const decimals = isNative ? NATIVE_DECIMALS : meta!.decimals;
        raws.push({
          tx_hash: t.hash.toLowerCase(),
          log_index: logIndexOf(t),
          block_number: Number(BigInt(t.blockNum)),
          from_address: (t.from ?? "").toLowerCase(),
          to_address: to,
          token_symbol: isNative ? "BNB" : meta!.symbol,
          token_address: isNative ? null : tokenAddr,
          amount_raw: rawValue.toString(),
          amount_display: formatUnitsString(rawValue, decimals),
        });
      }
    }

    // 4. Đối chiếu DB: hash nào đã có trong donations/transactions
    const hashes = [...new Set(raws.map((r) => r.tx_hash))];
    const knownHashes = new Set<string>();
    for (let i = 0; i < hashes.length; i += 200) {
      const chunk = hashes.slice(i, i + 200);
      const [d, t] = await Promise.all([
        admin.from("donations").select("tx_hash").in("tx_hash", chunk),
        admin.from("transactions").select("tx_hash").in("tx_hash", chunk),
      ]);
      for (const row of [...(d.data ?? []), ...(t.data ?? [])]) {
        if (row.tx_hash) knownHashes.add(String(row.tx_hash).toLowerCase());
      }
    }

    const classified = classifyCandidates(raws, new Set(walletToUser.keys()), knownHashes);
    const rows = classified.map((c) => ({
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
      classification: c.classification,
      matched_user_id: walletToUser.get(c.to_address) ?? null,
      skip_reason: c.skip_reason,
      selected: false,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin
        .from("admin_backfill_candidates")
        .upsert(rows.slice(i, i + 500), { onConflict: "job_id,tx_hash,log_index", ignoreDuplicates: true });
      if (error) throw new Error(`ghi candidate lỗi: ${error.message}`);
    }

    const nextOffset = offset + slice.length;
    const done = nextOffset >= allWallets.length;
    await admin.from("admin_backfill_jobs").update({
      status: done ? "preview_ready" : "scanning",
      progress_pct: Math.min(100, Math.round((nextOffset / allWallets.length) * 100)),
      stats: {
        ...stats,
        wallet_offset: nextOffset,
        wallets_total: allWallets.length,
        alchemy_calls: Number(stats.alchemy_calls ?? 0) + calls,
        cu_estimate: (Number(stats.alchemy_calls ?? 0) + calls) * 120,
        candidates_added: Number(stats.candidates_added ?? 0) + rows.length,
        wallet_errors: Number(stats.wallet_errors ?? 0) + walletErrors,
      },
    }).eq("id", jobId);

    return json({
      ok: true,
      status: done ? "preview_ready" : "scanning",
      wallets_scanned: slice.length,
      wallets_done: nextOffset,
      wallets_total: allWallets.length,
      alchemy_calls: calls,
      candidates_added: rows.length,
      wallet_errors: walletErrors,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
