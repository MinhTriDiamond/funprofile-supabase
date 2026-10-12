/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react';
import AgoraRTC, {
  CameraVideoTrackInitConfig,
  IAgoraRTCClient,
  IAgoraRTCRemoteUser,
  ICameraVideoTrack,
  IMicrophoneAudioTrack,
  MicrophoneAudioTrackInitConfig,
} from 'agora-rtc-sdk-ng';
import { createAgoraRtcClient, secondsUntilExpiry } from '@/lib/agoraRtc';
import { getRtcToken } from '../api/agora';
import { toast } from 'sonner';
import { NormalizedLiveError, normalizeLiveError } from '../utils/liveErrors';

type LiveRole = 'host' | 'audience';
export type LiveAudioMode = 'original' | 'voice';
export type LiveVideoQuality = 'auto' | '360p' | '480p' | '720p' | '1080p';
type LivePublishQuality = '360p' | '480p' | '720p';
export type LiveCameraFacingMode = 'user' | 'environment';
type LocalRenderFitMode = 'cover' | 'contain';

export interface LiveNetworkQuality {
  uplinkNetworkQuality?: number;
  downlinkNetworkQuality?: number;
}

export type LiveHealthStatus = 'unknown' | 'good' | 'optimizing' | 'device_overloaded' | 'network_weak';

export interface LiveHostPreviewStats {
  width?: number;
  height?: number;
  fps?: number;
  bitrateKbps?: number;
  latencyMs?: number;
  packetLoss?: number;
  quality?: LiveVideoQuality;
  encoderProfile?: LivePublishQuality;
  currentStreamType?: 'high' | 'low';
  networkQuality?: LiveNetworkQuality;
}

interface UseLiveRtcOptions {
  sessionId?: string;
  role: LiveRole;
  enabled?: boolean;
  audioMode?: LiveAudioMode;
  videoQuality?: LiveVideoQuality;
  initialFacingMode?: LiveCameraFacingMode;
  microphoneId?: string;
  remoteAudioMuted?: boolean;
  remoteAudioVolume?: number;
  onViewerCountChange?: (count: number) => void;
  onNetworkQualityChange?: (quality: LiveNetworkQuality) => void;
  onRemoteOffline?: () => void;
}

const MAX_REJOIN_ATTEMPTS = 5;
const TOKEN_TIMEOUT_MS = 10_000;
const JOIN_TIMEOUT_MS = 12_000;
const TRACK_TIMEOUT_MS = 12_000;
const PUBLISH_TIMEOUT_MS = 10_000;
const QUALITY_FALLBACKS: Record<LiveVideoQuality, LivePublishQuality[]> = {
  auto: ['720p', '480p', '360p'],
  '1080p': ['720p', '480p', '360p'],
  '720p': ['720p', '480p', '360p'],
  '480p': ['480p', '360p'],
  '360p': ['360p'],
};
const ENHANCEMENT_FULL = {
  smoothnessLevel: 0.25,
  lighteningLevel: 0.35,
  rednessLevel: 0.08,
  lighteningContrastLevel: 1 as const,
};
const ENHANCEMENT_LIGHT = {
  smoothnessLevel: 0.12,
  lighteningLevel: 0.22,
  rednessLevel: 0.04,
  lighteningContrastLevel: 1 as const,
};

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 767px)').matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
}

function isPortraitViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerHeight >= window.innerWidth;
}

function orient(width: number, height: number, facingMode: LiveCameraFacingMode = 'environment') {
  if (isMobileDevice() && isPortraitViewport() && facingMode === 'user') {
    return { width: Math.max(width, height), height: Math.min(width, height) };
  }
  return isMobileDevice() && isPortraitViewport()
    ? { width: Math.min(width, height), height: Math.max(width, height) }
    : { width: Math.max(width, height), height: Math.min(width, height) };
}

function normalizePublishQuality(videoQuality: LiveVideoQuality): LivePublishQuality {
  if (videoQuality === '360p' || videoQuality === '480p' || videoQuality === '720p') return videoQuality;
  return '720p';
}

function getAgoraVideoEncoderConfig(videoQuality: LiveVideoQuality, facingMode: LiveCameraFacingMode = 'environment') {
  const quality = normalizePublishQuality(videoQuality);
  const configs: Record<LivePublishQuality, Record<string, unknown>> = {
    '360p': {
      ...orient(640, 360, facingMode),
      frameRate: 20,
      bitrateMin: 250,
      bitrateMax: 700,
      optimizationMode: 'motion',
      degradationPreference: 'maintain-framerate',
    },
    '480p': {
      ...orient(854, 480, facingMode),
      frameRate: 24,
      bitrateMin: 700,
      bitrateMax: 1400,
      optimizationMode: 'detail',
      degradationPreference: 'detail',
    },
    '720p': {
      ...orient(1280, 720, facingMode),
      frameRate: 30,
      bitrateMin: 1200,
      bitrateMax: 2500,
      optimizationMode: 'detail',
      degradationPreference: 'detail',
    },
  };
  return configs[quality];
}

function getLowUplinkEncoderConfig(facingMode: LiveCameraFacingMode = 'environment') {
  return {
    ...orient(640, 360, facingMode),
    frameRate: 18,
    bitrateMin: 250,
    bitrateMax: 650,
    optimizationMode: 'motion' as const,
    degradationPreference: 'maintain-framerate' as const,
  };
}

function getLowStreamParameter(facingMode: LiveCameraFacingMode = 'environment') {
  const dims = orient(640, 360, facingMode);
  return {
    width: dims.width,
    height: dims.height,
    framerate: 15,
    bitrate: 400,
  };
}

function getQualityFallbacks(videoQuality: LiveVideoQuality): LivePublishQuality[] {
  return QUALITY_FALLBACKS[videoQuality] ?? QUALITY_FALLBACKS.auto;
}

function getInitialEnhancementLevel(): 'full' | 'light' | 'off' {
  return isMobileDevice() ? 'off' : 'full';
}

