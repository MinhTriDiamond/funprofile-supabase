/**
 * Feed Components — Barrel exports organized by sub-domain
 *
 * Sub-domains:
 *   post/      — PostCard, PostHeader, PostFooter, PostMedia, ExpandableContent, EditPostDialog
 *   comment/   — CommentItem, CommentSection, CommentReplyForm, CommentMediaUpload/Viewer
 *   reaction/  — ReactionButton, ReactionSummary, ReactionViewerDialog, CommentReactionButton
 *   media/     — MediaGrid, ImageViewer, FeedVideoPlayer, VideoUploader, MediaUploadPreview
 *   composer/  — CreatePost, CreatePostToolbar, CreatePostMediaManager, EmojiPicker, GifPicker,
 *                StickerPicker, FeelingActivityDialog, FriendTagDialog, LocationCheckin, PrivacySelector
 *   sidebar/   — LeftSidebar, RightSidebar
 *   special/   — GiftCelebrationCard, HeartAnimation, LinkPreviewCard, LivePostEmbed,
 *                LiveVideoPreview, AppHonorBoard, TopRanking, StoriesBar, ClaimHistoryModal, ShareDialog
 */

// ── Post ──
export { PostCard, FacebookPostCard } from './FacebookPostCard';
export { SharedPostCard } from './SharedPostCard';
export { PostHeader } from './PostHeader';
export { PostFooter } from './PostFooter';
export { PostMedia } from './PostMedia';
export { ExpandableContent } from './ExpandableContent';
export { EditPostDialog } from './EditPostDialog';

// ── Comment ──
export { CommentItem } from './CommentItem';
export { CommentSection } from './CommentSection';
export { CommentReplyForm } from './CommentReplyForm';
export { CommentMediaUpload } from './CommentMediaUpload';
export { CommentMediaViewer } from './CommentMediaViewer';

// ── Reaction ──
export { ReactionButton } from './ReactionButton';
export { ReactionSummary } from './ReactionSummary';
export { ReactionViewerDialog } from './ReactionViewerDialog';
export { CommentReactionButton } from './CommentReactionButton';

// ── Media ──
export { MediaGrid } from './MediaGrid';
export { ImageViewer } from './ImageViewer';
export { FeedVideoPlayer } from './FeedVideoPlayer';
export { VideoUploaderUppy } from './VideoUploaderUppy';
export { MediaUploadPreview } from './MediaUploadPreview';
export { VideoUploadProgress } from './VideoUploadProgress';

// ── Composer ──
export { CreatePost, FacebookCreatePost } from './FacebookCreatePost';
export { CreatePostToolbar } from './CreatePostToolbar';
export { CreatePostMediaManager } from './CreatePostMediaManager';
export { EmojiPicker } from './EmojiPicker';
export { default as GifPicker } from './GifPicker';
export { default as StickerPicker } from './StickerPicker';
export { FeelingActivityDialog } from './FeelingActivityDialog';
export { FriendTagDialog } from './FriendTagDialog';
export { LocationCheckin } from './LocationCheckin';
export { PrivacySelector } from './PrivacySelector';

// ── Sidebar ──
export { LeftSidebar, FacebookLeftSidebar } from './FacebookLeftSidebar';
export { RightSidebar, FacebookRightSidebar } from './FacebookRightSidebar';

// ── Special ──
export { GiftCelebrationCard } from './GiftCelebrationCard';
export { HeartAnimation } from './HeartAnimation';
export { LinkPreviewCard } from './LinkPreviewCard';
export { LivePostEmbed } from './LivePostEmbed';
export { LiveVideoPreview } from './LiveVideoPreview';
export { AppHonorBoard } from './AppHonorBoard';
export { TopRanking } from './TopRanking';
export { StoriesBar } from './StoriesBar';
export { ClaimHistoryModal } from './ClaimHistoryModal';
export { ShareDialog } from './ShareDialog';
export { TwemojiText } from './TwemojiText';

// ── Types & Utils ──
export type { PostData, SharedPostData, FacebookPostCardProps } from './types';
export { videoPlaybackCoordinator } from './videoPlaybackCoordinator';
