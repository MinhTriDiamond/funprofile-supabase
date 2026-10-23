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
//
// v2 (23/10/2026) - xem docs/scanner-route-b-tiers-2026-10-23/:
// 1) Quét theo 3 TẦNG HOẠT ĐỘNG thay vì vòng tròn đều mọi ví: ví có giao
//    dịch 30 ngày qua (nóng) ghé mỗi 2 giờ, 31-90 ngày (ấm) mỗi 24 giờ,
//    còn lại (lạnh) mỗi 96 giờ. Lý do: bản v1 đốt hết 30M CU free của
//    Alchemy trong ~4 ngày (chân B im từ 19/10/2026 vì "Monthly capacity
//    limit exceeded") trong khi cả đời chỉ ghi được 27 donations mới -
//    85%+ ví hoàn toàn im lìm. Mô phỏng trên dữ liệu thật: ~7,8M CU/tháng.
// 2) Nhiều endpoint Alchemy luân phiên (ALCHEMY_BSC_RPC_URLS): endpoint
//    nào hết hạn mức tháng thì tự chuyển sang endpoint kế tiếp.
// 3) Đọc watermark theo trang - sửa lỗi trần 1.000 dòng của PostgREST.

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

/**
 * Danh sách endpoint Alchemy: ưu tiên biến ALCHEMY_BSC_RPC_URLS (nhiều URL
 * cách nhau bằng dấu phẩy - mỗi URL thuộc một tài khoản Alchemy riêng thì có
 * hạn mức free riêng), không có thì dùng biến đơn ALCHEMY_BSC_RPC_URL cũ.
 * LƯU Ý: nhiều app/key trong CÙNG một tài khoản Alchemy vẫn dùng chung một
 * hạn mức tháng của tài khoản đó - muốn cộng dồn hạn mức free thì các URL
 * phải thuộc các tài khoản khác nhau.
 */
