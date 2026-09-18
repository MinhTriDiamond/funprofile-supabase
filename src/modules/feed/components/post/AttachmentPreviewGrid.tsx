/**
 * AttachmentPreviewGrid — Facebook-like asymmetric grid.
 * - 1 ảnh: full-bleed 4:5
 * - 2 ảnh: 2 cột 1:1
 * - 3 ảnh: 1 lớn (cột trái, row-span 2) + 2 nhỏ
 * - 4 ảnh: 2×2
 * - 5+ ảnh: 2 lớn hàng đầu + 3 nhỏ hàng sau; ô cuối overlay "+N"
 * Video hiện thumbnail (poster tự sinh), badge duration, icon Play trung tâm.
 * Progress upload dùng SVG circle mờ chồng ảnh — không dùng progress bar ngang.
 * Ô "+" thêm media nằm cuối grid khi chưa đầy slot.
 */
import { useMemo } from 'react';
import { AlertCircle, Captions, ImagePlus, Pencil, Play, RefreshCw, Volume2, VolumeX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DraftAttachment } from '../../types';

interface AttachmentPreviewGridProps {
  attachments: DraftAttachment[];
  disabled?: boolean;
  maxAttachments?: number;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRetry?: (id: string) => void;
  onAddMore?: () => void;
}

function formatDuration(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds)) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/** Circular progress overlay (SVG) — chuyên nghiệp như FB. */
function CircularProgress({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]">
      <svg width="56" height="56" viewBox="0 0 56 56" className="drop-shadow-lg">
        <circle cx="28" cy="28" r={radius} stroke="rgba(255,255,255,0.28)" strokeWidth="4" fill="none" />
        <circle
          cx="28"
          cy="28"
          r={radius}
          stroke="white"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform="rotate(-90 28 28)"
          style={{ transition: 'stroke-dasharray 200ms linear' }}
        />
        <text
          x="28"
          y="32"
          textAnchor="middle"
          fill="white"
          fontSize="11"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {Math.round(clamped)}%
        </text>
      </svg>
    </div>
  );
}

/**
 * Tính layout preset dựa trên số items.
 * Trả về mảng className cho từng ô (theo thứ tự), plus grid outer className.
 */
function computeLayout(count: number): { outer: string; tiles: string[]; visible: number } {
  if (count <= 0) return { outer: '', tiles: [], visible: 0 };
  if (count === 1) {
    return {
      outer: 'grid grid-cols-1',
      tiles: ['aspect-[4/5] w-full'],
      visible: 1,
    };
  }
  if (count === 2) {
    return {
      outer: 'grid grid-cols-2 gap-1.5',
      tiles: ['aspect-square', 'aspect-square'],
      visible: 2,
    };
  }
  if (count === 3) {
    return {
      outer: 'grid grid-cols-2 grid-rows-2 gap-1.5 aspect-[5/4]',
      tiles: ['row-span-2 h-full', 'h-full', 'h-full'],
      visible: 3,
    };
  }
  if (count === 4) {
    return {
      outer: 'grid grid-cols-2 gap-1.5',
      tiles: ['aspect-square', 'aspect-square', 'aspect-square', 'aspect-square'],
      visible: 4,
    };
  }
  // 5+ : 2 lớn trên, 3 nhỏ dưới, ô thứ 5 mang "+N" overlay
  return {
    outer: 'grid grid-cols-6 gap-1.5',
    tiles: [
      'col-span-3 aspect-[4/3]',
      'col-span-3 aspect-[4/3]',
      'col-span-2 aspect-square',
      'col-span-2 aspect-square',
      'col-span-2 aspect-square',
    ],
    visible: 5,
  };
}

