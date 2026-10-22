// verify-pending-donations — Bộ xác thực giao dịch tặng quà phía server.
// Dự án: docs/donation-verification-flow-2026-10-22/ (THIET-KE.md Mục 4 + Mục 8).
//
// HAI CHẾ ĐỘ (biến môi trường DONATION_VERIFY_ENFORCE):
//  - "false" (mặc định) = SHADOW: đối chiếu các donation client mới tạo, chỉ GHI LOG verdict
//    vào donation_verification_log, tuyệt đối không đổi trạng thái, không chặn gì.
//  - "true" = ENFORCE: xử lý các dòng status='pending_verification' — khớp thì server chuyển
//    'confirmed' (amount_usd để NULL cho pipeline repricing sẵn có tính giá trị chính thức),
//    quá hạn 24 giờ không khớp / khớp sai mạnh thì 'rejected_unverified' + gắn cờ integrity.
//
// Nguyên tắc: chỉ đối chiếu bằng tx_hash trên đúng chain (Moralis verbose tx + giải mã log
// Transfer như recover-donations-from-chain đang làm). Địa chỉ ví lấy từ CHÍNH giao dịch chuỗi;
// phía nào chưa biết ví (profile chưa có wallet_address) thì hạ verdict xuống 'match_partial'
// thay vì reject oan. Lỗi nhà cung cấp (Moralis unavailable) = verdict 'error', không đổi trạng thái.
//
// Điều kiện tiên quyết: bảng donation_verification_log (sql/03) đã tạo; lịch chạy do người
// thi hành production nối pg_cron theo nhịp fast-scan (1–3 phút) khi deploy.

import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { moralisFetch, isMoralisUnavailable } from "../_shared/moralisFetch.ts";

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const DEADLINE_HOURS = 24;
const BATCH_LIMIT = 50;
const SHADOW_WINDOW_HOURS = 26;

// Decimals theo symbol (khớp auto-scan-donations). Contract lấy từ tokens_registry (SoT).
const DECIMALS_BY_SYMBOL: Record<string, number> = {
  USDT: 18, BTCB: 18, CAMLY: 3, FUN: 18, BNB: 18,
};

interface DonationRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  amount: string;
  token_symbol: string;
  token_address: string | null;
  chain_id: number | null;
  chain_family: string | null;
  tx_hash: string;
  status: string;
  sender_address: string | null;
  recipient_address: string | null;
  created_at: string;
  pending_verification_since: string | null;
}

type Verdict = "match" | "match_partial" | "mismatch" | "not_found" | "error";

interface EvalResult {
  verdict: Verdict;
  reason: string;
  evidence: Record<string, unknown>;
}

function chainParam(chainId: number | null): string | null {
  if (chainId === 56) return "bsc";
  if (chainId === 97) return "bsc%20testnet";
  return null; // chain khác: ngoài phạm vi đợt này
}

function addrFromTopic(topic: string): string {
  return ("0x" + topic.slice(26)).toLowerCase();
}

function amountsMatch(declared: string, rawValue: bigint, decimals: number): boolean {
  const declaredNum = Number.parseFloat(declared);
  if (!Number.isFinite(declaredNum)) return false;
  const onChainNum = Number(rawValue) / 10 ** decimals;
  const diff = Math.abs(onChainNum - declaredNum);
  return diff <= Math.max(declaredNum * 0.005, 1e-9); // dung sai 0.5% cho làm tròn hiển thị
}

