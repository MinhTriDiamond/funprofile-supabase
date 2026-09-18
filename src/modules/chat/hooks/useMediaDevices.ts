
/**
 * Hook to manage media devices (cameras, microphones, speakers)
 * Provides device enumeration, selection, and switching capabilities
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AgoraRTC, { ICameraVideoTrack, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

export interface MediaDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput' | 'videoinput';
}

export interface MediaDevicesState {
  cameras: MediaDevice[];
  microphones: MediaDevice[];
  speakers: MediaDevice[];
  selectedCamera: string | null;
  selectedMicrophone: string | null;
  selectedSpeaker: string | null;
}

interface UseMediaDevicesOptions {
  videoTrack?: ICameraVideoTrack | null;
  audioTrack?: IMicrophoneAudioTrack | null;
}

export function useMediaDevices({ videoTrack, audioTrack }: UseMediaDevicesOptions = {}) {
  const [devices, setDevices] = useState<MediaDevicesState>({
    cameras: [],
    microphones: [],
    speakers: [],
    selectedCamera: null,
    selectedMicrophone: null,
    selectedSpeaker: null,
  });
  const [isEnumerating, setIsEnumerating] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioLevelIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Enumerate available devices
  const enumerateDevices = useCallback(async () => {
    setIsEnumerating(true);
    try {
      // Request permissions first to get proper device labels
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() => {});
      
      const [cameras, microphones] = await Promise.all([
        AgoraRTC.getCameras(),
        AgoraRTC.getMicrophones(),
      ]);
      
      // Get speakers if available (not all browsers support)
      let speakers: MediaDevice[] = [];
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        speakers = allDevices
          .filter(d => d.kind === 'audiooutput')
          .map(d => ({
            deviceId: d.deviceId,
            label: d.label || `Speaker ${d.deviceId.slice(0, 4)}`,
            kind: 'audiooutput' as const,
          }));
      } catch {
        // Speakers enumeration not supported on some browsers
      }

      setDevices(prev => ({
        ...prev,
        cameras: cameras.map(c => ({
          deviceId: c.deviceId,
          label: c.label || `Camera ${c.deviceId.slice(0, 4)}`,
          kind: 'videoinput' as const,
        })),
        microphones: microphones.map(m => ({
          deviceId: m.deviceId,
          label: m.label || `Microphone ${m.deviceId.slice(0, 4)}`,
          kind: 'audioinput' as const,
        })),
        speakers,
        // Set defaults if not already set
        selectedCamera: prev.selectedCamera || (cameras.length > 0 ? cameras[0].deviceId : null),
        selectedMicrophone: prev.selectedMicrophone || (microphones.length > 0 ? microphones[0].deviceId : null),
        selectedSpeaker: prev.selectedSpeaker || (speakers.length > 0 ? speakers[0].deviceId : null),
      }));
    } catch (error) {
      console.error('[MediaDevices] Failed to enumerate devices:', error);
    } finally {
      setIsEnumerating(false);
    }
  }, []);

  // Switch camera (for flip camera feature)
  const flipCamera = useCallback(async () => {
    if (!videoTrack || devices.cameras.length < 2) return false;

    try {
      const currentDeviceId = videoTrack.getTrackLabel();
      const currentIndex = devices.cameras.findIndex(c => c.label === currentDeviceId || c.deviceId === devices.selectedCamera);
      const nextIndex = (currentIndex + 1) % devices.cameras.length;
      const nextDevice = devices.cameras[nextIndex];

      await videoTrack.setDevice(nextDevice.deviceId);
      setDevices(prev => ({ ...prev, selectedCamera: nextDevice.deviceId }));
      return true;
    } catch (error) {
      console.error('[MediaDevices] Failed to flip camera:', error);
      return false;
    }
  }, [videoTrack, devices.cameras, devices.selectedCamera]);

  // Select specific camera
  const selectCamera = useCallback(async (deviceId: string) => {
    if (!videoTrack) return false;

    try {
      await videoTrack.setDevice(deviceId);
      setDevices(prev => ({ ...prev, selectedCamera: deviceId }));
      return true;
    } catch (error) {
      console.error('[MediaDevices] Failed to select camera:', error);
      return false;
    }
  }, [videoTrack]);

  // Select specific microphone
  const selectMicrophone = useCallback(async (deviceId: string) => {
    if (!audioTrack) return false;

    try {
      await audioTrack.setDevice(deviceId);
      setDevices(prev => ({ ...prev, selectedMicrophone: deviceId }));
      return true;
    } catch (error) {
      console.error('[MediaDevices] Failed to select microphone:', error);
      return false;
    }
  }, [audioTrack]);

  // Select speaker (playback device)
  const selectSpeaker = useCallback(async (deviceId: string) => {
    try {
      // Note: Speaker selection typically needs to be applied to audio elements
      // This is more of a stored preference
      setDevices(prev => ({ ...prev, selectedSpeaker: deviceId }));
      return true;
    } catch (error) {
      console.error('[MediaDevices] Failed to select speaker:', error);
      return false;
    }
  }, []);

  // Monitor audio level for mic test
  const startAudioLevelMonitor = useCallback(() => {
    if (!audioTrack) return;

    audioLevelIntervalRef.current = setInterval(() => {
      const level = audioTrack.getVolumeLevel();
      setAudioLevel(level * 100); // Convert to percentage
    }, 100);
  }, [audioTrack]);

  const stopAudioLevelMonitor = useCallback(() => {
    if (audioLevelIntervalRef.current) {
      clearInterval(audioLevelIntervalRef.current);
      audioLevelIntervalRef.current = null;
    }
    setAudioLevel(0);
  }, []);

  // Check if device has multiple cameras (for showing flip button)
  const hasMultipleCameras = devices.cameras.length > 1;

  // Get front/back camera info
  const getFrontCamera = useCallback(() => {
    return devices.cameras.find(c => 
      c.label.toLowerCase().includes('front') || 
      c.label.toLowerCase().includes('facetime') ||
      c.label.toLowerCase().includes('user')
    );
  }, [devices.cameras]);

  const getBackCamera = useCallback(() => {
    return devices.cameras.find(c => 
      c.label.toLowerCase().includes('back') || 
      c.label.toLowerCase().includes('environment')
    );
  }, [devices.cameras]);

  // Enumerate devices on mount
  useEffect(() => {
    enumerateDevices();

    // Listen for device changes
    const handleDeviceChange = () => {
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      stopAudioLevelMonitor();
    };
  }, [enumerateDevices, stopAudioLevelMonitor]);

  return {
    // State
    devices,
    isEnumerating,
    audioLevel,
    hasMultipleCameras,

    // Actions
    enumerateDevices,
    flipCamera,
    selectCamera,
    selectMicrophone,
    selectSpeaker,
    startAudioLevelMonitor,
    stopAudioLevelMonitor,

    // Helpers
    getFrontCamera,
    getBackCamera,
  };
}
