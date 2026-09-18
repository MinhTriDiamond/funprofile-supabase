import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { recoverTypedDataAddress } from "npm:viem@^2.38.0";
import { createAdminClient, createAnonClient } from "../_shared/supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FUN_MONEY_CONTRACT = "0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6";
const GROUP_ORDER = ["will", "wisdom", "love"] as const;

const GOV_GROUPS = {
  will: [
    { name: "Minh Trí", address: "0xe32d50a0badE4cbD5B0d6120d3A5FD07f63694f1" },
    { name: "Ánh Nguyệt", address: "0xfd0Da7a744245e7aCECCd786d5a743Ef9291a557" },
    { name: "Thu Trang", address: "0x02D5578173bd0DB25462BB32A254Cd4b2E6D9a0D" },
  ],
  wisdom: [
    { name: "Bé Giàu", address: "0xCa319fBc39F519822385F2D0a0114B14fa89A301" },
    { name: "Bé Ngọc", address: "0xDf8249159BB67804D718bc8186f95B75CE5ECbe8" },
    { name: "Ái Vân", address: "0x5102Ecc4a458a1af76aFA50d23359a712658a402" },
    { name: "Minh Trí Test 1", address: "0xE3e97a95d3f61814473f6d1eEbBa8253286D65c5" },
  ],
  love: [
    { name: "Thanh Tiên", address: "0xE418a560611e80E4239F5513D41e583fC9AC2E6d" },
    { name: "Bé Kim", address: "0x67464Df3082828b3Cf10C5Cb08FC24A28228EFd1" },
    { name: "Bé Hà", address: "0x9ec8C51175526BEbB1D04100256De71CF99B7CCC" },
    { name: "Minh Trí Test 2", address: "0x57a7943F2808Fc24b0403f25bb4670c5d84b3f2e" },
  ],
} as const;

type GovGroupKey = keyof typeof GOV_GROUPS;

const EIP712_DOMAIN = {
  name: "FUN Money",
  version: "1.2.1",
  chainId: 97,
  verifyingContract: FUN_MONEY_CONTRACT,
} as const;

const EIP712_PPLP_TYPES = {
  PureLoveProof: [
    { name: "user", type: "address" },
    { name: "actionHash", type: "bytes32" },
    { name: "amount", type: "uint256" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

interface StoredSignature {
  signer?: string;
  signature?: string;
  signed_at?: string;
  signer_name?: string | null;
}

type StoredSignatures = Partial<Record<GovGroupKey, StoredSignature>>;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function findAttesterByAddress(address: string): { group: GovGroupKey; name: string; address: string } | null {
  const normalized = normalizeAddress(address);

  for (const groupKey of GROUP_ORDER) {
    const member = GOV_GROUPS[groupKey].find((item) => normalizeAddress(item.address) === normalized);
    if (member) {
      return { group: groupKey, name: member.name, address: member.address };
    }
  }

  return null;
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createAnonClient();
    const { data: authData, error: authError } = await anonClient.auth.getUser(token);

    if (authError || !authData?.user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null);
    const requestId = typeof body?.request_id === "string" ? body.request_id : null;
    const signature = typeof body?.signature === "string" ? body.signature : null;
    const connectedAddress = typeof body?.connected_address === "string" ? body.connected_address : null;

    if (!requestId || !signature) {
      return jsonResponse({ success: false, error: "Thiếu request_id hoặc signature" }, 400);
    }

    const supabase = createAdminClient();
    const { data: requestRow, error: requestError } = await supabase
      .from("pplp_mint_requests")
      .select("id, recipient_address, amount_wei, evidence_hash, action_hash, nonce, status, multisig_signatures, multisig_required_groups, multisig_completed_groups")
      .eq("id", requestId)
      .maybeSingle();

    if (requestError) {
      throw requestError;
    }

    if (!requestRow) {
      return jsonResponse({ success: false, error: "Không tìm thấy request", code: "REQUEST_NOT_FOUND" }, 404);
    }

    if (!requestRow.evidence_hash) {
      return jsonResponse({ success: false, error: "Request thiếu evidence_hash", code: "INVALID_REQUEST" }, 400);
    }

    // Auto-generate action_hash if missing (backward compat for older records)
    let actionHash = requestRow.action_hash;
    if (!actionHash) {
      const { keccak256, toBytes } = await import("npm:viem@^2.38.0");
      const actionName = (requestRow as any).action_name || 'FUN_REWARD';
      actionHash = keccak256(toBytes(actionName));
      // Persist so future signs don't need to recalculate
      await supabase
        .from("pplp_mint_requests")
        .update({ action_hash: actionHash })
        .eq("id", requestId);
      console.log(`[attester-sign] Auto-generated action_hash for request ${requestId}`);
    }

    // Verify chữ ký EIP-712 (KHÔNG dùng currentSigs từ requestRow vì có thể stale)
    const recoveredAddress = await recoverTypedDataAddress({
      domain: EIP712_DOMAIN,
      types: EIP712_PPLP_TYPES,
      primaryType: "PureLoveProof",
      message: {
        user: requestRow.recipient_address as `0x${string}`,
        actionHash: actionHash as `0x${string}`,
        amount: BigInt(requestRow.amount_wei),
        evidenceHash: requestRow.evidence_hash as `0x${string}`,
        nonce: BigInt(requestRow.nonce),
      },
      signature: signature as `0x${string}`,
    });

    if (connectedAddress && normalizeAddress(recoveredAddress) !== normalizeAddress(connectedAddress)) {
      return jsonResponse({
        success: false,
        error: "Chữ ký không khớp với ví đang kết nối",
        code: "ADDRESS_MISMATCH",
      }, 400);
    }

    const attester = findAttesterByAddress(recoveredAddress);
    if (!attester) {
      return jsonResponse({ success: false, error: "Ví ký không thuộc GOV attester", code: "INVALID_ATTESTER" }, 403);
    }

    // Atomic update qua RPC có row lock — tránh race condition giữa các nhóm GOV
    const { data: rpcResult, error: rpcError } = await supabase.rpc("apply_attester_signature", {
      p_request_id: requestId,
      p_group: attester.group,
      p_signer_address: recoveredAddress,
      p_signer_name: attester.name,
      p_signature: signature,
    });

    if (rpcError) {
      console.error("[attester-sign] RPC error:", rpcError);
      throw rpcError;
    }

    const result = rpcResult as Record<string, unknown> | null;
    const code = typeof result?.code === "string" ? result.code : "UNKNOWN";

    // Các code "trạng thái" — không phải lỗi thật, frontend chỉ cần refetch
    if (code === "ALREADY_SIGNED" || code === "ALREADY_COMPLETED" || code === "INVALID_STATUS" || code === "NOT_FOUND") {
      return jsonResponse({
        success: false,
        code,
        message: result?.message ?? "Request đã thay đổi trạng thái, vui lòng tải lại danh sách.",
        request: {
          id: requestId,
          status: result?.status,
          multisig_completed_groups: result?.multisig_completed_groups ?? [],
        },
      });
    }

    if (code !== "OK") {
      return jsonResponse({
        success: false,
        code,
        error: result?.message ?? "Không thể lưu chữ ký",
      }, 500);
    }

    return jsonResponse({
      success: true,
      request: {
        id: requestId,
        status: result?.status,
        multisig_signatures: result?.multisig_signatures,
        multisig_completed_groups: result?.multisig_completed_groups,
      },
      signer_group: attester.group,
      signer_name: attester.name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[PPLP-ATTESTER-SIGN]", message, error);
    return jsonResponse({ success: false, error: message }, 500);
  }
});