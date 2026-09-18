import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useReels } from '@/hooks/useReels';
import { useLanguage } from '@/i18n/LanguageContext';
import { Upload, X, Film } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CreateReelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CreateReelDialog = ({ open, onOpenChange }: CreateReelDialogProps) => {
  const { t } = useLanguage();
  const { uploadReel, currentUser } = useReels();
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      toast.error(t('fileNotSupported'));
      return;
    }
    if (file.size > 2 * 1024 * 1024 * 1024) {
      toast.error(t('videoTooLarge'));
      return;
    }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!videoFile || !currentUser) return;
    setUploading(true);
    try {
      // Upload to R2 via presigned URL
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('get-upload-url', {
        body: {
          key: `reels/${currentUser.id}/${Date.now()}-${videoFile.name}`,
          contentType: videoFile.type,
          fileSize: videoFile.size,
        },
      });

      if (uploadError || !uploadData?.uploadUrl) throw new Error('Failed to get upload URL');

      // Upload file
      const uploadRes = await fetch(uploadData.uploadUrl, {
        method: 'PUT',
        body: videoFile,
        headers: { 'Content-Type': videoFile.type },
      });

      if (!uploadRes.ok) throw new Error('Upload failed');

      const videoUrl = uploadData.publicUrl;

      // Create reel record
      await uploadReel.mutateAsync({ videoUrl, caption, visibility });
      
      // Reset form
      setCaption('');
      setVideoFile(null);
      setVideoPreview(null);
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="w-5 h-5" /> {t('createReel')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Video upload area */}
          {!videoPreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">{t('addVideo')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('dragAndDrop')}</p>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden bg-black aspect-[9/16] max-h-[300px]">
              <video src={videoPreview} className="w-full h-full object-contain" controls />
              <button
                onClick={() => { setVideoFile(null); setVideoPreview(null); }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          
          <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleFileSelect} />

          {/* Caption */}
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder={t('writeCaptionReel')}
            className="resize-none"
            rows={3}
          />

          {/* Visibility */}
          <Select value={visibility} onValueChange={setVisibility}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="public">{t('publicReel')}</SelectItem>
              <SelectItem value="friends">{t('friendsOnlyReel')}</SelectItem>
              <SelectItem value="private">{t('privateReel')}</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={handleUpload}
            disabled={!videoFile || uploading}
            className="w-full"
          >
            {uploading ? t('uploadingReel') : t('uploadReel')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
