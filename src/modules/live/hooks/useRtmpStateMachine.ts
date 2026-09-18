import { useMemo } from 'react';
import type { LiveStatus } from '@/modules/live/types';

export interface RtmpUiState {
  status: LiveStatus;
  /** Nhãn ngắn hiển thị badge phía trên producer */
  label: string;
  /** Mô tả 1 dòng cho user */
  description: string;
  /** Tone hiển thị (cho badge variant) */
  tone: 'idle' | 'waiting' | 'connected' | 'live' | 'warning' | 'ended' | 'processing';
  /** Có cho phép mount preview player không */
  canMountPreview: boolean;
  /** Có cho phép nút "Phát trực tiếp" không (cần thêm điều kiện title/desc/uid ở caller) */
  canGoLive: boolean;
  /** Đang trong giai đoạn chờ reconnect */
  inDisconnectGrace: boolean;
  /** Phiên đã đóng (terminal) */
  isTerminal: boolean;
}

const TERMINAL: ReadonlySet<LiveStatus> = new Set([
  'ended', 'processing', 'processing_replay', 'archiving', 'archived', 'posted',
]);

/**
 * Map trạng thái backend → trạng thái UI duy nhất cho RTMP Live Producer.
 * Nguồn sự thật: live_sessions.status (kết hợp cờ sourceConnected từ poll khi cần).
 */
export function useRtmpStateMachine(input: {
  status: LiveStatus | string | null | undefined;
  sourceConnected?: boolean;
  cloudflareVideoUid?: string | null;
}): RtmpUiState {
  const { status: rawStatus, sourceConnected = false, cloudflareVideoUid = null } = input;
  return useMemo(() => {
    const status = (rawStatus || 'idle') as LiveStatus;
    const isTerminal = TERMINAL.has(status);
    const inDisconnectGrace = status === 'disconnect_grace';

    let label = 'Sẵn sàng';
    let description = 'Mở Live Producer để bắt đầu';
    let tone: RtmpUiState['tone'] = 'idle';
    let canMountPreview = false;
    let canGoLive = false;

    switch (status) {
      case 'idle':
      case 'preparing':
      case 'created':
        label = 'Đang chuẩn bị';
        description = 'Đang khởi tạo phiên live, vui lòng đợi…';
        tone = 'idle';
        break;
      case 'waiting_for_obs':
        label = 'Đang chờ nguồn phát';
        description = 'Mở phần mềm hỗ trợ RTMP/RTMPS như OBS, Zoom, Restream, OneStream, vMix rồi bấm Start Streaming để kết nối.';
        tone = 'waiting';
        break;
      case 'source_connected':
        label = 'Đã nhận tín hiệu nguồn phát';
        description = 'Hãy điền tiêu đề và mô tả để sẵn sàng phát trực tiếp.';
        tone = 'connected';
        canMountPreview = sourceConnected && !!cloudflareVideoUid;
        break;
      case 'ready_to_go_live':
        label = 'Sẵn sàng phát';
        description = 'Bấm "Phát trực tiếp" khi bạn muốn lên sóng.';
        tone = 'connected';
        canMountPreview = sourceConnected && !!cloudflareVideoUid;
        canGoLive = sourceConnected && !!cloudflareVideoUid;
        break;
      case 'live':
        label = 'Đang phát sóng';
        description = 'Buổi live đang phát công khai.';
        tone = 'live';
        canMountPreview = sourceConnected && !!cloudflareVideoUid;
        break;
      case 'disconnect_grace':
        label = 'Mất tín hiệu nguồn phát';
        description = 'Đang chờ nguồn phát kết nối lại trước khi tự kết thúc.';
        tone = 'warning';
        canMountPreview = !!cloudflareVideoUid; // giữ player để nhanh resume
        break;
      case 'reconnecting':
        label = 'Mất tín hiệu OBS';
        description = 'Mất tín hiệu từ OBS. Đang chờ OBS kết nối lại trong 60 giây trước khi tự kết thúc.';
        tone = 'warning';
        canMountPreview = !!cloudflareVideoUid; // giữ player để nhanh resume khi OBS quay lại
        break;
      case 'ended':
        label = 'Đã kết thúc';
        description = 'Buổi live đã kết thúc. Replay đang được xử lý.';
        tone = 'ended';
        break;
      case 'processing':
      case 'processing_replay':
      case 'archiving':
        label = 'Đang xử lý replay';
        description = 'Bản ghi đang được lưu và sẽ đăng tự động lên trang cá nhân.';
        tone = 'processing';
        break;
      case 'archived':
      case 'posted':
        label = 'Replay đã sẵn sàng';
        description = 'Bản ghi đã được lưu và đăng lên trang cá nhân.';
        tone = 'ended';
        break;
      case 'failed':
        label = 'Phiên lỗi';
        description = 'Không thể khởi tạo nguồn. Vui lòng thử lại.';
        tone = 'warning';
        break;
    }

    return { status, label, description, tone, canMountPreview, canGoLive, inDisconnectGrace, isTerminal };
  }, [rawStatus, sourceConnected, cloudflareVideoUid]);
}
