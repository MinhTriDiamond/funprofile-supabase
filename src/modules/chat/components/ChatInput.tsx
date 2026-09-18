
import { Component, useState, useRef, useCallback, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Paperclip, Send, X, Gift, Wallet, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uploadCommentMedia } from '@/utils/mediaUpload';
import { toast } from 'sonner';
import { EmojiPicker } from '@/components/feed/EmojiPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { lazyNamedWithChunkRecovery } from '@/lib/appUpdateRecovery';
import { OptionalWeb3Provider } from '@/components/providers/OptionalWeb3Provider';

// Lazy — không kéo wagmi vào bundle chat
const UnifiedGiftSendDialog = lazyNamedWithChunkRecovery(
  () => import('@/components/donations/UnifiedGiftSendDialog'),
  'UnifiedGiftSendDialog',
);

class ChatGiftBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[ChatInput] Crypto gift dialog unavailable.', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-x-4 bottom-20 z-[100] mx-auto max-w-sm rounded-xl border border-primary/20 bg-card p-4 text-sm text-card-foreground shadow-lg">
          Tính năng ví đang cần cập nhật, vui lòng tải lại trang.
        </div>
      );
    }

    return this.props.children;
  }
}

import type { Message } from '../types';
import type { Sticker } from '../types';
import { StickerPicker } from './StickerPicker';
import { RedEnvelopeDialog } from './RedEnvelopeDialog';
import { AttachmentPreviewDialog } from './AttachmentPreviewDialog';

