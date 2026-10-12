import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import type { TxExportRow, ExportMeta } from '@/utils/export';
import { exportTransactionsExcel } from '@/utils/export';

interface Props {
  /** Hàm trả về rows theo filter hiện tại (gọi tại thời điểm click). */
  getRows: () => TxExportRow[];
  meta: ExportMeta;
  filenameBase: string;
  currentUserId?: string | null;
  isAdminRole?: boolean;
  /** Hiển thị icon-only (compact). */
  iconOnly?: boolean;
  disabled?: boolean;
}

export function ExportTransactionsMenu({
  getRows,
  meta,
  filenameBase,
  currentUserId,
  isAdminRole,
  iconOnly = false,
  disabled,
}: Props) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  const handle = async () => {
    setBusy(true);
    try {
      const rows = getRows();
      await exportTransactionsExcel({ rows, meta, filenameBase, currentUserId, isAdminRole });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size={iconOnly ? 'icon' : 'sm'}
      className={iconOnly ? 'h-7 w-7' : 'h-7 px-2 gap-1.5'}
      disabled={disabled || busy}
      onClick={handle}
      title={t('etmExportTitle')}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : iconOnly ? (
        <Download className="w-4 h-4" />
      ) : (
        <FileSpreadsheet className="w-4 h-4 text-green-600" />
      )}
      {!iconOnly && <span className="text-xs">{t('etmExportExcel')}</span>}
    </Button>
  );
}
