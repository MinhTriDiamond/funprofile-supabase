import { useState, useCallback, useRef, memo, useMemo } from 'react';
import { toast } from 'sonner';
import { useLanguage } from '@/i18n/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { getAbsolutePostShareUrl } from '@/lib/slug';
import { isSupabaseStorageUrl, deleteStorageFile } from '@/utils/streamHelpers';
import { usePostStats } from '@/hooks/usePostStats';
import { useLiveReplayStatus } from '@/hooks/live/useLiveReplayStatus';
import { useLivePostMediaHydration } from '@/hooks/live/useLivePostMediaHydration';
import { PostHeader } from './PostHeader';
import { PostMedia } from './PostMedia';
import { PostFooter } from './PostFooter';
import { ExpandableContent } from './ExpandableContent';
import { CommentSection } from './CommentSection';
import { ImageViewer } from './ImageViewer';
import { EditPostDialog } from './EditPostDialog';
import { ShareDialog } from './ShareDialog';
import { LiveChatReplay } from '@/modules/live/components/LiveChatReplay';
import { LinkPreviewCard, extractFirstUrl } from './LinkPreviewCard';
import type { FacebookPostCardProps } from './types';
import { getPostPlayback } from './postPlaybackResolver';
import { useLongPress } from '@/hooks/useLongPress';
import { PostContextMenu } from './PostContextMenu';

