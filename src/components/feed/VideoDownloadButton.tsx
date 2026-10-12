import { memo } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Download, Loader2 } from 'lucide-react';
import { useDownloadVideo } from '@/hooks/useDownloadVideo';

interface VideoDownloadButtonProps {
  postId: string;
  videoUrl: string;
  postContent?: string | null;
  currentUserId?: string;
}

export const VideoDownloadButton = memo(function VideoDownloadButton({
  postId,
  videoUrl,
  postContent,
  currentUserId,
}: VideoDownloadButtonProps) {
  const { t } = useLanguage();
  const { download, isDownloading } = useDownloadVideo();

  return (
    <button
      type="button"
      disabled={isDownloading}
      onClick={() => download({ postId, videoUrl, currentUserId, postContent })}
      className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 py-2 rounded-md transition-colors hover:bg-secondary text-muted-foreground active:bg-secondary/80 text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
      aria-label={t('vdbDownloadVideo')}
    >
      {isDownloading ? (
        <Loader2 className="w-[18px] h-[18px] animate-spin" />
      ) : (
        <Download className="w-[18px] h-[18px]" />
      )}
      <span className="hidden sm:inline">{t('vdbDownloadVideo')}</span>
      <span className="sm:hidden">{t('vdbDownload')}</span>
    </button>
  );
});
