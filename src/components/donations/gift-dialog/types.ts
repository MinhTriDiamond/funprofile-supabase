/**
 * SR-2: Gift Dialog — Shared types
 */

export interface ResolvedRecipient {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  btcAddress?: string | null;
  hasVerifiedWallet?: boolean;
}

export interface MultiSendResult {
  recipient: ResolvedRecipient;
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface GiftDialogFlowState {
  flowStep: 'form' | 'confirm' | 'celebration';
  resolvedRecipients: ResolvedRecipient[];
  multiSendProgress: {
    current: number;
    total: number;
    results: MultiSendResult[];
  } | null;
  isMultiSending: boolean;
  currentSendingIndex: number;
}

export const STEP_CONFIG: Record<string, { label: string; progress: number }> = {
  idle: { label: '', progress: 0 },
  signing: { label: 'Vui lòng xác nhận trong ví...', progress: 15 },
  broadcasted: { label: 'Giao dịch đã được gửi lên mạng', progress: 35 },
  confirming: { label: 'Đang chờ xác nhận từ blockchain...', progress: 60 },
  finalizing: { label: 'Đang ghi nhận vào hệ thống...', progress: 85 },
  success: { label: 'Hoàn tất!', progress: 100 },
  timeout: { label: 'Chưa nhận được xác nhận kịp thời', progress: 70 },
};
