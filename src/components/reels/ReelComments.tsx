import { useState } from 'react';
import { useReelComments } from '@/hooks/useReels';
import { useReelCommentInteractions } from '@/hooks/useReelCommentInteractions';
import { useLanguage } from '@/i18n/LanguageContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, X, Heart, Trash2 } from 'lucide-react';
import { useReels } from '@/hooks/useReels';
import { formatDistanceToNow } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PostContextMenu } from '@/components/feed/PostContextMenu';
import { useLongPress } from '@/hooks/useLongPress';

interface ReelCommentsProps {
  reelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ReelComments = ({ reelId, open, onOpenChange }: ReelCommentsProps) => {
  const { t } = useLanguage();
  const { data: comments = [], isLoading } = useReelComments(open ? reelId : null);
  const { addComment, currentUser } = useReels();
  const { toggleCommentLike, deleteComment } = useReelCommentInteractions();
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  // Fetch which comments the current user has liked
  const commentIds = comments.map(c => c.id);
  const { data: likedCommentIds = [] } = useQuery({
    queryKey: ['reel-comment-likes', currentUser?.id, commentIds],
    queryFn: async () => {
      if (!currentUser || commentIds.length === 0) return [];
      const { data } = await supabase
        .from('reel_comment_likes')
        .select('comment_id')
        .eq('user_id', currentUser.id)
        .in('comment_id', commentIds);
      return (data || []).map(d => d.comment_id);
    },
    enabled: !!currentUser && commentIds.length > 0 && open,
  });

  const likedSet = new Set(likedCommentIds);

  const handleSubmit = () => {
    if (!newComment.trim()) return;
    addComment.mutate(
      { reelId, content: newComment.trim(), parentCommentId: replyTo || undefined },
      { onSuccess: () => { setNewComment(''); setReplyTo(null); } }
    );
  };

  const handleLikeComment = (commentId: string) => {
    if (!currentUser) return;
    toggleCommentLike.mutate({
      commentId,
      isLiked: likedSet.has(commentId),
      userId: currentUser.id,
    });
  };

  const handleDeleteComment = (commentId: string) => {
    deleteComment.mutate(commentId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl bg-background">
        <SheetHeader className="pb-2">
          <SheetTitle>{t('comments')} ({comments.length})</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pb-[calc(var(--mbn-h)+var(--safe-bottom)+8px)] px-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : comments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{t('reelNoComments')}</p>
          ) : (
            comments.map((comment) => {
              const isLiked = likedSet.has(comment.id);
              const isOwner = currentUser?.id === comment.user_id;
              return (
                <ReelCommentRow
                  key={comment.id}
                  comment={comment}
                  isLiked={isLiked}
                  isOwner={isOwner}
                  onLike={() => handleLikeComment(comment.id)}
                  onReply={() => setReplyTo(comment.id)}
                  onDelete={() => handleDeleteComment(comment.id)}
                  replyLabel={t('reply')}
                />
              );
            })
          )}
        </div>

        {/* Comment input */}
        {currentUser && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t">
            {replyTo && (
              <div className="flex items-center justify-between mb-2 text-xs text-muted-foreground">
                <span>{t('reelReplyingTo')}...</span>
                <button onClick={() => setReplyTo(null)}><X className="w-3 h-3" /></button>
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={t('reelAddComment')}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
              <Button size="icon" onClick={handleSubmit} disabled={!newComment.trim()}>
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

interface ReelCommentRowProps {
  comment: {
    id: string;
    content: string;
    created_at: string;
    like_count: number;
    profiles?: { username?: string | null; avatar_url?: string | null } | null;
  };
  isLiked: boolean;
  isOwner: boolean;
  onLike: () => void;
  onReply: () => void;
  onDelete: () => void;
  replyLabel: string;
}

const ReelCommentRow = ({ comment, isLiked, isOwner, onLike, onReply, onDelete, replyLabel }: ReelCommentRowProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPress = useLongPress(() => setMenuOpen(true), { delay: 350 });

  return (
    <div className="flex gap-3">
      <Avatar className="w-8 h-8 flex-shrink-0">
        <AvatarImage src={comment.profiles?.avatar_url || ''} />
        <AvatarFallback className="text-xs">{comment.profiles?.username?.[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="bg-muted rounded-xl px-3 py-2 select-text" {...longPress}>
          <p className="font-semibold text-sm">{comment.profiles?.username}</p>
          <p className="text-sm whitespace-pre-wrap break-words">{comment.content}</p>
        </div>
        <div className="flex items-center gap-4 mt-1 px-1">
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
          </span>
          <button
            onClick={onLike}
            className={`text-xs flex items-center gap-1 transition-colors ${isLiked ? 'text-red-500' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Heart className={`w-3 h-3 ${isLiked ? 'fill-current' : ''}`} />
            {comment.like_count > 0 && comment.like_count}
          </button>
          <button onClick={onReply} className="text-xs text-muted-foreground hover:text-foreground">
            {replyLabel}
          </button>
          {isOwner && (
            <button onClick={onDelete} className="text-xs text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <PostContextMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        content={comment.content || ''}
        title="Tùy chọn bình luận"
      />
    </div>
  );
};

export default ReelComments;
