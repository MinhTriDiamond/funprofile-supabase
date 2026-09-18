import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2, deleteFromR2 } from '@/utils/r2Upload';
import { deleteVideoByUrl } from '@/utils/streamHelpers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Image, Video, X, Loader2, UserPlus, MapPin, MoreHorizontal, Clapperboard } from 'lucide-react';
import { z } from 'zod';
import { compressImage, FILE_LIMITS, getVideoDuration } from '@/utils/imageCompression';
import { VideoUploaderUppy } from './VideoUploaderUppy';
import { EmojiPicker } from './EmojiPicker';
import { FriendTagDialog, TaggedFriend } from './FriendTagDialog';
import { LocationCheckin } from './LocationCheckin';

const MAX_CONTENT_LENGTH = 20000;

const postSchema = z.object({
  content: z.string().max(MAX_CONTENT_LENGTH, `Post must be less than ${MAX_CONTENT_LENGTH.toLocaleString()} characters`),
});

interface EditPostDialogProps {
  post: {
    id: string;
    content: string;
    image_url: string | null;
    video_url?: string | null;
    location?: string | null;
    post_type?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  onPostUpdated: () => void;
  currentUserId?: string;
}

export const EditPostDialog = ({ post, isOpen, onClose, onPostUpdated, currentUserId }: EditPostDialogProps) => {
  const [content, setContent] = useState(post.content);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(post.image_url);
  const [videoPreview, setVideoPreview] = useState<string | null>(post.video_url || null);
  const [loading, setLoading] = useState(false);
  
  // Location state
  const [location, setLocation] = useState<string | null>(post.location || null);
  const [showLocationDialog, setShowLocationDialog] = useState(false);
  
  // Friend tagging state
  const [taggedFriends, setTaggedFriends] = useState<TaggedFriend[]>([]);
  const [showFriendTagDialog, setShowFriendTagDialog] = useState(false);
  
  // Uppy video upload state
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  const [uppyVideoResult, setUppyVideoResult] = useState<{ uid: string; url: string; thumbnailUrl: string } | null>(null);
  const [isVideoUploading, setIsVideoUploading] = useState(false);

  // Reset state when post changes
  useEffect(() => {
    setContent(post.content);
    setImageFile(null);
    setImagePreview(post.image_url);
    setVideoPreview(post.video_url || null);
    setLocation(post.location || null);
    setPendingVideoFile(null);
    setUppyVideoResult(null);
    setIsVideoUploading(false);
    setTaggedFriends([]);
  }, [post.id, post.content, post.image_url, post.video_url, post.location]);

  const handleEmojiSelect = (emoji: string) => {
    setContent((prev) => prev + emoji);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > FILE_LIMITS.IMAGE_MAX_SIZE) {
        toast.error('Image must be less than 100MB');
        return;
      }

      try {
        toast.loading('Compressing image...');
        const compressed = await compressImage(file, {
          maxWidth: FILE_LIMITS.POST_IMAGE_MAX_WIDTH,
          maxHeight: FILE_LIMITS.POST_IMAGE_MAX_HEIGHT,
          quality: 0.85,
        });
        toast.dismiss();
        
        setImageFile(compressed);
        setImagePreview(URL.createObjectURL(compressed));
        // Clear video when adding image
        setVideoPreview(null);
        setPendingVideoFile(null);
        setUppyVideoResult(null);
      } catch (error) {
        toast.dismiss();
        toast.error('Failed to process image');
      }
    }
  };

  const handleVideoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > FILE_LIMITS.VIDEO_MAX_SIZE) {
        toast.error('Video must be less than 2GB');
        return;
      }

      try {
        const duration = await getVideoDuration(file);
        if (duration > FILE_LIMITS.VIDEO_MAX_DURATION) {
          toast.error('Video must be less than 120 minutes');
          return;
        }
      } catch (err) {
        console.error('Error checking video duration:', err);
      }

      // Use Uppy for video upload (consistent with CreatePost)
      setPendingVideoFile(file);
      setIsVideoUploading(true);
      // Clear image when adding video
      setImageFile(null);
      setImagePreview(null);
      setVideoPreview(null);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const removeVideo = () => {
    // If we have an Uppy video result, delete it from R2
    if (uppyVideoResult?.uid) {
      deleteFromR2(uppyVideoResult.uid).catch(err => console.warn('Cleanup error:', err));
    }
    setPendingVideoFile(null);
    setUppyVideoResult(null);
    setVideoPreview(null);
    setIsVideoUploading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if video is still uploading
    if (isVideoUploading) {
      toast.error('Vui lòng đợi video upload xong');
      return;
    }
    
    if (!content.trim() && !imageFile && !imagePreview && !videoPreview && !uppyVideoResult) {
      toast.error('Please add some content');
      return;
    }

    // Check content length
    if (content.length > MAX_CONTENT_LENGTH) {
      toast.error(`Nội dung quá dài (${content.length.toLocaleString()}/${MAX_CONTENT_LENGTH.toLocaleString()} ký tự)`);
      return;
    }

    // Validate content length
    const validation = postSchema.safeParse({ content: content.trim() });
    if (!validation.success) {
      toast.error(validation.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      // Get session for access token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Vui lòng đăng nhập để cập nhật bài viết');
        setLoading(false);
        return;
      }

      let imageUrl = imagePreview;
      let videoUrl = videoPreview;

      // Upload new image if selected
      if (imageFile) {
        const result = await uploadToR2(imageFile, 'posts', undefined, session.access_token);
        imageUrl = result.url;
        
        // Delete old image from R2 if exists and it's different
        if (post.image_url && post.image_url !== result.url) {
          try {
            const oldKey = post.image_url.split('/').slice(-2).join('/');
            await deleteFromR2(oldKey);
          } catch (error) {
            console.error('Error deleting old image:', error);
          }
        }
      }

      if (uppyVideoResult) {
        videoUrl = uppyVideoResult.url;
        
        // Delete old video if it was replaced
        if (post.video_url && post.video_url !== uppyVideoResult.url) {
          try {
            await deleteVideoByUrl(post.video_url);
          } catch (error) {
            console.error('Error deleting old video:', error);
          }
        }
      }

      // Update post
      const updatePayload: Record<string, unknown> = {
        content,
        image_url: imageUrl,
        video_url: videoUrl,
        location: location,
      };

      // For gift_celebration posts, extract and sync gift_message
      let extractedGiftMessage: string | null = null;
      if (post.post_type === 'gift_celebration') {
        // Extract message between quotes from content
        const quoteMatch = content.match(/"([^"]+)"/);
        extractedGiftMessage = quoteMatch ? quoteMatch[1] : null;
        updatePayload.gift_message = extractedGiftMessage;
      }

      const { error } = await supabase
        .from('posts')
        .update(updatePayload as any)
        .eq('id', post.id);

      if (error) throw error;

      // Sync gift message to donations and chat message
      if (post.post_type === 'gift_celebration') {
        // Update donations.message for all donations linked to this post
        const { data: linkedDonations } = await supabase
          .from('donations')
          .select('id, message_id, sender_id, amount, token_symbol, tx_hash')
          .eq('post_id', post.id);

        if (linkedDonations && linkedDonations.length > 0) {
          // Update donation message
          await supabase
            .from('donations')
            .update({ message: extractedGiftMessage })
            .eq('post_id', post.id);

          // Update linked chat messages
          for (const donation of linkedDonations) {
            if (donation.message_id) {
              const { data: senderProfile } = await supabase
                .from('profiles')
                .select('username')
                .eq('id', donation.sender_id)
                .single();

              const senderName = senderProfile?.username || 'Người dùng';
              const amount = parseFloat(donation.amount) || 0;
              const newChatContent = `🎁 ${senderName} đã tặng bạn ${amount.toLocaleString()} ${donation.token_symbol}!\n\n${extractedGiftMessage ? `"${extractedGiftMessage}"\n\n` : ''}💰 TX: ${donation.tx_hash.slice(0, 18)}...\n\n👉 Nhấn "Xem Card Chúc Mừng" để xem chi tiết!`;

              await supabase
                .from('messages')
                .update({ content: newChatContent })
                .eq('id', donation.message_id);
            }
          }
        }
      }

      toast.success('Post updated successfully');
      onPostUpdated();
      onClose();
    } catch (error: unknown) {
      console.error('Error updating post:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update post');
    } finally {
      setLoading(false);
    }
  };

  const isOverLimit = content.length > MAX_CONTENT_LENGTH;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle className="text-center text-xl font-bold">Chỉnh sửa bài viết</DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {/* Location display */}
              {location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4" style={{ color: '#E74852' }} />
                  <span>Tại </span>
                  <button
                    type="button"
                    onClick={() => setShowLocationDialog(true)}
                    className="text-foreground font-semibold hover:underline"
                  >
                    {location}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocation(null)}
                    className="text-muted-foreground hover:text-destructive ml-auto"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Content Input with Emoji */}
              <div className="relative">
                <Textarea
                  placeholder="Ánh sáng trong tim bạn đang muốn nói điều gì?"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[120px] resize-none border-0 focus-visible:ring-0 text-lg placeholder:text-muted-foreground pr-10"
                  disabled={loading}
                />
                <div className="absolute bottom-2 right-2">
                  <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                </div>
                {/* Character Counter */}
                <div className={`text-xs text-right mt-1 pr-1 ${
                  isOverLimit ? 'text-destructive font-semibold' :
                  content.length > MAX_CONTENT_LENGTH * 0.9 ? 'text-yellow-500' :
                  content.length > MAX_CONTENT_LENGTH * 0.8 ? 'text-yellow-600/70' : 'text-muted-foreground'
                }`}>
                  {content.length.toLocaleString()}/{MAX_CONTENT_LENGTH.toLocaleString()}
                </div>
              </div>

              {/* Uppy Video Uploader */}
              {pendingVideoFile && (
                <div className="mb-3">
                  <VideoUploaderUppy
                    selectedFile={pendingVideoFile}
                    onUploadComplete={(result) => {
                      setUppyVideoResult(result);
                      setIsVideoUploading(false);
                      setPendingVideoFile(null);
                      setVideoPreview(result.url);
                    }}
                    onUploadError={() => {
                      setIsVideoUploading(false);
                      setPendingVideoFile(null);
                      toast.error('Video upload failed');
                    }}
                    onUploadStart={() => setIsVideoUploading(true)}
                    onRemove={() => {
                      setPendingVideoFile(null);
                      setUppyVideoResult(null);
                      setIsVideoUploading(false);
                    }}
                    disabled={loading}
                  />
                </div>
              )}

              {/* Show uploaded video preview */}
              {(videoPreview || uppyVideoResult) && !pendingVideoFile && (
                <div className="relative">
                  <video 
                    src={uppyVideoResult?.url || videoPreview || ''} 
                    controls 
                    className="w-full rounded-lg" 
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={removeVideo}
                    disabled={loading}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {imagePreview && !videoPreview && !uppyVideoResult && !pendingVideoFile && (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" className="w-full rounded-lg" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={removeImage}
                    disabled={loading}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Add to Post - Facebook style colored icons */}
              <div className="border border-border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">Thêm vào bài viết của bạn</span>
                  <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
                    {/* Media - Green */}
                    <label className="w-9 h-9 min-w-[36px] rounded-full hover:bg-secondary flex items-center justify-center transition-colors cursor-pointer">
                      <Image className="w-6 h-6" style={{ color: '#45BD62' }} />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                        disabled={loading || isVideoUploading}
                      />
                    </label>
                    
                    {/* Video - Green */}
                    <label className="w-9 h-9 min-w-[36px] rounded-full hover:bg-secondary flex items-center justify-center transition-colors cursor-pointer">
                      <Video className="w-6 h-6" style={{ color: '#45BD62' }} />
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleVideoChange}
                        className="hidden"
                        disabled={loading || isVideoUploading}
                      />
                    </label>
                    
                    {/* Tag Friends - Blue */}
                    <button 
                      type="button"
                      onClick={() => setShowFriendTagDialog(true)}
                      className={`w-9 h-9 min-w-[36px] rounded-full hover:bg-secondary flex items-center justify-center transition-colors ${
                        taggedFriends.length > 0 ? 'bg-blue-100 dark:bg-blue-900/30' : ''
                      }`}
                      disabled={loading}
                      title="Gắn thẻ bạn bè"
                    >
                      <UserPlus className="w-6 h-6" style={{ color: '#1877F2' }} />
                    </button>
                    
                    {/* Emoji - Yellow */}
                    <EmojiPicker onEmojiSelect={handleEmojiSelect} />
                    
                    {/* Check-in - Red */}
                    <button 
                      type="button"
                      onClick={() => setShowLocationDialog(true)}
                      className={`w-9 h-9 min-w-[36px] rounded-full hover:bg-secondary flex items-center justify-center transition-colors ${
                        location ? 'bg-red-100 dark:bg-red-900/30' : ''
                      }`}
                      disabled={loading}
                      title="Check in"
                    >
                      <MapPin className="w-6 h-6" style={{ color: '#E74852' }} />
                    </button>
                    
                    {/* GIF - Teal (disabled for now) */}
                    <button 
                      type="button"
                      className="w-9 h-9 min-w-[36px] rounded-full hover:bg-secondary flex items-center justify-center transition-colors opacity-50 cursor-not-allowed"
                      disabled
                      title="GIF (Sắp có)"
                    >
                      <Clapperboard className="w-6 h-6" style={{ color: '#3BC7BD' }} />
                    </button>
                    
                    {/* More Options */}
                    <button 
                      type="button"
                      className="w-9 h-9 min-w-[36px] rounded-full hover:bg-secondary flex items-center justify-center transition-colors"
                      disabled={loading}
                      title="Thêm"
                    >
                      <MoreHorizontal className="w-6 h-6 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="p-4 border-t border-border shrink-0">
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose} disabled={loading || isVideoUploading}>
                  Huỷ
                </Button>
                <Button 
                  type="submit" 
                  disabled={loading || isVideoUploading || isOverLimit}
                  className="flex-1"
                >
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {isVideoUploading ? 'Đang tải video...' : loading ? 'Đang cập nhật...' : 'Lưu thay đổi'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Friend Tag Dialog */}
      {currentUserId && (
        <FriendTagDialog
          isOpen={showFriendTagDialog}
          onClose={() => setShowFriendTagDialog(false)}
          currentUserId={currentUserId}
          selectedFriends={taggedFriends}
          onTagFriends={setTaggedFriends}
        />
      )}

      {/* Location Check-in Dialog */}
      <LocationCheckin
        isOpen={showLocationDialog}
        onClose={() => setShowLocationDialog(false)}
        currentLocation={location}
        onSelectLocation={setLocation}
      />
    </>
  );
};
