import { useState, useRef } from 'react';
import { Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AvatarCropper } from './AvatarCropper';
import { AvatarViewer } from '@/components/ui/AvatarViewer';
import logger from '@/lib/logger';

interface AvatarEditorProps {
  userId: string;
  currentAvatarUrl?: string | null;
  username?: string;
  onAvatarUpdated: (newUrl: string) => void;
  size?: 'default' | 'large' | 'xl';
}

export function AvatarEditor({ 
  userId, 
  currentAvatarUrl, 
  username,
  onAvatarUpdated,
  size = 'large'
}: AvatarEditorProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ảnh phải nhỏ hơn 5MB');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn file ảnh');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropImage(reader.result as string);
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const createAvatarPost = async (newAvatarUrl: string, accessToken: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      await fetch(`${supabaseUrl}/functions/v1/create-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          content: '📸 đã cập nhật ảnh đại diện.',
          visibility: 'public',
          image_url: newAvatarUrl,
          media_urls: [{ url: newAvatarUrl, type: 'image' }],
        }),
      });
      logger.debug('[AvatarEditor] Avatar update post created');
    } catch (err) {
      logger.warn('[AvatarEditor] Failed to create avatar post:', err);
    }
  };

  const handleCropComplete = async (croppedImageBlob: Blob) => {
    setIsUploading(true);
    setCropImage(null);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        logger.error('[AvatarEditor] Session error:', sessionError);
        toast.error('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại');
        setIsUploading(false);
        return;
      }

      const key = `avatars/${userId}/avatar-${Date.now()}.jpg`;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const formData = new FormData();
      formData.append('file', croppedImageBlob, `avatar-${Date.now()}.jpg`);
      formData.append('key', key);
      formData.append('contentType', 'image/jpeg');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let response: Response;
      try {
        response = await fetch(`${supabaseUrl}/functions/v1/upload-to-r2`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': supabaseKey,
          },
          body: formData,
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
          throw new Error('Tải lên quá lâu, vui lòng kiểm tra mạng và thử lại');
        }
        throw new Error('Không kết nối được máy chủ, vui lòng thử lại');
      }
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        logger.error('[AvatarEditor] Upload edge function error:', response.status, errData);
        throw new Error(errData.error || `Upload thất bại: HTTP ${response.status}`);
      }

      const result = await response.json();
      logger.debug('[AvatarEditor] Avatar uploaded to R2:', result.url);

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: result.url })
        .eq('id', userId);

      if (error) {
        logger.error('[AvatarEditor] Profile update error:', error);
        throw new Error(`Profile update failed: ${error.message}`);
      }

      onAvatarUpdated(result.url);
      toast.success('Đã cập nhật ảnh đại diện');

      // Auto-create post about avatar change (fire-and-forget)
      createAvatarPost(result.url, session.access_token);
    } catch (error) {
      logger.error('[AvatarEditor] Error uploading avatar:', error);
      const msg = error instanceof Error ? error.message : 'Lỗi không xác định';
      toast.error(`Không thể tải lên ảnh đại diện: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  };

  const sizeClasses = size === 'xl'
    ? 'w-36 h-36 sm:w-44 sm:h-44 md:w-52 md:h-52'
    : size === 'large' 
      ? 'w-32 h-32 md:w-44 md:h-44' 
      : 'w-24 h-24';
  
  const buttonSizeClasses = size === 'xl'
    ? 'w-10 h-10 bottom-3 right-3'
    : size === 'large'
      ? 'w-9 h-9 bottom-2 right-2'
      : 'w-7 h-7 bottom-1 right-1';

  const iconSizeClasses = size === 'xl' ? 'w-5 h-5' : size === 'large' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <>
      <div className="relative">
        <div 
          className={`rounded-full p-1 ${currentAvatarUrl ? 'cursor-pointer' : ''}`}
          style={{
            background: 'linear-gradient(135deg, #166534 0%, #22c55e 50%, #16a34a 100%)'
          }}
          onClick={() => { if (currentAvatarUrl) setShowViewer(true); }}
        >
          <Avatar 
            className={`${sizeClasses} border-4 border-white`}
          >
            {currentAvatarUrl && <AvatarImage src={currentAvatarUrl} />}
            <AvatarFallback className="text-4xl md:text-5xl bg-primary text-white">
              {username?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </div>
        
        <button 
          type="button"
          onClick={(e) => { 
            e.preventDefault();
            e.stopPropagation(); 
            fileInputRef.current?.click(); 
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          disabled={isUploading}
          className={`absolute ${buttonSizeClasses} bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors disabled:opacity-50 z-10`}
          aria-label="Thay đổi ảnh đại diện"
        >
          {isUploading ? (
            <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Camera className={iconSizeClasses} />
          )}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Avatar Viewer Dialog */}
      <AvatarViewer
        imageUrl={currentAvatarUrl}
        isOpen={showViewer}
        onClose={() => setShowViewer(false)}
        fallbackText={username?.[0]?.toUpperCase() || 'U'}
      />

      {/* Avatar Cropper Dialog */}
      {cropImage && (
        <AvatarCropper
          image={cropImage}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImage(null)}
        />
      )}
    </>
  );
}
