import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { EmojiPicker } from '@/components/feed/EmojiPicker';
import { Plus, Send, Trash2, FileText, FileSpreadsheet, File, Smartphone, FileArchive, Play } from 'lucide-react';

/* ── helpers ── */

const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic'];
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v'];

function isImageFile(f: File) {
  if (f.type.startsWith('image/')) return true;
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTS.includes(ext);
}

function isVideoFile(f: File) {
  if (f.type.startsWith('video/')) return true;
  const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTS.includes(ext);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const iconMap: Record<string, React.ElementType> = {
  FileText,
  FileSpreadsheet,
  FileArchive,
  Smartphone,
  File,
};

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'pdf': return { Icon: FileText, color: 'text-red-500' };
    case 'doc': case 'docx': return { Icon: FileText, color: 'text-blue-500' };
    case 'xls': case 'xlsx': case 'csv': return { Icon: FileSpreadsheet, color: 'text-green-500' };
    case 'zip': case 'rar': case '7z': case 'tar': case 'gz': return { Icon: FileArchive, color: 'text-yellow-500' };
    case 'apk': return { Icon: Smartphone, color: 'text-green-600' };
    default: return { Icon: File, color: 'text-muted-foreground' };
  }
}

/* ── types ── */

interface AttachmentPreviewDialogProps {
  open: boolean;
  files: File[];
  onClose: () => void;
  onSend: (caption: string) => void;
  onAddMore: () => void;
  onRemoveFile: (index: number) => void;
  isSending?: boolean;
}

/* ── component ── */

export function AttachmentPreviewDialog({
  open,
  files,
  onClose,
  onSend,
  onAddMore,
  onRemoveFile,
  isSending = false,
}: AttachmentPreviewDialogProps) {
  const [caption, setCaption] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset when dialog opens/closes
  useEffect(() => {
    if (open) {
      setCaption('');
      setActiveIdx(0);
    }
  }, [open]);

  // Clamp activeIdx
  useEffect(() => {
    if (activeIdx >= files.length && files.length > 0) {
      setActiveIdx(files.length - 1);
    }
  }, [files.length, activeIdx]);

  const previews = useMemo(
    () => files.map((f) => (isImageFile(f) || isVideoFile(f) ? URL.createObjectURL(f) : '')),
    [files],
  );

  // Cleanup URLs
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  const handleEmojiSelect = useCallback((emoji: string) => {
    setCaption((p) => p + emoji);
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend(caption.trim());
    }
  };

  if (files.length === 0) return null;

  const activeFile = files[activeIdx] ?? files[0];
  const activePreview = previews[activeIdx] ?? '';
  const isImg = isImageFile(activeFile);
  const isVid = isVideoFile(activeFile);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-[95vw] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-base">Gửi file đính kèm</DialogTitle>
        </DialogHeader>

        {/* ── Main preview ── */}
        <div className="px-4 relative">
          <div className="relative rounded-lg overflow-hidden bg-muted flex items-center justify-center min-h-[200px] max-h-[320px]">
            {isImg && activePreview ? (
              <img
                src={activePreview}
                alt={activeFile.name}
                className="w-full max-h-[320px] object-contain"
              />
            ) : isVid && activePreview ? (
              <div className="relative w-full">
                <video
                  src={activePreview}
                  className="w-full max-h-[320px] object-contain"
                  muted
                  playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="h-12 w-12 rounded-full bg-black/50 flex items-center justify-center">
                    <Play className="h-6 w-6 text-white fill-white" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8">
                {(() => {
                  const { Icon, color } = getFileIcon(activeFile.name);
                  return <Icon className={`h-16 w-16 ${color}`} />;
                })()}
                <span className="text-sm font-medium truncate max-w-[240px]">{activeFile.name}</span>
                <span className="text-xs text-muted-foreground">{formatSize(activeFile.size)}</span>
              </div>
            )}

            {/* Remove button on preview */}
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 rounded-full opacity-80 hover:opacity-100"
              onClick={() => {
                onRemoveFile(activeIdx);
                if (files.length <= 1) onClose();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Thumbnails (if >1 file) ── */}
        {files.length > 1 && (
          <div className="flex gap-2 px-4 pt-2 overflow-x-auto pb-1">
            {files.map((f, i) => {
              const isActive = i === activeIdx;
              const thumb = previews[i];
              const isI = isImageFile(f);
              const isV = isVideoFile(f);
              return (
                <button
                  key={i}
                  onClick={() => setActiveIdx(i)}
                  className={`relative flex-shrink-0 h-14 w-14 rounded-lg overflow-hidden border-2 transition-colors ${
                    isActive ? 'border-primary' : 'border-transparent hover:border-muted-foreground/30'
                  }`}
                >
                  {(isI || isV) && thumb ? (
                    <img src={thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-muted flex items-center justify-center">
                      {(() => {
                        const { Icon, color } = getFileIcon(f.name);
                        return <Icon className={`h-5 w-5 ${color}`} />;
                      })()}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Caption input ── */}
        <div className="px-4 pt-2 flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Thêm chú thích..."
            className="min-h-[40px] max-h-[80px] resize-none flex-1 text-sm"
            rows={1}
          />
          <EmojiPicker onEmojiSelect={handleEmojiSelect} />
        </div>

        {/* ── Actions ── */}
        <DialogFooter className="px-4 py-3 flex-row gap-2 justify-between sm:justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={onAddMore}
            disabled={files.length >= 4 || isSending}
          >
            <Plus className="h-4 w-4 mr-1" />
            Thêm
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={isSending}>
              Huỷ
            </Button>
            <Button
              size="sm"
              onClick={() => onSend(caption.trim())}
              disabled={isSending}
              className="bg-primary hover:bg-primary/90"
            >
              <Send className="h-4 w-4 mr-1" />
              Gửi
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