interface ChatInputProps {
  onSend: (content: string, mediaUrls?: string[]) => Promise<void>;
  onSendSticker?: (sticker: Sticker) => Promise<void>;
  onCreateRedEnvelope?: (input: { token: 'CAMLY' | 'BNB'; totalAmount: number; totalCount: number }) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
  replyTo: Message | null;
  onCancelReply: () => void;
  isSending: boolean;
  recipientWalletAddress?: string | null;
  recipientBtcAddress?: string | null;
  recipientUserId?: string | null;
  recipientName?: string | null;
  recipientAvatar?: string | null;
  conversationId?: string | null;
  isGroup?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export function ChatInput({
  onSend,
  onSendSticker,
  onCreateRedEnvelope,
  onTyping,
  replyTo,
  onCancelReply,
  isSending,
  recipientWalletAddress,
  recipientBtcAddress,
  recipientUserId,
  recipientName,
  recipientAvatar,
  conversationId,
  isGroup = false,
  disabled = false,
  disabledReason,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showRedEnvelope, setShowRedEnvelope] = useState(false);
  const [isCreatingEnvelope, setIsCreatingEnvelope] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [showAttachPreview, setShowAttachPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isImageFile = (file: File | undefined) => {
    if (!file) return false;
    if (file.type.startsWith('image/')) return true;
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic'].includes(ext || '');
  };

  const isVideoFile = (file: File | undefined) => {
    if (!file) return false;
    if (file.type.startsWith('video/')) return true;
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'mov', 'm4v'].includes(ext || '');
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    onTyping(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Limit to 4 files
    const newFiles = files.slice(0, 4 - mediaFiles.length);
    if (files.length > newFiles.length) {
      toast.warning('Tối đa 4 file mỗi tin nhắn');
    }

    // Create previews for images/videos only
    const newPreviews = newFiles.map((file) =>
      isImageFile(file) || isVideoFile(file)
        ? URL.createObjectURL(file)
        : ''
    );
    
    setMediaFiles((prev) => [...prev, ...newFiles]);
    setMediaPreviews((prev) => [...prev, ...newPreviews]);

    // Open preview dialog when files are selected
    if (newFiles.length > 0) {
      setShowAttachPreview(true);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeMedia = (index: number) => {
    if (mediaPreviews[index]) {
      URL.revokeObjectURL(mediaPreviews[index]);
    }
    setMediaFiles((prev) => prev.filter((_, i) => i !== index));
    setMediaPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendWithMedia = async (captionText: string, filesToUpload: File[]) => {
    try {
      setIsUploading(true);
      let uploadedUrls: string[] = [];
      if (filesToUpload.length > 0) {
        const uploadPromises = filesToUpload.map((file) => uploadCommentMedia(file));
        const results = await Promise.all(uploadPromises);
        uploadedUrls = results.map((r) => r.url);
      }
      await onSend(captionText, uploadedUrls.length > 0 ? uploadedUrls : undefined);
      // Clear
      setContent('');
      setMediaFiles([]);
      mediaPreviews.forEach((url) => URL.revokeObjectURL(url));
      setMediaPreviews([]);
      setShowAttachPreview(false);
      onTyping(false);
    } catch (error) {
      console.error('Error sending message:', error);
      if (error instanceof Error && error.message === 'FILE_TYPE_NOT_SUPPORTED') {
        toast.error('File này chưa được hỗ trợ hoặc thiếu MIME. Vui lòng thử lại hoặc đổi định dạng.');
      } else {
        toast.error('Không thể gửi tin nhắn');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleSend = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent && mediaFiles.length === 0) return;
    await handleSendWithMedia(trimmedContent, mediaFiles);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEmojiSelect = useCallback((emoji: string) => {
    setContent((prev) => prev + emoji);
    textareaRef.current?.focus();
  }, []);

  const isDisabled = isSending || isUploading;
  const canSend = (content.trim() || mediaFiles.length > 0) && !isDisabled && !disabled;

  return (
    <div className="border-t bg-card p-3">
      {disabled && disabledReason && (
        <div className="mb-2 text-xs text-destructive">{disabledReason}</div>
      )}
      {!isGroup && !recipientWalletAddress && (
        <div className="mb-2 text-xs text-muted-foreground">
          Người dùng chưa cập nhật ví Web3. Không thể tặng tiền.
        </div>
      )}
      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-muted rounded-lg">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              Trả lời {replyTo.sender?.username}
            </p>
            <p className="text-sm truncate">{replyTo.content}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCancelReply}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Attachment preview dialog (Telegram-style) */}
      <AttachmentPreviewDialog
        open={showAttachPreview && mediaFiles.length > 0}
        files={mediaFiles}
        onClose={() => {
          setShowAttachPreview(false);
          setMediaFiles([]);
          mediaPreviews.forEach((url) => URL.revokeObjectURL(url));
          setMediaPreviews([]);
        }}
        onSend={(caption) => handleSendWithMedia(caption, mediaFiles)}
        onAddMore={() => fileInputRef.current?.click()}
        onRemoveFile={(index) => removeMedia(index)}
        isSending={isUploading}
      />

      {/* Input area */}
      <div className="flex items-end gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.apk"
          multiple
          className="hidden"
        />

        {/* Attach menu popup (Paperclip) */}
        <Popover open={showAttachMenu} onOpenChange={setShowAttachMenu}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 border border-[#C9A84C]/30 hover:border-[#C9A84C]/60 rounded-full"
              disabled={isDisabled || disabled}
              title="Đính kèm"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-52 p-1">
            <div className="flex flex-col">
              {/* Đính kèm file */}
              <button
                onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                disabled={mediaFiles.length >= 4}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent text-sm text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                Đính kèm file
              </button>

              {/* Stickers */}
              <button
                onClick={() => { setShowAttachMenu(false); setTimeout(() => setShowStickerPicker(true), 100); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent text-sm text-left"
              >
                <Layers className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                Stickers
              </button>



              {/* Crypto Gift — chỉ hiện khi không phải group */}
              {!isGroup && (
                <button
                  onClick={() => { setShowCryptoModal(true); setShowAttachMenu(false); }}
                  disabled={!recipientWalletAddress}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent text-sm text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Wallet className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  Crypto Gift
                </button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <EmojiPicker onEmojiSelect={handleEmojiSelect} />

        {/* StickerPicker controlled từ state */}
        {showStickerPicker && (
          <div className="absolute bottom-full mb-2 left-0 z-50 bg-card border rounded-lg shadow-lg">
            <StickerPicker
              onSelect={async (sticker) => {
                if (!onSendSticker) return;
                await onSendSticker(sticker);
                setShowStickerPicker(false);
              }}
            />
          </div>
        )}

        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
          placeholder="Nhập tin nhắn..."
          className="min-h-[40px] max-h-[120px] resize-none flex-1"
          rows={1}
          disabled={isDisabled || disabled}
        />

        <Button
          size="icon"
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            'flex-shrink-0 transition-colors',
            canSend && 'bg-primary hover:bg-primary/90'
          )}
        >
          <Send className="h-5 w-5" />
        </Button>
      </div>

      <RedEnvelopeDialog
        open={showRedEnvelope}
        onOpenChange={setShowRedEnvelope}
        onSubmit={async (input) => {
          if (!onCreateRedEnvelope) return;
          try {
            setIsCreatingEnvelope(true);
            await onCreateRedEnvelope(input);
            setShowRedEnvelope(false);
          } finally {
            setIsCreatingEnvelope(false);
          }
        }}
      />

      {showCryptoModal && (
        <ChatGiftBoundary>
          <Suspense fallback={null}>
            <OptionalWeb3Provider>
              <UnifiedGiftSendDialog
                isOpen={showCryptoModal}
                onClose={() => setShowCryptoModal(false)}
                mode="wallet"
                presetRecipient={{
                  id: recipientUserId || undefined,
                  username: recipientName || undefined,
                  displayName: recipientName || undefined,
                  avatarUrl: recipientAvatar || undefined,
                  walletAddress: recipientWalletAddress || undefined,
                  btcAddress: (recipientBtcAddress as string) || undefined,
                }}
              />
            </OptionalWeb3Provider>
          </Suspense>
        </ChatGiftBoundary>
      )}
    </div>
  );
}
