// scanner-transfers-tick — Chân quét BỔ SUNG cho scanner-rpc-tick (Route B).
//
// Vì sao tồn tại: gói Alchemy free giới hạn eth_getLogs ở 10 block/lần nên
// chân quét chính (scanner-rpc-tick) phải dựa vào endpoint công cộng yếu.
// API `alchemy_getAssetTransfers` KHÔNG bị trần đó ngay trên gói free
// (đo thật 13/10/2026: dải 50.000 block trả kết quả ~0,4s) ⇒ chân này quét
// theo TỪNG VÍ người dùng bằng API transfers để bắt donations song song
// với chân chính, dùng CHUNG:
//   - constants + phân loại: ../_shared/scanCore.ts (classifyCandidates)
//   - bộ ghi + policy:       ../_shared/ingestTransfer.ts (idempotent
//     theo (tx_hash, user_id) ⇒ hai chân ghi trùng nhau vẫn an toàn)
//   - bản đồ ví → user: cùng truy vấn profiles + custodial_wallets như tick.
//
// Phạm vi v1: chỉ chiều VÀO (toAddress = ví hệ thống) — đúng bản chất
// donations. Chiều ra vẫn do chân getLogs phụ trách.
//
// Watermark RIÊNG theo ví ở bảng `scanner_transfers_watermarks`
// (scanner_watermarks của chân chính khóa theo token, không theo ví).

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import {
  CHAIN_ID,
  TOKENS,
  classifyCandidates,
  type RawCandidate,
} from "../_shared/scanCore.ts";
import { ingestTransfer } from "../_shared/ingestTransfer.ts";

const WM_TABLE = "scanner_transfers_watermarks";
const REORG_BUFFER = 15;
/** Số ví quét mỗi lượt chạy — quét vòng tròn, ví "cũ nhất" trước. */
const BATCH_WALLETS = 48;
/** Trần trang (1.000 transfers/trang) cho mỗi ví mỗi lượt. */
const MAX_PAGES_PER_WALLET = 10;
const PAGE_SIZE = "0x3e8"; // 1000
/** Ngân sách mềm: hết thì dừng nhận ví mới, vẫn chốt sổ lượt chạy. */
const TIME_BUDGET_MS = 110_000;
const RPC_TIMEOUT_MS = 25_000;

const TOKEN_ADDRS = Object.keys(TOKENS);
const SYMBOL_BY_ADDR = new Map(
  Object.entries(TOKENS).map(([addr, m]) => [addr, m.symbol]),
);
const DECIMALS_BY_ADDR = new Map(
  Object.entries(TOKENS).map(([addr, m]) => [addr, m.decimals]),
);

/**
 * Guard cho cron — cùng ngữ nghĩa các hàm cron khác trong hệ:
 * hoặc header `x-cron-secret` khớp CRON_SHARED_SECRET (fallback CRON_SECRET),
 * hoặc `Authorization: Bearer` khớp SUPABASE_PUBLISHABLE_KEY (fallback
 * SUPABASE_ANON_KEY) — đúng dạng job cron 72 đang dùng.
 */
function cronAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SHARED_SECRET") ??
    Deno.env.get("CRON_SECRET");
  const presented = req.headers.get("x-cron-secret");
  if (cronSecret && presented && presented === cronSecret) return true;
  const token = (req.headers.get("Authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  const pub = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY");
  return !!(pub && token && token === pub);
}

function alchemyUrl(): string | null {
  const u = (Deno.env.get("ALCHEMY_BSC_RPC_URL") ?? "").trim();
  return u.startsWith("https://") ? u : null;
}

function hex(n: number): string {
  return "0x" + n.toString(16);
}

/** Chuỗi raw (uint256 dạng thập phân) → chuỗi hiển thị theo decimals, không float. */
export function formatAmount(rawDecimal: string, decimals: number): string {
  const v = BigInt(rawDecimal);
  if (decimals === 0) return v.toString();
  const base = 10n ** BigInt(decimals);
  const int = v / base;
  const frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int.toString();
}

