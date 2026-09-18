/**
 * DonationRecord — shape dùng chung cho Admin Panel + Export CSV/PDF.
 *
 * Trước đây type này sống trong `src/hooks/useDonationHistory.ts` (đã xoá ở
 * Batch 2.3 vì hook trở thành dead code). Move vào `src/types/` để các consumer
 * còn lại (`useAdminDonationHistory`, `exportDonations`, `DonationHistoryAdminTab`)
 * import từ 1 nơi ổn định, không phụ thuộc hook đã bỏ.
 */

export interface DonationRecord {
  id: string;
  sender: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url: string | null;
    public_wallet_address?: string | null;
    btc_address?: string | null;
  } | null;
  recipient: {
    id: string;
    username: string;
    display_name?: string | null;
    avatar_url: string | null;
    public_wallet_address?: string | null;
    btc_address?: string | null;
  };
  amount: string;
  token_symbol: string;
  message: string | null;
  tx_hash: string;
  light_score_earned: number | null;
  created_at: string;
  status: string;
  card_theme?: string | null;
  card_background?: string | null;
  card_sound?: string | null;
  sender_address?: string | null;
  is_external?: boolean;
  metadata?: { sender_name?: string } | null;
}
