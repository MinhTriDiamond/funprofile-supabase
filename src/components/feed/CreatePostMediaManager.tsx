/**
 * CreatePostMediaManager — upload queue, Uppy video, drag/drop, media preview
 * Extracted from FacebookCreatePost.tsx
 */
import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { deleteFromR2 } from '@/utils/r2Upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImagePlus, Video, X, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { FILE_LIMITS, getVideoDuration } from '@/utils/imageCompression';
import { UploadQueue, UploadItem, createUploadQueue } from '@/utils/uploadQueue';
import { VideoUploaderUppy } from './VideoUploaderUppy';
import { MediaUploadPreview } from './MediaUploadPreview';
import { useLanguage } from '@/i18n/LanguageContext';

const MAX_FILES_PER_POST = FILE_LIMITS.MAX_FILES_PER_POST || 100;

export interface UppyVideoResult {
  uid: string;
  url: string;
  thumbnailUrl: string;
  localThumbnail?: string;
}

interface CreatePostMediaManagerProps {
  loading: boolean;
  showMediaUpload: boolean;
  setShowMediaUpload: (v: boolean) => void;
  uploadQueueRef: React.MutableRefObject<UploadQueue | null>;
  uploadItems: UploadItem[];
  setUploadItems: (items: UploadItem[]) => void;
  pendingVideoFile: File | null;
  setPendingVideoFile: (f: File | null) => void;
  uppyVideoResult: UppyVideoResult | null;
  setUppyVideoResult: (r: UppyVideoResult | null) => void;
  isVideoUploading: boolean;
  setIsVideoUploading: (v: boolean) => void;
}

export interface CreatePostMediaManagerHandle {
  handleFileSelect: (files: FileList | null) => void;
}

