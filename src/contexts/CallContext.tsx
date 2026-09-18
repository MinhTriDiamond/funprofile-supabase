/**
 * Global Call Context
 * Listens for incoming calls across all pages, not just the chat page.
 * Wraps the entire app to enable receiving calls from anywhere.
 */

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { IncomingCallDialog } from '@/modules/chat/components/IncomingCallDialog';
import type { CallSession, CallType } from '@/modules/chat/types';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import logger from '@/lib/logger';

/** Shape of a call_sessions row from Supabase realtime payload */
interface CallSessionPayload {
  id: string;
  initiator_id: string;
  conversation_id: string | null;
  channel_name: string;
  call_type: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CallContextValue {
  incomingCall: CallSession | null;
  answerCall: () => void;
  declineCall: () => void;
}

const CallContext = createContext<CallContextValue | undefined>(undefined);

export function useGlobalCall() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useGlobalCall must be used within a CallProvider');
  }
  return context;
}

interface CallProviderProps {
  children: ReactNode;
  renderIncomingDialog?: boolean;
}

export function CallProvider({ children, renderIncomingDialog = true }: CallProviderProps) {
  // Use centralized auth hook instead of separate subscription
  const { userId } = useCurrentUser();
  const [incomingCall, setIncomingCall] = useState<CallSession | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Handle answer call - navigate to chat and let the chat page handle the actual connection
  const answerCall = useCallback(() => {
    if (!incomingCall) return;
    
    const callId = incomingCall.id;
    const conversationId = incomingCall.conversation_id;
    
    // Navigate to the conversation with answer parameter
    navigate(`/chat/${conversationId}?answer=${callId}`);
    
    // Delay clearing the incoming call to ensure navigation completes
    setTimeout(() => {
      setIncomingCall(null);
    }, 500);
  }, [incomingCall, navigate]);

  // Handle decline call
  const declineCall = useCallback(async () => {
    if (!incomingCall) return;

    try {
      await supabase
        .from('call_sessions')
        .update({ status: 'declined', ended_at: new Date().toISOString() })
        .eq('id', incomingCall.id);

      setIncomingCall(null);
    } catch (error) {
      logger.error('[CallContext] Failed to decline call:', error);
    }
  }, [incomingCall]);

  // Mark call active globally so AuthSessionKeeper / ChunkLoadRecovery skip disruptive reloads
  useEffect(() => {
    (window as any).__CALL_ACTIVE__ = !!incomingCall;
    return () => {
      (window as any).__CALL_ACTIVE__ = false;
    };
  }, [incomingCall]);

  // Subscribe to incoming calls globally
  useEffect(() => {
    if (!userId) return;

    logger.debug('[CallContext] Setting up global call listener for user:', userId);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // Scope the subscription to conversations the user is currently a member of.
      const { data: rows, error } = await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('user_id', userId)
        .is('left_at', null);

      if (cancelled) return;
      if (error) {
        logger.error('[CallContext] Failed to load conversation ids:', error);
        return;
      }

      const conversationIds = (rows || []).map((r) => r.conversation_id).filter(Boolean);
      if (!conversationIds.length) return;

      const inFilter = `conversation_id=in.(${conversationIds.join(',')})`;

      channel = supabase
        .channel(`global-incoming-calls:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'call_sessions', filter: inFilter },
          (payload) => {
            const session = payload.new as CallSessionPayload;

            // Skip if we're the initiator
            if (session.initiator_id === userId) return;

            // Only show ringing calls
            if (session.status !== 'ringing') return;

            logger.debug('[CallContext] Incoming call detected:', session.id);

            const typedSession: CallSession = {
              ...session,
              call_type: session.call_type as CallType,
            };
            setIncomingCall(typedSession);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'call_sessions', filter: inFilter },
          (payload) => {
            const session = payload.new as CallSessionPayload;

            // If the incoming call was cancelled/ended by caller
            if (incomingCall?.id === session.id && ['ended', 'declined', 'missed'].includes(session.status)) {
              logger.debug('[CallContext] Incoming call cancelled:', session.status);
              setIncomingCall(null);

              if (session.status === 'missed') {
                toast({
                  title: 'Cuộc gọi nhỡ',
                  description: 'Bạn đã bỏ lỡ một cuộc gọi',
                });
              }
            }
          }
        )
        .subscribe();
    })();

    return () => {
      logger.debug('[CallContext] Cleaning up global call listener');
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, incomingCall, toast]);

  return (
    <CallContext.Provider value={{ incomingCall, answerCall, declineCall }}>
      {children}
      {renderIncomingDialog ? (
        <IncomingCallDialog
          callSession={incomingCall}
          onAnswer={answerCall}
          onDecline={declineCall}
        />
      ) : null}
    </CallContext.Provider>
  );
}
