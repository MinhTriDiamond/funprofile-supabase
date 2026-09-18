import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, ChevronRight, Globe2, HelpCircle, Link2, Loader2, Mic, MicOff, Music, Settings, SlidersHorizontal, Sparkles, SwitchCamera, Users } from 'lucide-react';
import { toast } from 'sonner';
import { SmartDescriptionInput } from '../components/prelive/SmartDescriptionInput';
import { useMusicAutoPause } from '../hooks/useMusicAutoPause';
import { useVisualViewportInset } from '../hooks/useVisualViewportInset';
import { startWebcamLiveSessionBackend } from '../webcam/services/webcamLiveApi';

type VideoQuality = 'auto' | '360p' | '480p' | '720p' | '1080p';
export type WebcamAudioMode = 'original' | 'voice';
type MicrophoneDevice = {
  deviceId: string;
  label: string;
};
type PreviewFitMode = 'cover' | 'contain';

const QUALITY_LABELS: Record<VideoQuality | '1080p', string> = {
  auto: 'Auto HD - tự chọn theo mạng',
  '360p': 'Data Saver 360p - tiết kiệm data',
  '480p': 'SD 480p - ổn định hơn',
  '720p': 'HD 720p - nét hơn',
  '1080p': 'Full HD - cần Wi-Fi mạnh',
};

const QUALITY_OPTIONS: VideoQuality[] = ['auto', '720p', '480p', '360p'];

const QUALITY_CONSTRAINTS: Record<VideoQuality | '1080p', { width: number; height: number; frameRate: number }> = {
  auto: { width: 1280, height: 720, frameRate: 30 },
  '360p': { width: 640, height: 360, frameRate: 20 },
  '480p': { width: 854, height: 480, frameRate: 24 },
  '720p': { width: 1280, height: 720, frameRate: 30 },
  '1080p': { width: 1920, height: 1080, frameRate: 24 },
};

const AUDIO_MODE_LABELS: Record<WebcamAudioMode, string> = {
  original: 'Âm thanh gốc',
  voice: 'Khử ồn',
};

function getStoredAudioMode(): WebcamAudioMode {
  try {
    return localStorage.getItem('funprofile_webcam_audio_mode') === 'voice' ? 'voice' : 'original';
  } catch {
    return 'original';
  }
}

function getStoredMicrophoneId(): string {
  try {
    return localStorage.getItem('funprofile_webcam_microphone_id') || '';
  } catch {
    return '';
  }
}

function getStoredVideoQuality(): VideoQuality {
  try {
    const stored = localStorage.getItem('funprofile_webcam_video_quality');
    if (stored === 'auto' || stored === '720p' || stored === '480p' || stored === '360p') return stored;
    if (stored === '1080p') return '720p';
    return 'auto';
  } catch {
    return 'auto';
  }
}

function isMobileWebcamDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(max-width: 767px)').matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent);
}

function getMicrophoneLabel(device: MediaDeviceInfo, index: number): string {
  if (device.label) return device.label;
  if (device.deviceId === 'default') return 'Micro mặc định';
  return `Micro ${index + 1}`;
}

function getAudioConstraints(mode: WebcamAudioMode, microphoneId?: string): MediaTrackConstraints {
  const deviceConstraint = microphoneId ? { deviceId: { exact: microphoneId } } : {};

  if (mode === 'voice') {
    return {
      ...deviceConstraint,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
    };
  }

  return {
    ...deviceConstraint,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: { ideal: 2 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
  };
}

function getVideoConstraints(facing: 'user' | 'environment', quality: VideoQuality): MediaTrackConstraints {
  const mobile = isMobileWebcamDevice();
  const mobileConstraints: Record<VideoQuality | '1080p', { width: number; height: number; frameRate: number }> = {
    auto: { width: 1280, height: 720, frameRate: 30 },
    '360p': { width: 640, height: 360, frameRate: 20 },
    '480p': { width: 854, height: 480, frameRate: 24 },
    '720p': { width: 1280, height: 720, frameRate: 30 },
    '1080p': { width: 1280, height: 720, frameRate: 20 },
  };
  const q = mobile ? mobileConstraints[quality] : QUALITY_CONSTRAINTS[quality];
  const portrait = typeof window !== 'undefined' && window.innerHeight >= window.innerWidth;
  const preferWideFrontCamera = mobile && portrait && facing === 'user';
  const width = preferWideFrontCamera
    ? Math.max(q.width, q.height)
    : mobile && portrait
      ? Math.min(q.width, q.height)
      : Math.max(q.width, q.height);
  const height = preferWideFrontCamera
    ? Math.min(q.width, q.height)
    : mobile && portrait
      ? Math.max(q.width, q.height)
      : Math.min(q.width, q.height);

  return {
    facingMode: facing,
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: q.frameRate, max: Math.max(q.frameRate, 30) },
  };
}

