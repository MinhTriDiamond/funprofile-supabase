/**
 * btc-ownership-verify — Phase 1 BTC Attribution Resolver
 *
 * Xác thực sở hữu địa chỉ BTC bằng chữ ký BIP-322 (thay cho "sở hữu = tự gõ chuỗi vào ô
 * input", RC1). Dùng BIP-322 (không dùng bitcoinjs-message kiểu cũ, chỉ hỗ trợ P2PKH) vì hệ
 * thống có cả địa chỉ SegWit (bc1q...) và Taproot (bc1p...).
 *
 * KHÔNG đụng profiles.btc_address hay bất kỳ bảng dữ liệu sản xuất nào — chỉ ghi vào
 * btc_address_ownership_history qua claim_btc_ownership() (Phase 1, xem migration
 * 20260823124512). Wiring vào luồng đổi ví thật là việc của Phase 3.
 *
 * actions:
 *   { action: 'challenge', address }              → { nonce, message, expires_at }
 *   { action: 'verify', address, nonce, signature } → { success, ownership }
 *
 * Auth: bắt buộc đăng nhập (requireUser) — khác wallet_challenges (EVM login, ẩn danh),
 * đây là luồng "chứng minh sở hữu địa chỉ cho tài khoản đang có".
 */
import { corsHeaders, json, createAdminClient, requireUser, normalizeError } from "../_shared/httpAuth.ts";
import { Verifier } from "npm:bip322-js@4.0.0";

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 phút, cùng TTL với wagmi challenge (EVM) đã có.
const RATE_WINDOW_MS = 60 * 1000;
// challenge: không tự phát tác dụng gì (chỉ sinh nonce), 10/phút đủ rộng cho retry tay
// (copy/paste sai, đổi ví, gõ lại địa chỉ) mà vẫn chặn được spam ghi bảng challenges.
const CHALLENGE_RATE_LIMIT = 10;
// verify: đây là điểm GHI ownership thật (tương đương claim-reward/admin-merge-mint-requests
// về mức độ hệ trọng — cả 2 đều rate-limit 1/phút cho hành động ghi tài chính). Vẫn nới hơn
// 1/phút vì verify có thể fail vì lý do vô hại (dán nhầm chữ ký, ví ngoài trả sai định dạng)
// và cần cho phép thử lại trong cùng phiên mà không phải đợi hết cửa sổ.
const VERIFY_RATE_LIMIT = 5;

/**
 * Rate limit BỀN (không dùng Map trong bộ nhớ — mất hết state mỗi khi edge function cold
 * start, cho phép reset giới hạn chỉ bằng cách chờ instance mới). Dùng lại
 * public.check_rate_limit(p_key, p_limit, p_window_ms) — RPC atomic (INSERT ... ON CONFLICT)
 * đã có sẵn và đang dùng ở claim-reward, sso-otp-request, angel-chat... KHÔNG tự chế mới.
 */
async function checkRateLimit(
  admin: ReturnType<typeof createAdminClient>,
  key: string,
  limit: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_ms: RATE_WINDOW_MS,
  });
  if (error) {
    console.error("[btc-ownership-verify] check_rate_limit error:", error);
    return true; // fail-open trên lỗi hạ tầng rate-limit, không chặn luồng chính vì lỗi phụ
  }
  return data?.allowed !== false;
}

/**
 * Bech32 (bc1q.../bc1p...) case-insensitive theo BIP-173 → lowercase an toàn.
 * Legacy base58 (1.../3...) case-SENSITIVE — lowercase vô điều kiện sẽ tạo địa chỉ khác/
 * không hợp lệ VÀ làm verify chữ ký BIP-322 luôn fail (verify theo đúng chuỗi gốc).
 * Phải khớp public.btc_normalize_address() trong migration.
 */
