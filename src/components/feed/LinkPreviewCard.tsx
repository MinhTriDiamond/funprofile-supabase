import { memo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLinkPreview, extractFirstUrl } from '@/hooks/useLinkPreview';

interface LinkPreviewCardProps {
  url: string;
}

const EMBED_PATTERNS = [
  'facebook.com/video/embed',
  'facebook.com/plugins/video',
  'youtube.com/embed',
  'youtube-nocookie.com/embed',
  'player.vimeo.com',
  'dailymotion.com/embed',
  'tiktok.com/embed',
];

const DIRECT_VIDEO_EXTS = ['.mp4', '.webm', '.ogg', '.m3u8'];

function isEmbedUrl(url: string): boolean {
  return EMBED_PATTERNS.some(p => url.includes(p));
}

function isDirectVideo(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return DIRECT_VIDEO_EXTS.some(ext => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

const LinkPreviewCardComponent = ({ url }: LinkPreviewCardProps) => {
  const { data, isLoading } = useLinkPreview(url);
  const [imageError, setImageError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  if (isLoading) {
    return (
      <div className="mb-3 border-y border-border overflow-hidden">
        <Skeleton className="w-full h-[200px]" />
        <div className="p-3 space-y-2 bg-muted/30">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const domain = (() => {
    try { return new URL(data.url).hostname.replace('www.', ''); } catch { return ''; }
  })();

  const showImage = data.image && !imageError;
  const hasVideo = data.video && !videoError;
  const showVideo = hasVideo && (isEmbedUrl(data.video!) || isDirectVideo(data.video!));

  const renderMedia = () => {
    if (showVideo) {
      const videoUrl = data.video!;
      if (isEmbedUrl(videoUrl)) {
        return (
          <div className="w-full bg-black aspect-video">
            <iframe
              src={videoUrl}
              className="w-full h-full"
              allowFullScreen
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerPolicy="no-referrer"
              onError={() => setVideoError(true)}
            />
          </div>
        );
      }
      return (
        <div className="w-full bg-black">
          <video
            src={videoUrl}
            controls
            preload="metadata"
            className="w-full max-h-[400px]"
            poster={data.image || undefined}
            onError={() => setVideoError(true)}
          />
        </div>
      );
    }

    if (showImage) {
      return (
        <div className="w-full bg-muted">
          <img
            src={data.image!}
            alt={data.title || ''}
            className="w-full max-h-[400px] object-cover"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        </div>
      );
    }

    return null;
  };

  const metadataBlock = (
    <div className="px-3 py-2.5 space-y-0.5 bg-muted/30">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
        {data.favicon && (
          <img
            src={data.favicon}
            alt=""
            className="w-3.5 h-3.5 rounded-sm"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <span>{(data.author && data.siteName && data.author.toLowerCase().includes(data.siteName.toLowerCase())) ? domain : (data.siteName || domain)}</span>
      </div>

      {data.author && (
        <p className="font-semibold text-sm text-foreground">
          {data.author}
        </p>
      )}

      {data.title && (
        <h4 className="font-semibold text-[15px] leading-snug text-foreground line-clamp-2">
          {data.title}
        </h4>
      )}

      {data.description && (
        <p className="text-xs text-muted-foreground line-clamp-1">
          {data.description}
        </p>
      )}

      {!data.title && !data.image && !data.video && (
        <div className="flex items-center gap-1.5 text-sm text-primary">
          <ExternalLink className="w-3.5 h-3.5" />
          <span className="truncate">{domain}</span>
        </div>
      )}
    </div>
  );

  // When video is shown, use div wrapper to avoid <a> conflicting with video controls
  if (showVideo) {
    return (
      <div className="block mb-3 border-y border-border overflow-hidden group">
        {renderMedia()}
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {metadataBlock}
        </a>
      </div>
    );
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block mb-3 border-y border-border overflow-hidden group"
      onClick={(e) => e.stopPropagation()}
    >
      {renderMedia()}
      {metadataBlock}
    </a>
  );
};

export const LinkPreviewCard = memo(LinkPreviewCardComponent);
export { extractFirstUrl };
