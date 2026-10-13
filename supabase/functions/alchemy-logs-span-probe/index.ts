// Probe TẠM (13/10/2026): đo span eth_getLogs THẬT của endpoint Alchemy đang
// cấu hình (ALCHEMY_BSC_RPC_URL) trên BSC, phục vụ chốt ALCHEMY_LOGS_MAX_SPAN
// cho _shared/rpcClient.ts logsEndpoints(). Read-only, không ghi DB.
// Xoá sau khi chốt xong span. GET / → JSON kết quả từng mức span.
import { corsHeaders } from "../_shared/httpAuth.ts";

const ALCHEMY = Deno.env.get("ALCHEMY_BSC_RPC_URL") ?? "";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
// Lọc theo topic "to" = một ví mẫu để số log trả về luôn nhỏ — giới hạn của
// Alchemy tính theo KHOẢNG BLOCK nên kết quả đo không đổi, chỉ nhẹ payload.
const SAMPLE_TO =
  "0x000000000000000000000000ccb8ce81716c9891269303084718a62df028c174";

const hex = (n: number) => "0x" + n.toString(16);

interface RpcOut {
  ms: number;
  http: number;
  // deno-lint-ignore no-explicit-any
  json: any;
  raw: string | null;
}

async function rpcCall(
  method: string,
  // deno-lint-ignore no-explicit-any
  params: any[],
  timeoutMs = 25_000,
): Promise<RpcOut> {
  const started = Date.now();
  try {
    const res = await fetch(ALCHEMY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    // deno-lint-ignore no-explicit-any
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch { /* giữ null, raw bên dưới */ }
    return {
      ms: Date.now() - started,
      http: res.status,
      json,
      raw: json ? null : text.slice(0, 200),
    };
  } catch (e) {
    return { ms: Date.now() - started, http: 0, json: null, raw: String(e).slice(0, 200) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  // deno-lint-ignore no-explicit-any
  const out: Record<string, any> = { probe: "alchemy-logs-span", at: new Date().toISOString() };
  try {
    if (!ALCHEMY) {
      out.error = "missing ALCHEMY_BSC_RPC_URL";
    } else {
      const headOut = await rpcCall("eth_blockNumber", []);
      const head = Number(BigInt(headOut.json?.result ?? "0x0"));
      out.head_block = head;
      if (!head) {
        out.head_error = headOut.json?.error ?? headOut.raw;
      } else {
        out.spans = [];
        for (const span of [100, 500, 2000, 5000, 10000, 25000, 50000]) {
          const r = await rpcCall("eth_getLogs", [{
            address: USDT,
            topics: [TRANSFER_TOPIC, null, SAMPLE_TO],
            fromBlock: hex(Math.max(0, head - span)),
            toBlock: hex(head),
          }]);
          const result = r.json?.result;
          out.spans.push({
            span,
            ok: Array.isArray(result),
            logs: Array.isArray(result) ? result.length : null,
            error: r.json?.error
              ? String(r.json.error.message ?? JSON.stringify(r.json.error)).slice(0, 180)
              : (r.raw ?? null),
            http: r.http,
            ms: r.ms,
          });
          // Span lỗi vì giới hạn khoảng block thì các span lớn hơn cũng lỗi —
          // nhưng vẫn thử tiếp một mức để chắc chắn đó là trần cứng, rồi dừng.
          if (!Array.isArray(result) && r.json?.error) {
            const msg = String(r.json.error.message ?? "");
            if (/range|limit|block/i.test(msg)) {
              out.note = "range-limit hit at span " + span;
              break;
            }
          }
        }
        // Điểm dữ liệu Phương án B: getAssetTransfers trên cùng endpoint.
        const t = await rpcCall("alchemy_getAssetTransfers", [{
          fromBlock: hex(Math.max(0, head - 50000)),
          toBlock: hex(head),
          contractAddresses: [USDT],
          category: ["erc20"],
          withMetadata: true,
          excludeZeroValue: true,
          maxCount: "0xa",
          order: "desc",
        }]);
        const tres = t.json?.result;
        out.asset_transfers = {
          ok: !!tres && Array.isArray(tres.transfers),
          count: Array.isArray(tres?.transfers) ? tres.transfers.length : null,
          error: t.json?.error
            ? String(t.json.error.message ?? JSON.stringify(t.json.error)).slice(0, 180)
            : (t.raw ?? null),
          http: t.http,
          ms: t.ms,
        };
      }
    }
  } catch (e) {
    out.fatal = String(e).slice(0, 200);
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
