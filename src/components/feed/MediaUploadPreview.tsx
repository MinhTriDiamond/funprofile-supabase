/**
 * MediaUploadPreview Component
 * Grid layout with thumbnails, progress overlays, drag-and-drop reordering
 */

import { useState, useCallback } from 'react';
import { X, Loader2, CheckCircle, AlertCircle, RotateCcw, GripVertical, ImagePlus, Video, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { UploadItem, formatBytes } from '@/utils/uploadQueue';

interface MediaUploadPreviewProps {
  items: UploadItem[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  disabled?: boolean;
  maxItems?: number;
}

export function MediaUploadPreview({
  items,
  onRemove,
  onRetry,
  onReorder,
  disabled = false,
  maxItems = 100,
}: MediaUploadPreviewProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    if (disabled) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox
    e.dataTransfer.setData('text/plain', String(index));
  }, [disabled]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  }, [draggedIndex]);

  const handleDragEnd = useCallback(() => {
    if (draggedIndex !== null && dragOverIndex !== null && draggedIndex !== dragOverIndex) {
      onReorder(draggedIndex, dragOverIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [draggedIndex, dragOverIndex, onReorder]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  if (items.length === 0) {
    return null;
  }

  // Determine grid layout based on item count
  const getGridClass = () => {
    if (items.length === 1) return 'grid-cols-1';
    if (items.length === 2) return 'grid-cols-2';
    if (items.length <= 4) return 'grid-cols-2';
    return 'grid-cols-3 sm:grid-cols-4';
  };

  return (
    <div className="space-y-3">
      {/* Stats Bar */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {items.length}/{maxItems} file
          {items.filter(i => i.status === 'completed').length > 0 && (
            <span className="text-green-500 ml-2">
              ✓ {items.filter(i => i.status === 'completed').length} đã tải xong
            </span>
          )}
          {items.filter(i => i.status === 'uploading').length > 0 && (
            <span className="text-primary ml-2">
              ⬆ {items.filter(i => i.status === 'uploading').length} đang tải
            </span>
          )}
        </span>
        <span className="text-xs">
          Kéo để sắp xếp lại
        </span>
      </div>

      {/* Media Grid */}
      <div className={cn('grid gap-2', getGridClass())}>
        {items.map((item, index) => (
          <div
            key={item.id}
            draggable={!disabled && item.status !== 'uploading'}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onDragLeave={handleDragLeave}
            className={cn(
              'relative aspect-square rounded-lg overflow-hidden border-2 transition-all',
              draggedIndex === index && 'opacity-50 scale-95',
              dragOverIndex === index && 'border-primary border-dashed',
              item.status === 'completed' && 'border-green-500/50',
              item.status === 'failed' && 'border-destructive',
              item.status === 'uploading' && 'border-primary/50',
              item.status === 'queued' && 'border-border',
              !disabled && item.status !== 'uploading' && 'cursor-grab active:cursor-grabbing'
            )}
          >
            {/* Preview Image/Video */}
            <div className="absolute inset-0 bg-muted">
              {item.type === 'image' ? (
                <img
                  src={item.preview}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="relative w-full h-full">
                  <video
                    src={item.preview}
                    className="w-full h-full object-cover"
                    muted
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Play className="w-10 h-10 text-white drop-shadow-lg" />
                  </div>
                </div>
              )}
            </div>

            {/* Progress Overlay */}
            {(item.status === 'uploading' || item.status === 'queued') && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center p-2">
                {item.status === 'uploading' ? (
                  <>
                    <Loader2 className="w-6 h-6 text-white animate-spin mb-2" />
                    <Progress value={item.progress} className="w-3/4 h-1.5" />
                    <span className="text-white text-xs mt-1 font-medium">
                      {item.progress.toFixed(0)}%
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-6 h-6 rounded-full border-2 border-white/50 flex items-center justify-center">
                      <span className="text-white text-xs">{index + 1}</span>
                    </div>
                    <span className="text-white/70 text-xs mt-1">Đang chờ</span>
                  </>
                )}
              </div>
            )}

            {/* Completed Overlay */}
            {item.status === 'completed' && (
              <div className="absolute bottom-1 left-1 bg-green-500 text-white rounded-full p-1">
                <CheckCircle className="w-4 h-4" />
              </div>
            )}

            {/* Failed Overlay */}
            {item.status === 'failed' && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-2">
                <AlertCircle className="w-6 h-6 text-destructive mb-1" />
                <span className="text-white text-xs text-center mb-2 line-clamp-2">
                  {item.error || 'Thất bại'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRetry(item.id)}
                  className="h-6 text-xs text-white hover:bg-white/20"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  Thử lại
                </Button>
              </div>
            )}

            {/* Remove Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(item.id)}
              disabled={disabled}
              className="absolute top-1 right-1 h-6 w-6 bg-black/50 hover:bg-black/70 text-white rounded-full"
            >
              <X className="w-3 h-3" />
            </Button>

            {/* Drag Handle */}
            {!disabled && item.status !== 'uploading' && (
              <div className="absolute top-1 left-1 p-1 bg-black/50 rounded text-white opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
                <GripVertical className="w-3 h-3" />
              </div>
            )}

            {/* Type Indicator */}
            <div className="absolute bottom-1 right-1 bg-black/60 rounded px-1.5 py-0.5 flex items-center gap-1">
              {item.type === 'image' ? (
                <ImagePlus className="w-3 h-3 text-white" />
              ) : (
                <Video className="w-3 h-3 text-white" />
              )}
              <span className="text-white text-[10px] uppercase">
                {item.file.name.split('.').pop()}
              </span>
            </div>

            {/* File Size */}
            {item.status === 'queued' && (
              <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1.5 py-0.5">
                <span className="text-white text-[10px]">
                  {formatBytes(item.file.size)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Show "See more" if too many items */}
      {items.length > 12 && (
        <p className="text-sm text-center text-muted-foreground">
          Hiển thị 12/{items.length} file • Cuộn để xem thêm
        </p>
      )}
    </div>
  );
}
