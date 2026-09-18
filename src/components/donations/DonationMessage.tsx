import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DonationSuccessCard, DonationCardData } from './DonationSuccessCard';
import { getBscScanTxUrl } from '@/lib/bscScanHelpers';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { Gift, ExternalLink, Sparkles } from 'lucide-react';

interface DonationMetadata {
  donation_id: string;
  amount: string;
  token_symbol: string;
  message?: string | null;
  tx_hash: string;
  sender_username: string;
  sender_avatar_url?: string | null;
  recipient_username: string;
  recipient_avatar_url?: string | null;
  light_score_earned?: number;
  created_at: string;
}

interface DonationMessageProps {
  metadata: DonationMetadata;
  isOwn: boolean;
}

export const DonationMessage = ({ metadata, isOwn }: DonationMessageProps) => {
  const [showCard, setShowCard] = useState(false);
  const dateLocale = useDateLocale();

  const cardData: DonationCardData = {
    id: metadata.donation_id,
    amount: metadata.amount,
    tokenSymbol: metadata.token_symbol,
    senderUsername: metadata.sender_username,
    senderAvatarUrl: metadata.sender_avatar_url,
    recipientUsername: metadata.recipient_username,
    recipientAvatarUrl: metadata.recipient_avatar_url,
    message: metadata.message,
    txHash: metadata.tx_hash,
    lightScoreEarned: metadata.light_score_earned || 0,
    createdAt: metadata.created_at,
  };

  return (
    <>
      <button
        onClick={() => setShowCard(true)}
        className={cn(
          'w-full max-w-[280px] p-4 rounded-2xl text-left transition-all hover:scale-[1.02] shadow-lg',
          isOwn
            ? 'bg-gradient-to-br from-gold/30 to-amber-500/20 border border-gold/50 rounded-br-md'
            : 'bg-gradient-to-br from-gold/20 to-amber-500/10 border border-gold/30 rounded-bl-md'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-gold/20 flex items-center justify-center">
            <Gift className="w-4 h-4 text-gold" />
          </div>
          <span className="font-semibold text-gold text-sm">🎁 Tặng thưởng</span>
        </div>

        {/* Amount */}
        <div className="text-center py-3 px-4 rounded-xl bg-background/50 mb-3">
          <div className="text-2xl font-bold text-gold flex items-center justify-center gap-1">
            <Sparkles className="w-5 h-5" />
            {Number(metadata.amount).toLocaleString()} {metadata.token_symbol}
          </div>
        </div>

        {/* From/To */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Từ:</span>
            <Avatar className="w-5 h-5">
              <AvatarImage src={metadata.sender_avatar_url || undefined} />
              <AvatarFallback className="text-[10px]">
                {metadata.sender_username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">@{metadata.sender_username}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Đến:</span>
            <Avatar className="w-5 h-5">
              <AvatarImage src={metadata.recipient_avatar_url || undefined} />
              <AvatarFallback className="text-[10px]">
                {metadata.recipient_username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">@{metadata.recipient_username}</span>
          </div>
        </div>

        {/* Message */}
        {metadata.message && (
          <p className="mt-3 text-sm italic text-muted-foreground border-l-2 border-gold/50 pl-2">
            "{metadata.message}"
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gold/20">
          <span className="text-[10px] text-muted-foreground">
            {format(new Date(metadata.created_at), 'HH:mm dd/MM', { locale: dateLocale })}
          </span>
          <a
            href={getBscScanTxUrl(metadata.tx_hash, metadata.token_symbol)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            BSCScan
          </a>
        </div>

        {/* Tap hint */}
        <div className="text-center mt-2">
          <span className="text-[10px] text-muted-foreground">Nhấn để xem chi tiết</span>
        </div>
      </button>

      {/* Full Card Dialog */}
      <DonationSuccessCard
        isOpen={showCard}
        onClose={() => setShowCard(false)}
        data={cardData}
      />
    </>
  );
};
