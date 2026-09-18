/**
 * Mapping lỗi wagmi / viem / EIP-1193 → message tiếng Việt thân thiện.
 * Dùng chung cho luồng kết nối ví, ký giao dịch, switch chain.
 */

export type FriendlyWalletError = {
  /** Tiêu đề toast (ngắn, tiếng Việt) */
  title: string;
  /** Mô tả thêm (tùy chọn) */
  description?: string;
  /** Có nên gợi ý user gửi log không */
  showReportAction?: boolean;
};

const DEFAULT_REPORT_HINT = 'Bạn có thể bấm "Báo lỗi" để gửi log cho team Fun.Rich.';

function pickMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  const anyErr = err as any;
  return (
    anyErr?.shortMessage ||
    anyErr?.details ||
    anyErr?.message ||
    String(err)
  );
}

export function getFriendlyWalletError(err: unknown): FriendlyWalletError {
  const raw = pickMessage(err);
  const lower = raw.toLowerCase();
  const code = (err as any)?.code;

  // User rejected
  if (
    code === 4001 ||
    /user rejected|user denied|user cancel|đã huỷ|user closed/i.test(raw)
  ) {
    return { title: 'Bạn đã từ chối yêu cầu trong ví.' };
  }

  // Already processing request
  if (code === -32002 || /already pending|request of the same type|already processing/i.test(lower)) {
    return {
      title: 'Ví đang xử lý một yêu cầu khác.',
      description: 'Mở app ví (MetaMask/Trust/Bitget) để xem và phản hồi yêu cầu trước đó.',
    };
  }

  // Connector not found / not configured
  if (/connectornotfound|no provider|provider not found|connector .* not found/i.test(lower)) {
    return {
      title: 'Không thấy ví trong trình duyệt này.',
      description: 'Hãy mở Fun.Rich trong DApp browser của MetaMask / Trust / Bitget rồi thử lại.',
    };
  }

  // Chain mismatch / unsupported
  if (/chainmismatch|chain not supported|unsupported chain|wrong network/i.test(lower)) {
    return {
      title: 'Ví đang ở sai mạng.',
      description: 'Đang chuyển sang BNB Smart Chain (BSC)…',
    };
  }

  // Session expired (WalletConnect)
  if (/session.*expired|no matching key|session topic|connection request reset/i.test(lower)) {
    return {
      title: 'Phiên ví đã hết hạn.',
      description: 'Hãy bấm "Kết nối ví" lại để mở phiên mới.',
    };
  }

  // Timeout
  if (/timeout|timed out/i.test(lower)) {
    return {
      title: 'Ví không phản hồi kịp thời.',
      description: 'Mở lại app ví để xác nhận hoặc thử kết nối lại.',
    };
  }

  // Insufficient funds
  if (/insufficient (funds|balance)/i.test(lower)) {
    return {
      title: 'Số dư không đủ.',
      description: 'Cần thêm BNB để trả phí gas hoặc nạp thêm token.',
    };
  }

  // Network / RPC
  if (/network|fetch failed|failed to fetch|rpc/i.test(lower)) {
    return {
      title: 'Mạng đang chập chờn.',
      description: 'Kiểm tra kết nối Internet và thử lại sau giây lát.',
      showReportAction: true,
    };
  }

  // Fallback
  return {
    title: 'Chưa thể hoàn tất yêu cầu với ví.',
    description: `${raw || 'Lỗi không xác định.'} ${DEFAULT_REPORT_HINT}`.trim(),
    showReportAction: true,
  };
}
