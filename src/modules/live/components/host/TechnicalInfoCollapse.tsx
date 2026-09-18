import { ChevronDown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { LiveHostPreviewStats, LiveNetworkQuality } from '../../hooks/useLiveRtc';
import type { HostRecordingDetails } from './hostLiveTypes';

interface TechnicalInfoCollapseProps {
  channelName?: string | null;
  statusText: string;
  recording: HostRecordingDetails;
  networkQuality: LiveNetworkQuality;
  previewStats?: LiveHostPreviewStats;
}

export function TechnicalInfoCollapse({ channelName, statusText, recording, networkQuality, previewStats }: TechnicalInfoCollapseProps) {
  const resolution = previewStats?.width && previewStats?.height ? `${previewStats.width}x${previewStats.height}` : previewStats?.quality || 'đang đo';
  const fps = previewStats?.fps ? `${previewStats.fps} fps` : 'đang đo';
  const bitrate = previewStats?.bitrateKbps ? `${(previewStats.bitrateKbps / 1000).toFixed(2)} Mbps` : 'đang đo';
  const latency = previewStats?.latencyMs ? `${previewStats.latencyMs} ms` : 'đang đo';

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-2 rounded-full bg-white/70 px-3 text-xs font-bold text-muted-foreground shadow-sm hover:bg-white">
          <Info className="h-3.5 w-3.5" />
          Thông tin kỹ thuật
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-2xl border border-gold/15 bg-white/90 p-3 text-xs text-muted-foreground shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <div>Channel: {channelName || 'đang cập nhật'}</div>
          <div>RTC: {statusText || 'đang theo dõi'}</div>
          <div>Recorder: {recording.state}</div>
          <div>Publish resolution: {resolution}</div>
          <div>FPS: {fps}</div>
          <div>Publish bitrate: {bitrate}</div>
          <div>Packet loss: {previewStats?.packetLoss !== undefined ? `${previewStats.packetLoss}%` : 'đang đo'}</div>
          <div>RTT: {latency}</div>
          <div>Current stream: {previewStats?.currentStreamType || 'high'}</div>
          <div>Encoder profile: {previewStats?.encoderProfile || previewStats?.quality || 'đang đo'}</div>
          <div>Chunks: {recording.uploadStats.uploaded}/{recording.uploadStats.total}</div>
          <div>Upload: {recording.uploadProgress}%</div>
          <div>Network uplink: {(previewStats?.networkQuality?.uplinkNetworkQuality ?? networkQuality.uplinkNetworkQuality) || 'n/a'}</div>
          <div>Network downlink: {(previewStats?.networkQuality?.downlinkNetworkQuality ?? networkQuality.downlinkNetworkQuality) || 'n/a'}</div>
        </div>
        {recording.error && <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 font-semibold text-red-700">Recording: {recording.error}</div>}
      </CollapsibleContent>
    </Collapsible>
  );
}
