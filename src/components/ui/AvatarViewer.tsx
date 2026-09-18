import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AvatarViewerProps {
  imageUrl?: string | null;
  isOpen: boolean;
  onClose: () => void;
  fallbackText?: string;
}

export const AvatarViewer = ({ imageUrl, isOpen, onClose, fallbackText }: AvatarViewerProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden bg-black/95 border-none rounded-full aspect-square flex items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 z-10 bg-white/10 hover:bg-white/20 text-white rounded-full"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Avatar"
            className="w-full h-full object-cover rounded-full"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary rounded-full">
            <span className="text-6xl font-bold text-primary-foreground">
              {fallbackText || '?'}
            </span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
