import { useState, useCallback } from 'react';
import Cropper, { Point, Area } from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

interface AvatarCropperProps {
  image: string;
  onCropComplete: (croppedImage: Blob) => void;
  onCancel: () => void;
}

export const AvatarCropper = ({ image, onCropComplete, onCancel }: AvatarCropperProps) => {
  const { t } = useLanguage();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = (newCrop: Point) => {
    setCrop(newCrop);
  };

  const onZoomChange = (newZoom: number) => {
    setZoom(newZoom);
  };

  const onCropAreaComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error(t('cropCanvasFail'));
    }

    // Giới hạn kích thước tối đa 1024x1024 để upload nhanh hơn
    const MAX_SIZE = 1024;
    const scale = Math.min(1, MAX_SIZE / Math.max(pixelCrop.width, pixelCrop.height));
    const outW = Math.round(pixelCrop.width * scale);
    const outH = Math.round(pixelCrop.height * scale);

    canvas.width = outW;
    canvas.height = outH;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      outW,
      outH
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error(t('cropCanvasFail2')));
        },
        'image/jpeg',
        0.9
      );
    });
  };

  const handleCrop = async () => {
    if (!croppedAreaPixels) {
      toast.error(t('cropWaitImage'));
      return;
    }
    setIsProcessing(true);
    try {
      const croppedImage = await getCroppedImg(image, croppedAreaPixels);
      onCropComplete(croppedImage);
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('cropUnknown');
      toast.error(t('cropCanvasErr', { msg }));
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open && !isProcessing) onCancel(); }}>
      <DialogContent className="max-w-2xl w-[95vw] sm:w-full p-3 sm:p-6 max-h-[95vh] overflow-y-auto flex flex-col gap-3">
        <DialogHeader>
          <DialogTitle>{t('cropAvatarTitle')}</DialogTitle>
        </DialogHeader>
        <div 
          className="relative w-full bg-muted rounded-md overflow-hidden"
          style={{ height: 'min(60vh, 400px)', minHeight: '280px' }}
        >
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropAreaComplete}
            objectFit="contain"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">{t('zoomLabel')}</label>
          <Slider
            value={[zoom]}
            min={1}
            max={3}
            step={0.1}
            onValueChange={(value) => setZoom(value[0])}
          />
        </div>
        <DialogFooter className="flex-row gap-2 sm:gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isProcessing} className="flex-1 sm:flex-initial">
            {t('cancel')}
          </Button>
          <Button onClick={handleCrop} disabled={isProcessing} className="flex-1 sm:flex-initial">
            {isProcessing ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('processingShort')}</>
            ) : (
              t('applyAction')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
