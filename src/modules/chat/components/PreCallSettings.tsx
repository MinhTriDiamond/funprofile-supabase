import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Video, Mic } from 'lucide-react';

interface PreCallSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStart: (settings: { cameraId: string; micId: string }) => void;
  callType: 'voice' | 'video';
}

interface DeviceInfo {
  deviceId: string;
  label: string;
}

export function PreCallSettings({ open, onOpenChange, onStart, callType }: PreCallSettingsProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameras, setCameras] = useState<DeviceInfo[]>([]);
  const [mics, setMics] = useState<DeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');

  useEffect(() => {
    if (!open) return;

    const init = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: callType === 'video',
          audio: true,
        });
        streamRef.current = stream;

        if (videoRef.current && callType === 'video') {
          videoRef.current.srcObject = stream;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput').map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 4)}` }));
        const micDevices = devices.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label || `Mic ${d.deviceId.slice(0, 4)}` }));
        setCameras(cams);
        setMics(micDevices);
        if (cams.length) setSelectedCamera(cams[0].deviceId);
        if (micDevices.length) setSelectedMic(micDevices[0].deviceId);
      } catch {
        // Permission denied
      }
    };

    init();

    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [open, callType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cài đặt trước cuộc gọi</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {callType === 'video' && (
            <div className="rounded-lg overflow-hidden bg-black aspect-video">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            </div>
          )}

          {callType === 'video' && cameras.length > 0 && (
            <div>
              <Label className="flex items-center gap-2 mb-1"><Video className="h-4 w-4" /> Camera</Label>
              <Select value={selectedCamera} onValueChange={setSelectedCamera}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cameras.map(c => <SelectItem key={c.deviceId} value={c.deviceId}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {mics.length > 0 && (
            <div>
              <Label className="flex items-center gap-2 mb-1"><Mic className="h-4 w-4" /> Microphone</Label>
              <Select value={selectedMic} onValueChange={setSelectedMic}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {mics.map(m => <SelectItem key={m.deviceId} value={m.deviceId}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button onClick={() => {
            streamRef.current?.getTracks().forEach(t => t.stop());
            onStart({ cameraId: selectedCamera, micId: selectedMic });
          }}>
            Bắt đầu cuộc gọi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
