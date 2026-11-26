import type { RefCallback } from 'react';
import { ArrowLeft, Check, Globe2, Loader2, Mic, MicOff, Radio, Settings2, SwitchCamera, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { VideoQuality, WebcamAudioMode } from '../../pages/PreLivePage';

interface Props {
  setVideoElement: RefCallback<HTMLVideoElement>;
  description: string;
  onDescriptionChange: (value: string) => void;
  quality: VideoQuality;
  qualityOptions: VideoQuality[];
  qualityLabels: Record<VideoQuality, string>;
  onQualityChange: (quality: VideoQuality) => void;
  audioMode: WebcamAudioMode;
  onAudioModeChange: (mode: WebcamAudioMode) => void;
  microphones: { deviceId: string; label: string }[];
  microphoneId: string;
  onMicrophoneChange: (id: string) => void;
  isMicOn: boolean;
  onToggleMic: () => void;
  onSwitchCamera: () => void;
  mirror: boolean;
  preparing: boolean;
  denied: boolean;
  ready: boolean;
  starting: boolean;
  canStart: boolean;
  liveButtonLabel: string;
  onStart: () => void;
  onBack: () => void;
  onRetry: () => void;
}

const selectClass = 'h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export function DesktopWebcamSetup(props: Props) {
  const locked = props.starting || props.preparing;
  return (
    <main data-testid="desktop-webcam-setup" className="fixed inset-0 z-50 grid grid-cols-[320px_minmax(0,1fr)] overflow-hidden bg-background text-foreground xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside aria-label="Thiết lập buổi phát trực tiếp" className="flex min-h-0 flex-col border-r border-border bg-card">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-4">
          <Button variant="ghost" size="icon" onClick={props.onBack} disabled={props.starting} aria-label="Quay lại"><ArrowLeft className="h-5 w-5" /></Button>
          <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">FUN Profile</p><h1 className="text-lg font-bold">Tạo video trực tiếp</h1></div>
        </header>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
          <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm">
            <Video className="h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">Phát bằng webcam</p><p className="mt-0.5 text-xs text-muted-foreground">Kiểm tra hình ảnh và âm thanh trước khi lên sóng.</p></div>
          </div>
          <section className="space-y-3" aria-labelledby="desktop-live-details">
            <h2 id="desktop-live-details" className="font-semibold">Chi tiết bài viết</h2>
            <div className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"><Globe2 className="h-4 w-4" />Công khai</div>
            <div className="space-y-2">
              <Label htmlFor="desktop-live-description">Nội dung buổi live</Label>
              <Textarea id="desktop-live-description" value={props.description} onChange={event => props.onDescriptionChange(event.target.value)} maxLength={5000} rows={4} disabled={props.starting} placeholder="Video trực tiếp của bạn nói về điều gì?" className="resize-y" />
              <p className="text-right text-xs tabular-nums text-muted-foreground">{props.description.length}/5000</p>
            </div>
          </section>
          <section className="space-y-4" aria-labelledby="desktop-live-devices">
            <h2 id="desktop-live-devices" className="flex items-center gap-2 font-semibold"><Settings2 className="h-4 w-4" />Thiết bị và chất lượng</h2>
            <div className="space-y-2"><Label htmlFor="desktop-live-microphone">Micro</Label>
              <select id="desktop-live-microphone" value={props.microphoneId} onChange={event => props.onMicrophoneChange(event.target.value)} disabled={locked} className={selectClass}>
                <option value="">Micro mặc định</option>{props.microphones.filter(mic => mic.deviceId !== '').map(mic => <option key={mic.deviceId} value={mic.deviceId}>{mic.label}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="desktop-live-quality">Chất lượng video</Label>
              <select id="desktop-live-quality" value={props.quality} onChange={event => props.onQualityChange(event.target.value as VideoQuality)} disabled={locked} className={selectClass}>
                {props.qualityOptions.map(quality => <option key={quality} value={quality}>{props.qualityLabels[quality]}</option>)}
              </select>
            </div>
            <div className="space-y-2"><Label htmlFor="desktop-live-audio">Chế độ âm thanh</Label>
              <select id="desktop-live-audio" value={props.audioMode} onChange={event => props.onAudioModeChange(event.target.value as WebcamAudioMode)} disabled={locked} className={selectClass}>
                <option value="original">Âm thanh gốc</option><option value="voice">Khử ồn</option>
              </select>
            </div>
          </section>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><Globe2 className="mt-0.5 h-4 w-4 shrink-0" />Buổi live sẽ được chia sẻ công khai trên trang cá nhân của bạn khi bắt đầu phát.</p>
        </div>
        <footer className="shrink-0 space-y-3 border-t border-border bg-card p-5">
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">{props.ready ? <Check className="h-4 w-4 text-primary" /> : <Video className="h-4 w-4" />}{props.ready ? 'Camera đã sẵn sàng' : props.preparing ? 'Đang kết nối camera…' : 'Cần kiểm tra camera'}</p>
          <Button onClick={props.onStart} disabled={!props.canStart} className="h-12 w-full gap-2 text-base font-bold">{props.starting || props.preparing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Radio className="h-5 w-5" />}{props.liveButtonLabel}</Button>
        </footer>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col overflow-y-auto p-6 xl:p-8" aria-label="Xem trước webcam">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">Xem trước</h2><p className="mt-1 text-sm text-muted-foreground">Hình ảnh này chưa được phát trực tiếp.</p></div><span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold">Chỉ bạn nhìn thấy</span></header>
        <div className="flex min-h-0 flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div data-testid="desktop-camera-frame" className="relative aspect-video bg-media">
              <video ref={props.setVideoElement} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-contain" style={{ transform: props.mirror ? 'scaleX(-1)' : undefined }} />
              {(props.preparing || props.denied || !props.ready) && <div className="absolute inset-0 flex items-center justify-center bg-media/90 p-6 text-center text-media-foreground"><div className="max-w-sm">
                {props.preparing ? <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin" /> : <Video className="mx-auto mb-3 h-8 w-8" />}
                <h3 className="text-lg font-semibold">{props.preparing ? 'Đang chuẩn bị camera…' : props.denied ? 'Không thể truy cập camera và micro' : 'Camera chưa sẵn sàng'}</h3>
                {!props.preparing && <><p className="mt-2 text-sm opacity-80">Kiểm tra kết nối thiết bị và quyền camera, micro trong trình duyệt rồi thử lại.</p><Button onClick={props.onRetry} className="mt-4" disabled={props.starting}>Thử lại</Button></>}
              </div></div>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
              <div className="flex flex-wrap gap-2">
                <Button variant={props.isMicOn ? 'outline' : 'secondary'} onClick={props.onToggleMic} disabled={locked || !props.ready} aria-pressed={!props.isMicOn} className="gap-2">{props.isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}{props.isMicOn ? 'Tắt micro' : 'Bật micro'}</Button>
                <Button variant="outline" onClick={props.onSwitchCamera} disabled={locked || !props.ready} className="gap-2"><SwitchCamera className="h-4 w-4" />Đổi camera</Button>
              </div>
              <span className="text-xs text-muted-foreground">{props.isMicOn ? 'Micro đang bật' : 'Micro đang tắt'}</span>
            </div>
          </div>
          <p className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground">Khung xem trước giữ trọn hình ảnh từ webcam. Đeo tai nghe để hạn chế tiếng vọng khi phát trực tiếp.</p>
        </div>
      </section>
    </main>
  );
}
