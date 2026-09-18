import { Activity, AlertTriangle, RadioTower, Wifi } from 'lucide-react';
import type { LiveHealthStatus, LiveHostPreviewStats, LiveNetworkQuality } from '../../hooks/useLiveRtc';
import type { HostLiveUiState } from './hostLiveTypes';

interface LiveStreamHealthBarProps {
  uiState: HostLiveUiState;
  liveHealth: LiveHealthStatus;
  networkQuality: LiveNetworkQuality;
  previewStats: LiveHostPreviewStats;
  statusText: string;
}

function isMobileLiveUi() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 767px)').matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
}

function healthCopy(uiState: HostLiveUiState, liveHealth: LiveHealthStatus, uplink = 0) {
  if (liveHealth === 'device_overloaded' && uiState !== 'reconnecting' && isMobileLiveUi()) return { label: 'Đang tối ưu video', tone: 'text-amber-800 bg-amber-50 border-amber-200', icon: Activity };
  if (uiState === 'reconnecting') return { label: 'Đang khôi phục kết nối', tone: 'text-amber-800 bg-amber-50 border-amber-200', icon: AlertTriangle };
  if (liveHealth === 'device_overloaded') return { label: 'Thiết bị đang quá tải', tone: 'text-amber-800 bg-amber-50 border-amber-200', icon: AlertTriangle };
  if (liveHealth === 'network_weak' || uplink >= 5) return { label: 'Kết nối yếu', tone: 'text-red-800 bg-red-50 border-red-200', icon: AlertTriangle };
  if (liveHealth === 'optimizing' || uplink >= 4) return { label: 'Đang tối ưu tín hiệu', tone: 'text-amber-800 bg-amber-50 border-amber-200', icon: Activity };
  if (liveHealth === 'good' || (uplink > 0 && uplink <= 3)) return { label: 'Kết nối tốt', tone: 'text-emerald-800 bg-emerald-50 border-emerald-200', icon: Wifi };
  return { label: 'Đang theo dõi tín hiệu', tone: 'text-primary bg-primary/5 border-primary/20', icon: RadioTower };
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

export function LiveStreamHealthBar({ uiState, liveHealth, networkQuality, previewStats, statusText }: LiveStreamHealthBarProps) {
  const health = healthCopy(uiState, liveHealth, 0);
  const Icon = health.icon;
  const resolution = qualityLabel(previewStats);

  return (
    <div className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-bold shadow-sm ${health.tone}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span>{health.label}</span>
      <span className="text-current/35">·</span>
      <span>{resolution}</span>
      {statusText && statusText !== 'LIVE' && (
        <>
          <span className="text-current/35">·</span>
          <span className="truncate text-xs opacity-75">{statusText}</span>
        </>
      )}
    </div>
  );
}
