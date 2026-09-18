/**
 * Excel .xlsx export bằng ExcelJS.
 * - Sheet 1: Lịch sử giao dịch (full cột)
 * - Sheet 2: Thông tin xuất file (metadata + filter)
 * - Sheet 3: Summary theo filter hiện tại
 */
import type { TxExportRow, ExportMeta } from './types';
import { applyMask } from './maskPii';

const DIRECTION_VI: Record<string, string> = {
  in: 'Nhận',
  out: 'Gửi',
  external: 'Ví ngoài',
  unknown: 'Chưa rõ',
};

const HEADERS: { key: keyof TxExportRow; label: string; width: number }[] = [
  { key: 'stt', label: 'STT', width: 6 },
  { key: 'occurredAt', label: 'Thời gian', width: 20 },
  { key: 'direction', label: 'Chiều', width: 10 },
  { key: 'status', label: 'Trạng thái', width: 14 },
  { key: 'token', label: 'Token', width: 10 },
  { key: 'amount', label: 'Amount', width: 18 },
  { key: 'chain', label: 'Chain', width: 12 },
  { key: 'txHash', label: 'Tx hash', width: 46 },
  { key: 'fromLabel', label: 'Người gửi', width: 24 },
  { key: 'fromUsername', label: '@username gửi', width: 18 },
  { key: 'fromAddress', label: 'Ví người gửi', width: 46 },
  { key: 'toLabel', label: 'Người nhận', width: 24 },
  { key: 'toUsername', label: '@username nhận', width: 18 },
  { key: 'toAddress', label: 'Ví người nhận', width: 46 },
  { key: 'note', label: 'Memo / lời chúc', width: 40 },
  { key: 'source', label: 'Source', width: 16 },
  { key: 'sourceId', label: 'Source ID', width: 38 },
  { key: 'explorerUrl', label: 'Explorer URL', width: 60 },
  { key: 'type', label: 'Loại', width: 18 },
  { key: 'fee', label: 'Phí', width: 12 },
  { key: 'transactionId', label: 'Mã giao dịch', width: 38 },
];

