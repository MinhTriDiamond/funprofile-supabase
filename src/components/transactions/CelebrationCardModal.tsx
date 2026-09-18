/**
 * CelebrationCardModal — M5-UX3.
 *
 * Chuẩn hoá: mọi card chúc mừng trong luồng Unified History đều render đúng
 * `DonationReceivedCard` (thiết kế "FUN Profile — Biên Nhận Tặng").
 * Không tái tạo UI, chỉ adapter dữ liệu Unified → DonationReceivedData.
 */
import { useMemo } from 'react';
import {
  DonationReceivedCard,
  type DonationReceivedData,
} from '@/components/donations/DonationReceivedCard';
import { useUnifiedTransactionDetail } from '@/hooks/useUnifiedTransactionHistory';
import type { UnifiedDetailParty, UnifiedTransactionRow } from './types';

function shortAddr(a?: string | null) {
  if (!a) return '';
  return a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a;
}

function pickParty(
  row: UnifiedTransactionRow,
  side: 'sender' | 'recipient',
  override?: UnifiedDetailParty | null,
): UnifiedDetailParty {
  const dir = row.direction;
  if (override) return override;
  if (side === 'sender') {
    return {
      user_id: row.sender_user_id ?? (dir === 'out' ? row.user_id : row.counterparty_user_id) ?? null,
      username: row.sender_username ?? (dir === 'out' ? row.owner_username : row.counterparty_username) ?? null,
      display_name: row.sender_display_name ?? (dir === 'out' ? row.owner_display_name : row.counterparty_display_name) ?? null,
      avatar_url: row.sender_avatar_url ?? (dir === 'out' ? row.owner_avatar_url : row.counterparty_avatar_url) ?? null,
      address: row.sender_wallet_address ?? row.sender_address ?? null,
    } as UnifiedDetailParty;
  }
  return {
    user_id: row.recipient_user_id ?? (dir === 'in' ? row.user_id : row.counterparty_user_id) ?? null,
    username: row.recipient_username ?? (dir === 'in' ? row.owner_username : row.counterparty_username) ?? null,
    display_name: row.recipient_display_name ?? (dir === 'in' ? row.owner_display_name : row.counterparty_display_name) ?? null,
    avatar_url: row.recipient_avatar_url ?? (dir === 'in' ? row.owner_avatar_url : row.counterparty_avatar_url) ?? null,
    address: row.recipient_wallet_address ?? row.recipient_address ?? null,
  } as UnifiedDetailParty;
}

function rowToReceivedData(
  row: UnifiedTransactionRow,
  sender: UnifiedDetailParty,
  recipient: UnifiedDetailParty,
): DonationReceivedData {
  const senderUsername =
    sender.username || sender.display_name || shortAddr(sender.address) || 'wallet';
  const recipientUsername =
    recipient.username || recipient.display_name || shortAddr(recipient.address) || 'wallet';
  return {
    id: row.source_id,
    amount: row.amount_decimal != null ? String(row.amount_decimal) : '0',
    tokenSymbol: row.token_symbol ?? '',
    senderUsername,
    senderDisplayName: sender.display_name ?? null,
    senderAvatarUrl: sender.avatar_url ?? null,
    senderId: sender.user_id ?? '',
    recipientUsername,
    recipientDisplayName: recipient.display_name ?? null,
    recipientAvatarUrl: recipient.avatar_url ?? null,
    message: row.memo,
    txHash: row.tx_hash ?? '',
    createdAt: row.occurred_at,
    status: row.status ?? undefined,
  };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seed?: UnifiedTransactionRow | null;
  txHash?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
}

export function CelebrationCardModal({
  open, onOpenChange, seed, txHash, sourceTable, sourceId,
}: Props) {
  const { data } = useUnifiedTransactionDetail({
    txHash: open ? txHash : null,
    sourceTable: open ? sourceTable : null,
    sourceId: open ? sourceId : null,
    enabled: open && !seed,
  });

  const primary = (data?.primary ?? seed) as UnifiedTransactionRow | null;

  const cardData = useMemo<DonationReceivedData | null>(() => {
    if (!primary) return null;
    const sender = pickParty(primary, 'sender', data?.sender ?? null);
    const recipient = pickParty(primary, 'recipient', data?.recipient ?? null);
    return rowToReceivedData(primary, sender, recipient);
  }, [primary, data?.sender, data?.recipient]);

  if (!open || !cardData) return null;

  return (
    <DonationReceivedCard
      isOpen={open}
      onClose={() => onOpenChange(false)}
      data={cardData}
    />
  );
}
