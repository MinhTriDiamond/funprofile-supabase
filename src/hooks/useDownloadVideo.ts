import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { extractStreamUid, isStreamUrl } from '@/utils/streamUpload';
import { isR2Url, isSupabaseStorageUrl } from '@/utils/streamHelpers';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

type Provider = 'stream' | 'r2' | 'storage' | 'external';

function detectProvider(url: string): Provider {
  if (isStreamUrl(url)) return 'stream';
  if (isR2Url(url)) return 'r2';
  if (isSupabaseStorageUrl(url)) return 'storage';
  return 'external';
}

function resolveMp4Url(rawUrl: string, provider: Provider): string | null {
  if (provider === 'stream') {
    const uid = extractStreamUid(rawUrl);
    if (!uid) return null;
    // Customer code không suy được trực tiếp; dùng customer-<code> trong URL nếu có
    const m = rawUrl.match(/https?:\/\/(customer-[a-z0-9]+\.cloudflarestream\.com)/i);
    const host = m?.[1] ?? 'videodelivery.net';
    return `https://${host}/${uid}/downloads/default.mp4`;
  }
  return rawUrl;
}

function isTelegramWebView(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  // @ts-expect-error Telegram WebView global
  return /Telegram/i.test(ua) || !!window.Telegram?.WebView;
}

function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function buildFilename(post: { id: string; content?: string | null }): string {
  const slug = (post.content || `video-${post.id.slice(0, 8)}`)
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .slice(0, 60)
    .replace(/^-+|-+$/g, '');
  return `${slug || 'fun-video'}.mp4`;
}

export function useDownloadVideo() {
  const [isDownloading, setIsDownloading] = useState(false);

  const download = useCallback(
    async (params: {
      postId: string;
      videoUrl: string;
      currentUserId?: string;
      postContent?: string | null;
    }) => {
      if (isDownloading) return;
      const { postId, videoUrl, currentUserId, postContent } = params;
      if (!videoUrl) {
        toast.error('Không thể tải video');
        return;
      }

      const provider = detectProvider(videoUrl);
      const resolved = resolveMp4Url(videoUrl, provider);
      if (!resolved) {
        toast.error('Không thể tải video');
        return;
      }

      const toastId = toast.loading('Đang chuẩn bị tải video…');
      setIsDownloading(true);

      try {
        const filename = buildFilename({ id: postId, content: postContent });
        const proxyUrl =
          `${SUPABASE_URL}/functions/v1/replay-download?url=${encodeURIComponent(resolved)}&filename=${encodeURIComponent(filename)}`;

        // Telegram WebView + iOS Safari: <a download> bị chặn → dùng location.assign
        if (isTelegramWebView() || (isMobile() && /iPhone|iPad|iPod/i.test(navigator.userAgent))) {
          window.location.assign(proxyUrl);
        } else {
          const a = document.createElement('a');
          a.href = proxyUrl;
          a.download = filename;
          a.rel = 'noopener';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }

        toast.success('Video đang được tải xuống', { id: toastId });

        // Fire-and-forget analytics
        try {
          let hostOnly = videoUrl;
          try {
            hostOnly = new URL(videoUrl).host;
          } catch {
            /* keep raw */
          }
          await supabase.from('video_downloads').insert({
            post_id: postId,
            video_url: hostOnly,
            video_provider: provider,
            user_id: currentUserId ?? null,
            user_agent: navigator.userAgent.slice(0, 500),
          });
        } catch {
          /* swallow */
        }
      } catch (err) {
        console.error('[useDownloadVideo]', err);
        toast.error('Không thể tải video', { id: toastId });
      } finally {
        setIsDownloading(false);
      }
    },
    [isDownloading],
  );

  return { download, isDownloading };
}
