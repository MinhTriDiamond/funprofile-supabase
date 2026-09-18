/**
 * Chuẩn hoá 1 dòng giao dịch dùng cho cả Excel và PDF export.
 * Mọi nguồn (donations / btc on-chain / claims / swap / transfer / unified)
 * đều phải map về kiểu này trước khi xuất file.
 */
export interface TxExportRow {
  stt: number;
  transactionId: string;
  /** Date thật (không phải string) để Excel format date/time đúng. */
  occurredAt: Date;
  /** 'in' | 'out' | 'external' | 'unknown' — dùng cho cột Chiều tiếng Việt. */
  direction?: 'in' | 'out' | 'external' | 'unknown' | null;
  type: string;
  status: string;
  fromLabel: string;
  fromUsername?: string | null;
  fromAddress: string | null;
  toLabel: string;
  toUsername?: string | null;
  toAddress: string | null;
  token: string;
  /** number thật, không phải text. */
  amount: number;
  fee: number | null;
  network: string | null;
  chain?: string | null;
  txHash: string | null;
  explorerUrl?: string | null;
  note: string;
  source: string;
  sourceId?: string | null;
}

export interface ExportFilterParams {
  dateFrom?: string | null;
  dateTo?: string | null;
  direction?: string;
  token?: string | null;
  status?: string | null;
  type?: string | null;
  search?: string | null;
  selectedOnly?: boolean;
  [k: string]: unknown;
}

export interface ExportMeta {
  /** Hiển thị trên header report PDF. */
  title: string;
  /** Tên hiển thị user xuất (hoặc user chủ ví). */
  userDisplayName: string;
  userEmail?: string | null;
  userWalletAddress?: string | null;
  /** Khoảng thời gian export (do filter, không phải toàn bộ lịch sử). */
  dateRangeLabel?: string;
  /** true = user export dữ liệu của chính mình → không mask. */
  isOwner: boolean;
  /** Surface để ghi audit log. */
  surface: 'wallet_history' | 'profile_history' | 'claim_history' | string;
  /** Filter params được áp dụng (lưu vào audit log). */
  filterParams: ExportFilterParams;
  /** Tổng số giao dịch khớp filter (có thể > rows.length nếu bị cap). */
  totalAvailable?: number;
}

export const EXPORT_LIMITS = {
  excel: 50_000,
  csv: 100_000,
} as const;
