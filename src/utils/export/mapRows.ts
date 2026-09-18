/**
 * Convert các shape dữ liệu nguồn → TxExportRow chuẩn.
 * KHÔNG đụng business logic; chỉ format lại để export.
 */
import type { TxExportRow } from './types';
import type { DonationRecord } from '@/hooks/usePublicDonationHistory';
import { getGiftTokenLabel } from '@/lib/giftTokenLabel';

const STATUS_VI: Record<string, string> = {
  confirmed: 'Thành công',
  pending: 'Đang xử lý',
  failed: 'Thất bại',
};

const TYPE_VI: Record<string, string> = {
  donation: 'Tặng quà',
  swap: 'Hoán đổi',
  transfer: 'Chuyển khoản',
};

function chainName(chainId: number | null | undefined): string | null {
  if (chainId == null) return null;
  if (chainId === 56) return 'BSC';
  if (chainId === 97) return 'BSC Testnet';
  if (chainId === 1) return 'Ethereum';
  if (chainId === 0) return 'Bitcoin';
  return `Chain ${chainId}`;
}

export function mapDonationsToRows(
  donations: DonationRecord[],
  currentUserId?: string | null
): TxExportRow[] {
  return donations.map((d, idx) => {
    let direction: 'in' | 'out' | null = null;
    if (currentUserId) {
      if (d.recipient_id === currentUserId) direction = 'in';
      else if (d.sender_id === currentUserId) direction = 'out';
    }
    direction ??= (d.direction as 'in' | 'out' | undefined) ?? null;

    const senderLabel =
      d.sender_display_name ||
      (d.sender_username ? `@${d.sender_username}` : '') ||
      (d.is_external ? 'Ví ngoài' : 'Ẩn danh');
    const recipientLabel =
      d.recipient_display_name ||
      (d.recipient_username ? `@${d.recipient_username}` : '') ||
      'Ẩn danh';

    let amount = Number(d.amount) || 0;
    let token = getGiftTokenLabel(d.token_symbol, d.chain_id);
    let typeLabel = TYPE_VI[d.type] || d.type;

    if (d.type === 'swap') {
      // Swap: hiện cặp from→to trong note, amount lấy from_amount
      amount = Number(d.from_amount ?? d.amount) || 0;
      token = getGiftTokenLabel(d.from_symbol || d.token_symbol, d.chain_id);
      typeLabel = `Hoán đổi ${d.from_symbol ?? ''}→${d.to_symbol ?? ''}`.trim();
    }

    return {
      stt: idx + 1,
      transactionId: d.id,
      occurredAt: new Date(d.created_at),
      type: typeLabel,
      status: STATUS_VI[d.status] || d.status,
      fromLabel: senderLabel,
      fromAddress: d.sender_address ?? null,
      toLabel: recipientLabel,
      toAddress: d.counterparty_address ?? null,
      token,
      amount,
      fee: null,
      network: chainName(d.chain_id),
      txHash: d.tx_hash ?? null,
      note: d.message ?? '',
      source: d.is_external ? 'Ví ngoài' : d.type,
    };
  });
}

/** Map cho ClaimHistoryModal (CAMLY claims). */
export interface ClaimLikeRecord {
  id: string;
  username: string;
  full_name: string | null;
  wallet_address: string;
  amount: number;
  created_at: string;
  is_external?: boolean;
  email?: string | null;
}

export function mapClaimsToRows(claims: ClaimLikeRecord[]): TxExportRow[] {
  return claims.map((c, idx) => ({
    stt: idx + 1,
    transactionId: c.id,
    occurredAt: new Date(c.created_at),
    type: 'Claim CAMLY',
    status: 'Thành công',
    fromLabel: 'Treasury Cha & Bé Ly',
    fromAddress: null,
    toLabel: c.full_name || c.username || '—',
    toAddress: c.wallet_address,
    token: 'CAMLY',
    amount: Number(c.amount) || 0,
    fee: null,
    network: 'BSC',
    txHash: null,
    note: c.email ?? '',
    source: c.is_external ? 'Ví ngoài' : 'claim_reward',
  }));
}
