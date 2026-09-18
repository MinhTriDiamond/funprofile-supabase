import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Video, X, Loader2, CheckCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { deleteFromR2 } from '@/utils/r2Upload';
import logger from '@/lib/logger';

interface VideoUploaderUppyProps {
  onUploadComplete: (result: { uid: string; url: string; thumbnailUrl: string; localThumbnail?: string }) => void;
  onUploadError?: (error: Error) => void;
  onUploadStart?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
  selectedFile?: File | null;
}

interface UploadState {
  status: 'idle' | 'preparing' | 'uploading' | 'ready' | 'error';
  progress: number;
  bytesUploaded: number;
  bytesTotal: number;
  uploadSpeed: number;
  videoUrl?: string;
  videoKey?: string;
  error?: string;
  localThumbnail?: string;
}

/**
 * Generate a thumbnail from video file using canvas
 */
const generateVideoThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    
    const cleanup = () => {
      URL.revokeObjectURL(video.src);
    };
    
    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration * 0.25);
    };
    
    video.onseeked = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx?.drawImage(video, 0, 0);
      const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
      cleanup();
      resolve(thumbnailUrl);
    };
    
    video.onerror = () => {
      cleanup();
      reject(new Error('Cannot generate thumbnail from video'));
    };
    
    setTimeout(() => {
      if (!canvas.width) {
        cleanup();
        reject(new Error('Thumbnail generation timeout'));
      }
    }, 10000);
    
    video.src = URL.createObjectURL(file);
  });
};