function getAgoraAudioConfig(audioMode: LiveAudioMode, microphoneId?: string): MicrophoneAudioTrackInitConfig {
  const deviceConfig = microphoneId ? { microphoneId } : {};

  if (audioMode === 'voice') {
    return {
      ...deviceConfig,
      encoderConfig: 'speech_standard',
      AEC: true,
      ANS: true,
      AGC: true,
    } as const;
  }

  return {
    ...deviceConfig,
    encoderConfig: 'high_quality_stereo',
    AEC: false,
    ANS: false,
    AGC: false,
  } as const;
}

function getAgoraVideoConfig(videoQuality: LiveVideoQuality, facingMode: LiveCameraFacingMode = 'user'): CameraVideoTrackInitConfig {
  return {
    encoderConfig: getAgoraVideoEncoderConfig(videoQuality, facingMode),
    facingMode,
  } as CameraVideoTrackInitConfig;
}

function getLocalRenderFit(track: ICameraVideoTrack | null, facingMode: LiveCameraFacingMode): LocalRenderFitMode {
  const settings = track?.getMediaStreamTrack?.()?.getSettings?.();
  const width = settings?.width || 0;
  const height = settings?.height || 0;

  if (isMobileDevice() && isPortraitViewport() && facingMode === 'user') {
    return 'contain';
  }

  return 'cover';
}

function logLocalVideoDiagnostics(
  label: string,
  track: ICameraVideoTrack | null,
  quality: LiveVideoQuality,
  facingMode: LiveCameraFacingMode,
  fit: LocalRenderFitMode,
  stats?: any,
  enhancementStatus?: string,
) {
  const settings = track?.getMediaStreamTrack?.()?.getSettings?.();
  console.info('[useLiveRtc] Local video diagnostics:', {
    label,
    quality,
    facingMode,
    renderFit: fit,
    enhancementStatus,
    camera: {
      width: settings?.width,
      height: settings?.height,
      frameRate: settings?.frameRate,
      facingMode: settings?.facingMode,
      deviceId: settings?.deviceId,
    },
    stats: stats ? {
      codecType: stats.codecType,
      captureResolutionWidth: stats.captureResolutionWidth,
      captureResolutionHeight: stats.captureResolutionHeight,
      sendResolutionWidth: stats.sendResolutionWidth,
      sendResolutionHeight: stats.sendResolutionHeight,
      captureFrameRate: stats.captureFrameRate,
      sendFrameRate: stats.sendFrameRate,
      sendBitrate: stats.sendBitrate,
      targetSendBitrate: stats.targetSendBitrate,
      currentPacketLossRate: stats.currentPacketLossRate,
      sendRttMs: stats.sendRttMs,
      encodeDelay: stats.encodeDelay,
    } : undefined,
  });
}

function readHostPreviewStats(
  track: ICameraVideoTrack | null,
  stats: any,
  quality: LiveVideoQuality,
  encoderProfile?: LivePublishQuality,
  currentStreamType?: 'high' | 'low',
  networkQuality?: LiveNetworkQuality,
): LiveHostPreviewStats {
  const settings = track?.getMediaStreamTrack?.()?.getSettings?.();
  const width = Number(
    stats?.sendResolutionWidth ??
    stats?.captureResolutionWidth ??
    settings?.width ??
    0
  );
  const height = Number(
    stats?.sendResolutionHeight ??
    stats?.captureResolutionHeight ??
    settings?.height ??
    0
  );
  const fps = Number(
    stats?.sendFrameRate ??
    stats?.encodeFrameRate ??
    stats?.captureFrameRate ??
    stats?.sentFrameRate ??
    settings?.frameRate ??
    0
  );
  const bitrateKbps = Number(stats?.sendBitrate ?? stats?.targetSendBitrate ?? 0);
  const latencyMs = Number(stats?.sendRttMs ?? stats?.rtt ?? 0);
  const packetLoss = Number(stats?.currentPacketLossRate ?? 0);

  return {
    quality,
    encoderProfile,
    currentStreamType,
    networkQuality,
    width: width > 0 ? width : undefined,
    height: height > 0 ? height : undefined,
    fps: fps > 0 ? Math.round(fps) : undefined,
    bitrateKbps: bitrateKbps > 0 ? Math.round(bitrateKbps) : undefined,
    latencyMs: latencyMs > 0 ? Math.round(latencyMs) : undefined,
    packetLoss: packetLoss > 0 ? packetLoss : undefined,
  };
}

function mapRtcError(error: unknown): string {
  return normalizeLiveError(error).statusText;
}

function withRtcTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function hashToAgoraUid(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash &= 0x7FFFFFFF;
  }
  return hash || Math.floor(Math.random() * 2_000_000_000) + 1;
}

