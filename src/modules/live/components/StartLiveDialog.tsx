import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RadioTower, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface StartLiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LiveMode = 'webcam' | 'obs';

export function StartLiveDialog({ open, onOpenChange }: StartLiveDialogProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<LiveMode>('webcam');

  const handleStart = () => {
    onOpenChange(false);
    navigate(mode === 'webcam' ? '/live/setup' : '/live/obs');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Video className="h-5 w-5 text-destructive" />
            Bắt đầu LIVE
          </DialogTitle>
          <DialogDescription>
            Chọn cách bạn muốn phát trực tiếp.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as LiveMode)}
            className="grid grid-cols-2 gap-3"
          >
            <label
              htmlFor="mode-webcam"
              className={`group flex flex-col items-center gap-2 rounded-xl border p-5 cursor-pointer transition-all ${
                mode === 'webcam'
                  ? 'border-primary bg-accent/40 shadow-sm'
                  : 'border-border hover:border-muted-foreground/40 hover:bg-accent/20'
              }`}
            >
              <RadioGroupItem value="webcam" id="mode-webcam" className="sr-only" />
              <Video className="h-7 w-7 text-foreground/80" />
              <span className="text-sm font-semibold">Webcam</span>
              <span className="text-xs text-muted-foreground text-center leading-snug">
                Phát từ camera (điện thoại / máy tính)
              </span>
            </label>

            <label
              htmlFor="mode-obs"
              className={`group flex flex-col items-center gap-2 rounded-xl border p-5 cursor-pointer transition-all ${
                mode === 'obs'
                  ? 'border-primary bg-accent/40 shadow-sm'
                  : 'border-border hover:border-muted-foreground/40 hover:bg-accent/20'
              }`}
            >
              <RadioGroupItem value="obs" id="mode-obs" className="sr-only" />
              <RadioTower className="h-7 w-7 text-foreground/80" />
              <span className="text-sm font-semibold">Phần mềm phát trực tiếp</span>
              <span className="text-xs text-muted-foreground text-center leading-snug">
                OBS, Zoom, Restream, OneStream, vMix, Streamlabs…
              </span>
            </label>
          </RadioGroup>

          <Button onClick={handleStart} className="w-full">
            {mode === 'webcam' ? 'Bắt đầu Webcam Live' : 'Tiếp tục với phần mềm phát'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
