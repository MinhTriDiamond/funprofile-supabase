import { useState } from 'react';
import { cn } from '@/lib/utils';
import { getFileExtension, getFileName, getFileIconInfo } from '../utils/fileUtils';
import { FileText, FileSpreadsheet, File, Smartphone, FileArchive, Download, Loader2 } from 'lucide-react';

const iconMap: Record<string, React.ComponentType<any>> = {
  FileText,
  FileSpreadsheet,
  FileArchive,
  Smartphone,
  File,
};

interface FileAttachmentProps {
  url: string;
  isOwn: boolean;
}

export function FileAttachment({ url, isOwn }: FileAttachmentProps) {
  const [downloading, setDownloading] = useState(false);
  const ext = getFileExtension(url);
  const fileName = getFileName(url);
  const { icon, color } = getFileIconInfo(ext);
  const IconComponent = iconMap[icon] || File;

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Fallback: open in new tab
      window.open(url, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl border min-w-[200px] max-w-[280px] text-left group transition-colors',
        isOwn
          ? 'border-primary-foreground/20 hover:bg-primary-foreground/10'
          : 'border-border hover:bg-accent'
      )}
    >
      <div className={cn('shrink-0', color)}>
        <IconComponent className="h-8 w-8" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn(
          'text-sm font-medium truncate',
          isOwn ? 'text-primary-foreground' : 'text-foreground'
        )}>
          {fileName}
        </p>
        <p className={cn(
          'text-xs',
          isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
        )}>
          {ext.toUpperCase() || 'FILE'} · Bấm để tải
        </p>
      </div>
      {downloading ? (
        <Loader2 className={cn(
          'h-4 w-4 shrink-0 animate-spin',
          isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
        )} />
      ) : (
        <Download className={cn(
          'h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity',
          isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'
        )} />
      )}
    </button>
  );
}
