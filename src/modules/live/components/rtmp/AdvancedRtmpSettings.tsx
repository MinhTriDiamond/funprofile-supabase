import { ChevronDown, Clipboard, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface AdvancedRtmpSettingsProps {
  rtmpsUrl?: string | null;
  streamKey?: string | null;
  persistentStream: boolean;
  creating?: boolean;
  sourceConnected: boolean;
  isLive: boolean;
  resetting: boolean;
  onCopy: (value: string, label: string) => void;
  onResetKey: () => void;
  onChangeStreamMode: (checked: boolean) => void;
  defaultOpen?: boolean;
}

export function AdvancedRtmpSettings({
  rtmpsUrl,
  streamKey,
  persistentStream,
  creating = false,
  sourceConnected,
  isLive,
  resetting,
  onCopy,
  onResetKey,
  onChangeStreamMode,
  defaultOpen = false,
}: AdvancedRtmpSettingsProps) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="rounded-lg border bg-card">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="flex h-auto w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-left">
          <div>
            <div className="font-semibold">Cài đặt nguồn phát nâng cao</div>
            <div className="text-xs text-muted-foreground">RTMP/RTMPS URL, Stream Key và luồng cố định.</div>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 border-t p-4">
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Luồng cố định</div>
              <div className="text-xs text-muted-foreground">
                {persistentStream
                  ? 'Giữ Stream Key cố định để dùng lại trong phần mềm phát.'
                  : 'Tạo Stream Key mới cho từng phiên live.'}
              </div>
            </div>
            <Switch
              checked={persistentStream}
              onCheckedChange={onChangeStreamMode}
              disabled={creating || sourceConnected || isLive}
              aria-label="Luồng cố định"
            />
          </div>
          <Badge variant={persistentStream ? 'secondary' : 'outline'}>
            {persistentStream ? 'Luồng cố định' : 'Luồng tạm thời'}
          </Badge>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Server URL / RTMPS URL</label>
          <div className="flex gap-2">
            <Input value={rtmpsUrl || ''} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="icon" disabled={!rtmpsUrl} onClick={() => rtmpsUrl && onCopy(rtmpsUrl, 'Server URL')}>
              <Clipboard className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Stream Key</label>
          <div className="flex gap-2">
            <Input value={streamKey || ''} readOnly type="text" className="font-mono text-xs" />
            <Button variant="outline" size="icon" disabled={!streamKey} onClick={() => streamKey && onCopy(streamKey, 'Stream Key')}>
              <Clipboard className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-amber-700">Không chia sẻ Stream Key. Chỉ mở phần này khi cần cấu hình lại phần mềm phát.</p>
        </div>

        <Button variant="outline" onClick={onResetKey} disabled={resetting || !streamKey}>
          <RotateCcw className={resetting ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Đặt lại Stream Key
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}
