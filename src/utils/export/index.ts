/**
 * Entry export utils — Excel duy nhất.
 * PDF đã bị loại bỏ để giảm technical debt.
 */
import { toast } from 'sonner';
import type { TxExportRow, ExportMeta } from './types';
import { EXPORT_LIMITS } from './types';
import { recordExportAudit } from './auditLog';

export * from './types';
export * from './mapRows';

interface RunOpts {
  rows: TxExportRow[];
  meta: ExportMeta;
  filenameBase: string; // không gồm extension
  currentUserId?: string | null;
  isAdminRole?: boolean;
}

function tsForFilename(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export async function exportTransactionsExcel({
  rows, meta, filenameBase, currentUserId, isAdminRole,
}: RunOpts): Promise<void> {
  if (!rows.length) {
    toast.error('Không có giao dịch để xuất.');
    return;
  }
  const limit = EXPORT_LIMITS.excel;
  if (rows.length > limit) {
    toast.error(
      `Vượt giới hạn ${limit.toLocaleString('vi-VN')} dòng cho Excel. Vui lòng thu hẹp khoảng thời gian.`
    );
    if (currentUserId) {
      void recordExportAudit({
        userId: currentUserId,
        exportType: 'excel',
        surface: meta.surface,
        filterParams: meta.filterParams,
        rowCount: rows.length,
        role: isAdminRole ? 'admin' : 'user',
        status: 'blocked_limit',
        errorMessage: `row_count ${rows.length} > limit ${limit}`,
      });
    }
    return;
  }

  const filename = `${filenameBase}-${tsForFilename()}.xlsx`;
  const toastId = toast.loading('Đang tạo file Excel…');
  try {
    const { exportRowsToExcel } = await import('./exportExcel');
    await exportRowsToExcel(rows, meta, filename);
    toast.success(`Đã xuất ${rows.length.toLocaleString('vi-VN')} dòng.`, { id: toastId });
    if (currentUserId) {
      void recordExportAudit({
        userId: currentUserId,
        exportType: 'excel',
        surface: meta.surface,
        filterParams: meta.filterParams,
        rowCount: rows.length,
        role: isAdminRole ? 'admin' : 'user',
        status: 'success',
      });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error('[export] failed', e);
    toast.error(`Xuất file thất bại: ${msg}`, { id: toastId });
    if (currentUserId) {
      void recordExportAudit({
        userId: currentUserId,
        exportType: 'excel',
        surface: meta.surface,
        filterParams: meta.filterParams,
        rowCount: rows.length,
        role: isAdminRole ? 'admin' : 'user',
        status: 'failed',
        errorMessage: msg.slice(0, 500),
      });
    }
  }
}