export function AttachmentPreviewGrid({
  attachments,
  disabled,
  maxAttachments,
  onEdit,
  onRemove,
  onMove,
  onRetry,
  onAddMore,
}: AttachmentPreviewGridProps) {
  const sorted = useMemo(
    () => [...attachments].sort((a, b) => a.sortOrder - b.sortOrder),
    [attachments],
  );

  const canAddMore =
    !!onAddMore && (!maxAttachments || sorted.length < maxAttachments);

  // Tính "effective count" bao gồm cả tile "+ thêm" (nếu còn slot)
  const effectiveCount = sorted.length + (canAddMore ? 1 : 0);
  const layout = computeLayout(Math.min(effectiveCount, 5));

  if (sorted.length === 0) return null;

  const visibleAttachments = sorted.slice(0, layout.visible - (canAddMore ? 1 : 0));
  const remaining = sorted.length - visibleAttachments.length;

  const imageCount = sorted.filter((a) => a.kind === 'image').length;
  const videoCount = sorted.filter((a) => a.kind === 'video').length;

  return (
    <div className="space-y-2">
      <div className={`overflow-hidden rounded-2xl ${layout.outer}`}>
        {visibleAttachments.map((attachment, index) => {
          const isUploading = attachment.uploadStatus === 'uploading';
          const isError = attachment.uploadStatus === 'error';
          const isLastVisibleWithMore = index === visibleAttachments.length - 1 && remaining > 0 && !canAddMore;
          const duration = formatDuration(attachment.duration);
          const tileClass = layout.tiles[index] || 'aspect-square';
          const posterSrc = attachment.kind === 'video'
            ? (attachment.thumbnailUrl || attachment.fileUrl || attachment.previewUrl)
            : (attachment.previewUrl || attachment.fileUrl);

          return (
            <div
              key={attachment.id}
              className={`group relative overflow-hidden bg-muted ${tileClass}`}
              style={{ touchAction: 'manipulation' }}
            >
              {attachment.kind === 'image' ? (
                <img
                  src={posterSrc}
                  alt={attachment.altText || 'Ảnh đính kèm'}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="relative h-full w-full bg-black">
                  {posterSrc ? (
                    attachment.thumbnailUrl ? (
                      <img
                        src={posterSrc}
                        alt={attachment.altText || 'Video preview'}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <video
                        src={posterSrc}
                        className="h-full w-full object-cover opacity-80"
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )
                  ) : null}
                  {/* Play icon center */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white shadow-xl backdrop-blur-sm">
                      <Play className="ml-1 h-7 w-7 fill-current" />
                    </div>
                  </div>
                  {/* Muted icon top-left small */}
                  <div className="pointer-events-none absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur">
                    <VolumeX className="h-3.5 w-3.5" />
                  </div>
                </div>
              )}

              {/* Duration badge for video */}
              {duration ? (
                <span className="absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow">
                  {duration}
                </span>
              ) : null}

              {/* Alt text indicator */}
              {attachment.altText ? (
                <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                  <Captions className="h-3 w-3" /> Alt
                </span>
              ) : null}

              {/* Toolbar per tile (hover desktop, always visible mobile via tap-focus) */}
              <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-1 p-2 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <div className="flex flex-wrap gap-1">
                  {attachment.kind === 'image' && (
                    <button
                      type="button"
                      onClick={() => onEdit(attachment.id)}
                      disabled={disabled || isUploading}
                      aria-label="Sửa ảnh"
                      className="flex h-8 items-center gap-1 rounded-full bg-white/95 px-2.5 text-xs font-semibold text-foreground shadow-md transition hover:scale-105 disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Sửa
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit(attachment.id)}
                    disabled={disabled || isUploading}
                    aria-label="Thêm mô tả (Alt text)"
                    className="flex h-8 items-center gap-1 rounded-full bg-white/95 px-2.5 text-xs font-semibold text-foreground shadow-md transition hover:scale-105 disabled:opacity-50"
                  >
                    <Captions className="h-3.5 w-3.5" />
                    Alt
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(attachment.id)}
                  disabled={disabled}
                  aria-label="Xóa media"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white shadow-md backdrop-blur transition hover:scale-105 hover:bg-black/85 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Reorder arrows — bottom center on hover only (desktop pattern) */}
              {sorted.length > 1 ? (
                <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                  {index > 0 ? (
                    <button
                      type="button"
                      onClick={() => onMove(attachment.id, -1)}
                      disabled={disabled || isUploading}
                      className="h-7 w-7 rounded-full bg-black/70 text-white shadow-md transition hover:scale-110 disabled:opacity-50"
                      aria-label="Đưa lên trước"
                    >
                      ‹
                    </button>
                  ) : null}
                  {index < sorted.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => onMove(attachment.id, 1)}
                      disabled={disabled || isUploading}
                      className="h-7 w-7 rounded-full bg-black/70 text-white shadow-md transition hover:scale-110 disabled:opacity-50"
                      aria-label="Đưa xuống sau"
                    >
                      ›
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* +N overlay khi có ảnh ẩn (chỉ khi không có tile Add More) */}
              {isLastVisibleWithMore ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-3xl font-bold text-white backdrop-blur-sm">
                  +{remaining}
                </div>
              ) : null}

              {/* Upload progress */}
              {isUploading ? <CircularProgress value={attachment.progress || 0} /> : null}

              {/* Error state */}
              {isError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-destructive/90 p-3 text-center text-white">
                  <AlertCircle className="h-6 w-6" />
                  <span className="line-clamp-2 text-xs font-medium">{attachment.error || 'Tải lên thất bại'}</span>
                  {onRetry ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 gap-1 rounded-full"
                      onClick={() => onRetry(attachment.id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Thử lại
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}

        {/* "+ Add more" tile inline — luôn ở cuối grid khi còn slot */}
        {canAddMore ? (
          <button
            type="button"
            onClick={onAddMore}
            disabled={disabled}
            className={`group relative flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border/70 bg-muted/40 text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:opacity-50 ${
              layout.tiles[visibleAttachments.length] || 'aspect-square'
            }`}
            aria-label="Thêm ảnh hoặc video"
          >
            {/* Nếu vẫn còn ảnh chưa hiện (5+ tổng) → hiện "+N" thay chữ */}
            {remaining > 0 ? (
              <span className="text-2xl font-bold">+{remaining}</span>
            ) : (
              <>
                <ImagePlus className="h-6 w-6" />
                <span className="text-xs font-semibold">Thêm ảnh/video</span>
              </>
            )}
          </button>
        ) : null}
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <span>
          {imageCount > 0 ? `${imageCount} ảnh` : ''}
          {imageCount > 0 && videoCount > 0 ? ' · ' : ''}
          {videoCount > 0 ? `${videoCount} video` : ''}
        </span>
        {maxAttachments ? (
          <span>
            {sorted.length}/{maxAttachments}
          </span>
        ) : null}
      </div>
    </div>
  );
}
