import { Button } from '@/components/ui/button';
import { RefreshCw, Download } from 'lucide-react';

interface Props {
  onRefresh?: () => void;
  onExport?: () => void;
  isRefreshing?: boolean;
  disableExport?: boolean;
}

export function PanelToolbar({ onRefresh, onExport, isRefreshing, disableExport }: Props) {
  return (
    <div className="flex items-center gap-0.5">
      {onRefresh && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Làm mới"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      )}
      {onExport && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onExport}
          disabled={disableExport}
          title="Tải CSV"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
