import { DonationRecord } from '@/types/donation';

import { formatDate } from '@/lib/formatters';

/**
 * Export donations to CSV file
 */
export function exportDonationsToCSV(
  donations: DonationRecord[],
  type: 'sent' | 'received',
  filename?: string
) {
  // CSV headers
  const headers = [
    'Ngày giờ',
    'Người gửi',
    'Người nhận',
    'Số tiền',
    'Token',
    'Lời nhắn',
    'TX Hash',
    'Light Score',
    'Trạng thái'
  ];

  // Build rows
  const rows = donations.map(d => [
    formatDate(d.created_at),
    `@${d.sender?.username || 'Unknown'}`,
    `@${d.recipient?.username || 'Unknown'}`,
    d.amount,
    d.token_symbol,
    escapeCSV(d.message || ''),
    d.tx_hash,
    d.light_score_earned?.toString() || '0',
    translateStatus(d.status)
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => escapeCSV(cell)).join(','))
  ].join('\n');

  // Add BOM for UTF-8 support in Excel
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

  // Generate filename
  const date = new Date().toISOString().split('T')[0];
  const defaultFilename = `donation-history-${type}-${date}.csv`;

  // Trigger download
  downloadBlob(blob, filename || defaultFilename);
}




/**
 * Escape CSV special characters
 */
function escapeCSV(str: string): string {
  if (!str) return '';
  // If contains comma, quote, or newline, wrap in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Translate status to Vietnamese
 */
function translateStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: 'Đang xử lý',
    confirmed: 'Thành công',
    failed: 'Thất bại',
  };
  return statusMap[status] || status;
}




/**
 * Trigger file download
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
