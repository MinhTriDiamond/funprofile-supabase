// Probe TẠM: đo giới hạn thật + XUẤT RAW JSON của alchemy_getAssetTransfers trên BSC.
// Read-only, không ghi DB. Xoá sau khi CTO đối chiếu xong cấu trúc.
//
// GET ?wallet=0x...&span=2800000&samples=3
//   -> trả raw JSON nguyên văn (cắt số transfer về `samples` dòng để dễ đọc)
//      cho 3 lát: erc20 vào ví, native (external) vào ví, erc20 ra khỏi ví.
import { corsHeaders } from "../_shared/httpAuth.ts";

const ALCHEMY = Deno.env.get("ALCHEMY_BSC_RPC_URL") ?? "";

async function rpc(label: string, params: unknown[], samples: number) {
  const started = Date.now();
  const res = await fetch(ALCHEMY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alchemy_getAssetTransfers", params }),
  });
  const text = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(text);
  } catch { /* giữ raw */ }
  const result = (parsed?.result ?? null) as { transfers?: unknown[]; pageKey?: string } | null;
  const transfers = Array.isArray(result?.transfers) ? result!.transfers : [];
  return {
    label,
    http: res.status,
    ms: Date.now() - started,
    cu_cost_documented: 120,
    error: parsed?.error ?? null,
    transfers_count: transfers.length,
    page_key: result?.pageKey ?? null,
    raw_sample: { ...result, transfers: transfers.slice(0, samples) },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!ALCHEMY) {
    return new Response(JSON.stringify({ error: "missing ALCHEMY_BSC_RPC_URL" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const wallet = (url.searchParams.get("wallet") ?? "").toLowerCase();
  const span = Number(url.searchParams.get("span") ?? 2_800_000);
  const samples = Math.min(10, Number(url.searchParams.get("samples") ?? 3));

  const headRes = await fetch(ALCHEMY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
  });
  const headNum = Number((await headRes.json())?.result ?? "0x0");
  const hex = (n: number) => "0x" + n.toString(16);
  const fromBlock = hex(Math.max(0, headNum - span));
  const toBlock = hex(headNum);

  const probes = [
    await rpc("erc20_in", [{
      fromBlock,
      toBlock,
      toAddress: wallet || undefined,
      category: ["erc20"],
      withMetadata: true,
      excludeZeroValue: false,
      maxCount: "0x3e8",
      order: "asc",
    }], samples),
    await rpc("native_in", [{
      fromBlock,
      toBlock,
      toAddress: wallet || undefined,
      category: ["external"],
      withMetadata: true,
      excludeZeroValue: false,
      maxCount: "0x3e8",
      order: "asc",
    }], samples),
    await rpc("erc20_out", [{
      fromBlock,
      toBlock,
      fromAddress: wallet || undefined,
      category: ["erc20"],
      withMetadata: true,
      excludeZeroValue: false,
      maxCount: "0x3e8",
      order: "asc",
    }], samples),
  ];

  return new Response(
    JSON.stringify({
      wallet,
      head_block: headNum,
      span_blocks: span,
      from_block: fromBlock,
      to_block: toBlock,
      probes,
    }, null, 2),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