async function evaluateDonation(
  admin: ReturnType<typeof createAdminClient>,
  d: DonationRow,
  registry: Map<string, { symbol: string }>,
): Promise<EvalResult> {
  const chain = chainParam(d.chain_id);
  if (!chain) return { verdict: "error", reason: `unsupported_chain:${d.chain_id}`, evidence: {} };
  if (d.chain_family !== "evm") return { verdict: "error", reason: `out_of_scope_family:${d.chain_family}`, evidence: {} };

  const url = `${MORALIS_BASE}/transaction/${d.tx_hash}/verbose?chain=${chain}`;
  let tx: Record<string, unknown>;
  try {
    const res = await moralisFetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) return { verdict: "not_found", reason: "tx_not_found_on_chain", evidence: {} };
    if (!res.ok) {
      return { verdict: "error", reason: `moralis_http_${res.status}`, evidence: {} };
    }
    tx = await res.json();
  } catch (e) {
    return { verdict: "error", reason: `moralis_fetch_failed:${(e as Error).message}`, evidence: {} };
  }
  if (isMoralisUnavailable()) {
    return { verdict: "error", reason: "moralis_unavailable", evidence: {} };
  }

  const symbol = (d.token_symbol || "").toUpperCase();
  const decimals = DECIMALS_BY_SYMBOL[symbol];
  if (decimals === undefined) return { verdict: "error", reason: `unknown_token:${symbol}`, evidence: {} };

  const evidence: Record<string, unknown> = { tx_from: tx.from_address, tx_to: tx.to_address };

  // Ví kỳ vọng (nếu profile đã có). Thiếu ví != reject — chỉ hạ mức chắc chắn.
  const [{ data: senderProfile }, { data: recipientProfile }] = await Promise.all([
    admin.from("profiles").select("wallet_address").eq("id", d.sender_id).maybeSingle(),
    admin.from("profiles").select("wallet_address").eq("id", d.recipient_id).maybeSingle(),
  ]);
  const expectedTo = (d.recipient_address || recipientProfile?.wallet_address || "").toLowerCase();
  const expectedFrom = (d.sender_address || senderProfile?.wallet_address || "").toLowerCase();

  // Native BNB: dùng thẳng from/to/value của giao dịch.
  if (symbol === "BNB" && !d.token_address) {
    const raw = BigInt(String(tx.value ?? "0"));
    if (!amountsMatch(d.amount, raw, decimals)) {
      return { verdict: "mismatch", reason: "amount_mismatch_native", evidence: { ...evidence, on_chain_value: String(tx.value) } };
    }
    const to = String(tx.to_address ?? "").toLowerCase();
    const from = String(tx.from_address ?? "").toLowerCase();
    if (expectedTo && to !== expectedTo) return { verdict: "mismatch", reason: "recipient_mismatch", evidence };
    if (expectedFrom && from !== expectedFrom) return { verdict: "mismatch", reason: "sender_mismatch", evidence };
    const partial = !expectedTo || !expectedFrom;
    return { verdict: partial ? "match_partial" : "match", reason: partial ? "wallet_side_unknown" : "native_match", evidence };
  }

  // ERC20: tìm log Transfer của đúng contract trong registry.
  const contract = (d.token_address || "").toLowerCase();
  if (!contract || !registry.has(contract)) {
    return { verdict: "error", reason: `token_not_in_registry:${contract}`, evidence };
  }
  const logs = (tx.logs as Array<Record<string, unknown>> | undefined) ?? [];
  let sawAnyTransfer = false;
  for (const log of logs) {
    const topics = (log.topic0 !== undefined)
      ? [log.topic0, log.topic1, log.topic2, log.topic3].map((t) => String(t ?? ""))
      : ((log.topics as string[] | undefined) ?? []);
    if ((topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) continue;
    if (String(log.address ?? "").toLowerCase() !== contract) continue;
    sawAnyTransfer = true;
    const from = addrFromTopic(topics[1] ?? "");
    const to = addrFromTopic(topics[2] ?? "");
    const raw = BigInt(String(log.data ?? "0x0"));
    if (!amountsMatch(d.amount, raw, decimals)) continue; // có thể là transfer khác trong cùng tx (FunDisperse)
    if (expectedTo && to !== expectedTo) continue; // transfer của người nhận khác trong cùng tx
    if (expectedFrom && from !== expectedFrom) {
      return { verdict: "mismatch", reason: "sender_mismatch", evidence: { ...evidence, transfer_from: from, transfer_to: to } };
    }
    const partial = !expectedTo || !expectedFrom;
    return {
      verdict: partial ? "match_partial" : "match",
      reason: partial ? "wallet_side_unknown" : "erc20_match",
      evidence: { ...evidence, transfer_from: from, transfer_to: to, raw_value: raw.toString() },
    };
  }
  if (!sawAnyTransfer) return { verdict: "mismatch", reason: "no_transfer_for_token_in_tx", evidence };
  return { verdict: "mismatch", reason: "no_matching_transfer", evidence };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const admin = createAdminClient();
  const enforce = (Deno.env.get("DONATION_VERIFY_ENFORCE") ?? "false") === "true";
  const mode = enforce ? "enforce" : "shadow";
  const summary = { mode, processed: 0, match: 0, match_partial: 0, mismatch: 0, not_found: 0, error: 0, confirmed: 0, rejected: 0 };

  // Registry: contract -> symbol (chỉ nhận token active, risk trusted/allowed như record-donation)
  const { data: regRows } = await admin
    .from("tokens_registry")
    .select("token_address, symbol, risk_level, is_active, chain_id")
    .eq("is_active", true);
  const registry = new Map<string, { symbol: string }>();
  for (const r of regRows ?? []) {
    if ((r.risk_level === "trusted" || r.risk_level === "allowed") && r.token_address) {
      registry.set(String(r.token_address).toLowerCase(), { symbol: String(r.symbol) });
    }
  }

  // Chọn lô dòng cần đối chiếu
  let query = admin
    .from("donations")
    .select("id, sender_id, recipient_id, amount, token_symbol, token_address, chain_id, chain_family, tx_hash, status, sender_address, recipient_address, created_at, pending_verification_since")
    .eq("chain_family", "evm")
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);
  query = enforce
    ? query.eq("status", "pending_verification")
    : query.eq("status", "confirmed").gte("created_at", new Date(Date.now() - SHADOW_WINDOW_HOURS * 3600_000).toISOString());
  const { data: rows, error: selErr } = await query;
  if (selErr) {
    return new Response(JSON.stringify({ error: selErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  for (const d of (rows ?? []) as DonationRow[]) {
    // Shadow: bỏ qua dòng đã có log trong cửa sổ để không ghi trùng mỗi nhịp quét
    if (!enforce) {
      const { data: logged } = await admin
        .from("donation_verification_log")
        .select("id")
        .eq("donation_id", d.id)
        .eq("mode", "shadow")
        .limit(1);
      if (logged && logged.length > 0) continue;
    }

    const result = await evaluateDonation(admin, d, registry);
    summary.processed++;
    summary[result.verdict]++;

    await admin.from("donation_verification_log").insert({
      donation_id: d.id,
      mode,
      verdict: result.verdict,
      reason: result.reason,
      evidence: result.evidence,
    });

    if (!enforce || result.verdict === "error") continue;

    if (result.verdict === "match" || result.verdict === "match_partial") {
      const { error: upErr } = await admin
        .from("donations")
        .update({
          status: "confirmed",
          confirmed_at: new Date().toISOString(),
          integrity_status: "ok",
          amount_usd: null, // pipeline repricing sẵn có tính giá trị chính thức; client không chốt được
        })
        .eq("id", d.id)
        .eq("status", "pending_verification");
      if (!upErr) summary.confirmed++;
    } else {
      const since = new Date(d.pending_verification_since ?? d.created_at).getTime();
      const overdue = Date.now() - since > DEADLINE_HOURS * 3600_000;
      if (overdue) {
        const { error: upErr } = await admin
          .from("donations")
          .update({
            status: "rejected_unverified",
            integrity_status: result.verdict === "not_found" ? "unverified_timeout" : "verification_mismatch",
            integrity_reason: result.reason,
            integrity_flagged_at: new Date().toISOString(),
          })
          .eq("id", d.id)
          .eq("status", "pending_verification");
        if (!upErr) summary.rejected++;
      }
    }
  }

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