const FacebookPostCardComponent = ({
  post, currentUserId, onPostDeleted, initialStats,
  isPinned = false, onPinPost, onUnpinPost,
  isOwnProfile = false, viewAsPublic = false,
  disableRealtime = false,
}: FacebookPostCardProps) => {
  const { t } = useLanguage();
  const canShowPinOption = isOwnProfile && !viewAsPublic && post.user_id === currentUserId;
  const firstUrl = post.content ? extractFirstUrl(post.content) : null;

  // Auto-upgrade lên HLS HD khi Cloudflare Stream encode xong
  const isLivePost = post.post_type === 'live' || post.post_type === 'live_replay';
  const liveSessionId = isLivePost ? (post.metadata?.live_session_id as string | undefined) : undefined;
  const liveHydration = useLivePostMediaHydration(post);
  // Hydrate bất cứ khi nào là post live và chưa có MP4 R2 thật sự.
  // Không yêu cầu live_status='ended' trước, vì feed cache có thể vẫn ghi
  // 'live' do không có realtime invalidate khi host kết thúc.
  const needsReplayHydrate = isLivePost
    && post.metadata?.playback_provider !== 'r2'
    && post.metadata?.replay_status !== 'ready_mp4';
  const replayOverride = useLiveReplayStatus(liveSessionId, needsReplayHydrate, {
    subscriptionKey: post.id,
    realtime: !disableRealtime,
  });

  const effectivePost = useMemo(() => {
    const mergedMetadata = {
      ...(post.metadata || {}),
      ...(liveHydration.metadata || {}),
      ...(replayOverride || {}),
    };
    const playback = getPostPlayback(
      { ...(post as unknown as Record<string, unknown>), metadata: mergedMetadata },
      {
        metadata: mergedMetadata,
        liveSession: liveHydration.resolvedRoute as unknown as Record<string, unknown> | null,
        liveReplay: liveHydration.replay as unknown as Record<string, unknown> | null,
        replayOverride: replayOverride as unknown as Record<string, unknown> | null,
        fallbackUrl: liveHydration.finalVideoUrl,
      },
    );
    return {
      ...post,
      video_url: playback.status === 'ready' && playback.url ? playback.url : post.video_url,
      metadata: mergedMetadata,
    };
  }, [post, liveHydration.metadata, liveHydration.resolvedRoute, liveHydration.replay, liveHydration.finalVideoUrl, replayOverride]);
  const hasNativeMedia = !!(
    effectivePost.image_url ||
    effectivePost.video_url ||
    (effectivePost.media_urls && effectivePost.media_urls.length > 0)
  );
  const shouldShowLinkPreview = !!firstUrl && !hasNativeMedia;
  const downloadableVideoUrl = useMemo(() => {
    if (effectivePost.video_url) return effectivePost.video_url;
    const m = (effectivePost.media_urls || []).find(
      (it) => it && typeof it === 'object' && (it as { type?: string }).type === 'video' && (it as { url?: string }).url,
    ) as { url?: string } | undefined;
    return m?.url || null;
  }, [effectivePost.video_url, effectivePost.media_urls]);

  const [showImageViewer, setShowImageViewer] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showHeartAnimation, setShowHeartAnimation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const lastTapRef = useRef<number>(0);

  const {
    likeCount, commentCount, shareCount,
    currentReaction, reactionCounts,
    handleReactionChange, incrementCommentCount, setShareCount,
  } = usePostStats(post.id, currentUserId, initialStats, disableRealtime);

  const handleDelete = useCallback(async () => {
    if (isDeleting) return;
    const confirmed = window.confirm(t('fpcDeleteConfirm'));
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Unauthorized');

      const { error } = await supabase.functions.invoke('delete-post-archive', {
        body: { post_id: post.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      toast.success(t('postDeleted'));
      onPostDeleted();
      if (post.video_url && isSupabaseStorageUrl(post.video_url)) deleteStorageFile(post.video_url).catch(() => {});
    } catch {
      toast.error(t('cannotDeletePost'));
    } finally {
      setIsDeleting(false);
    }
  }, [isDeleting, post, onPostDeleted, t]);

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(getAbsolutePostShareUrl(post));
    toast.success(t('linkCopied'));
  }, [post, t]);

  const toggleComments = useCallback(() => setShowComments((p) => !p), []);

  const handleMediaDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300 && !currentReaction) {
      setShowHeartAnimation(true);
    }
    lastTapRef.current = now;
  }, [currentReaction]);

  return (
    <>
      <div className="fb-card mb-3 sm:mb-4 overflow-hidden">
        <PostHeader
          post={effectivePost}
          currentUserId={currentUserId}
          isPinned={isPinned}
          canShowPinOption={canShowPinOption}
          isDeleting={isDeleting}
          onCopyLink={handleCopyLink}
          onCopyContent={post.content ? () => {
            navigator.clipboard.writeText(post.content!);
            toast.success(t('postCopySuccess'));
          } : undefined}
          onEdit={() => setShowEditDialog(true)}
          onDelete={handleDelete}
          onPinPost={onPinPost}
          onUnpinPost={onUnpinPost}
        />

        {post.content && (
          <PostContentBlock
            content={post.content}
            shareUrl={getAbsolutePostShareUrl(post)}
            onOpenShare={() => setShowShareDialog(true)}
          />
        )}

        <PostMedia
          post={effectivePost}
          showHeartAnimation={showHeartAnimation}
          onHeartComplete={() => setShowHeartAnimation(false)}
          onDoubleTap={handleMediaDoubleTap}
        />

        {shouldShowLinkPreview && <LinkPreviewCard url={firstUrl} />}

        <PostFooter
          post={post}
          currentUserId={currentUserId}
          likeCount={likeCount}
          commentCount={commentCount}
          shareCount={shareCount}
          currentReaction={currentReaction}
          reactionCounts={reactionCounts}
          onToggleComments={toggleComments}
          onReactionChange={handleReactionChange}
          onShareClick={() => setShowShareDialog(true)}
          downloadableVideoUrl={downloadableVideoUrl}
        />

        {showComments && (
          <div className="border-t border-border px-4 py-3">
            {(post.post_type === 'live' || post.post_type === 'live_replay') && post.metadata?.live_session_id && (
              <div className="max-h-[300px] rounded-lg overflow-hidden border border-border mb-3">
                <LiveChatReplay sessionId={post.metadata.live_session_id} />
              </div>
            )}
            <CommentSection postId={post.id} onCommentAdded={incrementCommentCount} disableRealtime={disableRealtime} />
          </div>
        )}
      </div>

      <ImageViewer imageUrl={post.image_url || ''} isOpen={showImageViewer} onClose={() => setShowImageViewer(false)} />
      <EditPostDialog post={post} isOpen={showEditDialog} onClose={() => setShowEditDialog(false)} onPostUpdated={onPostDeleted} />
      <ShareDialog
        open={showShareDialog} onOpenChange={setShowShareDialog}
        post={post} currentUserId={currentUserId}
        onShareComplete={() => setShareCount((p) => p + 1)}
      />
    </>
  );
};

interface PostContentBlockProps {
  content: string;
  shareUrl: string;
  onOpenShare: () => void;
}

