// ingestTransfer.ts — BỘ GHI DÙNG CHUNG cho mọi đường backfill/scanner.
//
// Mục đích: chỉ có MỘT chỗ quyết định field của `transactions` + `donations`
// để admin backfill và scanner sản xuất không bao giờ lệch policy.
//
// Bất biến:
// - Idempotent theo `(tx_hash, user_id)` — chạy lại không ghi trùng.
// - Địa chỉ ví LOWERCASE trước khi ghi/so sánh.
// - `amount` là chuỗi (BigInt string / chuỗi thập phân), KHÔNG dùng Number().
// - Giao dịch ví ngoài: `is_external = true`,
//   `leaderboard_eligibility = 'external_excluded'`, `sender_id = null`,
//   và KHÔNG tạo post `gift_celebration`.
// - `swap_suspect`: CHỈ ghi `transactions` (lưu vết on-chain), bỏ qua
//   `donations` ⇒ không tính reward/leaderboard.
// - `dust_filtered` / `already_in_db`: không ghi gì.

export type IngestClassification =
  | "internal"
  | "external_in"
  | "swap_suspect"
  | "dust_filtered"
  | "already_in_db";

export interface IngestRow {
  tx_hash: string;
  block_number: number;
  from_address: string;
  to_address: string;
  token_symbol: string;
  token_address: string | null;
  /** Chuỗi thập phân đã format (vd "300"), KHÔNG phải số. */
  amount_display: string;
  usd_value: number | null;
  classification: IngestClassification;
  /** Chủ ví nhận (bắt buộc để ghi). */
  matched_user_id: string | null;
  /** Chủ ví gửi nếu là ví hệ thống (chỉ dùng cho `internal`). */
  sender_user_id?: string | null;
  chain_id?: number;
}

export interface DonationPolicy {
  is_external: boolean;
  leaderboard_eligibility: "internal" | "external_excluded";
  allow_sender_id: boolean;
  create_gift_post: boolean;
}

/** Quyết định field donations theo phân loại — nguồn duy nhất của policy. */
export function donationPolicyFor(
  classification: IngestClassification,
): DonationPolicy | null {
  switch (classification) {
    case "internal":
      return {
        is_external: false,
        leaderboard_eligibility: "internal",
        allow_sender_id: true,
        create_gift_post: false,
      };
    case "external_in":
      return {
        is_external: true,
        leaderboard_eligibility: "external_excluded",
        allow_sender_id: false,
        // Policy ví ngoài: KHÔNG tạo gift_celebration post.
        create_gift_post: false,
      };
    default:
      // swap_suspect / dust_filtered / already_in_db không vào donations.
      return null;
  }
}

/** Phân loại nào được ghi lưu vết vào `transactions`. */
export function writesTransaction(classification: IngestClassification): boolean {
  return (
    classification === "internal" ||
    classification === "external_in" ||
    classification === "swap_suspect"
  );
}

export interface IngestResult {
  transaction_written: boolean;
  donation_written: boolean;
  skipped_reason: string | null;
}

// deno-lint-ignore no-explicit-any
type Client = any;

export async function ingestTransfer(
  admin: Client,
  row: IngestRow,
): Promise<IngestResult> {
  const out: IngestResult = {
    transaction_written: false,
    donation_written: false,
    skipped_reason: null,
  };

  const txHash = row.tx_hash.toLowerCase();
  const fromAddr = row.from_address.toLowerCase();
  const toAddr = row.to_address.toLowerCase();
  const chainId = row.chain_id ?? 56;
  const userId = row.matched_user_id;

  if (!userId) {
    out.skipped_reason = "không xác định được chủ ví nhận";
    return out;
  }
  if (!writesTransaction(row.classification)) {
    out.skipped_reason = `phân loại ${row.classification} không ghi`;
    return out;
  }

  // 1. transactions — guard idempotent theo (tx_hash, user_id)
  const { data: existedTx } = await admin
    .from("transactions")
    .select("id")
    .eq("tx_hash", txHash)
    .eq("user_id", userId)
    .maybeSingle();

  if (!existedTx) {
    const { error } = await admin.from("transactions").insert({
      user_id: userId,
      tx_hash: txHash,
      from_address: fromAddr,
      to_address: toAddr,
      amount: row.amount_display,
      token_symbol: row.token_symbol,
      token_address: row.token_address ? row.token_address.toLowerCase() : null,
      chain_id: chainId,
      status: "confirmed",
    });
    if (error) throw new Error(`ghi transactions lỗi: ${error.message}`);
    out.transaction_written = true;
  }

  // 2. donations — chỉ với internal / external_in
  const policy = donationPolicyFor(row.classification);
  if (!policy) {
    out.skipped_reason = "chỉ lưu vết transactions (nghi ngờ swap)";
    return out;
  }

  const { data: existedDon } = await admin
    .from("donations")
    .select("id")
    .eq("tx_hash", txHash)
    .eq("recipient_id", userId)
    .maybeSingle();

  if (!existedDon) {
    const { error } = await admin.from("donations").insert({
      sender_id: policy.allow_sender_id ? (row.sender_user_id ?? null) : null,
      recipient_id: userId,
      amount: row.amount_display,
      amount_usd: row.usd_value,
      token_symbol: row.token_symbol,
      token_address: row.token_address ? row.token_address.toLowerCase() : null,
      chain_id: chainId,
      chain_family: "evm",
      tx_hash: txHash,
      status: "confirmed",
      block_number: row.block_number,
      sender_address: fromAddr,
      recipient_address: toAddr,
      is_external: policy.is_external,
      leaderboard_eligibility: policy.leaderboard_eligibility,
      confirmed_at: new Date().toISOString(),
      metadata: { source: "admin_backfill" },
    });
    if (error) throw new Error(`ghi donations lỗi: ${error.message}`);
    out.donation_written = true;
  }

  return out;
}
