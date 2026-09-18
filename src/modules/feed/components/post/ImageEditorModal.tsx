/**
 * ImageEditorModal — Crop (react-easy-crop), Rotate (Canvas API), Alt Text
 */
import { useEffect, useState, useCallback } from 'react';
import { Crop, RotateCw, Captions } from 'lucide-react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DraftAttachment } from '../../types';

interface ImageEditorModalProps {
  attachment: DraftAttachment | null;
  open: boolean;
  onClose: () => void;
  onSave: (payload: {
    file: File;
    previewUrl: string;
    width?: number;
    height?: number;
    altText: string;
    transformMeta?: Record<string, unknown> | null;
  }) => void;
}

type EditorTab = 'crop' | 'rotate' | 'alt';

const ASPECT_OPTIONS = [
  { label: 'Tự do', value: 0 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
] as const;

/** Create a cropped+rotated image via Canvas API */
async function getCroppedImg(
  imageSrc: string,
  cropArea: Area,
  rotation: number,
): Promise<{ file: File; url: string; width: number; height: number }> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const radians = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));

  // Rotated bounding box of the full image
  const rotW = image.width * cos + image.height * sin;
  const rotH = image.width * sin + image.height * cos;

  canvas.width = cropArea.width;
  canvas.height = cropArea.height;

  ctx.translate(-cropArea.x, -cropArea.y);
  ctx.translate(rotW / 2, rotH / 2);
  ctx.rotate(radians);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        const file = new File([blob!], 'edited.webp', { type: 'image/webp' });
        resolve({
          file,
          url: URL.createObjectURL(file),
          width: cropArea.width,
          height: cropArea.height,
        });
      },
      'image/webp',
      0.92,
    );
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function ImageEditorModal({
  attachment,
  open,
  onClose,
  onSave,
}: ImageEditorModalProps) {
  const [tab, setTab] = useState<EditorTab>('crop');
  const [altText, setAltText] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [aspectIdx, setAspectIdx] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!attachment) return;
    setAltText(attachment.altText || '');
    setTab('crop');
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAspectIdx(0);
  }, [attachment]);

  const onCropComplete = useCallback((_: Area, area: Area) => {
    setCroppedArea(area);
  }, []);

  const previewSrc = attachment?.previewUrl || attachment?.fileUrl;

  const handleSave = async () => {
    if (!attachment || !previewSrc || !croppedArea) return;
    setSaving(true);
    try {
      const { file, url, width, height } = await getCroppedImg(
        previewSrc,
        croppedArea,
        rotation,
      );
      onSave({
        file,
        previewUrl: url,
        width,
        height,
        altText,
        transformMeta: { rotation, crop: croppedArea, editedAt: new Date().toISOString() },
      });
    } catch (e) {
      console.error('Image edit failed:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleAltTextSave = () => {
    if (!attachment?.file) return;
    onSave({
      file: attachment.file,
      previewUrl: attachment.previewUrl || '',
      width: attachment.width,
      height: attachment.height,
      altText,
      transformMeta: attachment.transformMeta,
    });
  };

  if (!attachment) return null;

  const aspect = ASPECT_OPTIONS[aspectIdx].value;

  const tabs: Array<{ id: EditorTab; label: string; icon: typeof Crop }> = [
    { id: 'crop', label: 'Cắt', icon: Crop },
    { id: 'rotate', label: 'Xoay', icon: RotateCw },
    { id: 'alt', label: 'Alt Text', icon: Captions },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-center text-lg font-bold">
            Chỉnh sửa ảnh
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Left menu */}
          <div className="w-24 border-r border-border py-3 flex flex-col gap-1 shrink-0">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`flex flex-col items-center gap-1 py-2 px-2 text-xs transition-colors rounded-lg mx-1 ${
                    tab === item.id
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Main area */}
          <div className="flex-1 overflow-auto">
            {tab === 'alt' ? (
              <div className="p-4 space-y-4">
                {previewSrc && (
                  <img
                    src={previewSrc}
                    alt="Preview"
                    className="max-h-[300px] mx-auto rounded-lg object-contain"
                  />
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Alt Text (mô tả ảnh cho người khiếm thị)
                  </label>
                  <Input
                    value={altText}
                    onChange={(e) => setAltText(e.target.value)}
                    placeholder="Mô tả nội dung trong ảnh..."
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground">
                    {altText.length}/500
                  </p>
                </div>
                <Button onClick={handleAltTextSave} className="w-full">
                  Lưu Alt Text
                </Button>
              </div>
            ) : tab === 'rotate' ? (
              <div className="p-4 space-y-4">
                <div className="relative h-[400px] bg-muted rounded-lg overflow-hidden">
                  {previewSrc && (
                    <Cropper
                      image={previewSrc}
                      crop={crop}
                      zoom={zoom}
                      rotation={rotation}
                      aspect={aspect || undefined}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                      showGrid={false}
                    />
                  )}
                </div>
                <div className="flex items-center justify-center gap-2">
                  {[0, 90, 180, 270].map((deg) => (
                    <Button
                      key={deg}
                      variant={rotation === deg ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRotation(deg)}
                    >
                      {deg}°
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              /* crop tab */
              <div className="p-4 space-y-4">
                <div className="relative h-[400px] bg-muted rounded-lg overflow-hidden">
                  {previewSrc && (
                    <Cropper
                      image={previewSrc}
                      crop={crop}
                      zoom={zoom}
                      rotation={rotation}
                      aspect={aspect || undefined}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                    />
                  )}
                </div>
                <div className="flex items-center justify-center gap-2">
                  {ASPECT_OPTIONS.map((opt, idx) => (
                    <Button
                      key={opt.label}
                      variant={aspectIdx === idx ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAspectIdx(idx)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-3 px-2">
                  <span className="text-xs text-muted-foreground">Zoom</span>
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          {tab !== 'alt' && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