export const VideoUploaderUppy = ({
  onUploadComplete,
  onUploadError,
  onUploadStart,
  onRemove,
  disabled = false,
  selectedFile,
}: VideoUploaderUppyProps) => {
  const [uploadState, setUploadState] = useState<UploadState>({
    status: 'idle',
    progress: 0,
    bytesUploaded: 0,
    bytesTotal: 0,
    uploadSpeed: 0,
  });

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  const isUploadingRef = useRef(false);
  const localThumbnailRef = useRef<string | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const currentFileRef = useRef<string | null>(null);
  const uploadStartedRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const lastBytesRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  // Store callbacks in refs to avoid re-triggering upload effect
  const onUploadCompleteRef = useRef(onUploadComplete);
  const onUploadErrorRef = useRef(onUploadError);
  const onUploadStartRef = useRef(onUploadStart);
  useEffect(() => {
    onUploadCompleteRef.current = onUploadComplete;
    onUploadErrorRef.current = onUploadError;
    onUploadStartRef.current = onUploadStart;
  }, [onUploadComplete, onUploadError, onUploadStart]);

  // Update elapsed time every second during upload
  useEffect(() => {
    if (uploadState.status !== 'preparing' && uploadState.status !== 'uploading') return;
    const interval = setInterval(() => {
      if (startTimeRef.current > 0) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [uploadState.status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (xhrRef.current) {
        xhrRef.current.abort();
        xhrRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      currentFileRef.current = null;
      uploadStartedRef.current = false;
    };
  }, []);

  // Warn before leaving during upload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUploadingRef.current) {
        e.preventDefault();
        e.returnValue = 'Video đang được tải lên. Bạn có chắc muốn rời đi?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Retry
  const handleRetry = useCallback(() => {
    if (!selectedFile) return;
    uploadStartedRef.current = false;
    currentFileRef.current = null;
    setElapsedSeconds(0);
    setUploadState({
      status: 'idle',
      progress: 0,
      bytesUploaded: 0,
      bytesTotal: 0,
      uploadSpeed: 0,
    });
    setTimeout(() => {
      setUploadState(prev => ({ ...prev }));
    }, 100);
  }, [selectedFile]);

  // Start upload when file is selected
  useEffect(() => {
    if (!selectedFile) return;

    const fileId = `${selectedFile.name}_${selectedFile.size}_${selectedFile.lastModified}`;
    
    if (currentFileRef.current === fileId && uploadStartedRef.current) return;
    
    if (xhrRef.current && currentFileRef.current !== fileId) {
      xhrRef.current.abort();
      xhrRef.current = null;
      isUploadingRef.current = false;
    }

    const startUpload = async () => {
      if (uploadStartedRef.current && currentFileRef.current === fileId) return;
      
      currentFileRef.current = fileId;
      uploadStartedRef.current = true;
      startTimeRef.current = Date.now();
      abortControllerRef.current = new AbortController();
      
      try {
        isUploadingRef.current = true;
        
        setUploadState({
          status: 'preparing',
          progress: 0,
          bytesUploaded: 0,
          bytesTotal: selectedFile.size,
          uploadSpeed: 0,
        });

        onUploadStartRef.current?.();

        // Generate local thumbnail in parallel
        generateVideoThumbnail(selectedFile)
          .then(thumb => {
            localThumbnailRef.current = thumb;
            setUploadState(prev => ({ ...prev, localThumbnail: thumb }));
          })
          .catch(err => console.warn('[VideoUploader] Thumbnail error:', err));

        // Step 1: Get presigned URL from get-upload-url edge function
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Chưa đăng nhập');

        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const extension = selectedFile.name.split('.').pop() || 'mp4';
        const key = `videos/${timestamp}-${randomString}.${extension}`;

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

        const presignResponse = await fetch(`${supabaseUrl}/functions/v1/get-upload-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({ key, contentType: selectedFile.type, fileSize: selectedFile.size }),
          signal: abortControllerRef.current.signal,
        });

        if (!presignResponse.ok) {
          const errData = await presignResponse.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${presignResponse.status}`);
        }

        const { uploadUrl, publicUrl } = await presignResponse.json();
        if (!uploadUrl || !publicUrl) throw new Error('Không nhận được URL upload từ server');

        logger.debug('[VideoUploader] Got presigned URL for R2, key:', key);

        // Step 2: Upload directly to R2 via XMLHttpRequest (for progress tracking)
        setUploadState(prev => ({
          ...prev,
          status: 'uploading',
          videoUrl: publicUrl,
          videoKey: key,
        }));

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;

          xhr.upload.addEventListener('progress', (event) => {
            if (!event.lengthComputable) return;
            const now = Date.now();
            const timeDiff = (now - lastTimeRef.current) / 1000;
            const bytesDiff = event.loaded - lastBytesRef.current;
            const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;

            lastBytesRef.current = event.loaded;
            lastTimeRef.current = now;

            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadState(prev => ({
              ...prev,
              progress,
              bytesUploaded: event.loaded,
              bytesTotal: event.total,
              uploadSpeed: speed > 0 ? speed : prev.uploadSpeed,
            }));
          });

          xhr.addEventListener('load', () => {
            xhrRef.current = null;
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload thất bại: HTTP ${xhr.status}`));
            }
          });

          xhr.addEventListener('error', () => {
            xhrRef.current = null;
            reject(new Error('Lỗi mạng khi tải lên'));
          });

          xhr.addEventListener('abort', () => {
            xhrRef.current = null;
            reject(new Error('Upload đã bị hủy'));
          });

          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', selectedFile.type);
          xhr.setRequestHeader('Cache-Control', 'public, max-age=31536000, immutable');
          xhr.send(selectedFile);
        });

        // Upload complete — no processing needed for R2!
        setUploadState(prev => ({
          ...prev,
          status: 'ready',
          progress: 100,
        }));

        isUploadingRef.current = false;
        toast.success('Video đã tải lên thành công!');
        
        onUploadCompleteRef.current({ 
          uid: key,
          url: publicUrl,
          thumbnailUrl: '',
          localThumbnail: localThumbnailRef.current,
        });

      } catch (error) {
        console.error('[VideoUploader] Error:', error);
        isUploadingRef.current = false;
        uploadStartedRef.current = false;
        currentFileRef.current = null;

        const errorMessage = error instanceof Error ? error.message : 'Lỗi không xác định';
        
        setUploadState(prev => ({
          ...prev,
          status: 'error',
          error: errorMessage,
        }));

        onUploadErrorRef.current?.(error instanceof Error ? error : new Error(errorMessage));
        toast.error(`Lỗi: ${errorMessage}`);
      }
    };

    startUpload();
  }, [selectedFile]);

  const handleCancel = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
    isUploadingRef.current = false;
    uploadStartedRef.current = false;
    currentFileRef.current = null;
    
    // Clean up uploaded file from R2
    const keyToDelete = uploadState.videoKey;
    if (keyToDelete) {
      logger.debug('[VideoUploader] Cleaning up cancelled upload:', keyToDelete);
      deleteFromR2(keyToDelete).catch(err => console.warn('[VideoUploader] Cleanup error:', err));
    }

    setUploadState({
      status: 'idle',
      progress: 0,
      bytesUploaded: 0,
      bytesTotal: 0,
      uploadSpeed: 0,
    });
    setElapsedSeconds(0);
    onRemove?.();
  }, [onRemove, uploadState.videoKey]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatSpeed = (bytesPerSecond: number): string => {
    return `${formatBytes(bytesPerSecond)}/s`;
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds <= 0) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getETA = (): string => {
    if (uploadState.uploadSpeed <= 0) return '--:--';
    const remaining = uploadState.bytesTotal - uploadState.bytesUploaded;
    const seconds = remaining / uploadState.uploadSpeed;
    return formatTime(seconds);
  };

  if (uploadState.status === 'idle' && !selectedFile) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4" data-video-key={uploadState.videoKey}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Video className="w-5 h-5 text-primary" />
          <span className="font-medium text-sm">Tải video lên</span>
          {elapsedSeconds > 0 && uploadState.status !== 'ready' && (
            <span className="text-xs text-muted-foreground">({elapsedSeconds}s)</span>
          )}
        </div>
        
        {uploadState.status !== 'ready' && (
          <Button variant="ghost" size="icon" onClick={handleCancel} disabled={disabled} className="h-8 w-8">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Preparing */}
      {uploadState.status === 'preparing' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Đang chuẩn bị...</span>
        </div>
      )}

      {/* Uploading */}
      {uploadState.status === 'uploading' && (
        <div className="space-y-3">
          <Progress value={uploadState.progress} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatBytes(uploadState.bytesUploaded)} / {formatBytes(uploadState.bytesTotal)}</span>
            <span className="font-medium text-primary">{Math.round(uploadState.progress)}%</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            {uploadState.uploadSpeed > 0 && <span>Tốc độ: {formatSpeed(uploadState.uploadSpeed)}</span>}
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Còn lại: {getETA()}
            </span>
          </div>
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-600 dark:text-amber-400">
            ⚠️ Vui lòng không đóng trình duyệt khi đang tải lên!
          </div>
        </div>
      )}

      {/* Ready */}
      {uploadState.status === 'ready' && (
        <div className="space-y-2">
          <div className="relative rounded-lg overflow-hidden bg-muted h-32">
            {uploadState.localThumbnail ? (
              <img src={uploadState.localThumbnail} alt="Video thumbnail" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Video className="w-12 h-12 text-muted-foreground" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-500" />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Video đã sẵn sàng
            </span>
            <Button variant="ghost" size="sm" onClick={handleCancel} className="h-6 text-xs text-muted-foreground hover:text-destructive">
              Xóa
            </Button>
          </div>
        </div>
      )}

      {/* Error */}
      {uploadState.status === 'error' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span>{uploadState.error || 'Đã xảy ra lỗi'}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRetry} className="gap-1">
              <RefreshCw className="w-3 h-3" />
              Thử lại
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              Hủy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
