import type React from 'react';
import { Check, Clipboard, Loader2, Play, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react';
import { ProgressChecklist, type ChecklistStep } from '@/modules/live/components/ProgressChecklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { LivePreviewPlayer } from './LivePreviewPlayer';

interface LiveSetupPanelProps {
  checklistSteps: ChecklistStep[];
  previewProps: React.ComponentProps<typeof LivePreviewPlayer>;
  title: string;
  description: string;
  detailsComplete: boolean;
  persistentStream: boolean;
  creating: boolean;
  saving: boolean;
  publishing: boolean;
  resetting: boolean;
  sourceConnected: boolean;
  inputConnected: boolean;
  canGoLive: boolean;
  disabledReason: string | null;
  statusCheckError: string | null;
  rtmpsUrl?: string | null;
  streamKey?: string | null;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSaveDetails: () => void;
  onGoLive: () => void;
  onResetKey: () => void;
  onChangeStreamMode: (checked: boolean) => void;
  onCopy: (value: string, label: string) => void;
  onReloadPreview: () => void;
}

export function LiveSetupPanel({
  checklistSteps,
  previewProps,
  title,
  description,
  detailsComplete,
  persistentStream,
  creating,
  saving,
  publishing,
  resetting,
  sourceConnected,
  inputConnected,
  canGoLive,
  disabledReason,
  statusCheckError,
  rtmpsUrl,
  streamKey,
  onTitleChange,
  onDescriptionChange,
  onSaveDetails,
  onGoLive,
  onResetKey,
  onChangeStreamMode,
  onCopy,
  onReloadPreview,
}: LiveSetupPanelProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)_380px]">
      <ProgressChecklist title="Tiến trình" steps={checklistSteps} />

      <section className="space-y-4">
        <LivePreviewPlayer {...previewProps} />

        {previewProps.canShowPreview && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onReloadPreview}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Tải lại preview
            </Button>
          </div>
        )}

        <div className="border bg-card p-4 rounded-lg space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Hoàn tất chi tiết bài viết</h2>
            {detailsComplete ? <Badge variant="secondary">Đã hoàn tất</Badge> : <Badge variant="outline">Bắt buộc</Badge>}
          </div>
          <div className="space-y-1">
            <Input value={title} onChange={(event) => onTitleChange(event.target.value.slice(0, 5000))} placeholder="Tiêu đề live (bắt buộc)" maxLength={5000} />
            {title.length >= 5000 && <p className="text-xs text-amber-600 dark:text-amber-400">Tiêu đề đã đạt giới hạn 5000 ký tự.</p>}
          </div>
          <div className="space-y-1">
            <Textarea value={description} onChange={(event) => onDescriptionChange(event.target.value.slice(0, 5000))} placeholder="Mô tả live (bắt buộc)" rows={5} maxLength={5000} />
            {description.length >= 5000 && <p className="text-xs text-amber-600 dark:text-amber-400">Mô tả đã đạt giới hạn 5000 ký tự.</p>}
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1">
              <label className="text-sm font-medium">Quyền riêng tư</label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm opacity-80" value="public" disabled>
                <option value="public">Công khai</option>
              </select>
            </div>
            <Button onClick={onSaveDetails} disabled={saving || !detailsComplete || title.length > 5000 || description.length > 5000}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Lưu chi tiết
            </Button>
          </div>
        </div>
      </section>

      <aside className="border bg-card p-4 rounded-lg space-y-4">
        <div>
          <h2 className="font-semibold">Kết nối nguồn video</h2>
          <p className="text-sm text-muted-foreground">Trong phần mềm phát, chọn Custom RTMP/RTMPS rồi nhập Server URL và Stream Key.</p>
        </div>

        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Luồng cố định</div>
              <div className="text-xs text-muted-foreground">
                {persistentStream ? 'Giữ Stream Key cố định để dùng lại trong phần mềm phát.' : 'Tạo Stream Key mới cho từng phiên live.'}
              </div>
            </div>
            <Switch checked={persistentStream} onCheckedChange={onChangeStreamMode} disabled={creating || sourceConnected} aria-label="Luồng cố định" />
          </div>
          <Badge variant={persistentStream ? 'secondary' : 'outline'}>{persistentStream ? 'Luồng cố định' : 'Luồng tạm thời'}</Badge>
          {persistentStream && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Không chia sẻ Stream Key. Ai có key này đều có thể gửi nguồn phát vào phiên của bạn.
            </div>
          )}
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
        </div>

        <Button variant="outline" onClick={onResetKey} disabled={resetting || !streamKey}>
          {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Đặt lại Stream Key
        </Button>

        {statusCheckError && !sourceConnected && (
          <div className="flex gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Không kiểm tra được trạng thái Cloudflare/nguồn phát: {statusCheckError}</span>
          </div>
        )}

        <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            {sourceConnected && detailsComplete && canGoLive
              ? 'Đã nhận tín hiệu RTMP/RTMPS từ nguồn phát. Bạn có thể phát trực tiếp.'
              : sourceConnected && previewProps.canShowPreview && !canGoLive
                ? disabledReason || 'Đang chờ preview hiển thị hình ảnh đầu tiên.'
              : inputConnected && !sourceConnected
                ? 'Nguồn phát đã kết nối nhưng chưa có dữ liệu video. Đang chờ Cloudflare nhận khung hình đầu tiên...'
                : disabledReason || 'Chờ tín hiệu nguồn phát...'}
          </span>
        </div>

        <Button onClick={onGoLive} disabled={!canGoLive || publishing} className="w-full">
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Phát trực tiếp
        </Button>
      </aside>
    </div>
  );
}
