import { Activity, AlertTriangle, BadgeCheck, ChevronDown, Clock, Eye, Heart, Info, PhoneOff, Radio, RadioTower, Save, Wifi } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useUserIdentityBadge } from '@/hooks/useUserIdentityBadge';
import type { LiveSession } from '../../types';
import type { LiveDurationLimitState } from '../../hooks/useLiveDurationLimit';
import type { LiveHealthStatus, LiveHostPreviewStats, LiveNetworkQuality } from '../../hooks/useLiveRtc';
import type { HostLiveUiState, HostRecordingDetails } from './hostLiveTypes';

interface HostLiveTopBarProps {
  session: LiveSession;
  uiState: HostLiveUiState;
  liveDuration: string;
  durationLimit: LiveDurationLimitState;
  viewerCount: number;
  reactionCount: number;
  recording: HostRecordingDetails;
  liveHealth: LiveHealthStatus;
  networkQuality: LiveNetworkQuality;
  previewStats: LiveHostPreviewStats;
  statusText: string;
  hasPost?: boolean;
  onViewPost?: () => void;
  onRequestEnd?: () => void;
  isEnding?: boolean;
}

function healthCopy(uiState: HostLiveUiState, liveHealth: LiveHealthStatus) {
  if (uiState === 'reconnecting') return { label: 'Khôi phục kết nối', tone: 'text-amber-800 bg-amber-50 border-amber-200', icon: AlertTriangle };
  if (liveHealth === 'device_overloaded') return { label: 'Thiết bị quá tải', tone: 'text-amber-800 bg-amber-50 border-amber-200', icon: AlertTriangle };
  if (liveHealth === 'network_weak') return { label: 'Kết nối yếu', tone: 'text-red-800 bg-red-50 border-red-200', icon: AlertTriangle };
  if (liveHealth === 'optimizing') return { label: 'Tối ưu tín hiệu', tone: 'text-amber-800 bg-amber-50 border-amber-200', icon: Activity };
  if (liveHealth === 'good') return { label: 'Kết nối tốt', tone: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: Wifi };
  return { label: 'Theo dõi tín hiệu', tone: 'text-primary bg-primary/5 border-primary/20', icon: RadioTower };
}

function qualityLabel(stats: LiveHostPreviewStats) {
  const width = stats.width || 0;
  const height = stats.height || 0;
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (!width || !height) return 'đang đo';
  if (longSide >= 1280 || shortSide >= 720) return '720p HD';
  if (shortSide >= 470) return '480p';
  if (shortSide >= 340) return '360p';
  return `${height}p`;
}

function recordingLabel(recording: HostRecordingDetails) {
  if (recording.state === 'recording') return 'Đang lưu replay';
  if (recording.state === 'ready') return 'Replay sẵn sàng';
  if (['stopping', 'compressing', 'processing'].includes(recording.state)) return 'Đang xử lý replay';
  if (recording.state === 'failed') return 'Cần kiểm tra replay';
  return 'Replay standby';
}