function createAudienceUidSeed(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

// Agora Web SDK: uid dạng chuỗi chỉ-gồm-chữ-số bị hiểu là "string user account",
// không khớp token ký cho UID số nguyên ⇒ gateway từ chối bắt tay.
// Chuẩn hoá sang number trước MỌI lệnh client.join(...).
function normalizeJoinUid(uid: string | number): string | number {
  if (typeof uid === 'string' && /^\d+$/.test(uid)) {
    const num = Number(uid);
    if (Number.isSafeInteger(num) && num > 0) return num;
  }
  return uid;
}

export function useLiveRtc({
  sessionId,
  role,
  enabled = true,
  audioMode = 'original',
  videoQuality = 'auto',
  initialFacingMode = 'user',
  microphoneId,
  remoteAudioMuted = false,
  remoteAudioVolume = 1,
  onViewerCountChange,
  onNetworkQualityChange,
  onRemoteOffline,
}: UseLiveRtcOptions) {
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioRef = useRef<IMicrophoneAudioTrack | null>(null);
  const localVideoRef = useRef<ICameraVideoTrack | null>(null);
  const remoteAudioRef = useRef<any>(null);
  const tokenExpiresAtRef = useRef<number | null>(null);
  const rejoinAttemptsRef = useRef(0);
  const renewFailuresRef = useRef(0);
  const rejoinTimerRef = useRef<number | null>(null);
  const audienceUidRef = useRef<number | null>(null);
  const isLeavingRef = useRef(false);
  const startedRef = useRef(false);
  const cameraFacingRef = useRef<LiveCameraFacingMode>(initialFacingMode);
  const requestedQualityRef = useRef<LiveVideoQuality>(videoQuality);
  const activeQualityRef = useRef<LivePublishQuality>(normalizePublishQuality(videoQuality));
  const currentStreamTypeRef = useRef<'high' | 'low'>('high');
  const networkQualityRef = useRef<LiveNetworkQuality>({});
  const statsTimerRef = useRef<number | null>(null);
  const weakUplinkCountRef = useRef(0);
  const lowSendFpsCountRef = useRef(0);
  const lowBitrateCountRef = useRef(0);
  const highPacketLossCountRef = useRef(0);
  const adaptiveReducedRef = useRef(false);
  const adaptiveToastShownRef = useRef(false);
  const deviceToastShownRef = useRef(false);
  const enhancementStatusRef = useRef<'not_applied' | 'full' | 'light' | 'disabled' | 'unsupported'>('not_applied');
  const activeRenderFitRef = useRef<LocalRenderFitMode>('cover');
  const lastDiagnosticsLogRef = useRef(0);

  const localContainerRef = useRef<HTMLDivElement | null>(null);
  const [localContainerMounted, setLocalContainerMounted] = useState(false);

  const setLocalContainerRef = useCallback((node: HTMLDivElement | null) => {
    localContainerRef.current = node;
    setLocalContainerMounted(!!node);
  }, []);
  const remoteContainerRef = useRef<HTMLDivElement | null>(null);

  const playLocalVideo = useCallback((track: ICameraVideoTrack | null = localVideoRef.current, facing = cameraFacingRef.current) => {
    if (!track || !localContainerRef.current) return;
    try {
      track.stop();
    } catch {
      // Best effort: Agora may throw if the preview was not playing yet.
    }
    localContainerRef.current.replaceChildren();
    const fit = getLocalRenderFit(track, facing);
    activeRenderFitRef.current = fit;
    track.play(localContainerRef.current, {
      fit,
      mirror: facing === 'user',
    });
    setHostPreviewStats(readHostPreviewStats(
      track,
      undefined,
      requestedQualityRef.current,
      activeQualityRef.current,
      currentStreamTypeRef.current,
      networkQualityRef.current,
    ));
    logLocalVideoDiagnostics('play', track, requestedQualityRef.current, facing, fit, undefined, enhancementStatusRef.current);
  }, []);

  const [isJoined, setIsJoined] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const [statusText, setStatusText] = useState('Connecting...');
  const [networkQuality, setNetworkQuality] = useState<LiveNetworkQuality>({});
  const [liveHealth, setLiveHealth] = useState<LiveHealthStatus>('unknown');
  const [hostPreviewStats, setHostPreviewStats] = useState<LiveHostPreviewStats>({
    quality: videoQuality,
    encoderProfile: normalizePublishQuality(videoQuality),
    currentStreamType: 'high',
  });

  const applyLiveVideoEnhancement = useCallback(async (
    track: ICameraVideoTrack | null = localVideoRef.current,
    level: 'full' | 'light' | 'off' = 'full',
  ) => {
    if (!track) return false;
    const setBeautyEffect = (track as any).setBeautyEffect;
    if (typeof setBeautyEffect !== 'function') {
      enhancementStatusRef.current = 'unsupported';
      console.info('[useLiveRtc] Agora beauty effect is not available on this browser/device.');
      return false;
    }

    try {
      if (level === 'off') {
        await setBeautyEffect.call(track, false);
        enhancementStatusRef.current = 'disabled';
        return true;
      }

      await setBeautyEffect.call(track, true, level === 'full' ? ENHANCEMENT_FULL : ENHANCEMENT_LIGHT);
      enhancementStatusRef.current = level;
      return true;
    } catch (error) {
      enhancementStatusRef.current = 'unsupported';
      console.info('[useLiveRtc] Agora beauty effect is unsupported or failed on this device:', error);
      return false;
    }
  }, []);

  const reduceLiveVideoEnhancement = useCallback(async () => {
    if (enhancementStatusRef.current === 'full') {
      await applyLiveVideoEnhancement(localVideoRef.current, 'light');
      return true;
    }
    if (enhancementStatusRef.current === 'light') {
      await applyLiveVideoEnhancement(localVideoRef.current, 'off');
      return true;
    }
    return false;
  }, [applyLiveVideoEnhancement]);

  const applyAdaptiveVideoQuality = useCallback(async () => {
    const track = localVideoRef.current;
    if (!track) return;

    try {
      if (activeQualityRef.current === '720p') {
        await (track as any).setEncoderConfiguration?.(getAgoraVideoEncoderConfig('480p', cameraFacingRef.current));
        activeQualityRef.current = '480p';
        currentStreamTypeRef.current = 'high';
        adaptiveReducedRef.current = false;
        playLocalVideo(track, cameraFacingRef.current);
        setLiveHealth('network_weak');
        setStatusText('Mạng yếu, FUN Profile đã giảm chất lượng để live mượt hơn.');
        if (!adaptiveToastShownRef.current) {
          adaptiveToastShownRef.current = true;
          toast.info('Mạng yếu, FUN Profile đã giảm chất lượng để live mượt hơn.');
        }
        setStatusText('FUN Profile đang tối ưu video để live mượt hơn...');
        return;
      }

      if (activeQualityRef.current === '480p' && !adaptiveReducedRef.current) {
        await (track as any).setEncoderConfiguration?.(getLowUplinkEncoderConfig(cameraFacingRef.current));
        activeQualityRef.current = '360p';
        currentStreamTypeRef.current = 'low';
        adaptiveReducedRef.current = true;
        playLocalVideo(track, cameraFacingRef.current);
        setLiveHealth('optimizing');
        setStatusText('Mạng yếu, đang tối ưu video để giảm giật...');
        if (!adaptiveToastShownRef.current) {
          adaptiveToastShownRef.current = true;
          toast.info('Mạng yếu, FUN Profile đang tối ưu video để giảm giật.');
        }
      }
    } catch (error) {
      console.warn('[useLiveRtc] Failed to apply adaptive video config:', error);
    }
  }, [playLocalVideo]);

  const applyDeviceOverloadProtection = useCallback(async () => {
    const track = localVideoRef.current;
    if (!track) return;

    try {
      const reducedEnhancement = await reduceLiveVideoEnhancement();
      if (reducedEnhancement) {
        setLiveHealth('optimizing');
        setStatusText('FUN Profile đang tối ưu video để live mượt hơn...');
        queueMicrotask(() => setStatusText('FUN Profile đang tối ưu video để live mượt hơn...'));
        setStatusText('Thiáº¿t bá»‹ Ä‘ang tá»‘i Æ°u camera Ä‘á»ƒ giáº£m giáº­t...');
        return;
      }

      await (track as any).setEncoderConfiguration?.(getLowUplinkEncoderConfig(cameraFacingRef.current));
      activeQualityRef.current = '360p';
      currentStreamTypeRef.current = 'low';
      adaptiveReducedRef.current = true;
      playLocalVideo(track, cameraFacingRef.current);
      const mobile = isMobileDevice();
      const severeOverload = !mobile || lowSendFpsCountRef.current >= 8;
      setLiveHealth(severeOverload ? 'device_overloaded' : 'optimizing');
      setStatusText(severeOverload
        ? 'Thiết bị đang quá tải, FUN Profile đang tối ưu độ mượt...'
        : 'FUN Profile đang tối ưu video để live mượt hơn...');
      setStatusText('Thiết bị đang quá tải, FUN Profile đang tối ưu độ mượt...');
      setStatusText(severeOverload
        ? 'Thiết bị đang quá tải, FUN Profile đang tối ưu độ mượt...'
        : 'FUN Profile đang tối ưu video để live mượt hơn...');
      if (!deviceToastShownRef.current) {
        deviceToastShownRef.current = true;
        toast.info(severeOverload
          ? 'Thiết bị đang quá tải, FUN Profile đã giảm tải video để live mượt hơn.'
          : 'FUN Profile đang tối ưu video để live mượt hơn.');
      }
      if (!deviceToastShownRef.current) {
        deviceToastShownRef.current = true;
        toast.info('Thiết bị đang quá tải, FUN Profile đã giảm tải video để live mượt hơn.');
      }
    } catch (error) {
      console.warn('[useLiveRtc] Failed to apply device overload protection:', error);
    }
  }, [playLocalVideo, reduceLiveVideoEnhancement]);

  const stopHostStatsMonitor = useCallback(() => {
    if (statsTimerRef.current) {
      window.clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
  }, []);

  const startHostStatsMonitor = useCallback(() => {
    stopHostStatsMonitor();
    statsTimerRef.current = window.setInterval(() => {
      const track = localVideoRef.current;
      if (!track) return;

      const stats = (track as any).getStats?.();
      setHostPreviewStats(readHostPreviewStats(
        track,
        stats,
        requestedQualityRef.current,
        activeQualityRef.current,
        currentStreamTypeRef.current,
        networkQualityRef.current,
      ));
      const sendFps = Number(
        stats?.sendFrameRate ??
        stats?.encodeFrameRate ??
        stats?.captureFrameRate ??
        stats?.sentFrameRate ??
        0
      );
      const bitrateKbps = Number(stats?.sendBitrate ?? stats?.targetSendBitrate ?? 0);
      const packetLoss = Number(stats?.currentPacketLossRate ?? 0);
      const uplink = networkQualityRef.current.uplinkNetworkQuality || 0;
      const networkLooksOk = uplink > 0 && uplink <= 3;
      const now = Date.now();

      if (now - lastDiagnosticsLogRef.current > 15000) {
        lastDiagnosticsLogRef.current = now;
        logLocalVideoDiagnostics(
          'stats',
          track,
          requestedQualityRef.current,
          cameraFacingRef.current,
          activeRenderFitRef.current,
          stats,
          enhancementStatusRef.current,
        );
      }

      const mobile = isMobileDevice();
      const lowFpsThreshold = mobile ? 14 : 18;
      const healthyFpsThreshold = mobile ? 20 : 24;
      const expectedBitrate = activeQualityRef.current === '720p' ? 900 : activeQualityRef.current === '480p' ? 450 : 180;
      const lowBitrate = bitrateKbps > 0 && bitrateKbps < expectedBitrate;
      const highPacketLoss = packetLoss >= 8;
      const weakUplink = uplink >= 5;

      if (weakUplink) weakUplinkCountRef.current += 1;
      else if (uplink > 0 && uplink <= 3) weakUplinkCountRef.current = 0;

      if (lowBitrate) lowBitrateCountRef.current += 1;
      else lowBitrateCountRef.current = 0;

      if (highPacketLoss) highPacketLossCountRef.current += 1;
      else highPacketLossCountRef.current = 0;

      const networkWeakLongEnough =
        weakUplinkCountRef.current >= 3 ||
        lowBitrateCountRef.current >= 3 ||
        highPacketLossCountRef.current >= 2;

      if (networkWeakLongEnough) {
        setLiveHealth(weakUplinkCountRef.current >= 4 || highPacketLossCountRef.current >= 3 ? 'network_weak' : 'optimizing');
        setStatusText('Mạng yếu, đang tối ưu tín hiệu live...');
        applyAdaptiveVideoQuality().catch(() => undefined);
        return;
      }

      if (networkLooksOk && sendFps > 0 && sendFps < lowFpsThreshold) {
        lowSendFpsCountRef.current += 1;
        setLiveHealth(lowSendFpsCountRef.current >= 4 ? 'device_overloaded' : 'optimizing');
        setStatusText(lowSendFpsCountRef.current >= 4
          ? 'Thiết bị đang quá tải, FUN Profile đang tối ưu độ mượt...'
          : 'FUN Profile đang tối ưu video để live mượt hơn...');
        if (lowSendFpsCountRef.current >= 4) {
          applyDeviceOverloadProtection().catch(() => undefined);
        }
        return;
      }

      if (networkLooksOk && sendFps >= healthyFpsThreshold) {
        lowSendFpsCountRef.current = 0;
        lowBitrateCountRef.current = 0;
        highPacketLossCountRef.current = 0;
        if (!adaptiveReducedRef.current) {
          setLiveHealth('good');
          setStatusText('LIVE');
        }
      }
    }, 5000);
  }, [applyAdaptiveVideoQuality, applyDeviceOverloadProtection, stopHostStatsMonitor]);

  const emitViewerCount = useCallback((_client: IAgoraRTCClient) => {
    // no-op: viewer count managed by increment/decrement in LiveAudiencePage
  }, []);

  const applyRemoteAudioState = useCallback((audioTrack = remoteAudioRef.current) => {
    if (!audioTrack) return;
    const normalizedVolume = Math.max(0, Math.min(1, remoteAudioVolume));
    try {
      audioTrack.setVolume?.(remoteAudioMuted || normalizedVolume === 0 ? 0 : Math.round(normalizedVolume * 100));
      if (remoteAudioMuted || normalizedVolume === 0) {
        audioTrack.stop?.();
      } else {
        audioTrack.play?.();
      }
    } catch (error) {
      console.warn('[useLiveRtc] Failed to apply remote audio state:', error);
    }
  }, [remoteAudioMuted, remoteAudioVolume]);

  const clearRejoinTimer = () => {
    if (rejoinTimerRef.current) {
      window.clearTimeout(rejoinTimerRef.current);
      rejoinTimerRef.current = null;
    }
  };

  const playRemote = useCallback((user: IAgoraRTCRemoteUser) => {
    if (user.videoTrack && remoteContainerRef.current) {
      try {
        user.videoTrack.stop();
      } catch {
        // Best effort: remote preview may not have been playing yet.
      }
      remoteContainerRef.current.replaceChildren();
      user.videoTrack.play(remoteContainerRef.current, {
        fit: 'contain',
        mirror: false,
      });
      setHasRemoteVideo(true);
    }
    if (user.audioTrack) {
      remoteAudioRef.current = user.audioTrack;
      applyRemoteAudioState(user.audioTrack);
    }
  }, [applyRemoteAudioState]);

  const getAudienceUid = useCallback(() => {
    if (role !== 'audience') return undefined;
    if (!audienceUidRef.current) {
      audienceUidRef.current = hashToAgoraUid(`audience:${sessionId || 'unknown'}:${createAudienceUidSeed()}`);
    }
    return audienceUidRef.current;
  }, [role, sessionId]);

  const refreshToken = useCallback(async () => {
    if (!sessionId || !clientRef.current) return;
    const tokenData = await withRtcTimeout(
      getRtcToken({ sessionId, role, uid: getAudienceUid() }),
      TOKEN_TIMEOUT_MS,
      'LIVE_TOKEN_TIMEOUT',
    );
    tokenExpiresAtRef.current = tokenData.expiresAt;
    await clientRef.current.renewToken(tokenData.token);
    renewFailuresRef.current = 0;
  }, [getAudienceUid, role, sessionId]);

  const leave = useCallback(async () => {
    isLeavingRef.current = true;
    clearRejoinTimer();
    stopHostStatsMonitor();
    renewFailuresRef.current = 0;
    rejoinAttemptsRef.current = 0;

    const client = clientRef.current;
    const localTracks = [localAudioRef.current, localVideoRef.current].filter(Boolean) as Array<IMicrophoneAudioTrack | ICameraVideoTrack>;
    if (client && localTracks.length > 0) {
      await client.unpublish(localTracks).catch((error) => {
        console.warn('[useLiveRtc] agora_rtc_unpublish failed:', error);
      });
    }
    localAudioRef.current?.stop();
    localVideoRef.current?.stop();
    localAudioRef.current?.close();
    localVideoRef.current?.close();
    console.info('[useLiveRtc] agora_rtc_leave', { sessionId, role });
    localAudioRef.current = null;
    localVideoRef.current = null;
    remoteAudioRef.current?.stop?.();
    remoteAudioRef.current = null;
    setHasRemoteVideo(false);
    setIsJoined(false);
    setLiveHealth('unknown');
    setHostPreviewStats({
      quality: videoQuality,
      encoderProfile: normalizePublishQuality(videoQuality),
      currentStreamType: 'high',
    });
    startedRef.current = false;

    if (client) {
      client.removeAllListeners();
      await client.leave();
      clientRef.current = null;
    }
  }, [role, sessionId, stopHostStatsMonitor, videoQuality]);

  const rejoinWithBackoff = useCallback(async () => {
    if (!sessionId || !clientRef.current || isLeavingRef.current) return;
    if (rejoinAttemptsRef.current >= MAX_REJOIN_ATTEMPTS) {
      setStatusText('Không thể khôi phục kết nối LIVE. Vui lòng thử lại.');
      return;
    }

    rejoinAttemptsRef.current += 1;
    const attempt = rejoinAttemptsRef.current;
    const delay = Math.min(1000 * 2 ** (attempt - 1), 12000);
    clearRejoinTimer();

    rejoinTimerRef.current = window.setTimeout(async () => {
      try {
        const tokenData = await withRtcTimeout(
          getRtcToken({ sessionId, role, uid: getAudienceUid() }),
          TOKEN_TIMEOUT_MS,
          'LIVE_TOKEN_TIMEOUT',
        );
        tokenExpiresAtRef.current = tokenData.expiresAt;
        await clientRef.current?.leave();
        await withRtcTimeout(
          clientRef.current?.join(tokenData.appId, tokenData.channel, tokenData.token, normalizeJoinUid(tokenData.uid)) ?? Promise.resolve(''),
          JOIN_TIMEOUT_MS,
          'LIVE_JOIN_TIMEOUT',
        );

        if (role === 'host' && localAudioRef.current) {
          if (localVideoRef.current) {
            await withRtcTimeout(
              clientRef.current?.publish([localAudioRef.current, localVideoRef.current]) ?? Promise.resolve(),
              PUBLISH_TIMEOUT_MS,
              'LIVE_PUBLISH_TIMEOUT',
            );
          } else {
            await withRtcTimeout(
              clientRef.current?.publish(localAudioRef.current) ?? Promise.resolve(),
              PUBLISH_TIMEOUT_MS,
              'LIVE_PUBLISH_TIMEOUT',
            );
          }
          if (clientRef.current) emitViewerCount(clientRef.current);
        }

        rejoinAttemptsRef.current = 0;
        setStatusText(role === 'audience' ? 'Đang chờ tín hiệu từ host...' : 'LIVE');
        setIsJoined(true);
      } catch (error) {
        console.error('[useLiveRtc] Rejoin failed:', {
          sessionId,
          role,
          attempt,
          error,
          friendly: normalizeLiveError(error),
        });
        setStatusText(mapRtcError(error));
        rejoinWithBackoff().catch(() => undefined);
      }
    }, delay);
  }, [emitViewerCount, getAudienceUid, role, sessionId]);

  const setupClient = useCallback(() => {
    if (clientRef.current) return clientRef.current;

    const client = createAgoraRtcClient('live');
    clientRef.current = client;
    try {
      (client as any).enableDualStream?.();
      (client as any).setLowStreamParameter?.(getLowStreamParameter(cameraFacingRef.current));
    } catch (error) {
      console.warn('[useLiveRtc] Failed to enable dual stream:', error);
    }

    client.on('user-joined', () => {
      emitViewerCount(client);
    });

    client.on('user-published', async (user, mediaType) => {
      await client.subscribe(user, mediaType);
      if (mediaType === 'video') {
        await (client as any).setRemoteVideoStreamType?.(user.uid, 0).catch?.(() => undefined);
      }
      playRemote(user);
      emitViewerCount(client);
    });

    client.on('user-unpublished', () => {
      setHasRemoteVideo(false);
      if (role === 'audience') {
        setStatusText('Host tạm dừng phát...');
        onRemoteOffline?.();
      }
    });

    client.on('user-left', () => {
      emitViewerCount(client);
      if (role === 'audience') {
        setHasRemoteVideo(false);
        setStatusText('Host đã rời phiên live');
        onRemoteOffline?.();
      }
    });

    client.on('connection-state-change', (curState, _prevState, reason) => {
      if (curState === 'DISCONNECTED' && reason !== 'LEAVE' && !isLeavingRef.current) {
        setStatusText('Đang khôi phục kết nối LIVE...');
        rejoinWithBackoff().catch(() => undefined);
      }
    });

    client.on('network-quality', (quality: LiveNetworkQuality) => {
      networkQualityRef.current = quality;
      setNetworkQuality(quality);
      onNetworkQualityChange?.(quality);
      if (role === 'host') {
        const uplink = quality.uplinkNetworkQuality || 0;
        if (uplink >= 5) {
          weakUplinkCountRef.current += 1;
          if (weakUplinkCountRef.current < 3) return;
          setLiveHealth(weakUplinkCountRef.current >= 4 ? 'network_weak' : 'optimizing');
          setStatusText('Mạng yếu, đang tối ưu tín hiệu live...');
          applyAdaptiveVideoQuality().catch(() => undefined);
        } else if (uplink > 0 && uplink <= 3) {
          weakUplinkCountRef.current = 0;
          if (isJoined) setStatusText('LIVE');
        }
      }
    });

    client.on('token-privilege-will-expire', () => {
      refreshToken().catch(() => {
        renewFailuresRef.current += 1;
        if (renewFailuresRef.current >= 2) {
          setStatusText('Đang cấp lại token...');
          rejoinWithBackoff().catch(() => undefined);
        }
      });
    });

    client.on('token-privilege-did-expire', () => {
      refreshToken().catch(() => {
        renewFailuresRef.current += 1;
        setStatusText('Token hết hạn, đang kết nối lại...');
        rejoinWithBackoff().catch(() => undefined);
      });
    });

    return client;
  }, [applyAdaptiveVideoQuality, emitViewerCount, isJoined, liveHealth, onNetworkQualityChange, onRemoteOffline, playRemote, refreshToken, rejoinWithBackoff, role]);

  const start = useCallback(async () => {
    if (!sessionId || !enabled) return;
    if (startedRef.current) return;
    startedRef.current = true;
    isLeavingRef.current = false;
    type HostTrackBundle = {
      audioTrack: IMicrophoneAudioTrack;
      videoTrack: ICameraVideoTrack;
      selectedQuality: LivePublishQuality;
    };
    let pendingHostTracks: HostTrackBundle | null = null;

    const createHostTracks = async (): Promise<HostTrackBundle> => {
      setStatusText('Đang chuẩn bị camera/micro...');
      // "Âm thanh gốc" giữ nhạc/giọng hát/tiếng môi trường tự nhiên hơn:
      // tắt AEC/ANS/AGC để browser/SDK không bóp méo tiếng lớn hoặc tiếng nền.
      // "Khử ồn" bật lại bộ xử lý giọng nói cho phòng ồn khi host chỉ nói chuyện.
      let lastTrackError: unknown = null;
      const microphoneOptions = microphoneId ? [microphoneId, undefined] : [undefined];

      for (const qualityOption of getQualityFallbacks(videoQuality)) {
        for (const microphoneOption of microphoneOptions) {
          try {
            const [audioTrack, videoTrack] = await withRtcTimeout(
              AgoraRTC.createMicrophoneAndCameraTracks(
                getAgoraAudioConfig(audioMode, microphoneOption),
                getAgoraVideoConfig(qualityOption, cameraFacingRef.current),
              ),
              TRACK_TIMEOUT_MS,
              'LIVE_DEVICE_TIMEOUT',
            );
            if (isLeavingRef.current) {
              audioTrack.close();
              videoTrack.close();
              throw new Error('LIVE_START_CANCELLED');
            }

            activeQualityRef.current = qualityOption;
            currentStreamTypeRef.current = 'high';
            adaptiveReducedRef.current = false;
            return { audioTrack, videoTrack, selectedQuality: qualityOption };
          } catch (trackError) {
            lastTrackError = trackError;
            console.warn('[useLiveRtc] Failed to create media tracks:', {
              quality: qualityOption,
              hasSelectedMicrophone: Boolean(microphoneOption),
              error: trackError,
            });
          }
        }
      }

      if (!isMobileDevice() && audioMode === 'original') {
        setStatusText('Đang thử lại với micro mặc định...');
        for (const qualityOption of getQualityFallbacks(videoQuality)) {
          try {
            const [audioTrack, videoTrack] = await withRtcTimeout(
              AgoraRTC.createMicrophoneAndCameraTracks(
                getAgoraAudioConfig('voice'),
                getAgoraVideoConfig(qualityOption, cameraFacingRef.current),
              ),
              TRACK_TIMEOUT_MS,
              'LIVE_DEVICE_TIMEOUT',
            );
            if (isLeavingRef.current) {
              audioTrack.close();
              videoTrack.close();
              throw new Error('LIVE_START_CANCELLED');
            }

            activeQualityRef.current = qualityOption;
            currentStreamTypeRef.current = 'high';
            adaptiveReducedRef.current = false;
            return { audioTrack, videoTrack, selectedQuality: qualityOption };
          } catch (fallbackTrackError) {
            lastTrackError = fallbackTrackError;
            console.warn('[useLiveRtc] Failed to create media tracks with default voice audio:', {
              quality: qualityOption,
              error: fallbackTrackError,
            });
          }
        }
      }

      throw lastTrackError ?? new Error('LIVE_DEVICE_TIMEOUT');
    };

    try {
      const assertStartActive = () => {
        if (isLeavingRef.current) throw new Error('LIVE_START_CANCELLED');
      };
      let tokenData: Awaited<ReturnType<typeof getRtcToken>>;
      let hostTracks: HostTrackBundle | null = null;

      setStatusText(role === 'host' ? 'Đang lấy quyền kết nối LIVE...' : 'Đang kết nối LIVE...');

      if (role === 'host') {
        const [tokenResult, tracksResult] = await Promise.allSettled([
          withRtcTimeout(
            getRtcToken({ sessionId, role, uid: getAudienceUid() }),
            TOKEN_TIMEOUT_MS,
            'LIVE_TOKEN_TIMEOUT',
          ),
          createHostTracks(),
        ] as const);

        if (tracksResult.status === 'fulfilled') {
          pendingHostTracks = tracksResult.value;
        }
        if (tokenResult.status === 'rejected') {
          pendingHostTracks?.audioTrack.close();
          pendingHostTracks?.videoTrack.close();
          pendingHostTracks = null;
          throw tokenResult.reason;
        }
        if (tracksResult.status === 'rejected') {
          throw tracksResult.reason;
        }

        tokenData = tokenResult.value;
        hostTracks = tracksResult.value;
      } else {
        tokenData = await withRtcTimeout(
          getRtcToken({ sessionId, role, uid: getAudienceUid() }),
          TOKEN_TIMEOUT_MS,
          'LIVE_TOKEN_TIMEOUT',
        );
      }
      assertStartActive();
      tokenExpiresAtRef.current = tokenData.expiresAt;
      const client = setupClient();
      await client.setClientRole(role);
      setStatusText('Đang tham gia phòng LIVE...');
      await withRtcTimeout(
        client.join(tokenData.appId, tokenData.channel, tokenData.token, normalizeJoinUid(tokenData.uid)),
        JOIN_TIMEOUT_MS,
        'LIVE_JOIN_TIMEOUT',
      );
      assertStartActive();
      emitViewerCount(client);

      if (role === 'host') {
        if (!hostTracks) throw new Error('LIVE_DEVICE_TIMEOUT');
        const { audioTrack, videoTrack, selectedQuality } = hostTracks;
        pendingHostTracks = null;
        if (selectedQuality !== normalizePublishQuality(videoQuality)) {
          setStatusText('Thiết bị không hỗ trợ chất lượng cao, đã chuyển về chế độ mượt.');
        }
        localAudioRef.current = audioTrack;
        localVideoRef.current = videoTrack;
        await applyLiveVideoEnhancement(videoTrack, getInitialEnhancementLevel());
        assertStartActive();
        try {
          (videoTrack as any).on?.('beauty-effect-overload', () => {
            console.warn('[useLiveRtc] Beauty effect overload detected; reducing enhancement.');
            reduceLiveVideoEnhancement().catch(() => undefined);
          });
        } catch {
          // Older SDK/browser combinations may not expose this event.
        }
        playLocalVideo(videoTrack, cameraFacingRef.current);
        setStatusText('Đang phát tín hiệu LIVE...');
        await withRtcTimeout(
          client.publish([audioTrack, videoTrack]),
          PUBLISH_TIMEOUT_MS,
          'LIVE_PUBLISH_TIMEOUT',
        );
        assertStartActive();
        startHostStatsMonitor();
        setLiveHealth('good');
        setStatusText('LIVE');
      } else {
        setStatusText('Đang chờ tín hiệu từ host...');
        for (const user of client.remoteUsers) {
          if (user.hasVideo) {
            await client.subscribe(user, 'video');
            await (client as any).setRemoteVideoStreamType?.(user.uid, 0).catch?.(() => undefined);
          }
          if (user.hasAudio) await client.subscribe(user, 'audio');
          playRemote(user);
        }
      }

      setIsJoined(true);
      rejoinAttemptsRef.current = 0;
      renewFailuresRef.current = 0;
    } catch (error) {
      pendingHostTracks?.audioTrack.close();
      pendingHostTracks?.videoTrack.close();
      startedRef.current = false;
      const friendly = normalizeLiveError(error);
      console.error('[useLiveRtc] Start failed:', {
        sessionId,
        role,
        code: friendly.code,
        message: friendly.internalMessage,
        error,
      });
      setStatusText(friendly.statusText);
      throw new NormalizedLiveError(error);
    }
  }, [applyLiveVideoEnhancement, audioMode, emitViewerCount, enabled, getAudienceUid, microphoneId, playLocalVideo, playRemote, reduceLiveVideoEnhancement, role, sessionId, setupClient, startHostStatsMonitor, videoQuality]);

  const toggleMute = useCallback(async () => {
    if (!localAudioRef.current) return;
    const next = !isMuted;
    await localAudioRef.current.setEnabled(!next);
    setIsMuted(next);
  }, [isMuted]);

  const toggleCamera = useCallback(async () => {
    if (!localVideoRef.current) return;
    const next = !isCameraOff;
    await localVideoRef.current.setEnabled(!next);
    setIsCameraOff(next);
  }, [isCameraOff]);

  const switchCamera = useCallback(async () => {
    const currentTrack = localVideoRef.current;
    if (!currentTrack || isSwitchingCamera) return false;

    setIsSwitchingCamera(true);
    const targetFacing = cameraFacingRef.current === 'user' ? 'environment' : 'user';

    try {
      const cameras = await AgoraRTC.getCameras();
      if (cameras.length < 2) {
        setStatusText('Thiết bị chỉ có một camera.');
        return false;
      }

      const currentDeviceId = currentTrack.getMediaStreamTrack()?.getSettings?.().deviceId;
      const currentIndex = cameras.findIndex((camera) => camera.deviceId === currentDeviceId);
      const isBackCamera = (label: string) => /back|rear|environment|sau|trước sau/i.test(label);
      const isFrontCamera = (label: string) => /front|user|face|trước/i.test(label);
      const preferred = cameras.find((camera) => (
        camera.deviceId !== currentDeviceId &&
        (targetFacing === 'environment' ? isBackCamera(camera.label || '') : isFrontCamera(camera.label || ''))
      ));
      const fallback = currentIndex >= 0
        ? cameras[(currentIndex + 1) % cameras.length]
        : cameras[targetFacing === 'environment' ? Math.min(1, cameras.length - 1) : 0];
      const nextCamera = preferred || fallback;

      if ((currentTrack as any).setDevice) {
        await (currentTrack as any).setDevice(nextCamera.deviceId);
        cameraFacingRef.current = targetFacing;
        playLocalVideo(currentTrack, targetFacing);
      } else {
        const nextTrack = await AgoraRTC.createCameraVideoTrack({
          ...(getAgoraVideoConfig(activeQualityRef.current, targetFacing) as any),
          cameraId: nextCamera.deviceId,
          facingMode: targetFacing,
        });
        await applyLiveVideoEnhancement(nextTrack, getInitialEnhancementLevel());
        if (clientRef.current) {
          await clientRef.current.unpublish(currentTrack);
          currentTrack.close();
          await clientRef.current.publish(nextTrack);
        }
        localVideoRef.current = nextTrack;
        cameraFacingRef.current = targetFacing;
        playLocalVideo(nextTrack, targetFacing);
      }

      setStatusText('LIVE');
      return true;
    } catch (error) {
      console.warn('[useLiveRtc] Failed to switch camera:', error);
      setStatusText('Không thể xoay camera. Vui lòng kiểm tra quyền camera.');
      return false;
    } finally {
      setIsSwitchingCamera(false);
    }
  }, [applyLiveVideoEnhancement, isSwitchingCamera, playLocalVideo, videoQuality]);

  const toggleRemoteAudio = useCallback(() => {
    if (!remoteAudioRef.current) return;
    if (isMuted) {
      remoteAudioRef.current.play();
      setIsMuted(false);
    } else {
      remoteAudioRef.current.stop();
      setIsMuted(true);
    }
  }, [isMuted]);

  useEffect(() => {
    applyRemoteAudioState();
  }, [applyRemoteAudioState]);

  useEffect(() => {
    if (!tokenExpiresAtRef.current || !isJoined) return;
    const secondsLeft = secondsUntilExpiry(tokenExpiresAtRef.current);
    if (secondsLeft > 90) return;
    refreshToken().catch(() => {
      rejoinWithBackoff().catch(() => undefined);
    });
  }, [isJoined, refreshToken, rejoinWithBackoff]);

  useEffect(() => {
    if (localContainerMounted && localVideoRef.current && localContainerRef.current) {
      playLocalVideo();
    }
  }, [localContainerMounted, playLocalVideo]);

  useEffect(() => {
    return () => {
      leave().catch(() => undefined);
    };
  }, [leave]);

  const getLocalTracks = useCallback(() => ({
    audio: localAudioRef.current,
    video: localVideoRef.current,
  }), []);

  return {
    setLocalContainerRef,
    remoteContainerRef,
    isJoined,
    isMuted,
    isCameraOff,
    isSwitchingCamera,
    hasRemoteVideo,
    statusText,
    networkQuality,
    liveHealth,
    hostPreviewStats,
    start,
    leave,
    toggleMute,
    toggleCamera,
    switchCamera,
    toggleRemoteAudio,
    getLocalTracks,
  };
}