function inspectCameraStream(stream: MediaStream, context: string): PreviewFitMode {
  const settings = stream.getVideoTracks()[0]?.getSettings?.();
  const width = settings?.width;
  const height = settings?.height;
  const frameRate = settings?.frameRate;
  const facingMode = settings?.facingMode;
  if (!width || !height) return 'cover';

  const ratio = Math.min(width, height) / Math.max(width, height);
  const portraitNineSixteen = 9 / 16;
  const mobilePortrait = isMobileWebcamDevice() && typeof window !== 'undefined' && window.innerHeight >= window.innerWidth;
  const fit: PreviewFitMode = mobilePortrait && width > height ? 'contain' : 'cover';

  console.info('[PreLive] Camera settings:', {
    context,
    width,
    height,
    frameRate,
    facingMode,
    ratio,
    fit,
  });

  if (Math.abs(ratio - portraitNineSixteen) > 0.18) {
    console.warn('[PreLive] Camera returned an unusual aspect ratio:', {
      context,
      width,
      height,
      frameRate,
      facingMode,
      ratio,
    });
  }

  return fit;
}

function hasActiveVideoTrack(stream?: MediaStream | null): stream is MediaStream {
  return !!stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled);
}

export default function PreLivePage() {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestIdRef = useRef(0);
  const isStartingLiveRef = useRef(false);

  useMusicAutoPause(true);
  const keyboardInset = useVisualViewportInset();

  const [isMicOn, setIsMicOn] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [description, setDescription] = useState('');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [quality, setQuality] = useState<VideoQuality>(() => getStoredVideoQuality());
  const [showQuality, setShowQuality] = useState(false);
  const [audioMode, setAudioMode] = useState<WebcamAudioMode>(() => getStoredAudioMode());
  const [showAudioMode, setShowAudioMode] = useState(false);
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState(() => getStoredMicrophoneId());
  const [showMicrophones, setShowMicrophones] = useState(false);
  const [previewFit, setPreviewFit] = useState<PreviewFitMode>('cover');
  const [isPreparingCamera, setIsPreparingCamera] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [isStartingLive, setIsStartingLive] = useState(false);

  const refreshMicrophones = useCallback(async (preferredId?: string) => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(device => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: getMicrophoneLabel(device, index),
        }));

      setMicrophones(audioInputs);

      const nextPreferredId = preferredId ?? selectedMicrophoneId;
      if (nextPreferredId && !audioInputs.some(device => device.deviceId === nextPreferredId)) {
        setSelectedMicrophoneId('');
        try {
          localStorage.removeItem('funprofile_webcam_microphone_id');
        } catch {
          // Ignore storage restrictions.
        }
        if (hasPermission) {
          toast.info('Micro đã chọn không còn khả dụng. FUN Profile đã chuyển về micro mặc định.');
        }
      }
    } catch (error) {
      console.warn('[PreLive] Failed to enumerate microphones:', error);
    }
  }, [hasPermission, selectedMicrophoneId]);

  const startCamera = useCallback(async (
    facing: 'user' | 'environment',
    nextQuality: VideoQuality,
    nextAudioMode: WebcamAudioMode,
    nextMicrophoneId = selectedMicrophoneId,
    allowMicrophoneFallback = true,
  ) => {
    const requestId = cameraRequestIdRef.current + 1;
    cameraRequestIdRef.current = requestId;
    setIsPreparingCamera(true);
    setCameraReady(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    const activateStream = (stream: MediaStream, context: string, preferredMicrophoneId?: string) => {
      if (cameraRequestIdRef.current !== requestId) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setPreviewFit(inspectCameraStream(stream, context));
      setHasPermission(true);
      setCameraReady(hasActiveVideoTrack(stream));
      setIsPreparingCamera(false);
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (streamRef.current === stream) setCameraReady(false);
        };
      });
      refreshMicrophones(preferredMicrophoneId);
    };

    const markCameraUnavailable = () => {
      if (cameraRequestIdRef.current !== requestId) return;
      setCameraReady(false);
      setIsPreparingCamera(false);
    };

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('MediaDevices API is not available');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: getVideoConstraints(facing, nextQuality),
        audio: getAudioConstraints(nextAudioMode, nextMicrophoneId),
      });
      activateStream(stream, 'initial', nextMicrophoneId);
    } catch (err: unknown) {
      console.error('[PreLive] Camera error:', err);
      const errName = (err as { name?: string })?.name;
      const errConstraint = (err as { constraint?: string })?.constraint;
      if (nextQuality !== '480p' && errName === 'OverconstrainedError' && errConstraint !== 'deviceId') {
        setQuality('480p');
        try {
          localStorage.setItem('funprofile_webcam_video_quality', '480p');
        } catch {
          // Ignore storage restrictions.
        }
        toast.info('Thiết bị không hỗ trợ chất lượng cao, đã chuyển về chế độ mượt.');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: getVideoConstraints(facing, '480p'),
            audio: getAudioConstraints(nextAudioMode, nextMicrophoneId),
          });
          activateStream(stream, 'quality_fallback', nextMicrophoneId);
        } catch (fallbackQualityError) {
          console.error('[PreLive] Quality fallback failed:', fallbackQualityError);
          markCameraUnavailable();
          setHasPermission(false);
          toast.error('Không thể truy cập camera/micro.');
        }
        return;
      }
      if (nextMicrophoneId && allowMicrophoneFallback && (errName === 'NotFoundError' || errName === 'OverconstrainedError')) {
        setSelectedMicrophoneId('');
        try {
          localStorage.removeItem('funprofile_webcam_microphone_id');
        } catch {
          // Ignore storage restrictions.
        }
        toast.info('Không dùng được micro đã chọn. FUN Profile đang thử micro mặc định.');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: getVideoConstraints(facing, nextQuality),
            audio: getAudioConstraints(nextAudioMode),
          });
          activateStream(stream, 'microphone_fallback', '');
        } catch (fallbackError) {
          console.error('[PreLive] Default microphone fallback failed:', fallbackError);
          markCameraUnavailable();
          setHasPermission(false);
          toast.error('Không thể truy cập camera/micro.');
        }
        return;
      }

      markCameraUnavailable();
      setHasPermission(false);
      if (errName === 'NotAllowedError') {
        toast.error('Bạn chưa cấp quyền camera/micro.');
      } else if (errName === 'NotFoundError') {
        toast.error('Không tìm thấy thiết bị camera/micro.');
      } else {
        toast.error('Không thể truy cập camera.');
      }
    }
  }, [refreshMicrophones, selectedMicrophoneId]);

  useEffect(() => {
    startCamera(facingMode, quality, audioMode, selectedMicrophoneId);
    return () => {
      cameraRequestIdRef.current += 1;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [audioMode, facingMode, quality, selectedMicrophoneId, startCamera]);

  useEffect(() => {
    if (!navigator.mediaDevices?.addEventListener) return;
    const handleDeviceChange = () => {
      refreshMicrophones();
    };
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [refreshMicrophones]);

  const handleToggleMic = () => {
    if (streamRef.current) {
      const audioTracks = streamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMicOn(prev => !prev);
    }
  };

  const handleFlipCamera = () => {
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacing);
  };




  const handleQualityChange = (q: VideoQuality) => {
    setQuality(q);
    setShowQuality(false);
    try {
      localStorage.setItem('funprofile_webcam_video_quality', q);
    } catch {
      // Ignore storage restrictions.
    }
  };

  const handleAudioModeChange = (mode: WebcamAudioMode) => {
    setAudioMode(mode);
    setShowAudioMode(false);
    try {
      localStorage.setItem('funprofile_webcam_audio_mode', mode);
    } catch {
      // Ignore storage restrictions.
    }
  };

  const handleMicrophoneChange = (microphoneId: string) => {
    setSelectedMicrophoneId(microphoneId);
    setShowMicrophones(false);
    try {
      if (microphoneId) {
        localStorage.setItem('funprofile_webcam_microphone_id', microphoneId);
      } else {
        localStorage.removeItem('funprofile_webcam_microphone_id');
      }
    } catch {
      // Ignore storage restrictions.
    }
  };

  const handleGoLive = async () => {
    if (isStartingLiveRef.current) return;

    if (!hasActiveVideoTrack(streamRef.current)) {
      toast.info('Äang chuáº©n bá»‹ láº¡i camera...');
      await startCamera(facingMode, quality, audioMode, selectedMicrophoneId);
      return;
    }

    isStartingLiveRef.current = true;
    setIsStartingLive(true);
    const title = description.trim() || undefined;
    const isMobileLike = /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent)
      || window.matchMedia('(max-width: 767px)').matches;
    const isTabletLike = !isMobileLike && window.matchMedia('(max-width: 1024px)').matches;
    const viewportOrientation: 'portrait' | 'landscape' = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';

    // Đọc kích thước thật của camera track để quyết định orientation chính xác,
    // bất kể device là desktop hay mobile (vd webcam dọc/USB phone-cam/OBS virtual cam).
    const trackSettings = streamRef.current?.getVideoTracks?.()[0]?.getSettings?.();
    const cameraWidth = typeof trackSettings?.width === 'number' ? trackSettings.width : undefined;
    const cameraHeight = typeof trackSettings?.height === 'number' ? trackSettings.height : undefined;
    let cameraOrientation: 'landscape' | 'portrait' | undefined;
    if (cameraWidth && cameraHeight) {
      cameraOrientation = cameraHeight > cameraWidth ? 'portrait' : 'landscape';
    }

    // Ưu tiên orientation thật của camera; fallback rule cũ.
    const recordingAspectRatio: 'landscape_16_9' | 'portrait_9_16' =
      cameraOrientation === 'portrait'
        ? 'portrait_9_16'
        : cameraOrientation === 'landscape'
          ? 'landscape_16_9'
          : (isMobileLike && viewportOrientation === 'portrait')
            ? 'portrait_9_16'
            : 'landscape_16_9';
    const startRequestedAt = performance.now();
    const startPayload = {
      quality: quality === 'auto' || quality === '720p' ? '720p' : '480p',
      audioMode,
      deviceType: isMobileLike ? 'mobile' as const : isTabletLike ? 'tablet' as const : 'desktop' as const,
      viewportOrientation,
      recordingAspectRatio,
      cameraWidth,
      cameraHeight,
      cameraOrientation,
    };
    if (import.meta.env.DEV) {
      console.debug('[PreLiveStart]', { phase: 'request', ...startPayload });
    }
    try {
      const started = await startWebcamLiveSessionBackend({
        title,
        description: title,
        privacy: 'public',
        ...startPayload,
      });
      if (import.meta.env.DEV) {
        console.debug('[PreLiveStart]', {
          phase: 'success',
          sessionId: started.sessionId,
          recordingStartQueued: started.recordingStartQueued,
          recordingAvailable: started.recordingAvailable,
          durationMs: Math.round(performance.now() - startRequestedAt),
        });
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      navigate(`/live/${started.sessionId}/host`, {
        state: {
          title,
          privacy: 'public',
          quality,
          audioMode,
          facingMode,
          micDeviceId: selectedMicrophoneId || undefined,
          backendStarted: true,
          recordingAvailable: started.recordingAvailable,
          fallbackRecordingRecommended: started.fallbackRecordingRecommended,
          fallbackProvider: started.fallbackProvider,
          recordingErrorCode: started.recordingErrorCode,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const lower = message.toLowerCase();
      const userMessage = lower.includes('unauthorized') || lower.includes('auth') || lower.includes('token')
        ? 'Phiên đăng nhập chưa sẵn sàng. Vui lòng thử lại.'
        : lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')
          ? 'Mạng đang chậm, chưa thể bắt đầu LIVE. Vui lòng thử lại sau vài giây.'
          : lower.includes('banned')
            ? 'Tài khoản không thể phát trực tiếp.'
            : 'Chưa thể bắt đầu LIVE. Vui lòng thử lại sau ít giây.';
      console.error('[PreLive] live-webcam-start failed:', {
        error,
        message,
        durationMs: Math.round(performance.now() - startRequestedAt),
        ...startPayload,
      });
      if (import.meta.env.DEV) {
        console.debug('[PreLiveStart]', {
          phase: 'failed',
          message,
          durationMs: Math.round(performance.now() - startRequestedAt),
          ...startPayload,
        });
      }
      toast.error(userMessage);
      isStartingLiveRef.current = false;
      setIsStartingLive(false);
    }
  };

  const handleBack = () => {
    cameraRequestIdRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    navigate(-1);
  };

  const selectedMicrophoneLabel = microphones.find(mic => mic.deviceId === selectedMicrophoneId)?.label || 'Micro mặc định';
  const selectedQualityLabel = quality === 'auto' ? 'Auto HD' : quality === '720p' ? 'HD' : quality === '480p' ? 'SD' : quality === '360p' ? 'Data Saver' : 'HD';
  const toggleAudioModePanel = () => {
    setShowAudioMode((open) => !open);
    setShowQuality(false);
    setShowMicrophones(false);
  };
  const toggleQualityPanel = () => {
    setShowQuality((open) => !open);
    setShowAudioMode(false);
    setShowMicrophones(false);
  };
  const toggleMicrophonePanel = () => {
    refreshMicrophones();
    setShowMicrophones((open) => !open);
    setShowAudioMode(false);
    setShowQuality(false);
  };
  const canStartLive = hasPermission === true && cameraReady && hasActiveVideoTrack(streamRef.current) && !isPreparingCamera && !isStartingLive;
  const liveButtonLabel = isStartingLive
    ? 'Đang vào LIVE...'
    : isPreparingCamera || hasPermission === null
      ? 'Đang chuẩn bị camera...'
      : cameraReady
        ? 'Phát trực tiếp'
        : 'Camera chưa sẵn sàng';

  return (
    <div className="fixed inset-0 z-50 flex h-[100dvh] overflow-hidden overscroll-none bg-black text-white">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 h-full w-full object-center ${
          previewFit === 'contain' ? 'object-contain' : 'object-cover'
        }`}
        style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
      />

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/0 to-black/90" />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button
          onClick={handleBack}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/35 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/60"
          aria-label="Quay lại"
        >
          <ArrowLeft className="w-7 h-7" />
        </button>
        <span className="hidden">
          {isStartingLive ? 'Đang kết nối LIVE...' : 'Phát trực tiếp'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-white font-bold text-lg leading-tight drop-shadow">Phát trực tiếp</div>
          <button className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black shadow">
            <Globe2 className="h-4 w-4" />
            Công khai
            <ChevronRight className="h-3.5 w-3.5 rotate-90" />
          </button>
        </div>
        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/35 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/60"
          aria-label="Trợ giúp"
        >
          <HelpCircle className="w-7 h-7" />
        </button>
      </div>

      <div className="absolute right-3 top-[calc(5.25rem+env(safe-area-inset-top))] z-10 hidden flex-col items-end gap-4 md:flex">
        <button
          onClick={handleToggleMic}
          className={`flex items-center justify-end gap-3 text-white font-semibold drop-shadow transition-colors ${
            isMicOn
              ? 'hover:text-white/80'
              : 'text-red-200 hover:text-red-100'
          }`}
          title={isMicOn ? 'Tắt micro' : 'Bật micro'}
        >
          <span className="hidden min-[380px]:inline text-sm">{isMicOn ? 'Tắt tiếng micrô' : 'Bật micrô'}</span>
          <span className="w-11 h-11 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center">
            {isMicOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </span>
        </button>

        <button
          onClick={() => {
            refreshMicrophones();
            setShowMicrophones(!showMicrophones);
          }}
          className="flex items-center justify-end gap-3 text-white font-semibold drop-shadow transition-colors hover:text-white/80"
          title="Chọn micro"
        >
          <span className="hidden min-[380px]:inline max-w-[140px] truncate text-sm">{selectedMicrophoneLabel}</span>
          <span className="w-11 h-11 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center">
            <Mic className="w-6 h-6" />
          </span>
        </button>

        <button
          onClick={handleFlipCamera}
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          title="Xoay camera"
        >
          <SwitchCamera className="w-6 h-6" />
        </button>




        <button
          onClick={() => setShowQuality(!showQuality)}
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          title="Chất lượng video"
        >
          <Settings className="w-6 h-6" />
        </button>

        <button
          onClick={() => setShowAudioMode(!showAudioMode)}
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          title="Chế độ âm thanh"
        >
          {audioMode === 'original' ? <Music className="w-6 h-6" /> : <SlidersHorizontal className="w-6 h-6" />}
        </button>
      </div>

      {/* Microphone picker */}
      {showMicrophones && (
        <div className="animate-fade-in absolute inset-x-3 bottom-[calc(15.5rem+env(safe-area-inset-bottom))] z-30 max-h-[38dvh] overflow-y-auto rounded-2xl border border-white/15 bg-black/85 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl md:inset-x-auto md:right-20 md:top-[calc(50%-3.5rem)] md:bottom-auto md:w-[min(19rem,calc(100vw-7rem))] md:-translate-y-1/2">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white/50">
            Chọn micro
          </div>
          <button
            onClick={() => handleMicrophoneChange('')}
            className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
              !selectedMicrophoneId
                ? 'bg-blue-600 text-white font-medium'
                : 'text-white/80 hover:bg-white/10'
            }`}
          >
            Micro mặc định
          </button>
          {microphones.map((microphone) => (
            <button
              key={microphone.deviceId}
              onClick={() => handleMicrophoneChange(microphone.deviceId)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
                selectedMicrophoneId === microphone.deviceId
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              {microphone.label}
            </button>
          ))}
          {microphones.length === 0 && (
            <div className="px-4 py-3 text-sm text-white/70">
              Chưa tìm thấy micro. Hãy kiểm tra quyền micro hoặc kết nối mic ngoài.
            </div>
          )}
        </div>
      )}

      {/* Quality picker */}
      {showQuality && (
        <div className="animate-fade-in absolute inset-x-3 bottom-[calc(15.5rem+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-white/15 bg-black/85 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl md:inset-x-auto md:right-20 md:top-1/2 md:bottom-auto md:-translate-y-1/2">
          {QUALITY_OPTIONS.map(q => (
            <button
              key={q}
              onClick={() => handleQualityChange(q)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
                quality === q
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              {QUALITY_LABELS[q]}
            </button>
          ))}
        </div>
      )}

      {/* Audio mode picker */}
      {showAudioMode && (
        <div className="animate-fade-in absolute inset-x-3 bottom-[calc(15.5rem+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-white/15 bg-black/85 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl md:inset-x-auto md:right-20 md:top-[calc(50%+3.75rem)] md:bottom-auto md:-translate-y-1/2">
          {(Object.keys(AUDIO_MODE_LABELS) as WebcamAudioMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => handleAudioModeChange(mode)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
                audioMode === mode
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              {AUDIO_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      )}

      {/* Bottom section */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 space-y-3 px-3 pt-8"
        style={{
          paddingBottom: `calc(max(env(safe-area-inset-bottom), 12px) + 12px + ${keyboardInset}px)`,
          transition: 'padding-bottom 0.15s ease-out',
        }}
      >
        <SmartDescriptionInput
          value={description}
          onChange={setDescription}
          maxLength={5000}
          placeholder="Nhấn để thêm mô tả..."
        />


        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={toggleAudioModePanel}
            className={`flex h-12 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold backdrop-blur-md ${
              showAudioMode ? 'border-white bg-white text-black' : 'border-white/15 bg-black/40 text-white'
            }`}
          >
            {audioMode === 'original' ? <Music className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
            Nhạc
          </button>
          <button type="button" onClick={() => toast.info('Hiệu ứng sẽ sớm được hỗ trợ.')} className="flex h-12 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 text-sm font-semibold text-white backdrop-blur-md">
            <Sparkles className="h-4 w-4" />
            Hiệu ứng
          </button>
          <button type="button" onClick={() => toast.info('Chia sẻ lên story sẽ sớm được hỗ trợ.')} className="flex h-12 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 text-sm font-semibold text-white backdrop-blur-md">
            <Users className="h-4 w-4" />
            Story
          </button>
          <button type="button" onClick={handleFlipCamera} className="flex h-12 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 text-sm font-semibold text-white backdrop-blur-md">
            <SwitchCamera className="h-4 w-4" />
            Camera
          </button>
          <button
            type="button"
            onClick={handleToggleMic}
            className={`flex h-12 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold backdrop-blur-md ${
              isMicOn ? 'border-white/15 bg-black/40 text-white' : 'border-red-300/40 bg-red-500/20 text-red-100'
            }`}
          >
            {isMicOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            {isMicOn ? 'Mic' : 'Mic tắt'}
          </button>
          <button
            type="button"
            onClick={toggleQualityPanel}
            className={`flex h-12 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold backdrop-blur-md ${
              showQuality ? 'border-white bg-white text-black' : 'border-white/15 bg-black/40 text-white'
            }`}
          >
            <Settings className="h-4 w-4" />
            {selectedQualityLabel}
          </button>
          <button
            type="button"
            onClick={toggleMicrophonePanel}
            className={`flex h-12 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-semibold backdrop-blur-md ${
              showMicrophones ? 'border-white bg-white text-black' : 'border-white/15 bg-black/40 text-white'
            }`}
          >
            <Mic className="h-4 w-4" />
            <span className="max-w-[44vw] truncate">{selectedMicrophoneLabel}</span>
          </button>
        </div>

        <button className="hidden w-full items-center justify-between gap-3 text-left text-white md:flex">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold">Chia sẻ lên</div>
              <div className="text-sm text-white/70">Tin: Bật</div>
            </div>
          </div>
          <ChevronRight className="h-6 w-6" />
        </button>

        {/* Quality and audio indicators */}
        <div className="flex min-w-0 items-center justify-center gap-2 text-xs text-white/55">
          <span>{QUALITY_LABELS[quality]}</span>
          <span>•</span>
          <span>{AUDIO_MODE_LABELS[audioMode]}</span>
          <span>•</span>
          <span className="max-w-[42vw] truncate">Micro: {selectedMicrophoneLabel}</span>
        </div>

        <button
          onClick={handleGoLive}
          disabled={!canStartLive}
          aria-label={liveButtonLabel}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-lg font-bold text-white shadow-lg shadow-blue-600/30 transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {(isStartingLive || isPreparingCamera) && <Loader2 className="h-5 w-5 animate-spin" />}
          <span>{liveButtonLabel}</span>
        </button>

        <div className="hidden items-center justify-around text-white md:flex">
          <button className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10"><Link2 className="h-6 w-6" /></button>
          <button className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10"><BarChart3 className="h-6 w-6" /></button>
          <button className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10"><Sparkles className="h-6 w-6" /></button>
          <button className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-white/10"><Users className="h-6 w-6" /></button>
        </div>
      </div>
      {hasPermission === false && (
        <div className="absolute inset-0 z-20 bg-black/90 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-white text-lg font-semibold mb-2">
            Không thể truy cập Camera
          </div>
          <div className="text-white/60 text-sm mb-6">
            Vui lòng cấp quyền camera và micro trong cài đặt trình duyệt, sau đó thử lại.
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => startCamera(facingMode, quality, audioMode, selectedMicrophoneId)}
              className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Thử lại
            </button>
            <button
              onClick={handleBack}
              className="px-6 py-2.5 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors"
            >
              Quay lại
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