export function HostLiveTopBar({
  session,
  uiState,
  liveDuration,
  durationLimit,
  viewerCount,
  reactionCount,
  recording,
  liveHealth,
  networkQuality,
  previewStats,
  statusText,
  hasPost,
  onViewPost,
  onRequestEnd,
  isEnding,
}: HostLiveTopBarProps) {
  const hostName = session.host_profile?.full_name || session.host_profile?.username || 'Host';
  const hostInitial = hostName.charAt(0).toUpperCase();
  const { data: identityBadge } = useUserIdentityBadge(session.host_user_id);
  const isVerified = !!identityBadge?.did_id && ['verified', 'active'].includes(String(identityBadge.did_status || '').toLowerCase());

  const isLive = uiState === 'live' || uiState === 'reconnecting';
  const durationLabel = durationLimit?.combinedLabel || liveDuration;
  const warning = durationLimit?.warningLevel;
  const health = healthCopy(uiState, liveHealth);
  const HealthIcon = health.icon;
  const resolution = qualityLabel(previewStats);

  return (
    <div className="rounded-2xl border border-gold/20 bg-white/92 px-3 py-2.5 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Host identity */}
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative shrink-0">
            <Avatar className="h-10 w-10 border-2 border-gold/60 shadow-sm">
              <AvatarImage src={session.host_profile?.avatar_url || ''} />
              <AvatarFallback className="bg-primary/10 text-sm font-black text-primary">{hostInitial || 'H'}</AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-red-600">
              <Radio className="h-2 w-2 text-white" />
            </span>
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1">
              <span className="truncate text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{hostName}</span>
              {isVerified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Verified host" />}
            </div>
            <div className="line-clamp-1 text-sm font-black leading-tight text-foreground">
              {session.title || 'Đang LIVE trên FUN Profile'}
            </div>
          </div>
        </div>

        <div className="mx-1 hidden h-8 w-px bg-gold/20 md:block" />

        {/* Stats pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black uppercase text-white',
            isLive ? 'bg-red-600 shadow-[0_0_14px_rgba(220,38,38,0.4)]' : 'bg-muted-foreground',
          )}>
            <span className="relative flex h-1.5 w-1.5">
              {isLive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
            </span>
            {isLive ? 'LIVE' : uiState === 'replay_ready' ? 'REPLAY' : 'ENDED'}
          </span>
          <span className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
            warning === 'urgent' ? 'bg-red-100 text-red-800' : warning === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-muted/70',
          )}>
            <Clock className={cn('h-3 w-3', warning === 'urgent' ? 'text-red-700' : warning === 'warning' ? 'text-amber-700' : 'text-primary')} />
            {durationLabel}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1 text-[11px] font-bold">
            <Eye className="h-3 w-3 text-emerald-700" />
            {viewerCount}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1 text-[11px] font-bold">
            <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
            {reactionCount.toLocaleString()}
          </span>
          <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold', health.tone)}>
            <HealthIcon className="h-3 w-3" />
            {health.label}
            <span className="opacity-40">·</span>
            <span>{resolution}</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
            <Save className="h-3 w-3" />
            {recordingLabel(recording)}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full bg-white/70 px-2.5 text-[11px] font-bold text-muted-foreground shadow-sm hover:bg-white">
                <Info className="h-3 w-3" />
                Kỹ thuật
                <ChevronDown className="h-3 w-3" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 w-full rounded-xl border border-gold/15 bg-white/95 p-3 text-[11px] text-muted-foreground shadow-sm">
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                <div>Channel: {session.agora_channel || session.channel_name || 'đang cập nhật'}</div>
                <div>RTC: {statusText || 'đang theo dõi'}</div>
                <div>Recorder: {recording.state}</div>
                <div>Resolution: {previewStats?.width && previewStats?.height ? `${previewStats.width}x${previewStats.height}` : 'đang đo'}</div>
                <div>FPS: {previewStats?.fps ? `${previewStats.fps} fps` : 'đang đo'}</div>
                <div>Bitrate: {previewStats?.bitrateKbps ? `${(previewStats.bitrateKbps / 1000).toFixed(2)} Mbps` : 'đang đo'}</div>
                <div>Packet loss: {previewStats?.packetLoss !== undefined ? `${previewStats.packetLoss}%` : 'đang đo'}</div>
                <div>RTT: {previewStats?.latencyMs ? `${previewStats.latencyMs} ms` : 'đang đo'}</div>
                <div>Uplink: {(previewStats?.networkQuality?.uplinkNetworkQuality ?? networkQuality.uplinkNetworkQuality) || 'n/a'}</div>
                <div>Downlink: {(previewStats?.networkQuality?.downlinkNetworkQuality ?? networkQuality.downlinkNetworkQuality) || 'n/a'}</div>
                <div>Chunks: {recording.uploadStats.uploaded}/{recording.uploadStats.total}</div>
                <div>Upload: {recording.uploadProgress}%</div>
              </div>
              {recording.error && <div className="mt-2 rounded-lg bg-red-50 px-2 py-1.5 font-semibold text-red-700">Recording: {recording.error}</div>}
            </CollapsibleContent>
          </Collapsible>
          {hasPost && onViewPost && (
            <Button variant="ghost" size="sm" onClick={onViewPost} className="h-8 rounded-full bg-white/70 px-3 text-[11px] font-bold text-primary shadow-sm hover:bg-primary/10">
              Xem bài live
            </Button>
          )}
          {onRequestEnd && (
            <Button
              size="sm"
              variant="destructive"
              onClick={onRequestEnd}
              disabled={isEnding}
              className="h-8 rounded-full px-3 text-[11px] font-black uppercase shadow-sm"
            >
              <PhoneOff className="h-3 w-3" />
              {isEnding ? 'Đang kết thúc' : 'Kết thúc'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
