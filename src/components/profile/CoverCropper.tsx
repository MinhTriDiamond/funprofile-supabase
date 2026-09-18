import { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ZoomIn, Check, X } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';

interface CoverCropperProps {
  image: string;
  onCropComplete: (croppedImageBlob: Blob) => void;
  onCancel: () => void;
}

// Create image from URL
const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

// Get cropped image as blob
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  // Set canvas size to cropped area (max 1920x640 for cover)
  const maxWidth = 1920;
  const maxHeight = 640;
  
  let targetWidth = pixelCrop.width;
  let targetHeight = pixelCrop.height;
  
  if (targetWidth > maxWidth) {
    const scale = maxWidth / targetWidth;
    targetWidth = maxWidth;
    targetHeight = targetHeight * scale;
  }
  
  if (targetHeight > maxHeight) {
    const scale = maxHeight / targetHeight;
    targetHeight = maxHeight;
    targetWidth = targetWidth * scale;
  }

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    targetWidth,
    targetHeight
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas is empty'));
        }
      },
      'image/jpeg',
      0.9
    );
  });
}

export function CoverCropper({ image, onCropComplete, onCancel }: CoverCropperProps) {
  const { t } = useLanguage();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const onCropChange = useCallback((location: { x: number; y: number }) => {
    setCrop(location);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropCompleteCallback = useCallback(
    (_croppedArea: any, croppedAreaPixels: { x: number; y: number; width: number; height: number }) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleCrop = async () => {
    if (!croppedAreaPixels) return;
    
    try {
      const croppedImage = await getCroppedImg(image, croppedAreaPixels);
      onCropComplete(croppedImage);
    } catch (error) {
      console.error('Error cropping image:', error);
    }
  };

  return (
    <Dialog open onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 flex-shrink-0">
          <DialogTitle className="text-xl font-bold">{t('cropCoverTitle')}</DialogTitle>
        </DialogHeader>
        
        {/* Cropper Area - 3:1 aspect ratio for cover */}
        <div className="relative w-full h-[300px] sm:h-[400px] bg-black">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={3 / 1}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropCompleteCallback}
            showGrid={true}
            cropShape="rect"
            objectFit="horizontal-cover"
          />
        </div>
        
        {/* Controls */}
        <div className="px-6 py-4 flex-shrink-0 border-t bg-background">
          {/* Zoom Slider */}
          <div className="flex items-center gap-4 mb-4">
            <ZoomIn className="w-5 h-5 text-muted-foreground" />
            <Slider
              value={[zoom]}
              onValueChange={([value]) => setZoom(value)}
              min={1}
              max={3}
              step={0.1}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-12 text-right">
              {zoom.toFixed(1)}x
            </span>
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>
              <X className="w-4 h-4 mr-2" />
              {t('cancel')}
            </Button>
            <Button onClick={handleCrop} className="bg-primary hover:bg-primary/90">
              <Check className="w-4 h-4 mr-2" />
              {t('applyAction')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