function styleHeader(row: any, count: number) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  row.alignment = { vertical: 'middle', horizontal: 'left' };
  row.height = 22;
  row.eachCell((cell: any, idx: number) => {
    if (idx > count) return;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF166534' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  });
}

interface SummaryRow {
  token: string;
  totalIn: number;
  countIn: number;
  totalOut: number;
  countOut: number;
  count: number;
}

function computeSummary(rows: TxExportRow[]): SummaryRow[] {
  const map = new Map<string, SummaryRow>();
  for (const r of rows) {
    const tk = r.token || 'UNKNOWN';
    const cur = map.get(tk) ?? { token: tk, totalIn: 0, countIn: 0, totalOut: 0, countOut: 0, count: 0 };
    cur.count += 1;
    if (r.direction === 'in') {
      cur.totalIn += r.amount || 0;
      cur.countIn += 1;
    } else if (r.direction === 'out') {
      cur.totalOut += r.amount || 0;
      cur.countOut += 1;
    }
    map.set(tk, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count);
}

function fmtFilterVal(v: unknown): string {
  if (v == null || v === '' || v === 'all') return '—';
  return String(v);
}

export async function exportRowsToExcel(
  rows: TxExportRow[],
  meta: ExportMeta,
  filename: string
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FUN Profile';
  wb.created = new Date();

  /* ---------------- Sheet 1: Lịch sử giao dịch ---------------- */
  const ws = wb.addWorksheet('Lịch sử giao dịch', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  ws.columns = HEADERS.map(h => ({ header: h.label, key: h.key as string, width: h.width }));
  styleHeader(ws.getRow(1), HEADERS.length);

  for (const raw of rows) {
    const masked = applyMask(raw, meta.isOwner, {
      wallet: ['fromAddress', 'toAddress'],
      hash: ['txHash'],
    });
    ws.addRow({
      ...masked,
      direction: masked.direction ? DIRECTION_VI[masked.direction] ?? masked.direction : '—',
    });
  }

  ws.getColumn('occurredAt').numFmt = 'yyyy-mm-dd hh:mm:ss';
  ws.getColumn('amount').numFmt = '#,##0.00######';
  ws.getColumn('amount').alignment = { horizontal: 'right' };
  ws.getColumn('fee').numFmt = '#,##0.00######';
  ws.getColumn('fee').alignment = { horizontal: 'right' };
  ws.getColumn('stt').alignment = { horizontal: 'center' };

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };

  /* ---------------- Sheet 2: Thông tin xuất file ---------------- */
  const metaWs = wb.addWorksheet('Thông tin xuất file');
  metaWs.columns = [
    { header: 'Trường', key: 'k', width: 28 },
    { header: 'Giá trị', key: 'v', width: 70 },
  ];
  styleHeader(metaWs.getRow(1), 2);

  const f = meta.filterParams || {};
  const dateRangeLabel =
    f.dateFrom && f.dateTo ? `${f.dateFrom} → ${f.dateTo}`
      : f.dateFrom ? `Từ ${f.dateFrom}`
      : f.dateTo ? `Đến ${f.dateTo}`
      : (meta.dateRangeLabel || 'Toàn bộ');

  metaWs.addRows([
    { k: 'Báo cáo', v: meta.title },
    { k: 'Người dùng', v: meta.userDisplayName },
    { k: 'Ví', v: meta.userWalletAddress ?? '' },
    { k: 'Khoảng thời gian', v: dateRangeLabel },
    { k: 'Tổng số dòng đã xuất', v: rows.length },
    { k: 'Tổng số dòng khớp filter', v: meta.totalAvailable ?? rows.length },
    { k: 'Thời điểm xuất', v: new Date().toLocaleString('vi-VN') },
    { k: 'Surface', v: meta.surface },
    { k: '— Filter —', v: '' },
    { k: 'Chiều', v: fmtFilterVal(f.direction) },
    { k: 'Token', v: fmtFilterVal(f.token) },
    { k: 'Chain', v: fmtFilterVal((f as { chain?: unknown }).chain) },
    { k: 'Trạng thái', v: fmtFilterVal(f.status) },
    { k: 'Loại', v: fmtFilterVal(f.type) },
    { k: 'Tìm kiếm', v: fmtFilterVal(f.search) },
    { k: 'Chỉ ví ngoài', v: (f as { externalOnly?: boolean }).externalOnly ? 'Có' : '—' },
  ]);

  /* ---------------- Sheet 3: Summary ---------------- */
  const sumWs = wb.addWorksheet('Summary');
  sumWs.columns = [
    { header: 'Token', key: 'token', width: 12 },
    { header: 'Tổng nhận', key: 'totalIn', width: 20 },
    { header: 'Lệnh nhận', key: 'countIn', width: 12 },
    { header: 'Tổng gửi', key: 'totalOut', width: 20 },
    { header: 'Lệnh gửi', key: 'countOut', width: 12 },
    { header: 'Tổng giao dịch', key: 'count', width: 15 },
  ];
  styleHeader(sumWs.getRow(1), 6);

  const summary = computeSummary(rows);
  for (const s of summary) sumWs.addRow(s);

  sumWs.getColumn('totalIn').numFmt = '#,##0.00######';
  sumWs.getColumn('totalOut').numFmt = '#,##0.00######';
  sumWs.getColumn('totalIn').alignment = { horizontal: 'right' };
  sumWs.getColumn('totalOut').alignment = { horizontal: 'right' };
  sumWs.getColumn('countIn').alignment = { horizontal: 'right' };
  sumWs.getColumn('countOut').alignment = { horizontal: 'right' };
  sumWs.getColumn('count').alignment = { horizontal: 'right' };

  // Totals row
  if (summary.length > 0) {
    const totalRow = sumWs.addRow({
      token: 'TOTAL',
      totalIn: summary.reduce((s, r) => s + r.totalIn, 0),
      countIn: summary.reduce((s, r) => s + r.countIn, 0),
      totalOut: summary.reduce((s, r) => s + r.totalOut, 0),
      countOut: summary.reduce((s, r) => s + r.countOut, 0),
      count: summary.reduce((s, r) => s + r.count, 0),
    });
    totalRow.font = { bold: true };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
