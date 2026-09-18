import { useState, useRef, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadToR2 } from '@/utils/r2Upload';
import { Button } from '@/components/ui/button';
import { Image, Video, X, Smile, Sticker } from 'lucide-react';
import { toast } from 'sonner';
import { compressImage, FILE_LIMITS, getVideoDuration } from '@/utils/imageCompression';
import { lazyWithChunkRecovery } from '@/lib/appUpdateRecovery';

const GifPicker = lazyWithChunkRecovery(() => import('./GifPicker'), 'GifPicker');
const StickerPicker = lazyWithChunkRecovery(() => import('./StickerPicker'), 'StickerPicker');

interface CommentMediaUploadProps {
  onMediaUploaded: (url: string, type: 'image' | 'video') => void;
  onMediaRemoved: () => void;
  onGifSelect?: (gifUrl: string) => void;
  onStickerSelect?: (stickerUrl: string) => void;
}

export const CommentMediaUpload = ({ 
  onMediaUploaded, 
  onMediaRemoved,
  onGifSelect,
  onStickerSelect,
}: CommentMediaUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Get session for access token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      toast.error('Vui lòng đăng nhập để tải media lên');
      return;
    }

    setUploading(true);

    try {
      let fileToUpload = file;

      if (type === 'image') {
        // Validate original size
        if (file.size > FILE_LIMITS.IMAGE_MAX_SIZE) {
          toast.error('Image must be less than 100MB');
          setUploading(false);
          return;
        }

        // Compress image
        toast.loading('Compressing image...');
        fileToUpload = await compressImage(file, {
          maxWidth: FILE_LIMITS.POST_IMAGE_MAX_WIDTH,
          maxHeight: FILE_LIMITS.POST_IMAGE_MAX_HEIGHT,
          quality: 0.85,
        });
        toast.dismiss();
      } else {
        // Video validation
        if (file.size > FILE_LIMITS.VIDEO_MAX_SIZE) {
          toast.error('Video must be less than 2GB');
          setUploading(false);
          return;
        }

        // Check video duration
        try {
          const duration = await getVideoDuration(file);
          if (duration > FILE_LIMITS.VIDEO_MAX_DURATION) {
            toast.error('Video must be less than 120 minutes');
            setUploading(false);
            return;
          }
        } catch (err) {
          console.error('Error checking video duration:', err);
        }
      }

      const result = await uploadToR2(fileToUpload, 'comment-media', undefined, session.access_token);

      setPreview({ url: result.url, type });
      onMediaUploaded(result.url, type);
      toast.success('Media uploaded!');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload media');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onMediaRemoved();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      {/* Backdrop overlay for pickers */}
      {(showGifPicker || showStickerPicker) && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={() => { setShowGifPicker(false); setShowStickerPicker(false); }}
        />
      )}

      {/* GIF Picker portal */}
      {showGifPicker && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[360px] max-w-[calc(100vw-32px)]">
          <Suspense fallback={<div className="w-full h-48 bg-card rounded-xl animate-pulse" />}>
            <GifPicker
              onSelect={(url) => {
                onGifSelect?.(`g:${url}`);
                setShowGifPicker(false);
              }}
              onClose={() => setShowGifPicker(false)}
            />
          </Suspense>
        </div>
      )}

      {/* Sticker Picker portal */}
      {showStickerPicker && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-80 max-w-[calc(100vw-32px)]">
          <Suspense fallback={<div className="w-full h-48 bg-card rounded-xl animate-pulse" />}>
            <StickerPicker
              onSelect={(url) => {
                onStickerSelect?.(`s:${url}`);
                setShowStickerPicker(false);
              }}
              onClose={() => setShowStickerPicker(false)}
            />
          </Suspense>
        </div>
      )}

      {!preview && (
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileSelect(e, 'image')}
            className="hidden"
            id="comment-image-upload"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => document.getElementById('comment-image-upload')?.click()}
            disabled={uploading}
            className="text-muted-foreground hover:text-foreground"
          >
            <Image className="w-4 h-4" />
          </Button>

          <input
            type="file"
            accept="video/*"
            onChange={(e) => handleFileSelect(e, 'video')}
            className="hidden"
            id="comment-video-upload"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => document.getElementById('comment-video-upload')?.click()}
            disabled={uploading}
            className="text-muted-foreground hover:text-foreground"
          >
            <Video className="w-4 h-4" />
          </Button>

          {/* GIF button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setShowGifPicker(!showGifPicker); setShowStickerPicker(false); }}
            className="text-muted-foreground hover:text-foreground text-xs font-bold"
          >
            GIF
          </Button>

          {/* Sticker button */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => { setShowStickerPicker(!showStickerPicker); setShowGifPicker(false); }}
            className="text-muted-foreground hover:text-foreground"
          >
            <Sticker className="w-4 h-4" />
          </Button>
        </div>
      )}

      {preview && (
        <div className="relative inline-block group">
          {preview.type === 'image' ? (
            <img 
              src={preview.url} 
              alt="Preview" 
              className="max-w-xs max-h-32 rounded-lg border border-border"
            />
          ) : (
            <video 
              src={preview.url} 
              className="max-w-xs max-h-32 rounded-lg border border-border"
            />
          )}
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleRemove}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
};