interface AlchemyTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string;
  rawContract?: { value?: string; address?: string | null; decimals?: string | number };
}

async function alchemyRpc(
  url: string,
  method: string,
  // deno-lint-ignore no-explicit-any
  params: any[],
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: ctrl.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.error) {
      throw new Error(
        `alchemy ${method} http=${res.status} err=${
          json?.error?.message ?? "no-body"
        }`,
      );
    }
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

/** Lấy toàn bộ transfers VÀO một ví trong [fromBlock, toBlock] (có trần trang). */
async function fetchInbound(
  url: string,
  wallet: string,
  fromBlock: number,
  toBlock: number,
): Promise<{ transfers: AlchemyTransfer[]; complete: boolean }> {
  const out: AlchemyTransfer[] = [];
  // Hai truy vấn: ERC-20 của 4 token hệ thống + native BNB (external).
  const queries: Record<string, unknown>[] = [
    {
      fromBlock: hex(fromBlock),
      toBlock: hex(toBlock),
      toAddress: wallet,
      contractAddresses: TOKEN_ADDRS,
      category: ["erc20"],
      order: "asc",
      withMetadata: false,
      excludeZeroValue: true,
      maxCount: PAGE_SIZE,
    },
    {
      fromBlock: hex(fromBlock),
      toBlock: hex(toBlock),
      toAddress: wallet,
      category: ["external"],
      order: "asc",
      withMetadata: false,
      excludeZeroValue: true,
      maxCount: PAGE_SIZE,
    },
  ];
  let complete = true;
  for (const q of queries) {
    let pageKey: string | undefined;
    let pages = 0;
    do {
      const params = pageKey ? { ...q, pageKey } : q;
      // deno-lint-ignore no-explicit-any
      const result: any = await alchemyRpc(url, "alchemy_getAssetTransfers", [
        params,
      ]);
      const batch: AlchemyTransfer[] = result?.transfers ?? [];
      out.push(...batch);
      pageKey = result?.pageKey;
      pages++;
      if (pageKey && pages >= MAX_PAGES_PER_WALLET) {
        complete = false;
        break;
      }
    } while (pageKey);
  }
  return { transfers: out, complete };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const started = Date.now();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (!cronAuthorized(req)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const url = alchemyUrl();
  if (!url) {
    return json({
      ok: false,
      skipped: true,
      reason: "alchemy_url_missing_or_invalid",
    });
  }

  const admin = createAdminClient();
  // deno-lint-ignore no-explicit-any
  const summary: Record<string, any> = {
    ok: true,
    route: "transfers_b",
    at: new Date().toISOString(),
  };

  try {
    const head = parseInt(await alchemyRpc(url, "eth_blockNumber", []), 16);
    const safeHead = Math.max(0, head - REORG_BUFFER);
    summary.head_block = head;
    summary.safe_head = safeHead;

    // ── Bản đồ ví → user (cùng nguồn với scanner-rpc-tick) ──
    const [profilesRes, custodialRes] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "id, username, public_wallet_address, wallet_address, external_wallet_address",
        )
        .or(
          "public_wallet_address.not.is.null,wallet_address.not.is.null,external_wallet_address.not.is.null",
        ),
      admin
        .from("custodial_wallets")
        .select("user_id, wallet_address")
        .not("wallet_address", "is", null),
    ]);
    const walletToUser = new Map<string, { id: string; username: string }>();
    for (const p of profilesRes.data ?? []) {
      for (
        const w of [
          // deno-lint-ignore no-explicit-any
          (p as any).public_wallet_address,
          // deno-lint-ignore no-explicit-any
          (p as any).wallet_address,
          // deno-lint-ignore no-explicit-any
          (p as any).external_wallet_address,
        ]
      ) {
        if (typeof w === "string" && w.trim()) {
          walletToUser.set(w.toLowerCase(), {
            // deno-lint-ignore no-explicit-any
            id: String((p as any).id),
            // deno-lint-ignore no-explicit-any
            username: String((p as any).username ?? ""),
          });
        }
      }
    }
    for (const c of custodialRes.data ?? []) {
      // deno-lint-ignore no-explicit-any
      const w = typeof (c as any).wallet_address === "string"
        // deno-lint-ignore no-explicit-any
        ? (c as any).wallet_address.toLowerCase()
        : "";
      if (!w || walletToUser.has(w)) continue;
      // deno-lint-ignore no-explicit-any
      walletToUser.set(w, { id: String((c as any).user_id), username: "custodial" });
    }
    summary.wallets_tracked = walletToUser.size;

    // ── Watermark riêng + mốc bắt đầu mặc định = vị trí chân chính ──
    const { data: wmRows } = await admin.from(WM_TABLE).select(
      "wallet_address, last_block",
    );
    const wm = new Map<string, number>(
      (wmRows ?? []).map((r) => [
        // deno-lint-ignore no-explicit-any
        String((r as any).wallet_address).toLowerCase(),
        // deno-lint-ignore no-explicit-any
        Number((r as any).last_block),
      ]),
    );
    const { data: mainWm } = await admin.from("scanner_watermarks").select(
      "last_block",
    );
    const defaultStart = Math.min(
      safeHead,
      ...(mainWm ?? []).map((r) => Number(r.last_block)),
    );
    summary.default_start_block = defaultStart;

    // ── Chọn lô ví: chưa quét bao giờ trước, rồi watermark thấp nhất ──
    const sweepList = [...walletToUser.keys()]
      .map((w) => ({ wallet: w, from: wm.get(w) ?? defaultStart }))
      .sort((a, b) => a.from - b.from)
      .slice(0, BATCH_WALLETS);

    const raws: RawCandidate[] = [];
    const advanceTo = new Map<string, number>();
    let walletsSwept = 0;
    let walletErrors = 0;

    for (const { wallet, from } of sweepList) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        summary.stopped_early = "time_budget";
        break;
      }
      if (from >= safeHead) {
        advanceTo.set(wallet, safeHead);
        walletsSwept++;
        continue;
      }
      try {
        const { transfers, complete } = await fetchInbound(
          url,
          wallet,
          from + 1,
          safeHead,
        );
        let lastSeenBlock = from;
        for (const t of transfers) {
          const block = parseInt(t.blockNum, 16);
          if (Number.isFinite(block)) {
            lastSeenBlock = Math.max(lastSeenBlock, block);
          }
          const rawHex = t.rawContract?.value;
          if (!rawHex) continue;
          const rawDec = BigInt(rawHex).toString();
          const addr = (t.rawContract?.address ?? null)?.toLowerCase() ?? null;
          if (addr) {
            const symbol = SYMBOL_BY_ADDR.get(addr);
            if (!symbol) continue; // token ngoài hệ thống — bỏ qua
            raws.push({
              tx_hash: t.hash.toLowerCase(),
              log_index: 0,
              block_number: block,
              from_address: t.from.toLowerCase(),
              to_address: t.to.toLowerCase(),
              token_symbol: symbol,
              token_address: addr,
              amount_raw: rawDec,
              amount_display: formatAmount(
                rawDec,
                DECIMALS_BY_ADDR.get(addr) ?? 18,
              ),
            });
          } else {
            // Native BNB (category external, rawContract.address = null)
            raws.push({
              tx_hash: t.hash.toLowerCase(),
              log_index: 0,
              block_number: block,
              from_address: t.from.toLowerCase(),
              to_address: t.to.toLowerCase(),
              token_symbol: "BNB",
              token_address: null,
              amount_raw: rawDec,
              amount_display: formatAmount(rawDec, 18),
            });
          }
        }
        advanceTo.set(
          wallet,
          complete ? safeHead : Math.max(from, lastSeenBlock - 1),
        );
        walletsSwept++;
      } catch (e) {
        walletErrors++;
        console.error(
          `[scanner-transfers] ví ${wallet} lỗi:`,
          e instanceof Error ? e.message : e,
        );
        // Không advance watermark của ví lỗi — lượt sau quét lại.
      }
    }
    summary.wallets_swept = walletsSwept;
    summary.wallet_errors = walletErrors;
    summary.candidates = raws.length;

    // ── Đối chiếu hash đã có (cùng mẫu với scanner-rpc-tick) ──
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

    // ── Phân loại bằng lõi chung + ghi qua bộ ghi chung ──
    const classified = classifyCandidates(
      raws,
      new Set(walletToUser.keys()),
      known,
    );
    let writtenTx = 0;
    let writtenDonations = 0;
    let ingestErrors = 0;
    const byClass: Record<string, number> = {};
    for (const c of classified) {
      byClass[c.classification] = (byClass[c.classification] ?? 0) + 1;
      if (
        c.classification === "dust_filtered" ||
        c.classification === "already_in_db"
      ) {
        continue;
      }
      const recipient = walletToUser.get(c.to_address.toLowerCase());
      const sender = walletToUser.get(c.from_address.toLowerCase());
      try {
        const r = await ingestTransfer(admin, {
          tx_hash: c.tx_hash,
          block_number: c.block_number,
          from_address: c.from_address,
          to_address: c.to_address,
          token_symbol: c.token_symbol,
          token_address: c.token_address,
          amount_display: c.amount_display,
          usd_value: null,
          classification: c.classification,
          matched_user_id: recipient?.id ?? null,
          sender_user_id: sender?.id ?? null,
          chain_id: CHAIN_ID,
        });
        if (r.transaction_written) writtenTx++;
        if (r.donation_written) writtenDonations++;
      } catch (e) {
        ingestErrors++;
        console.error(
          `[scanner-transfers] ingest lỗi tx ${c.tx_hash}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    summary.by_classification = byClass;
    summary.transactions_written = writtenTx;
    summary.donations_written = writtenDonations;
    summary.ingest_errors = ingestErrors;

    // ── Chốt watermark cho các ví đã quét ──
    if (advanceTo.size > 0) {
      const rows = [...advanceTo.entries()].map(([wallet_address, last_block]) => ({
        wallet_address,
        last_block,
        updated_at: new Date().toISOString(),
      }));
      const { error: wmErr } = await admin.from(WM_TABLE).upsert(rows, {
        onConflict: "wallet_address",
      });
      if (wmErr) throw new Error(`ghi watermark lỗi: ${wmErr.message}`);
    }
    summary.watermarks_advanced = advanceTo.size;
    summary.duration_ms = Date.now() - started;

    // ── Ghi một dòng telemetry vào scanner_tick_log (best-effort) ──
    try {
      await admin.from("scanner_tick_log").insert({
        chain_id: CHAIN_ID,
        mode: "transfers_route_b",
        head_block: head,
        safe_head: safeHead,
        scanned_ranges: { wallets: walletsSwept, batch: BATCH_WALLETS },
        candidates: raws.length,
        missing_in_db: writtenDonations,
        gap_blocks_added: 0,
        gaps_resolved: 0,
        watermark_advanced: advanceTo.size > 0,
        wallets_tracked: walletToUser.size,
        rpc_healthy: 1,
        duration_ms: summary.duration_ms,
        ok: true,
        error_message: null,
        rpc_endpoint_stats: [{ url: "alchemy(***)", attempts: 1, failures: 0, timeouts: 0 }],
      });
    } catch (_) {
      // Telemetry lỗi không được làm hỏng lượt quét.
    }

    return json(summary);
  } catch (e) {
    summary.ok = false;
    summary.error = e instanceof Error ? e.message : String(e);
    summary.duration_ms = Date.now() - started;
    return json(summary, 500);
  }
});