function btcNormalizeAddress(address: string): string {
  const trimmed = (address ?? "").trim();
  return /^bc1[a-z0-9]+$/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

const SUPPORTED_ADDRESS_RE = /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i;

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const user = await requireUser(req);
    const admin = createAdminClient();
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip") || null;

    if (action === "challenge") {
      const rawAddress: string | undefined = body.address;
      if (!rawAddress || typeof rawAddress !== "string") {
        return json({ error: "address required" }, 400);
      }
      const address = btcNormalizeAddress(rawAddress);
      if (!SUPPORTED_ADDRESS_RE.test(address)) {
        return json({ error: "Định dạng địa chỉ BTC không hợp lệ" }, 400);
      }
      if (!(await checkRateLimit(admin, `btc_ownership_challenge:${user.id}`, CHALLENGE_RATE_LIMIT))) {
        return json({ error: "Too many requests" }, 429);
      }

      // Dọn challenge hết hạn của chính user này (best-effort, không chặn luồng chính).
      await admin.from("btc_ownership_challenges")
        .delete().eq("user_id", user.id).lt("expires_at", new Date().toISOString());

      const nonce = randomNonce();
      const issuedAt = new Date();
      const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
      const message = [
        "FUN Profile — Xác thực sở hữu địa chỉ BTC",
        `Address: ${address}`,
        `Account: ${user.id}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt.toISOString()}`,
        `Expires At: ${expiresAt.toISOString()}`,
      ].join("\n");

      const { error: insertError } = await admin.from("btc_ownership_challenges").insert({
        user_id: user.id,
        address,
        nonce,
        message,
        expires_at: expiresAt.toISOString(),
        ip_address: ipAddress,
      });
      if (insertError) {
        console.error("[btc-ownership-verify] challenge insert error:", insertError);
        return json({ error: "Failed to create challenge" }, 500);
      }

      return json({ nonce, message, expires_at: expiresAt.toISOString() });
    }

    if (action === "verify") {
      const rawAddress: string | undefined = body.address;
      const nonce: string | undefined = body.nonce;
      const signature: string | undefined = body.signature;
      if (!rawAddress || !nonce || !signature) {
        return json({ error: "address, nonce, signature required" }, 400);
      }
      // Rate limit RIÊNG cho verify (không dùng chung bộ đếm với challenge) — đây là điểm
      // ghi ownership thật, cần giới hạn độc lập kể cả khi user đã dùng hết quota challenge.
      if (!(await checkRateLimit(admin, `btc_ownership_verify:${user.id}`, VERIFY_RATE_LIMIT))) {
        return json({ error: "Too many requests" }, 429);
      }
      const address = btcNormalizeAddress(rawAddress);

      // Nonce: 1 lần dùng, chưa hết hạn, đúng user, đúng address (cùng bài học sso-web3-auth).
      //
      // UPDATE ... WHERE used_at IS NULL ... RETURNING nguyên tử — KHÔNG tách SELECT rồi
      // UPDATE riêng. Với SELECT-rồi-UPDATE, 2 request đồng thời cùng nonce đều có thể pass
      // qua SELECT (used_at vẫn NULL ở cả 2 lần đọc) trước khi request nào kịp UPDATE — race
      // condition cho phép dùng 1 nonce 2 lần. UPDATE ... RETURNING dựa vào row lock của
      // chính Postgres: request thứ 2 phải đợi request thứ 1 commit, rồi thấy used_at đã khác
      // NULL nên WHERE không khớp, trả về 0 dòng — không có khoảng hở giữa đọc và ghi.
      const { data: claimedRows, error: challengeError } = await admin
        .from("btc_ownership_challenges")
        .update({ used_at: new Date().toISOString() })
        .eq("nonce", nonce)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .select("*");

      const challenge = claimedRows?.[0];
      if (challengeError || !challenge) {
        return json({ error: "Invalid or expired nonce. Please request a new challenge." }, 401);
      }

      if (challenge.user_id !== user.id) {
        console.warn(`[btc-ownership-verify] nonce/user mismatch: challenge.user=${challenge.user_id} caller=${user.id}`);
        return json({ error: "Nonce không thuộc phiên đăng nhập này" }, 401);
      }
      if (challenge.address !== address) {
        console.warn(`[btc-ownership-verify] nonce/address mismatch: challenge.address=${challenge.address} body.address=${address}`);
        return json({ error: "Địa chỉ không khớp challenge đã cấp" }, 401);
      }

      let signatureValid = false;
      try {
        signatureValid = Verifier.verifySignature(address, challenge.message, signature);
      } catch (e) {
        console.warn(`[btc-ownership-verify] BIP-322 verify threw for address=${address}:`, normalizeError(e).message);
        signatureValid = false;
      }

      if (!signatureValid) {
        await admin.from("account_activity_logs").insert({
          user_id: user.id,
          action: "btc_ownership_verify_failed",
          details: { address, reason: "signature_invalid" },
          ip_address: ipAddress,
        });
        return json({ error: "Invalid signature" }, 401);
      }

      const { data: ownership, error: claimError } = await admin.rpc("claim_btc_ownership", {
        p_address: address,
        p_user_id: user.id,
        p_verification_method: "signature",
        p_evidence_ref: signature,
        p_created_by: user.id,
        p_request_id: challenge.id,
      });

      if (claimError) {
        console.error("[btc-ownership-verify] claim_btc_ownership error:", claimError);
        return json({ error: "Failed to record ownership" }, 500);
      }

      await admin.from("account_activity_logs").insert({
        user_id: user.id,
        action: "btc_ownership_verify_succeeded",
        details: { address },
        ip_address: ipAddress,
      });

      return json({ success: true, ownership });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const normalized = normalizeError(error);
    console.error("[btc-ownership-verify] error:", normalized);
    return json({ error: normalized.message || "Internal server error" }, normalized.status || 500);
  }
});