function alchemyUrls(): string[] {
  const multi = (Deno.env.get("ALCHEMY_BSC_RPC_URLS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("https://"));
  if (multi.length > 0) return [...new Set(multi)];
  const single = (Deno.env.get("ALCHEMY_BSC_RPC_URL") ?? "").trim();
  return single.startsWith("https://") ? [single] : [];
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

interface EndpointStat {
  attempts: number;
  failures: number;
  quotaDead: boolean;
}

/** Nhóm endpoint Alchemy dùng chung cho cả một lượt quét. */
interface RpcPool {
  urls: string[];
  dead: Set<number>;
  stats: EndpointStat[];
  cursor: number;
}

function makePool(urls: string[]): RpcPool {
  return {
    urls,
    dead: new Set(),
    stats: urls.map(() => ({ attempts: 0, failures: 0, quotaDead: false })),
    cursor: 0,
  };
}

/** Chọn endpoint còn sống kế tiếp theo vòng tròn; -1 nếu tất cả đã chết hạn mức. */
function nextEndpoint(pool: RpcPool): number {
  for (let i = 0; i < pool.urls.length; i++) {
    const idx = (pool.cursor + i) % pool.urls.length;
    if (!pool.dead.has(idx)) {
      pool.cursor = idx + 1;
      return idx;
    }
  }
  return -1;
}

async function alchemyRpc(
  pool: RpcPool,
  method: string,
  // deno-lint-ignore no-explicit-any
  params: any[],
  // deno-lint-ignore no-explicit-any
): Promise<any> {
  // - Hết hạn mức tháng ở một endpoint: đánh dấu chết cho lượt này và chuyển
  //   ngay sang endpoint khác (không lùi nhịp, không thử lại endpoint đó).
  // - Trần tốc độ (429/compute units mỗi giây): lùi nhịp rồi thử lại.
  // - Lỗi khác: giữ nguyên hành vi cũ - thử lại có lùi nhịp rồi bỏ cuộc.
  const BACKOFFS_MS = [800, 2000, 4500];
  let lastError: Error | null = null;
  const maxAttempts = pool.urls.length + BACKOFFS_MS.length;
  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const idx = nextEndpoint(pool);
    if (idx < 0) {
      throw lastError ??
        new Error("alchemy rpc failed: all endpoints out of monthly capacity");
    }
    const stat = pool.stats[idx];
    stat.attempts++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
    let backoff = false;
    try {
      const res = await fetch(pool.urls[idx], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json && !json.error) return json.result;
      const msg = String(json?.error?.message ?? `http=${res.status}`);
      lastError = new Error(`alchemy ${method} err=${msg}`);
      stat.failures++;
      if (/monthly capacity|capacity limit|quota/i.test(msg)) {
        pool.dead.add(idx);
        stat.quotaDead = true;
        continue;
      }
      const rateLimited = res.status === 429 ||
        /rate|compute units|too many requests/i.test(msg);
      if (!rateLimited) throw lastError;
      backoff = true;
    } catch (e) {
      if (e === lastError) throw e;
      lastError = e instanceof Error ? e : new Error(String(e));
      stat.failures++;
      backoff = true;
    } finally {
      clearTimeout(timer);
    }
    if (attempt === maxAttempts) throw lastError;
    if (backoff) {
      await new Promise((r) =>
        setTimeout(r, BACKOFFS_MS[Math.min(attempt, BACKOFFS_MS.length - 1)])
      );
    }
  }
  throw lastError ?? new Error("alchemy rpc failed");
}

/** Lấy toàn bộ transfers VÀO một ví trong [fromBlock, toBlock] (có trần trang). */
async function fetchInbound(
  pool: RpcPool,
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
      const result: any = await alchemyRpc(pool, "alchemy_getAssetTransfers", [
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

  const urls = alchemyUrls();
  if (urls.length === 0) {
    return json({
      ok: false,
      skipped: true,
      reason: "alchemy_url_missing_or_invalid",
    });
  }
  const pool = makePool(urls);

  const admin = createAdminClient();
  // deno-lint-ignore no-explicit-any
  const summary: Record<string, any> = {
    ok: true,
    route: "transfers_b",
    at: new Date().toISOString(),
  };

  try {
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

    // ── Watermark riêng: đọc TOÀN BỘ theo trang ──
    // PostgREST trần 1.000 dòng/lượt mà bảng đã vượt 1.000 ví - cách đọc cũ
    // bỏ sót các ví cuối bảng (cũng là lỗi khiến vòng quét "giậm chân" được
    // ghi nhận ngày 14/10/2026). updated_at của mỗi dòng = lần ghé thăm ví
    // gần nhất, dùng cho nhịp quét theo tầng bên dưới.
    const wm = new Map<string, number>();
    const lastVisit = new Map<string, number>();
    for (let off = 0; ; off += 1000) {
      const { data } = await admin.from(WM_TABLE)
        .select("wallet_address, last_block, updated_at")
        .order("wallet_address")
        .range(off, off + 999);
      const rows = data ?? [];
      for (const r of rows) {
        // deno-lint-ignore no-explicit-any
        const a = String((r as any).wallet_address).toLowerCase();
        // deno-lint-ignore no-explicit-any
        wm.set(a, Number((r as any).last_block));
        // deno-lint-ignore no-explicit-any
        const v = new Date(String((r as any).updated_at)).getTime();
        if (Number.isFinite(v)) lastVisit.set(a, v);
      }
      if (rows.length < 1000) break;
    }

    // ── Hoạt động gần nhất của từng địa chỉ (transactions 90 ngày qua) ──
    const since90 = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const lastActivity = new Map<string, number>();
    for (let off = 0; ; off += 1000) {
      const { data } = await admin.from("transactions")
        .select("from_address, to_address, created_at")
        .gte("created_at", since90)
        .order("created_at", { ascending: false })
        .range(off, off + 999);
      const rows = data ?? [];
      for (const r of rows) {
        // deno-lint-ignore no-explicit-any
        const ts = new Date(String((r as any).created_at)).getTime();
        for (
          const a of [
            // deno-lint-ignore no-explicit-any
            (r as any).from_address,
            // deno-lint-ignore no-explicit-any
            (r as any).to_address,
          ]
        ) {
          if (typeof a === "string" && a) {
            const k = a.toLowerCase();
            // Sắp xếp giảm dần theo thời gian: lần gặp đầu tiên là mới nhất.
            if (!lastActivity.has(k)) lastActivity.set(k, ts);
          }
        }
      }
      if (rows.length < 1000) break;
    }

    // ── Chia 3 tầng hoạt động ──
    // Đếm và gắn tầng TRƯỚC khi gọi Alchemy, để lượt chạy vẫn báo cáo được
    // tình hình kể cả khi Alchemy đang hết hạn mức tháng.
    const NOW = Date.now();
    const DAY_MS = 24 * 3600 * 1000;
    const tierRankOf = new Map<string, number>(); // 0 nóng, 1 ấm, 2 lạnh
    const tierCounts = { hot: 0, warm: 0, cold: 0 };
    for (const w of walletToUser.keys()) {
      const act = lastActivity.get(w);
      const rank = act !== undefined && NOW - act <= 30 * DAY_MS
        ? 0
        : act !== undefined && NOW - act <= 90 * DAY_MS
        ? 1
        : 2;
      tierRankOf.set(w, rank);
      if (rank === 0) tierCounts.hot++;
      else if (rank === 1) tierCounts.warm++;
      else tierCounts.cold++;
    }
    summary.tiers = tierCounts;
    summary.alchemy_endpoints = urls.length;

    const head = parseInt(await alchemyRpc(pool, "eth_blockNumber", []), 16);
    const safeHead = Math.max(0, head - REORG_BUFFER);
    summary.head_block = head;
    summary.safe_head = safeHead;

    // ── Mốc bắt đầu mặc định cho ví chưa có watermark = vị trí chân chính ──
    const { data: mainWm } = await admin.from("scanner_watermarks").select(
      "last_block",
    );
    const defaultStart = Math.min(
      safeHead,
      ...(mainWm ?? []).map((r) => Number(r.last_block)),
    );
    summary.default_start_block = defaultStart;

    // ── Chọn lô ví theo tầng: chỉ ví ĐẾN HẠN mới được quét ──
    // Nhịp ghé thăm: nóng mỗi 2 giờ, ấm mỗi 24 giờ, lạnh mỗi 96 giờ (4 ngày).
    // Ưu tiên trong lô: tầng nóng trước, quá hạn lâu nhất trước,
    // watermark thấp nhất trước. Mô phỏng trên dữ liệu thật 23/10/2026:
    // khoảng 7,8M CU/tháng - vừa gói free 30M CU với dư địa gấp ~4 lần.
    const VISIT_INTERVAL_MS = [
      2 * 3600 * 1000,
      24 * 3600 * 1000,
      96 * 3600 * 1000,
    ];
    const dueList: {
      wallet: string;
      from: number;
      rank: number;
      overdue: number;
    }[] = [];
    for (const w of walletToUser.keys()) {
      const rank = tierRankOf.get(w) ?? 2;
      const visited = lastVisit.get(w);
      if (visited === undefined || NOW - visited >= VISIT_INTERVAL_MS[rank]) {
        dueList.push({
          wallet: w,
          from: wm.get(w) ?? defaultStart,
          rank,
          overdue: visited === undefined
            ? Number.MAX_SAFE_INTEGER
            : NOW - visited,
        });
      }
    }
    dueList.sort((a, b) =>
      a.rank - b.rank || b.overdue - a.overdue || a.from - b.from
    );
    const batchDue = dueList.slice(0, BATCH_WALLETS);
    const sweepList = batchDue.map(({ wallet, from }) => ({ wallet, from }));
    summary.due_now = dueList.length;
    summary.batch_tiers = {
      hot: batchDue.filter((d) => d.rank === 0).length,
      warm: batchDue.filter((d) => d.rank === 1).length,
      cold: batchDue.filter((d) => d.rank === 2).length,
    };

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
          pool,
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

    summary.watermarks_advanced = advanceTo.size;
    summary.endpoints_dead = pool.dead.size;
    summary.duration_ms = Date.now() - started;

    // ── Ghi telemetry TRƯỚC khi chốt watermark (best-effort) ──
    // để mọi lượt chạy đều để lại dấu vết quan sát được, kể cả khi
    // bước chốt watermark gặp lỗi.
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
        rpc_healthy: pool.urls.length - pool.dead.size,
        duration_ms: summary.duration_ms,
        ok: walletErrors === 0,
        error_message: walletErrors > 0 ? `${walletErrors} ví lỗi RPC` : null,
        rpc_endpoint_stats: pool.stats.map((s, i) => ({
          url: `alchemy#${i + 1}`,
          attempts: s.attempts,
          failures: s.failures,
          timeouts: 0,
        })),
      });
    } catch (_) {
      // Telemetry lỗi không được làm hỏng lượt quét.
    }

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

    return json(summary);
  } catch (e) {
    summary.ok = false;
    summary.error = e instanceof Error ? e.message : String(e);
    summary.endpoints_dead = pool.dead.size;
    summary.duration_ms = Date.now() - started;
    return json(summary, 500);
  }
});
