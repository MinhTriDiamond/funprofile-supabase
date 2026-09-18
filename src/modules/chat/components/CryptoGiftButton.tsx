
import React, { useState } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { SendCryptoModal } from './SendCryptoModal';

interface CryptoGiftButtonProps {
  recipientAddress?: string | null;
  recipientBtcAddress?: string | null;
  recipientUserId?: string | null;
  recipientName?: string | null;
  recipientAvatar?: string | null;
  conversationId?: string | null;
  disabled?: boolean;
}

class CryptoGiftErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    toast.error('Wallet system not ready. Please refresh or reconnect.');
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

export function CryptoGiftButton({ 
  recipientAddress,
  recipientBtcAddress,
  recipientUserId,
  recipientName,
  recipientAvatar,
  conversationId,
  disabled,
}: CryptoGiftButtonProps) {
  const [open, setOpen] = useState(false);
  const isDisabled = disabled || !recipientAddress;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0 border border-[#C9A84C]/30 hover:border-[#C9A84C]/60 rounded-full"
              onClick={() => setOpen(true)}
              disabled={isDisabled}
            >
              <Wallet className="h-5 w-5 text-gold" />
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Send crypto gift</TooltipContent>
      </Tooltip>

      <CryptoGiftErrorBoundary>
        <SendCryptoModal
          open={open}
          onOpenChange={setOpen}
          recipientUserId={recipientUserId || ''}
          recipientUsername={recipientName || 'Người dùng'}
          recipientWalletAddress={recipientAddress || null}
          recipientBtcAddress={recipientBtcAddress}
          conversationId={conversationId || ''}
          recipientAvatarUrl={recipientAvatar}
          recipientDisplayName={recipientName}
        />
      </CryptoGiftErrorBoundary>
    </>
  );
}
