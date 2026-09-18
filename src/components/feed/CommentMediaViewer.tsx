import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CommentMediaViewerProps {
  mediaUrl: string;
  mediaType: 'image' | 'video';
  isOpen: boolean;
  onClose: () => void;
}

export const CommentMediaViewer = ({ 
  mediaUrl, 
  mediaType, 
  isOpen, 
  onClose 
}: CommentMediaViewerProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4 z-10 bg-white/10 hover:bg-white/20 text-white"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
        {mediaType === 'image' ? (
          <img 
            src={mediaUrl} 
            alt="Comment media" 
            className="w-full h-auto max-h-[90vh] object-contain"
          />
        ) : (
          <video 
            src={mediaUrl} 
            controls 
            className="w-full h-auto max-h-[90vh]"
            autoPlay
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