export const CreatePostMediaManager = forwardRef<CreatePostMediaManagerHandle, CreatePostMediaManagerProps>(({
  loading,
  showMediaUpload,
  setShowMediaUpload,
  uploadQueueRef,
  uploadItems,
  setUploadItems,
  pendingVideoFile,
  setPendingVideoFile,
  uppyVideoResult,
  setUppyVideoResult,
  isVideoUploading,
  setIsVideoUploading,
}, ref) => {
  const { t } = useLanguage();
  const [isDragging, setIsDragging] = useState(false);
  const queueInitialized = useRef(false);

  // Initialize upload queue (ref-guard pattern to run exactly once)
  useEffect(() => {
    if (queueInitialized.current) return;
    queueInitialized.current = true;
    const queue = createUploadQueue({
      maxConcurrent: 4,
      maxFiles: MAX_FILES_PER_POST,
      onProgress: () => {},
      onComplete: () => {},
      onError: (item) => {
        toast.error(`${t('uploadFailed')}: ${item.file.name}`);
      },
      onQueueComplete: () => {},
    });
    uploadQueueRef.current = queue;
    const unsubscribe = queue.subscribe((items) => setUploadItems([...items]));
    return () => { unsubscribe(); queue.destroy(); queueInitialized.current = false; };
  }, [uploadQueueRef, setUploadItems, t]);

  // Prevent tab close during upload
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const isUploading = uploadQueueRef.current?.isUploading() || isVideoUploading;
      if (isUploading) {
        e.preventDefault();
        e.returnValue = t('uploadingLeaveWarning');
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isVideoUploading]);

  const handleFileSelect = useCallback(async (files: FileList | null, accessToken?: string) => {
    if (!files || !uploadQueueRef.current) return;
    const imageFiles: File[] = [];
    const videoFiles: File[] = [];

    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) { toast.error(`${t('fileNotSupported')}: "${file.name}"`); continue; }
      if (isImage && file.size > FILE_LIMITS.IMAGE_MAX_SIZE) { toast.error(`${t('imageTooLarge')}: "${file.name}"`); continue; }
      if (isVideo && file.size > FILE_LIMITS.VIDEO_MAX_SIZE) { toast.error(`${t('videoTooLarge')}: "${file.name}"`); continue; }
      if (isVideo) {
        try {
          const duration = await getVideoDuration(file);
          if (duration > FILE_LIMITS.VIDEO_MAX_DURATION) { toast.error(`${t('videoTooLong')}: "${file.name}"`); continue; }
          videoFiles.push(file);
        } catch { toast.error(`${t('cannotReadVideo')}: "${file.name}"`); }
      } else {
        imageFiles.push(file);
      }
    }

    if (videoFiles.length > 0) {
      setPendingVideoFile(videoFiles[0]);
      setIsVideoUploading(true);
      setShowMediaUpload(true);
      if (videoFiles.length > 1) toast.info(`${t('onlyOneVideoAtATime')}. ${videoFiles.length - 1} ${t('videosSkipped')}.`);
    }

    if (imageFiles.length > 0) {
      const { added, rejected } = await uploadQueueRef.current.addFiles(imageFiles, accessToken);
      if (added.length > 0) setShowMediaUpload(true);
      rejected.forEach(({ file, reason }) => toast.error(`${file.name}: ${reason}`));
    }
  }, [t, setPendingVideoFile, setIsVideoUploading, setShowMediaUpload, uploadQueueRef]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFileSelect(e.dataTransfer.files); }, [handleFileSelect]);

  const removeMedia = (id: string) => uploadQueueRef.current?.removeItem(id);
  const retryMedia = (id: string) => uploadQueueRef.current?.retryUpload(id);
  const reorderMedia = (from: number, to: number) => uploadQueueRef.current?.reorderItems(from, to);

  // Expose handleFileSelect to parent via ref
  useImperativeHandle(ref, () => ({ handleFileSelect }), [handleFileSelect]);

  if (!showMediaUpload) return null;

  return (
    <div
      className={`mt-4 border-2 border-dashed rounded-lg p-4 transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {pendingVideoFile && (
        <div className="mb-3">
          <VideoUploaderUppy
            selectedFile={pendingVideoFile}
            onUploadComplete={(result) => {
              setUppyVideoResult(result);
              setIsVideoUploading(false);
              setPendingVideoFile(null);
              supabase.auth.refreshSession().catch(() => {});
            }}
            onUploadError={() => { setIsVideoUploading(false); setPendingVideoFile(null); }}
            onUploadStart={() => setIsVideoUploading(true)}
            onRemove={() => { setPendingVideoFile(null); setUppyVideoResult(null); setIsVideoUploading(false); }}
            disabled={loading}
          />
        </div>
      )}

      {uppyVideoResult && !pendingVideoFile && (
        <div className="mb-3 relative rounded-lg overflow-hidden border border-green-500/50 bg-muted h-48">
          {uppyVideoResult.localThumbnail ? (
            <img src={uppyVideoResult.localThumbnail} alt="Video preview" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Video className="w-16 h-16 text-muted-foreground" />
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (uppyVideoResult?.uid) deleteFromR2(uppyVideoResult.uid).catch(() => {});
              setUppyVideoResult(null);
            }}
            className="absolute top-2 right-2 h-8 w-8 bg-black/50 hover:bg-black/70 text-white rounded-full"
          >
            <X className="w-4 h-4" />
          </Button>
          <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 rounded px-2 py-1">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-white text-xs font-medium">{t('readyToPost')}</span>
          </div>
          <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 rounded px-2 py-1">
            <Video className="w-4 h-4 text-white" />
            <span className="text-white text-xs">Video</span>
          </div>
        </div>
      )}

      {uploadItems.length === 0 && !pendingVideoFile && !uppyVideoResult ? (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
            <ImagePlus className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="font-medium mb-1">{t('addPhotoVideo')}</p>
          <p className="text-sm text-muted-foreground mb-4">{t('dragAndDrop')} ({t('maxFiles')} {MAX_FILES_PER_POST})</p>
          <Input
            id="media-upload"
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            disabled={loading}
          />
          <Button variant="secondary" onClick={() => document.getElementById('media-upload')?.click()} disabled={loading}>
            {t('chooseFromDevice')}
          </Button>
        </div>
      ) : uploadItems.length > 0 ? (
        <div className="space-y-3">
          <MediaUploadPreview
            items={uploadItems}
            onRemove={removeMedia}
            onRetry={retryMedia}
            onReorder={reorderMedia}
            disabled={loading}
            maxItems={MAX_FILES_PER_POST}
          />
          {uploadItems.length < MAX_FILES_PER_POST && (
            <div className="flex items-center gap-2">
              <Input id="add-more-media" type="file" accept="image/*,video/*" multiple onChange={(e) => handleFileSelect(e.target.files)} className="hidden" disabled={loading} />
              <Button variant="outline" size="sm" onClick={() => document.getElementById('add-more-media')?.click()} disabled={loading}>
                <ImagePlus className="w-4 h-4 mr-2" />
                {t('addPhotoVideo')}
              </Button>
              <span className="text-sm text-muted-foreground">{uploadItems.length}/{MAX_FILES_PER_POST}</span>
            </div>
          )}
        </div>
      ) : null}

      {uploadItems.length === 0 && !pendingVideoFile && !uppyVideoResult && (
        <button onClick={() => setShowMediaUpload(false)} className="absolute top-2 right-2 w-7 h-7 bg-secondary hover:bg-muted rounded-full flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
});

CreatePostMediaManager.displayName = 'CreatePostMediaManager';

// Export for parent component to call directly
export { MAX_FILES_PER_POST };
