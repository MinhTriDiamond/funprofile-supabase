
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AgoraRTC, {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  ICameraVideoTrack,
  UID,
} from 'agora-rtc-sdk-ng';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { createAgoraRtcClient } from '@/lib/agoraRtc';
import { getAgoraCallToken } from '../agoraCallToken';
import { chatRpc } from '../chatRpc';
import { canBeginCall, cleanupCallAttempt, isCurrentCallAttempt, isRecentRingingCall, type CallAttempt } from '../callLifecycle';
import logger from '@/lib/logger';
import type { CallSessionRow } from '@/types/realtimeRows';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';
export type CallType = 'voice' | 'video';

export interface CallSession {
  id: string;
  conversation_id: string;
  initiator_id: string;
  call_type: CallType;
  status: string;
  channel_name: string;
  started_at?: string;
  ended_at?: string;
  duration_seconds?: number;
}

export interface RemoteUser {
  uid: UID;
  audioTrack?: any;
  videoTrack?: any;
  hasAudio: boolean;
  hasVideo: boolean;
}

interface UseAgoraCallOptions {
  conversationId?: string;
  userId: string | null;
}

// Call timeout in milliseconds (45 seconds)
const CALL_TIMEOUT_MS = 45000;

export function useAgoraCall({ conversationId, userId }: UseAgoraCallOptions) {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // State
  const [callState, setCallState] = useState<CallState>('idle');
  const [callType, setCallType] = useState<CallType>('voice');
  const [currentSession, setCurrentSession] = useState<CallSession | null>(null);
  const [remoteUsers, setRemoteUsers] = useState<RemoteUser[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isAutoAnswering, setIsAutoAnswering] = useState(false);
  const [needsAudioGesture, setNeedsAudioGesture] = useState(false);

  // Refs
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const callInProgressRef = useRef(false);
  const localVideoTrackRef = useRef<ICameraVideoTrack | null>(null);
  const screenTrackRef = useRef<any>(null);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoAnswerProcessedRef = useRef<string | null>(null);
  const callGenerationRef = useRef(0);
  const activeAttemptRef = useRef<CallAttempt | null>(null);
  const remoteAudioTracksRef = useRef(new Map<UID, { play: () => void }>());
  
  // Refs to avoid closure issues in event handlers
  const callStateRef = useRef<CallState>('idle');
  const endCallRef = useRef<(() => Promise<void>) | null>(null);
  const currentSessionRef = useRef<CallSession | null>(null);
  const incomingCallRef = useRef<CallSession | null>(null);
  const callDurationRef = useRef(0);

  const getToken = useCallback((callSessionId: string) => getAgoraCallToken(callSessionId), []);

  // Initialize Agora client
  const initClient = useCallback((generation: number) => {
    if (!clientRef.current) {
      clientRef.current = createAgoraRtcClient('rtc');
      
      // Event handlers
      clientRef.current.on('user-published', async (user, mediaType) => {
        if (!activeAttemptRef.current || activeAttemptRef.current.generation !== generation) return;
        await clientRef.current?.subscribe(user, mediaType);
        if (!activeAttemptRef.current || activeAttemptRef.current.generation !== generation) return;
        
        setRemoteUsers(prev => {
          const existing = prev.find(u => u.uid === user.uid);
          if (existing) {
            return prev.map(u => 
              u.uid === user.uid 
                ? { 
                    ...u, 
                    [mediaType === 'audio' ? 'audioTrack' : 'videoTrack']: user[mediaType === 'audio' ? 'audioTrack' : 'videoTrack'],
                    [mediaType === 'audio' ? 'hasAudio' : 'hasVideo']: true 
                  }
                : u
            );
          }
          return [...prev, {
            uid: user.uid,
            audioTrack: mediaType === 'audio' ? user.audioTrack : undefined,
            videoTrack: mediaType === 'video' ? user.videoTrack : undefined,
            hasAudio: mediaType === 'audio',
            hasVideo: mediaType === 'video',
          }];
        });

        // Play audio track
        if (mediaType === 'audio' && user.audioTrack) {
          remoteAudioTracksRef.current.set(user.uid, user.audioTrack);
          try {
            user.audioTrack.play();
            setNeedsAudioGesture(false);
          } catch {
            setNeedsAudioGesture(true);
          }
        }
      });

      clientRef.current.on('user-unpublished', (user, mediaType) => {
        if (!activeAttemptRef.current || activeAttemptRef.current.generation !== generation) return;
        if (mediaType === 'audio') remoteAudioTracksRef.current.delete(user.uid);
        setRemoteUsers(prev => 
          prev.map(u => 
            u.uid === user.uid 
              ? { 
                  ...u, 
                  [mediaType === 'audio' ? 'audioTrack' : 'videoTrack']: undefined,
                  [mediaType === 'audio' ? 'hasAudio' : 'hasVideo']: false 
                }
              : u
          )
        );
      });

      clientRef.current.on('user-left', (user, reason) => {
        if (!activeAttemptRef.current || activeAttemptRef.current.generation !== generation) return;
        remoteAudioTracksRef.current.delete(user.uid);
        logger.debug('[Agora] Remote user left:', user.uid, 'reason:', reason);
        
        setRemoteUsers(prev => {
          const newUsers = prev.filter(u => u.uid !== user.uid);
          
          // In 1-on-1 calls, if no remote users left, auto-end the call
          if (newUsers.length === 0) {
            // Use setTimeout to avoid state update during render
            setTimeout(() => {
              if (activeAttemptRef.current?.generation === generation && callStateRef.current === 'connected') {
                logger.debug('[Agora] All remote users left, auto-ending call');
                endCallRef.current?.();
              }
            }, 100);
          }
          
          return newUsers;
        });
      });

      // Listen for connection state changes
      clientRef.current.on('connection-state-change', (curState, prevState, reason) => {
        if (generation !== callGenerationRef.current) return;
        logger.debug('[Agora] Connection state:', prevState, '->', curState, 'reason:', reason);
        
        if (curState === 'DISCONNECTED' && reason === 'LEAVE') {
          // Already disconnected, ensure cleanup
          if (callStateRef.current !== 'idle') {
            logger.debug('[Agora] Disconnected via LEAVE, cleaning up');
            endCallRef.current?.();
          }
        }
      });

      clientRef.current.on('token-privilege-will-expire', async () => {
        const session = currentSessionRef.current;
        if (!session || generation !== callGenerationRef.current || !['ringing', 'connected'].includes(callStateRef.current)) return;
        try {
          const renewed = await getAgoraCallToken(session.id);
          if (generation !== callGenerationRef.current || currentSessionRef.current?.id !== session.id) return;
          await clientRef.current?.renewToken(renewed.token);
        } catch {
          if (generation === callGenerationRef.current) {
            toast({ title: 'Kết nối sắp hết hạn', description: 'Không thể gia hạn quyền cuộc gọi. Vui lòng kết thúc và gọi lại.', variant: 'destructive' });
            void endCallRef.current?.();
          }
        }
      });
    }
    return clientRef.current;
  }, [toast]);

  // Start a call
  const startCall = useCallback(async (type: CallType) => {
    if (!conversationId || !userId) return;
    if (!canBeginCall(callStateRef.current, callInProgressRef.current)) return;
    callInProgressRef.current = true;
    const generation = ++callGenerationRef.current;
    activeAttemptRef.current = null;
    currentSessionRef.current = null;
    setCurrentSession(null);

    try {
      // Check DB for existing ringing/active call from the other user
      const { data: existingCalls, error: existingCallError } = await supabase
        .from('call_sessions')
        .select('*')
        .eq('conversation_id', conversationId)
        .in('status', ['ringing', 'active'])
        .order('created_at', { ascending: false })
        .limit(100);
      if (existingCallError) throw existingCallError;

      const nowMs = Date.now();
      const activeCall = (existingCalls || []).find((call) => call.status === 'active');
      if (activeCall) {
        toast({ title: 'Cuộc gọi đang hoạt động', description: 'Hãy kết thúc cuộc gọi hiện tại trước khi bắt đầu cuộc gọi mới.' });
        callInProgressRef.current = false;
        return;
      }
      const existingCall = (existingCalls || []).find((call) => isRecentRingingCall(call.status, call.created_at, nowMs, CALL_TIMEOUT_MS));

      if (existingCall) {
        if (existingCall.initiator_id === userId) {
          toast({ title: 'Cuộc gọi đang đổ chuông', description: 'Hãy chờ người nhận hoặc kết thúc yêu cầu hiện tại.' });
          callInProgressRef.current = false;
          return;
        }
        // The other person already called us - answer their call instead
        const typedSession: CallSession = { ...existingCall, call_type: existingCall.call_type as CallType };
        setIncomingCall(typedSession);
        callInProgressRef.current = false;
        return;
      }

      setCallState('calling');
      setCallType(type);

      // CRITICAL: Request media FIRST - must be in direct user gesture context
      let audioTrack: IMicrophoneAudioTrack;
      let videoTrack: ICameraVideoTrack | null = null;
      
      if (type === 'video') {
        try {
          const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
          audioTrack = tracks[0];
          videoTrack = tracks[1];
        } catch (videoErr: any) {
          console.warn('[Agora] Camera not available, falling back to audio only:', videoErr.message);
          try {
            audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            type = 'voice';
            toast({
              title: 'Camera không khả dụng',
              description: 'Cuộc gọi sẽ chuyển sang chế độ thoại vì không thể truy cập camera.',
            });
          } catch (audioErr: any) {
            throw new Error('Không thể truy cập microphone và camera. Vui lòng kiểm tra quyền truy cập thiết bị.');
          }
        }
      } else {
        try {
          audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        } catch (audioErr: any) {
          throw new Error('Không thể truy cập microphone. Vui lòng kiểm tra quyền truy cập thiết bị.');
        }
      }
      
      localAudioTrackRef.current = audioTrack;
      localVideoTrackRef.current = videoTrack;

      if (callGenerationRef.current !== generation) {
        audioTrack.close();
        videoTrack?.close();
        return;
      }

      const session = await chatRpc.startCallSession(conversationId, type) as unknown as CallSession;
      if (callGenerationRef.current !== generation) {
        audioTrack.close();
        videoTrack?.close();
        try { await chatRpc.endCallSession(session.id, 0); } catch { /* session-specific stale cleanup */ }
        return;
      }
      activeAttemptRef.current = { sessionId: session.id, generation };
      
      // Type assertion for the session
      const typedSession: CallSession = {
        ...session,
        call_type: session.call_type as CallType,
      };
      currentSessionRef.current = typedSession;
      setCurrentSession(typedSession);

      // Get a token bound to the server-owned call row and join tuple.
      const tokenData = await getToken(session.id);
      if (!activeAttemptRef.current || activeAttemptRef.current.generation !== generation) {
        audioTrack.close();
        videoTrack?.close();
        try { await chatRpc.endCallSession(session.id, 0); } catch { /* stale session cleanup */ }
        return;
      }
      
      // Cleanup existing client before joining
      if (clientRef.current) {
        try { await clientRef.current.leave(); } catch { /* cleanup — leave failure is non-critical */ }
        clientRef.current = null;
      }
      const client = initClient(generation);
      await client.join(tokenData.appId, tokenData.channel, tokenData.token, tokenData.uid);
      if (!activeAttemptRef.current || activeAttemptRef.current.generation !== generation) {
        audioTrack.close();
        videoTrack?.close();
        try { await client.leave(); } catch { /* stale client cleanup */ }
        try { await chatRpc.endCallSession(session.id, 0); } catch { /* session-specific stale cleanup */ }
        return;
      }

      // Publish pre-created tracks
      if (videoTrack) {
        await client.publish([audioTrack, videoTrack]);
      } else {
        await client.publish(audioTrack);
      }
      if (!activeAttemptRef.current || activeAttemptRef.current.generation !== generation) {
        audioTrack.close();
        videoTrack?.close();
        try { await client.leave(); } catch { /* stale client cleanup */ }
        try { await chatRpc.endCallSession(session.id, 0); } catch { /* stale session cleanup */ }
        return;
      }

      setCallState('ringing');

      // Set auto-timeout for missed call
      callTimeoutRef.current = setTimeout(async () => {
        if (activeAttemptRef.current?.sessionId !== session.id || activeAttemptRef.current.generation !== generation) return;
        logger.debug('[Agora] Call timeout - marking as missed');
        try {
          const missed = await chatRpc.markCallMissed(session.id);
          if (!missed || activeAttemptRef.current?.sessionId !== session.id || activeAttemptRef.current.generation !== generation) return;
          
          toast({
            title: 'Không có phản hồi',
            description: 'Người nhận không trả lời cuộc gọi',
          });
          
          // Cleanup
          localAudioTrackRef.current?.close();
          localVideoTrackRef.current?.close();
          localAudioTrackRef.current = null;
          localVideoTrackRef.current = null;
          activeAttemptRef.current = null;
          currentSessionRef.current = null;
          callGenerationRef.current += 1;
          await clientRef.current?.leave();
          clientRef.current = null;
          
          setCallState('idle');
          setCurrentSession(null);
        } catch (err) {
          console.error('[Agora] Failed to mark call as missed:', err);
        }
      }, CALL_TIMEOUT_MS);

    } catch (error: any) {
      if (callGenerationRef.current !== generation) return;
      console.error('Failed to start call:', error);
      toast({
        title: 'Lỗi',
        description: error.message || 'Không thể bắt đầu cuộc gọi',
        variant: 'destructive',
      });
      // Clean up any created tracks on error
      localAudioTrackRef.current?.close();
      localVideoTrackRef.current?.close();
      localAudioTrackRef.current = null;
      localVideoTrackRef.current = null;
      screenTrackRef.current?.close?.();
      screenTrackRef.current = null;
      if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      try { await clientRef.current?.leave(); } catch { /* cleanup continues */ }
      clientRef.current = null;
      const failedSession = currentSessionRef.current;
      let failedSessionEnded = !failedSession;
      if (failedSession) {
        try { failedSessionEnded = await chatRpc.endCallSession(failedSession.id, callDurationRef.current); } catch { failedSessionEnded = false; }
        if (!failedSessionEnded) toast({ title: 'Thiết bị đã được dọn dẹp', description: 'Máy chủ chưa xác nhận kết thúc phiên gọi.', variant: 'destructive' });
      }
      setCurrentSession(null);
      currentSessionRef.current = null;
      currentSessionRef.current = null;
      activeAttemptRef.current = null;
      setRemoteUsers([]);
      setIncomingCall(null);
      setCallDuration(0);
      setCallState('idle');
    } finally {
      if (callGenerationRef.current === generation) callInProgressRef.current = false;
    }
  }, [conversationId, userId, getToken, initClient, toast]);

  const answerSession = useCallback(async (session: CallSession) => {
    if (!userId || callInProgressRef.current || !['idle', 'ringing'].includes(callStateRef.current)) return;
    callInProgressRef.current = true;
    const generation = ++callGenerationRef.current;
    const attempt = { sessionId: session.id, generation };
    activeAttemptRef.current = attempt;

    try {
      setCallState('connecting');
      setCallType(session.call_type);
      currentSessionRef.current = session;
      setCurrentSession(session);
      let audioTrack: IMicrophoneAudioTrack;
      let videoTrack: ICameraVideoTrack | null = null;
      if (session.call_type === 'video') {
        const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
        audioTrack = tracks[0];
        videoTrack = tracks[1];
      } else {
        audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
      }
      if (!isCurrentCallAttempt(activeAttemptRef.current, attempt)) {
        audioTrack.close();
        videoTrack?.close();
        return;
      }
      localAudioTrackRef.current = audioTrack;
      localVideoTrackRef.current = videoTrack;

      const accepted = await chatRpc.acceptCallSession(session.id);
      if (!accepted) throw new Error('Cuộc gọi đã được kết thúc hoặc người khác đã trả lời.');
      if (!isCurrentCallAttempt(activeAttemptRef.current, attempt)) {
        audioTrack.close();
        videoTrack?.close();
        try { await chatRpc.endCallSession(session.id, 0); } catch { /* stale session cleanup */ }
        return;
      }
      const tokenData = await getToken(session.id);
      if (!isCurrentCallAttempt(activeAttemptRef.current, attempt)) {
        audioTrack.close();
        videoTrack?.close();
        try { await chatRpc.endCallSession(session.id, 0); } catch { /* stale session cleanup */ }
        return;
      }

      if (clientRef.current) {
        try { await clientRef.current.leave(); } catch { /* cleanup continues */ }
        clientRef.current = null;
      }
      const client = initClient(generation);
      await client.join(tokenData.appId, tokenData.channel, tokenData.token, tokenData.uid);
      if (!isCurrentCallAttempt(activeAttemptRef.current, attempt)) {
        audioTrack.close();
        videoTrack?.close();
        try { await client.leave(); } catch { /* stale client cleanup */ }
        try { await chatRpc.endCallSession(session.id, 0); } catch { /* stale session cleanup */ }
        return;
      }
      await client.publish(videoTrack ? [audioTrack, videoTrack] : audioTrack);
      if (!isCurrentCallAttempt(activeAttemptRef.current, attempt)) {
        audioTrack.close();
        videoTrack?.close();
        try { await client.leave(); } catch { /* stale client cleanup */ }
        try { await chatRpc.endCallSession(session.id, 0); } catch { /* stale session cleanup */ }
        return;
      }

      setCallState('connected');
      setIncomingCall(null);
      setIsAutoAnswering(false);
      setCallDuration(0);
      durationIntervalRef.current = setInterval(() => setCallDuration((value) => value + 1), 1000);
    } catch (error) {
      if (!isCurrentCallAttempt(activeAttemptRef.current, attempt)) return;
      console.error('Failed to answer call:', error);
      toast({ title: 'Lỗi', description: error instanceof Error ? error.message : 'Không thể trả lời cuộc gọi', variant: 'destructive' });
      const endRecorded = await cleanupCallAttempt(attempt, {
        closeTracks: () => {
          localAudioTrackRef.current?.close();
          localVideoTrackRef.current?.close();
          screenTrackRef.current?.close?.();
          localAudioTrackRef.current = null;
          localVideoTrackRef.current = null;
          screenTrackRef.current = null;
        },
        leaveRtc: async () => { try { await clientRef.current?.leave(); } finally { clientRef.current = null; } },
        clearTimers: () => {
          if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          durationIntervalRef.current = null;
          callTimeoutRef.current = null;
        },
        markEnded: (sessionId) => chatRpc.endCallSession(sessionId, 0),
      });
      if (!endRecorded) toast({ title: 'Cuộc gọi đã đóng trên thiết bị', description: 'Máy chủ chưa xác nhận trạng thái kết thúc. Hãy kiểm tra lại trong cuộc trò chuyện.', variant: 'destructive' });
      setCurrentSession(null);
      currentSessionRef.current = null;
      setIncomingCall(null);
      setCallState('idle');
      activeAttemptRef.current = null;
    } finally {
      if (isCurrentCallAttempt(activeAttemptRef.current, attempt)) callInProgressRef.current = false;
    }
  }, [userId, getToken, initClient, toast]);

  const answerCall = useCallback(() => {
    if (incomingCall) void answerSession(incomingCall);
  }, [incomingCall, answerSession]);

  // Decline incoming call
  const declineCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      const declined = await chatRpc.declineCallSession(incomingCall.id);
      if (!declined) throw new Error('Cuộc gọi đã thay đổi trạng thái.');

      setIncomingCall(null);
    } catch (error) {
      console.error('Failed to decline call:', error);
    }
  }, [incomingCall]);

  // End call - uses refs to avoid dependency churn
  const endCall = useCallback(async () => {
    try {
      const session = currentSessionRef.current;
      const duration = callDurationRef.current;
      const endAttempt = session ? { sessionId: session.id, generation: callGenerationRef.current } : null;
      callGenerationRef.current += 1;
      activeAttemptRef.current = null;
      const cleanup = {
        closeTracks: () => {
          localAudioTrackRef.current?.close();
          localVideoTrackRef.current?.close();
          screenTrackRef.current?.close();
          localAudioTrackRef.current = null;
          localVideoTrackRef.current = null;
          screenTrackRef.current = null;
          setIsScreenSharing(false);
        },
        leaveRtc: async () => { try { await clientRef.current?.leave(); } finally { clientRef.current = null; } },
        clearTimers: () => {
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
          if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
          callTimeoutRef.current = null;
          durationIntervalRef.current = null;
        },
        markEnded: session ? (sessionId: string) => chatRpc.endCallSession(sessionId, duration) : undefined,
      };
      const endRecorded = endAttempt ? await cleanupCallAttempt(endAttempt, cleanup) : await cleanupCallAttempt({ sessionId: '', generation: callGenerationRef.current }, cleanup);
      let databaseEnded = endRecorded;
      if (session && !endRecorded) {
        try {
          const { data, error } = await supabase.from('call_sessions').select('status').eq('id', session.id).maybeSingle();
          databaseEnded = !error && Boolean(data && ['ended', 'missed', 'declined'].includes(data.status));
        } catch { databaseEnded = false; }
      }
      if (!databaseEnded) toast({ title: 'Đã đóng cuộc gọi trên thiết bị', description: 'Chưa xác nhận được trạng thái trên máy chủ. Vui lòng mở lại cuộc trò chuyện khi có mạng.', variant: 'destructive' });

      // Reset state
      setCallState('idle');
      setCurrentSession(null);
      currentSessionRef.current = null;
      setRemoteUsers([]);
      remoteAudioTracksRef.current.clear();
      setNeedsAudioGesture(false);
      setCallDuration(0);
      setIsMuted(false);
      setIsCameraOff(false);
      callInProgressRef.current = false;

    } catch (error) {
      console.error('Failed to end call:', error);
    }
  }, [userId]);

  // Sync refs to avoid closure issues
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    endCallRef.current = endCall;
  }, [endCall]);

  useEffect(() => {
    currentSessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    callDurationRef.current = callDuration;
  }, [callDuration]);

  // Debug logging for callState changes
  useEffect(() => {
    logger.debug('[Agora] callState changed:', callState, 'session:', currentSession?.id?.slice(0, 8));
  }, [callState, currentSession]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (localAudioTrackRef.current) {
      const newMuted = !isMuted;
      try {
        await localAudioTrackRef.current.setEnabled(!newMuted);
        if (currentSession && userId) {
          const updated = await chatRpc.updateCallParticipant(currentSession.id, newMuted, isCameraOff);
          if (!updated) throw new Error('Trạng thái cuộc gọi đã thay đổi.');
        }
        setIsMuted(newMuted);
      } catch (error) {
        await localAudioTrackRef.current.setEnabled(isMuted);
        toast({ title: 'Không thể đổi microphone', description: error instanceof Error ? error.message : 'Vui lòng thử lại.', variant: 'destructive' });
      }
    }
  }, [isMuted, currentSession, userId, isCameraOff, toast]);

  const resumeRemoteAudio = useCallback(() => {
    try {
      remoteAudioTracksRef.current.forEach((track) => track.play());
      setNeedsAudioGesture(false);
    } catch {
      setNeedsAudioGesture(true);
    }
  }, []);

  // Toggle camera
  const toggleCamera = useCallback(async () => {
    if (localVideoTrackRef.current) {
      const newOff = !isCameraOff;
      try {
        await localVideoTrackRef.current.setEnabled(!newOff);
        if (currentSession && userId) {
          const updated = await chatRpc.updateCallParticipant(currentSession.id, isMuted, newOff);
          if (!updated) throw new Error('Trạng thái cuộc gọi đã thay đổi.');
        }
        setIsCameraOff(newOff);
      } catch (error) {
        await localVideoTrackRef.current.setEnabled(!isCameraOff);
        toast({ title: 'Không thể đổi camera', description: error instanceof Error ? error.message : 'Vui lòng thử lại.', variant: 'destructive' });
      }
    }
  }, [isCameraOff, currentSession, userId, isMuted, toast]);

  // Switch to video (during voice call)
  const switchToVideo = useCallback(async () => {
    if (callType === 'video' || !clientRef.current) return;

    try {
      const videoTrack = await AgoraRTC.createCameraVideoTrack();
      localVideoTrackRef.current = videoTrack;
      await clientRef.current.publish(videoTrack);
      setCallType('video');
      setIsCameraOff(false);
    } catch (error: any) {
      console.error('Failed to switch to video:', error);
      toast({
        title: 'Camera không khả dụng',
        description: 'Không thể bật camera. Vui lòng kiểm tra quyền truy cập.',
        variant: 'destructive',
      });
    }
  }, [callType, toast]);

  // Handle auto-answer from URL parameter (when accepting call from another page)
  useEffect(() => {
    const answerCallId = searchParams.get('answer');
    
    // Skip if no answer param, no user, already processing, or already answered this call
    if (!answerCallId || !userId || !conversationId || isAutoAnswering) return;
    if (autoAnswerProcessedRef.current === answerCallId) return;
    if (callState !== 'idle') return;

    logger.debug('[Agora] Auto-answer triggered for call:', answerCallId);
    autoAnswerProcessedRef.current = answerCallId;
    
    const autoAnswerCall = async () => {
      try {
        setIsAutoAnswering(true);
        
        // Fetch the call session from database
        const { data: session, error } = await supabase
          .from('call_sessions')
          .select('*')
          .eq('id', answerCallId)
          .eq('conversation_id', conversationId)
          .eq('status', 'ringing')
          .single();

        if (error || !session) {
          logger.debug('[Agora] Call session not found or not ringing:', error?.message);
          // Clear the URL parameter
          setSearchParams({}, { replace: true });
          setIsAutoAnswering(false);
          return;
        }

        logger.debug('[Agora] Found call session, auto-answering:', session.id);
        
        // Set the incoming call and trigger answer
        const typedSession: CallSession = {
          ...session,
          call_type: session.call_type as CallType,
        };
        
        // Set incoming call first
        setIncomingCall(typedSession);
        
        // Clear the URL parameter
        setSearchParams({}, { replace: true });
        
        // Small delay to ensure state is updated, then answer
        // Use the same guarded path as the visible Answer action.
        setTimeout(() => { void answerSession(typedSession); }, 0);
        
      } catch (err) {
        console.error('[Agora] Auto-answer error:', err);
        setSearchParams({}, { replace: true });
        setIsAutoAnswering(false);
      }
    };

    autoAnswerCall();
  }, [searchParams, userId, conversationId, callState, isAutoAnswering, answerSession, toast, setSearchParams]);

  // Cleanup stale ringing sessions on mount
  useEffect(() => {
    if (!conversationId || !userId) return;
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    supabase
      .from('call_sessions')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('initiator_id', userId)
      .eq('status', 'ringing')
      .lt('created_at', twoMinutesAgo)
      .then(async ({ data, error }) => {
        if (error) { console.error('[Agora] Error loading stale sessions:', error); return; }
        for (const row of data || []) {
          try { await chatRpc.markCallMissed(row.id); }
          catch (markError) { console.error('[Agora] Error marking stale call:', markError); }
        }
      });
  }, [conversationId, userId]);

  // Subscribe to incoming calls via realtime - STABLE dependencies only
  useEffect(() => {
    if (!userId || !conversationId) return;

    logger.debug('[Agora] Setting up realtime subscription for:', conversationId);

    const channel = supabase
      .channel(`calls-${conversationId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const session = payload.new as CallSessionRow;
          // Don't show incoming call if we initiated it
          if (session.initiator_id !== userId && session.status === 'ringing') {
            const typedSession: CallSession = {
              ...session,
              call_type: session.call_type as CallType,
            };
            setIncomingCall(typedSession);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_sessions',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const session = payload.new as CallSessionRow;
          const curSession = currentSessionRef.current;
          const curCallState = callStateRef.current;
          const curIncoming = incomingCallRef.current;

          logger.debug('[Agora] Realtime session update:', session.id?.slice(0, 8), session.status, 
            'mySession:', curSession?.id?.slice(0, 8), 'myState:', curCallState);
          
          // If call became active and we're the caller, update state
          if (curSession?.id === session.id) {
            if (session.status === 'active' && curCallState === 'ringing') {
              logger.debug('[Agora] Call answered! Transitioning to connected');
              // Clear the timeout since call was answered
              if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
              }
              
              setCallState('connected');
              durationIntervalRef.current = setInterval(() => {
                setCallDuration(prev => prev + 1);
              }, 1000);
            }
            // If call was declined/missed/ended
            if (['declined', 'missed', 'ended'].includes(session.status) && curCallState !== 'idle') {
              logger.debug('[Agora] Session ended via realtime, cleaning up');
              // Clear the timeout
              if (callTimeoutRef.current) {
                clearTimeout(callTimeoutRef.current);
                callTimeoutRef.current = null;
              }
              endCallRef.current?.();
            }
          }

          // If incoming call was cancelled
          if (curIncoming?.id === session.id && ['ended', 'declined', 'missed'].includes(session.status)) {
            setIncomingCall(null);
          }
          if (curIncoming?.id === session.id && session.status === 'active') setIncomingCall(null);
        }
      )
      .subscribe();

    return () => {
      logger.debug('[Agora] Cleaning up realtime subscription');
      supabase.removeChannel(channel);
    };
  }, [userId, conversationId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const session = currentSessionRef.current;
      const attempt = session ? { sessionId: session.id, generation: callGenerationRef.current } : null;
      callGenerationRef.current += 1;
      activeAttemptRef.current = null;
      const cleanup = {
        closeTracks: () => {
          localAudioTrackRef.current?.close();
          localVideoTrackRef.current?.close();
          screenTrackRef.current?.close?.();
          localAudioTrackRef.current = null;
          localVideoTrackRef.current = null;
          screenTrackRef.current = null;
          remoteAudioTracksRef.current.clear();
        },
        leaveRtc: async () => { try { await clientRef.current?.leave(); } finally { clientRef.current = null; } },
        clearTimers: () => {
          if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
          if (callTimeoutRef.current) clearTimeout(callTimeoutRef.current);
        },
        markEnded: session ? (sessionId: string) => chatRpc.endCallSession(sessionId, callDurationRef.current) : undefined,
      };
      void cleanupCallAttempt(attempt || { sessionId: '', generation: callGenerationRef.current }, cleanup).then((ended) => {
        if (!ended && session) console.warn('[Agora] Call end cleanup is pending');
      });
    };
  }, []);

  // Toggle screen sharing
  const toggleScreenShare = useCallback(async () => {
    if (!clientRef.current) return;

    if (isScreenSharing) {
      // Stop screen sharing
      if (screenTrackRef.current) {
        await clientRef.current.unpublish(screenTrackRef.current);
        screenTrackRef.current.close();
        screenTrackRef.current = null;
      }
      // Re-publish camera track if camera is on
      if (localVideoTrackRef.current && !isCameraOff) {
        await clientRef.current.publish(localVideoTrackRef.current);
      }
      setIsScreenSharing(false);
    } else {
      // Start screen sharing
      try {
        const screenTrack = await AgoraRTC.createScreenVideoTrack({}, 'disable');
        // screenTrack can be ILocalVideoTrack or [ILocalVideoTrack, ILocalAudioTrack]
        const videoTrack = Array.isArray(screenTrack) ? screenTrack[0] : screenTrack;
        
        screenTrackRef.current = videoTrack;

        // Unpublish camera track
        if (localVideoTrackRef.current) {
          await clientRef.current!.unpublish(localVideoTrackRef.current);
        }

        // Publish screen track
        await clientRef.current!.publish(videoTrack);
        setIsScreenSharing(true);

        // Listen for browser's native "Stop sharing" button
        videoTrack.on('track-ended', async () => {
          logger.debug('[Agora] Screen sharing ended by browser');
          if (screenTrackRef.current) {
            await clientRef.current?.unpublish(screenTrackRef.current);
            screenTrackRef.current.close();
            screenTrackRef.current = null;
          }
          if (localVideoTrackRef.current && !isCameraOff) {
            await clientRef.current?.publish(localVideoTrackRef.current);
          }
          setIsScreenSharing(false);
        });
      } catch (error: any) {
        console.warn('[Agora] Screen sharing failed:', error.message);
        // User cancelled or not supported
        if (error.message !== 'Permission denied' && error.message !== 'NotAllowedError') {
          toast({
            title: 'Không thể chia sẻ màn hình',
            description: error.message || 'Vui lòng thử lại',
            variant: 'destructive',
          });
        }
      }
    }
  }, [isScreenSharing, isCameraOff, toast]);

  // Flip camera (switch between front/back)
  const flipCamera = useCallback(async () => {
    if (!localVideoTrackRef.current) return false;

    try {
      const cameras = await AgoraRTC.getCameras();
      if (cameras.length < 2) return false;

      const currentLabel = localVideoTrackRef.current.getTrackLabel();
      const currentIndex = cameras.findIndex(c => c.label === currentLabel);
      const nextIndex = (currentIndex + 1) % cameras.length;
      const nextDevice = cameras[nextIndex];

      await localVideoTrackRef.current.setDevice(nextDevice.deviceId);
      return true;
    } catch (error) {
      console.error('[Agora] Failed to flip camera:', error);
      return false;
    }
  }, []);

  return {
    // State
    callState,
    callType,
    currentSession,
    remoteUsers,
    isMuted,
    isCameraOff,
    isScreenSharing,
    incomingCall,
    callDuration,
    needsAudioGesture,
    localVideoTrack: localVideoTrackRef.current,
    localAudioTrack: localAudioTrackRef.current,
    screenTrack: screenTrackRef.current,
    
    // Actions
    startCall,
    answerCall,
    declineCall,
    endCall,
    resumeRemoteAudio,
    toggleMute,
    toggleCamera,
    switchToVideo,
    flipCamera,
    toggleScreenShare,
  };
}
