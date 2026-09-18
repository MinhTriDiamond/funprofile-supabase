import type { Dispatch, RefCallback, SetStateAction } from 'react';
import type { LiveMessage } from '../../hooks/useLiveMessages';
import type { LiveNetworkQuality, LiveHealthStatus, LiveHostPreviewStats } from '../../hooks/useLiveRtc';
import type { LiveReaction } from '../../hooks/useLiveReactions';
import type { LiveViewer } from '../../hooks/useLivePresence';
import type { RecordingStatus } from '../../liveService';
import type { LiveSession } from '../../types';
import type { LiveDurationLimitState } from '../../hooks/useLiveDurationLimit';

export type HostLiveUiState =
  | 'loading'
  | 'live'
  | 'reconnecting'
  | 'ending'
  | 'processing_replay'
  | 'replay_ready'
  | 'failed';

export interface HostRecordingDetails {
  state: RecordingStatus;
  error: string | null;
  uploadProgress: number;
  compressProgress: number;
  chunkedEnabled: boolean;
  uploadStats: {
    uploaded: number;
    total: number;
  };
  streamUploadProgress: number;
}

export interface HostLiveCommonProps {
  session: LiveSession;
  sessionId: string;
  uiState: HostLiveUiState;
  liveDuration: string;
  durationLimit: LiveDurationLimitState;
  viewers: LiveViewer[];
  messages: LiveMessage[];
  messagesLoading: boolean;
  reactions: LiveReaction[];
  reactionCount: number;
  recording: HostRecordingDetails;
  isJoined: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isSwitchingCamera: boolean;
  isEnding: boolean;
  statusText: string;
  liveHealth: LiveHealthStatus;
  networkQuality: LiveNetworkQuality;
  previewStats: LiveHostPreviewStats;
  setLocalContainerRef: RefCallback<HTMLDivElement>;
  onSendMessage: (message: string) => Promise<void>;
  onReact: (emoji: string) => Promise<boolean>;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onSwitchCamera: () => Promise<boolean>;
  onRequestEnd: () => void;
  onViewPost: () => void;
  setShowEndConfirm: Dispatch<SetStateAction<boolean>>;
}
