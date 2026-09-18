
import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMessages } from '../hooks/useMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useConversation } from '../hooks/useConversations';
import { useAgoraCall } from '../hooks/useAgoraCall';
import { CallRoom } from './CallRoom';
import { IncomingCallDialog } from './IncomingCallDialog';
import { usePins } from '../hooks/usePins';
import { useBlocks } from '../hooks/useBlocks';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useReports } from '../hooks/useReports';
import { useAngelInline } from '../hooks/useAngelInline';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import { MessageSearch } from './MessageSearch';
import { GroupSettingsDialog } from './GroupSettingsDialog';
import { EditMessageDialog } from './EditMessageDialog';
import { ReportDialog } from './ReportDialog';
import { BlockUserDialog } from './BlockUserDialog';

import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Search, Settings, Users, Phone, Video, MoreHorizontal, Pin, Trash2, ArrowLeft } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import type { Message, ConversationParticipant } from '../types';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { canSendMessage, useChatSettings } from '../hooks/useChatSettings';

interface MessageThreadProps {
  conversationId: string;
  userId: string | null;
  username: string | null;
  onBack?: () => void;
}

export function MessageThread({ conversationId, userId, username, onBack }: MessageThreadProps) {
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const isAtBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const previousMessageCountRef = useRef(0);
  const pendingReadIdsRef = useRef<Set<string>>(new Set());
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { data: conversation, refetch: refetchConversation } = useConversation(conversationId);
  const {
    messages,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    sendMessage,
    markAsRead,
    addReaction,
    removeReaction,
    editMessage,
    softDeleteMessage,
  } = useMessages(conversationId, userId);

  const { typingUsers, sendTyping } = useTypingIndicator(conversationId, userId, username);
  const { settings: chatSettings } = useChatSettings(userId);

  const handleTyping = useCallback((isTyping: boolean) => {
    if (chatSettings?.show_typing_indicator === false) return;
    sendTyping(isTyping);
  }, [chatSettings?.show_typing_indicator, sendTyping]);

  // Agora call hook
  const {
    callState,
    callType,
    currentSession,
    remoteUsers,
    isMuted,
    isCameraOff,
    isScreenSharing,
    callDuration,
    localVideoTrack,
    screenTrack,
    incomingCall,
    startCall,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleCamera,
    switchToVideo,
    flipCamera,
    toggleScreenShare,
  } = useAgoraCall({ conversationId, userId });

  // Get other participant for header
  const otherParticipant = conversation?.participants?.find(
    (p: ConversationParticipant) => p.user_id !== userId && !p.left_at
  );
  const headerProfile = otherParticipant?.profile;
  const isGroup = conversation?.type === 'group';
  const participantCount = conversation?.participants?.filter((p: ConversationParticipant) => !p.left_at).length || 0;

  const { pinnedMessage, pinMessage, unpinMessage } = usePins(conversationId);
  const { blockedIds, blockedByIds, blockUser, unblockUser } = useBlocks(userId);
  const { createReport } = useReports(userId);
  const { invokeAngel } = useAngelInline();
  
  const headerName = isGroup
    ? conversation?.name
    : headerProfile?.full_name || headerProfile?.username || 'Người dùng';
  const headerAvatar = isGroup
    ? conversation?.avatar_url
    : headerProfile?.avatar_url;
  const recipientUserId = !isGroup ? otherParticipant?.user_id || null : null;
  // Chat gift should only read the single source of truth from Profile (web3_wallet_address).
  const recipientWalletAddress = !isGroup
    ? (headerProfile?.public_wallet_address
      || headerProfile?.external_wallet_address
      || headerProfile?.wallet_address
      || null)
    : null;

  const dmOtherUserId = !isGroup ? recipientUserId : null;
  const isDmBlockedByMe = !!dmOtherUserId && blockedIds.has(dmOtherUserId);
  const isDmBlockedMe = !!dmOtherUserId && blockedByIds.has(dmOtherUserId);
  const isDmBlocked = isDmBlockedByMe || isDmBlockedMe;

  const visibleMessages = messages.filter((m) => {
    if (!userId) return true;
    if (m.sender_id === userId) return true;
    return !blockedIds.has(m.sender_id);
  });

  const getViewportEl = () => scrollRootRef.current;
  const scheduleScrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
      scrollRafRef.current = null;
    });
  };

  // Track whether the user is near the bottom; used to avoid yanking scroll when loading older messages.
  useEffect(() => {
    const viewport = getViewportEl();
    if (!viewport) return;

    const onScroll = () => {
      const thresholdPx = 80;
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      isAtBottomRef.current = distanceFromBottom <= thresholdPx;
      setShowJumpToLatest(!isAtBottomRef.current);
      if (isAtBottomRef.current) {
        setNewMessagesCount(0);
      }
    };

    onScroll();
    viewport.addEventListener('scroll', onScroll);
    return () => viewport.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll to bottom on initial load, and when new messages arrive while user is at bottom.
  useEffect(() => {
    if (isLoading) return;
    if (!bottomRef.current) return;
    const previousCount = previousMessageCountRef.current;
    const incomingCount = Math.max(messages.length - previousCount, 0);
    previousMessageCountRef.current = messages.length;

    if (!didInitialScrollRef.current) {
      didInitialScrollRef.current = true;
      scheduleScrollToBottom();
      setShowJumpToLatest(false);
      setNewMessagesCount(0);
      return;
    }
    if (isAtBottomRef.current) {
      scheduleScrollToBottom();
      setShowJumpToLatest(false);
      setNewMessagesCount(0);
    } else {
      if (incomingCount > 0) {
        setShowJumpToLatest(true);
        setNewMessagesCount((prev) => prev + incomingCount);
      }
    }
  }, [isLoading, messages.length]);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  // Mark messages as read (only if read receipts enabled)
  useEffect(() => {
    if (!userId || messages.length === 0) return;
    if (chatSettings?.show_read_receipts === false) return;

    const unreadIds = messages
      .filter(
      (m) => m.sender_id !== userId && !m.read_by?.includes(userId)
      )
      .map((m) => m.id)
      .filter((id) => !pendingReadIdsRef.current.has(id));

    if (!unreadIds.length) return;

    unreadIds.forEach((id) => pendingReadIdsRef.current.add(id));
    markAsRead(unreadIds)
      .catch(() => undefined)
      .finally(() => {
        unreadIds.forEach((id) => pendingReadIdsRef.current.delete(id));
      });
  }, [messages, userId, markAsRead, chatSettings?.show_read_receipts]);

  const handleSend = async (content: string, mediaUrls?: string[]) => {
    // Kiểm tra quyền gửi tin nhắn (chỉ cho hội thoại 1-1)
    if (recipientUserId && userId) {
      const allowed = await canSendMessage(userId, recipientUserId);
      if (!allowed) {
        toast.error('Bạn không thể gửi tin nhắn cho người này do cài đặt quyền riêng tư của họ');
        return;
      }
    }
    const trimmed = (content || '').trim();
    await sendMessage.mutateAsync({
      content,
      mediaUrls,
      replyToId: replyTo?.id,
    });
    setReplyTo(null);

    if (trimmed.toLowerCase().startsWith('@angel')) {
      const prompt = trimmed.replace(/^@angel\s*/i, '').trim();
      if (!prompt) return;
      invokeAngel.mutate(
        { conversationId, prompt },
        {
          onError: (e: any) => {
            toast.error(e?.message || 'Angel AI phản hồi thất bại');
          },
        }
      );
    }
  };

  const handleSendSticker = async (sticker: any) => {
    if (recipientUserId && userId) {
      const allowed = await canSendMessage(userId, recipientUserId);
      if (!allowed) {
        toast.error('Bạn không thể gửi tin nhắn cho người này do cài đặt quyền riêng tư của họ');
        return;
      }
    }
    await sendMessage.mutateAsync({
      content: '[Sticker]',
      mediaUrls: [],
      replyToId: replyTo?.id,
      messageType: 'sticker',
      metadata: { sticker },
    });
    setReplyTo(null);
  };

  const handleCreateRedEnvelope = async (input: { token: 'CAMLY' | 'BNB'; totalAmount: number; totalCount: number }) => {
    if (!userId) throw new Error('Not authenticated');
    if (recipientUserId) {
      const allowed = await canSendMessage(userId, recipientUserId);
      if (!allowed) {
        toast.error('Bạn không thể gửi tin nhắn cho người này do cài đặt quyền riêng tư của họ');
        return;
      }
    }
    // Create envelope row
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    // Assuming supabase client is available globally or imported
    const { supabase } = await import('@/integrations/supabase/client');
    const { data: envelope, error: envErr } = await supabase
      .from('red_envelopes')
      .insert({
        creator_id: userId,
        conversation_id: conversationId,
        token: input.token,
        total_amount: input.totalAmount,
        total_count: input.totalCount,
        remaining_amount: input.totalAmount,
        remaining_count: input.totalCount,
        expires_at: expiresAt,
        status: 'active',
      })
      .select('id')
      .single();
    if (envErr) throw envErr;

    // Send envelope message
    const msg = await sendMessage.mutateAsync({
      content: '[Red Envelope]',
      mediaUrls: [],
      replyToId: replyTo?.id,
      messageType: 'red_envelope',
      metadata: { envelopeId: envelope.id },
    });
    setReplyTo(null);

    // Best-effort link message_id back to envelope
    if ((msg as any)?.id) {
      supabase.from('red_envelopes').update({ message_id: (msg as any).id }).eq('id', envelope.id).then(() => undefined);
    }
  };

  const handleReaction = (messageId: string, emoji: string, hasReacted: boolean) => {
    if (hasReacted) {
      removeReaction.mutate({ messageId, emoji });
    } else {
      addReaction.mutate({ messageId, emoji });
    }
  };

  const scrollToMessage = async (messageId: string) => {
    // Best-effort: try to locate the message in DOM; if not loaded, fetch older pages.
    const tryScroll = () => {
      const el = document.getElementById(`msg-${messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setHighlightMessageId(messageId);
        window.setTimeout(() => {
          setHighlightMessageId((current) => (current === messageId ? null : current));
        }, 1800);
        return true;
      }
      return false;
    };

    if (tryScroll()) return true;

    // Try fetching older pages a few times.
    for (let i = 0; i < 8; i++) {
      if (!hasNextPage || isFetchingNextPage) break;
      await fetchNextPage();
      // Let React render.
      await new Promise((r) => setTimeout(r, 50));
      if (tryScroll()) return true;
    }

    toast.warning('Không tìm thấy tin nhắn trong lịch sử đã tải.');
    return false;
  };

  const handleJumpToLatest = () => {
    scheduleScrollToBottom('smooth');
    setShowJumpToLatest(false);
    setNewMessagesCount(0);
  };

  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="p-4 border-b flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : ''}`}>
              <Skeleton className={`h-12 ${i % 2 === 0 ? 'w-48' : 'w-64'} rounded-2xl`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (showSearch) {
    const participants =
      conversation?.participants
        ?.filter((p: ConversationParticipant) => !p.left_at)
        .map((p: ConversationParticipant) => ({
          id: p.user_id,
          username: p.profile?.full_name || p.profile?.username || 'Người dùng',
        })) || [];
    return (
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <MessageSearch
          conversationId={conversationId}
          participants={participants}
          excludedSenderIds={Array.from(blockedIds)}
          onClose={() => setShowSearch(false)}
          onSelectMessage={async (messageId) => {
            await scrollToMessage(messageId);
            setShowSearch(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-2 py-2 sm:p-3 border-b flex items-center justify-between bg-card gap-1 sm:gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
          {onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="shrink-0 -ml-1 h-8 w-8 sm:h-10 sm:w-10">
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          )}
          <div
            className={`flex items-center gap-2 sm:gap-3 min-w-0 flex-1 ${!isGroup && dmOtherUserId ? 'cursor-pointer group' : ''}`}
            onClick={() => {
              if (!isGroup && dmOtherUserId) {
                navigate(`/profile/${dmOtherUserId}`);
              } else if (isGroup) {
                setShowGroupSettings(true);
              }
            }}
          >
          <Avatar className={`h-8 w-8 sm:h-10 sm:w-10 shrink-0 transition-all ${!isGroup && dmOtherUserId ? 'group-hover:ring-2 group-hover:ring-primary' : ''}`}>
            <AvatarImage src={headerAvatar || undefined} alt={headerName || ''} />
            <AvatarFallback className="text-xs sm:text-sm">{(headerName || 'U')[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className={`font-medium truncate max-w-[100px] sm:max-w-[200px] text-sm sm:text-base ${!isGroup && dmOtherUserId ? 'group-hover:underline' : ''}`}>{headerName}</p>
            {isGroup ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                {participantCount} thành viên
              </p>
            ) : typingUsers.length > 0 ? (
              <p className="text-xs text-muted-foreground">Đang nhập...</p>
            ) : null}
          </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {/* Call buttons */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => startCall('voice')}
            disabled={callState !== 'idle' || (!isGroup && isDmBlocked)}
            title="Gọi thoại"
            className="h-8 w-8 sm:h-10 sm:w-10"
          >
            <Phone className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => startCall('video')}
            disabled={callState !== 'idle' || (!isGroup && isDmBlocked)}
            title="Gọi video"
            className="h-8 w-8 sm:h-10 sm:w-10"
          >
            <Video className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          
          <Button variant="ghost" size="icon" onClick={() => setShowSearch(true)} className="h-8 w-8 sm:h-10 sm:w-10">
            <Search className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          {isGroup && (
            <Button variant="ghost" size="icon" onClick={() => setShowGroupSettings(true)} className="h-8 w-8 sm:h-10 sm:w-10">
              <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          )}
          {!isGroup && dmOtherUserId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowBlockDialog(true)} disabled={isDmBlockedMe && !isDmBlockedByMe}>
                  {isDmBlockedMe && !isDmBlockedByMe
                    ? 'Bạn đã bị tạm ngừng kết nối'
                    : isDmBlockedByMe
                      ? 'Kết nối lại'
                      : 'Tạm ngừng kết nối'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Xóa cuộc trò chuyện
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Pinned banner */}
      {pinnedMessage && (
        <div className="px-4 py-2 border-b bg-card flex items-center justify-between gap-2">
          <button
            onClick={() => scrollToMessage(pinnedMessage.id)}
            className="flex items-center gap-2 min-w-0 text-left"
            title="Đi đến tin nhắn đã ghim"
          >
            <Pin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm truncate">
              {pinnedMessage.content || '(Tin nhắn đã ghim)'}
            </span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => unpinMessage.mutate(pinnedMessage.id)}
            disabled={unpinMessage.isPending}
          >
            {unpinMessage.isPending ? '...' : 'Bỏ ghim'}
          </Button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRootRef} className="flex-1 min-h-0 overflow-y-auto p-4">
        <div className="space-y-4">
          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Đang tải...' : 'Tải tin nhắn cũ hơn'}
              </Button>
            </div>
          )}

          {visibleMessages.map((message, index) => {
            const isOwn = message.sender_id === userId;
            const showAvatar = !isOwn && (
              index === 0 || visibleMessages[index - 1]?.sender_id !== message.sender_id
            );

            return (
              <div
                key={message.id}
                id={`msg-${message.id}`}
                className={cn(
                  'rounded-md transition-colors',
                  highlightMessageId === message.id && 'bg-primary/10 ring-1 ring-primary/30'
                )}
              >
                <MessageBubble
                message={message}
                isOwn={isOwn}
                showAvatar={showAvatar}
                userId={userId}
                onReply={() => setReplyTo(message)}
                onReaction={(messageId, emoji, hasReacted) => handleReaction(messageId, emoji, hasReacted)}
                onPin={(messageId) => {
                  const msg = messages.find(m => m.id === messageId);
                  if (msg?.pinned_at) {
                    unpinMessage.mutate(messageId);
                  } else {
                    pinMessage.mutate(messageId);
                  }
                }}
                onEdit={() => setEditingMessage(message)}
                onDelete={(messageId) => {
                  if (!isOwn) return;
                  if (window.confirm('Thu hồi / xóa tin nhắn này?')) {
                    softDeleteMessage.mutate({ messageId });
                  }
                }}
                onReport={() => {
                  setReportTarget(message);
                  setShowReport(true);
                }}
                isPinned={!!message.pinned_at}
                highlightId={highlightMessageId}
                showReadStatus={chatSettings?.show_read_receipts !== false}
              />
              </div>
            );
          })}

          {typingUsers.length > 0 && (
            <TypingIndicator users={typingUsers} />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {showJumpToLatest && (
        <div className="absolute right-4 z-20 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-24">
          <Button size="sm" onClick={handleJumpToLatest} className="rounded-full shadow-lg">
            {newMessagesCount > 0 ? `Tin mới nhất (${newMessagesCount})` : 'Tin mới nhất'}
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-0 z-10 bg-card pb-[env(safe-area-inset-bottom)]">
        <ChatInput
          onSend={handleSend}
          onSendSticker={handleSendSticker}
          onCreateRedEnvelope={handleCreateRedEnvelope}
          onTyping={handleTyping}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          isSending={sendMessage.isPending}
          recipientWalletAddress={recipientWalletAddress}
          recipientUserId={recipientUserId}
          recipientName={headerName}
          recipientAvatar={headerAvatar}
          conversationId={conversationId}
          isGroup={isGroup}
          disabled={!isGroup && isDmBlocked}
          disabledReason={
            !isGroup && isDmBlocked
              ? isDmBlockedByMe
                ? 'Bạn đã tạm ngừng kết nối. Không thể nhắn tin trực tiếp.'
                : 'Người dùng này đã tạm ngừng kết nối với bạn. Không thể nhắn tin trực tiếp.'
              : undefined
          }
        />
      </div>

      <EditMessageDialog
        open={!!editingMessage}
        onOpenChange={(open) => {
          if (!open) setEditingMessage(null);
        }}
        initialValue={editingMessage?.content || ''}
        isSaving={editMessage.isPending}
        onSave={async (next) => {
          if (!editingMessage) return;
          try {
            await editMessage.mutateAsync({ messageId: editingMessage.id, content: next });
            setEditingMessage(null);
            toast.success('Đã cập nhật');
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Không thể sửa tin nhắn');
          }
        }}
      />

      <ReportDialog
        open={showReport}
        onOpenChange={(open) => {
          setShowReport(open);
          if (!open) setReportTarget(null);
        }}
        onSubmit={async (reason: string, details: string) => {
          if (!reportTarget) return;
          try {
            await createReport.mutateAsync({
              reportedUserId: reportTarget.sender_id,
              conversationId,
              messageId: reportTarget.id,
              reason,
              details,
            });
            toast.success('Đã gửi phản hồi');
            setShowReport(false);
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Gửi thất bại');
          }
        }}
      />

      {isGroup && conversation && (
        <GroupSettingsDialog
          open={showGroupSettings}
          onOpenChange={setShowGroupSettings}
          conversation={conversation}
          currentUserId={userId}
          onUpdate={async () => { refetchConversation(); }}
          onLeave={async () => { navigate('/chat'); }}
        />
      )}

      {dmOtherUserId && (
        <BlockUserDialog
          open={showBlockDialog}
          onOpenChange={setShowBlockDialog}
          username={headerName}
          isBlocking={blockUser.isPending || unblockUser.isPending}
          mode={isDmBlockedByMe ? 'unblock' : 'block'}
          onConfirm={async () => {
            try {
              if (isDmBlockedByMe) {
                await unblockUser.mutateAsync(dmOtherUserId);
                toast.success('Đã kết nối lại');
              } else {
                await blockUser.mutateAsync(dmOtherUserId);
                toast.success('Đã tạm ngừng kết nối');
              }
              setShowBlockDialog(false);
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : 'Thao tác thất bại');
            }
          }}
        />
      )}

      {/* Delete conversation confirm */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa cuộc trò chuyện</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa cuộc trò chuyện này? Bạn sẽ không còn thấy cuộc trò chuyện trong danh sách.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  if (!userId) return;
                  const { error } = await supabase
                    .from('conversation_participants')
                    .update({ left_at: new Date().toISOString() })
                    .eq('conversation_id', conversationId)
                    .eq('user_id', userId);
                  if (error) throw error;
                  queryClient.invalidateQueries({ queryKey: ['conversations', userId] });
                  toast.success('Đã xóa cuộc trò chuyện');
                  navigate('/chat');
                } catch (e: unknown) {
                  toast.error(e instanceof Error ? e.message : 'Không thể xóa cuộc trò chuyện');
                }
              }}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Call Room - shown when a call is active */}
      {callState !== 'idle' && (
        <CallRoom
          isOpen={true}
          callState={callState}
          callType={callType}
          callDuration={callDuration}
          localVideoTrack={localVideoTrack}
          screenTrack={screenTrack}
          remoteUsers={remoteUsers}
          isMuted={isMuted}
          isCameraOff={isCameraOff}
          isScreenSharing={isScreenSharing}
          localUserInfo={{
            username: username || 'Bạn',
          }}
          remoteUserInfo={{
            username: headerName || 'Người dùng',
            avatarUrl: headerAvatar || undefined,
          }}
          onToggleMute={toggleMute}
          onToggleCamera={toggleCamera}
          onToggleScreenShare={toggleScreenShare}
          onSwitchToVideo={switchToVideo}
          onFlipCamera={flipCamera}
          onEndCall={endCall}
        />
      )}

      {/* Incoming Call Dialog */}
      {incomingCall && (
        <IncomingCallDialog
          callSession={incomingCall}
          onAnswer={answerCall}
          onDecline={declineCall}
        />
      )}
    </div>
  );
}