const PostContentBlock = ({ content, shareUrl, onOpenShare }: PostContentBlockProps) => {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const blockRef = useRef<HTMLDivElement | null>(null);

  const openMenu = useCallback(() => {
    try { navigator.vibrate?.(15); } catch { /* noop */ }
    setMenuOpen(true);
  }, []);

  const longPress = useLongPress(openMenu, { delay: 350 });

  const handleSelectText = useCallback(() => {
    setSelectMode(true);
    // Chọn sẵn toàn bộ để user chỉ cần kéo handle điều chỉnh.
    requestAnimationFrame(() => {
      const node = blockRef.current;
      if (!node) return;
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(node);
      sel.removeAllRanges();
      sel.addRange(range);
    });
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Shift+F10 / phím Menu → mở context menu (chuẩn desktop).
    if ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu') {
      e.preventDefault();
      setMenuOpen(true);
    }
  }, []);

  const selectionClass = selectMode
    ? 'select-text [-webkit-touch-callout:default] [-webkit-user-select:text] [user-select:text]'
    : 'md:select-text [-webkit-touch-callout:none] [-webkit-user-select:none] [user-select:none] md:[-webkit-touch-callout:default] md:[-webkit-user-select:text] md:[user-select:text]';

  return (
    <>
      <div
        ref={blockRef}
        role="article"
        aria-label={t('fpcContentAria')}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className={`px-4 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-sm ${selectionClass}`}
        {...longPress}
      >
        <ExpandableContent content={content} maxLength={300} maxLines={5} />
      </div>
      {menuOpen && (
        <PostContextMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          content={content}
          shareUrl={shareUrl}
          onShare={onOpenShare}
          onSelectText={handleSelectText}
        />
      )}
    </>
  );
};



export const PostCard = memo(FacebookPostCardComponent, (prev, next) => (
  prev.post.id === next.post.id &&
  prev.post.content === next.post.content &&
  prev.post.image_url === next.post.image_url &&
  prev.post.video_url === next.post.video_url &&
  prev.post.post_type === next.post.post_type &&
  prev.post.replay_status === next.post.replay_status &&
  prev.post.replay_ready === next.post.replay_ready &&
  prev.post.playback_provider === next.post.playback_provider &&
  prev.post.processing_message === next.post.processing_message &&
  prev.post.metadata?.live_status === next.post.metadata?.live_status &&
  prev.post.metadata?.live_session_id === next.post.metadata?.live_session_id &&
  prev.post.metadata?.status === next.post.metadata?.status &&
  prev.post.metadata?.host_connection_status === next.post.metadata?.host_connection_status &&
  prev.post.metadata?.last_seen_at === next.post.metadata?.last_seen_at &&
  prev.post.metadata?.last_host_heartbeat_at === next.post.metadata?.last_host_heartbeat_at &&
  prev.post.metadata?.ended_at === next.post.metadata?.ended_at &&
  prev.post.metadata?.playback_provider === next.post.metadata?.playback_provider &&
  prev.post.metadata?.playback_url === next.post.metadata?.playback_url &&
  prev.post.metadata?.video_url === next.post.metadata?.video_url &&
  prev.post.metadata?.replay_url === next.post.metadata?.replay_url &&
  prev.post.metadata?.playback_hls === next.post.metadata?.playback_hls &&
  prev.post.metadata?.archive_url === next.post.metadata?.archive_url &&
  prev.post.metadata?.archive_mp4_url === next.post.metadata?.archive_mp4_url &&
  prev.post.metadata?.r2_video_url === next.post.metadata?.r2_video_url &&
  prev.post.metadata?.playback_mp4 === next.post.metadata?.playback_mp4 &&
  prev.post.metadata?.replay_status === next.post.metadata?.replay_status &&
  prev.post.metadata?.replay_ready === next.post.metadata?.replay_ready &&
  prev.post.metadata?.archive_status === next.post.metadata?.archive_status &&
  prev.post.media_urls?.length === next.post.media_urls?.length &&
  prev.currentUserId === next.currentUserId &&
  prev.initialStats?.commentCount === next.initialStats?.commentCount &&
  prev.initialStats?.shareCount === next.initialStats?.shareCount &&
  prev.initialStats?.reactions?.length === next.initialStats?.reactions?.length &&
  prev.isPinned === next.isPinned &&
  prev.isOwnProfile === next.isOwnProfile &&
  prev.viewAsPublic === next.viewAsPublic &&
  prev.disableRealtime === next.disableRealtime
));

/** @deprecated Use PostCard instead */
export const FacebookPostCard = PostCard;
