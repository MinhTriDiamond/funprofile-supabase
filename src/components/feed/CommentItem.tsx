import { useRef, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { MessageCircle, Trash2, Share2, Flag, MoreHorizontal } from 'lucide-react';
import { CommentReactionButton } from './CommentReactionButton';
import { CommentReplyForm } from './CommentReplyForm';
import { CommentMediaViewer } from './CommentMediaViewer';
import { TwemojiText } from './TwemojiText';
import { ExpandableContent } from './ExpandableContent';
import { PostContextMenu } from './PostContextMenu';
import { useLongPress } from '@/hooks/useLongPress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { formatRelativeTime } from '@/lib/formatters';
import { deleteVideoByUrl } from '@/utils/streamHelpers';
import { useLanguage } from '@/i18n/LanguageContext';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  image_url?: string | null;
  video_url?: string | null;
  parent_comment_id?: string | null;
  profiles: {
    username: string;
    avatar_url: string | null;
  };
  replies?: Comment[];
}

interface CommentItemProps {
  comment: Comment;
  postId: string;
  onReplyAdded: () => void;
  onCommentDeleted: () => void;
  level?: number;
}

export const CommentItem = ({ 
  comment, 
  postId, 
  onReplyAdded, 
  onCommentDeleted,
  level = 0 
}: CommentItemProps) => {
  const { t } = useLanguage();
  const { userId: currentUserId } = useCurrentUser();
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [showMediaViewer, setShowMediaViewer] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAllReplies, setShowAllReplies] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const commentShareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/post/${postId}#comment-${comment.id}`
    : '';
  const longPress = useLongPress(() => setMenuOpen(true), { delay: 350 });
  const handleSelectText = () => {
    setSelectMode(true);
    requestAnimationFrame(() => {
      const el = bubbleRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    });
  };

  const handleDelete = async () => {
    if (!currentUserId || currentUserId !== comment.user_id) {
      toast.error(t('canOnlyDeleteOwnComment'));
      return;
    }

    if (!confirm(t('confirmDeleteComment'))) return;

    setDeleting(true);
    
    // Delete video from storage (R2 or Stream)
    if (comment.video_url) {
      await deleteVideoByUrl(comment.video_url);
    }
    
    const { error } = await supabase
      .from('comments')
      .delete()
      .eq('id', comment.id);

    if (error) {
      toast.error(t('cannotDeleteComment'));
    } else {
      toast.success(t('commentDeleted'));
      onCommentDeleted();
    }
    setDeleting(false);
  };

  const handleShare = () => {
    const url = `${window.location.origin}/post/${postId}#comment-${comment.id}`;
    navigator.clipboard.writeText(url);
    toast.success(t('commentLinkCopied'));
  };

  const handleReport = () => {
    toast.info(t('reportSent'));
  };

  // Parse media URL with g: and s: prefix support
  const rawMediaUrl = comment.image_url || comment.video_url;
  let mediaUrl = rawMediaUrl;
  let mediaType: 'image' | 'video' | 'gif' | 'sticker' = comment.image_url ? 'image' : 'video';

  if (rawMediaUrl?.startsWith('g:')) {
    mediaUrl = rawMediaUrl.slice(2);
    mediaType = 'gif';
  } else if (rawMediaUrl?.startsWith('s:')) {
    mediaUrl = rawMediaUrl.slice(2);
    mediaType = 'sticker';
  }

  const visibleReplies = showAllReplies 
    ? comment.replies 
    : comment.replies?.slice(0, 2);
  const hiddenRepliesCount = (comment.replies?.length || 0) - 2;

  return (
    <div 
      id={`comment-${comment.id}`}
      className={`space-y-2 ${level > 0 ? `${level >= 2 ? 'ml-4 sm:ml-8' : 'ml-4 sm:ml-10'} pl-3 border-l-2 border-yellow-400/30 hover:border-yellow-400/60 transition-colors duration-300` : ''}`}
    >
      <div className="flex gap-3 group animate-fade-in">
        <Link to={`/profile/${comment.user_id}`}>
          <Avatar className="w-9 h-9 ring-2 ring-primary/20 transition-all duration-300 group-hover:ring-primary/40 shrink-0 cursor-pointer hover:scale-105">
            <AvatarImage 
              src={comment.profiles?.avatar_url} 
              alt={comment.profiles?.username || 'User'} 
              sizeHint="sm" 
            />
            <AvatarFallback className="text-xs bg-gradient-to-br from-primary/30 to-primary/10 text-primary font-semibold">
              {comment.profiles?.username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </Link>
        
        <div className="flex-1 min-w-0 space-y-1">
          {/* Username-only header when content is empty + gif/sticker */}
          {!comment.content.trim() && (mediaType === 'gif' || mediaType === 'sticker') && (
            <div className="px-1">
              <Link 
                to={`/profile/${comment.user_id}`}
                className="font-semibold text-sm text-primary hover:underline cursor-pointer"
              >
                {comment.profiles?.username || t('anonymous')}
              </Link>
            </div>
          )}

          {/* Text bubble — hidden when only gif/sticker without text */}
          {(comment.content.trim() || (mediaType !== 'gif' && mediaType !== 'sticker')) && (
            <div
              ref={bubbleRef}
              className={`bg-muted/60 rounded-2xl px-4 py-2.5 transition-all duration-300 hover:bg-muted/80 group-hover:shadow-sm overflow-hidden ${selectMode ? 'select-text' : ''}`}
              {...longPress}
              style={selectMode ? { WebkitUserSelect: 'text', userSelect: 'text' } : undefined}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <Link 
                  to={`/profile/${comment.user_id}`}
                  className="font-semibold text-sm text-primary hover:underline cursor-pointer"
                >
                  {comment.profiles?.username || t('anonymous')}
                </Link>
              </div>
              
              {comment.content.trim() && (
                <ExpandableContent
                  content={comment.content}
                  maxLength={300}
                  maxLines={4}
                  className="text-sm"
                  renderText={(text) => <TwemojiText text={text} emojiSize={18} />}
                />
              )}
              
              {/* Regular image/video stays inside bubble */}
              {mediaUrl && (mediaType === 'image' || mediaType === 'video') && (
                <div className="mt-2">
                  {mediaType === 'image' ? (
                    <img
                      src={mediaUrl}
                      alt="Comment media"
                      className="max-w-full sm:max-w-[280px] rounded-xl border border-border cursor-pointer hover:opacity-90 transition-all duration-300 hover:shadow-md overflow-hidden"
                      onClick={() => setShowMediaViewer(true)}
                    />
                  ) : (
                    <video
                      src={mediaUrl}
                      controls
                      className="max-w-full sm:max-w-[280px] rounded-xl border border-border overflow-hidden"
                    />
                  )}
                </div>
              )}
            </div>
          )}

          {/* GIF — standalone outside bubble (Facebook-style) */}
          {mediaUrl && mediaType === 'gif' && (
            <div className="mt-1">
              <img
                src={mediaUrl}
                alt="GIF"
                className="max-w-full sm:max-w-[280px] rounded-2xl shadow-sm overflow-hidden"
              />
            </div>
          )}

          {/* Sticker — standalone outside bubble, larger size */}
          {mediaUrl && mediaType === 'sticker' && (
            <div className="mt-1">
              <img
                src={mediaUrl}
                alt="Sticker"
                className="w-32 h-32 object-contain hover:scale-105 transition-transform duration-200"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 px-2 text-xs">
            <CommentReactionButton 
              commentId={comment.id} 
              onReactionChange={onReplyAdded}
            />
            
            {level < 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReplyForm(!showReplyForm)}
                className="text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 gap-1 h-7 px-2"
              >
                {t('reply')}
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShare}
              className="text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 gap-1 h-7 px-2"
            >
              {t('share')}
            </Button>
            
            <span className="text-muted-foreground/60">
              {formatRelativeTime(comment.created_at)}
            </span>

            {/* More options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-7 h-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {currentUserId === comment.user_id && (
                  <DropdownMenuItem 
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    {t('delete')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleReport}>
                  <Flag className="w-4 h-4 mr-2" />
                  {t('report')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Reply Form */}
          {showReplyForm && (
            <div className="animate-fade-in mt-2">
              <CommentReplyForm
                postId={postId}
                parentCommentId={comment.id}
                onReplyAdded={() => {
                  setShowReplyForm(false);
                  onReplyAdded();
                }}
                onCancel={() => setShowReplyForm(false)}
              />
            </div>
          )}

          {/* Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <div className="space-y-2 mt-2 animate-fade-in">
              {!showAllReplies && hiddenRepliesCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllReplies(true)}
                  className="text-xs text-primary hover:text-primary hover:bg-primary/10 font-medium h-7"
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                  {t('viewMoreReplies').replace('{count}', String(hiddenRepliesCount))}
                </Button>
              )}
              
              {visibleReplies?.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  postId={postId}
                  onReplyAdded={onReplyAdded}
                  onCommentDeleted={onReplyAdded}
                  level={level + 1}
                />
              ))}
              
              {showAllReplies && hiddenRepliesCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllReplies(false)}
                  className="text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 h-7"
                >
                  {t('hideReplies')}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {mediaUrl && (mediaType === 'image' || mediaType === 'video') && (
        <CommentMediaViewer
          mediaUrl={mediaUrl}
          mediaType={mediaType}
          isOpen={showMediaViewer}
          onClose={() => setShowMediaViewer(false)}
        />
      )}

      <PostContextMenu
        open={menuOpen}
        onOpenChange={(o) => { setMenuOpen(o); if (!o) setSelectMode(false); }}
        content={comment.content || ''}
        shareUrl={commentShareUrl}
        onShare={handleShare}
        onSelectText={handleSelectText}
        title="Tùy chọn bình luận"
      />
    </div>
  );
};
