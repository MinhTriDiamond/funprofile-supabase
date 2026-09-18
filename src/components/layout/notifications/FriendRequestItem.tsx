/**
 * FriendRequestItem - Friend request with inline actions
 */

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { cn } from '@/lib/utils';
import { UserPlus, X, Loader2 } from 'lucide-react';
import type { NotificationWithDetails } from './types';
import { useLanguage } from '@/i18n/LanguageContext';

interface FriendRequestItemProps {
  notification: NotificationWithDetails;
  onAccept: (notification: NotificationWithDetails) => Promise<void>;
  onReject: (notification: NotificationWithDetails) => Promise<void>;
  onNavigate: (notification: NotificationWithDetails) => void;
}

export function FriendRequestItem({ 
  notification, 
  onAccept, 
  onReject,
  onNavigate 
}: FriendRequestItemProps) {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isHandled, setIsHandled] = useState(false);
  const dateLocale = useDateLocale();
  const { t } = useLanguage();

  const handleAccept = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAccepting(true);
    try {
      await onAccept(notification);
      setIsHandled(true);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRejecting(true);
    try {
      await onReject(notification);
      setIsHandled(true);
    } finally {
      setIsRejecting(false);
    }
  };

  if (isHandled) {
    return null;
  }

  return (
    <div
      className={cn(
        "w-full p-3 sm:p-4 flex items-start gap-3 border-b border-border/30",
        !notification.read && "bg-gradient-to-r from-gold/10 via-gold/5 to-transparent shadow-[inset_0_0_20px_hsl(var(--gold-glow)/0.1)]"
      )}
    >
      {/* Avatar */}
      <button 
        onClick={() => onNavigate(notification)}
        className="relative flex-shrink-0"
      >
        <Avatar className={cn(
          "w-10 h-10 sm:w-12 sm:h-12 border-2 transition-all cursor-pointer hover:ring-2 hover:ring-primary/50",
          !notification.read ? "border-gold/50 shadow-[0_0_10px_hsl(var(--gold-glow)/0.3)]" : "border-transparent"
        )}>
          {notification.actor?.avatar_url && (
            <AvatarImage src={notification.actor.avatar_url} />
          )}
          <AvatarFallback className="bg-primary/20 text-primary">
            {notification.actor?.username?.[0]?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 bg-card rounded-full flex items-center justify-center border border-border shadow-sm">
          <UserPlus className="w-3 h-3 text-pink-500" />
        </div>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <button 
          onClick={() => onNavigate(notification)}
          className="text-left hover:underline"
        >
          <p className={cn(
            "text-sm leading-relaxed",
            !notification.read ? "text-foreground" : "text-muted-foreground"
          )}>
            <strong>{notification.actor?.username || t('notifGenericUser')}</strong> {t('friendReqSentence')}
          </p>
        </button>
        
        <p className={cn(
          "text-xs mt-1",
          !notification.read ? "text-gold" : "text-muted-foreground"
        )}>
          {formatDistanceToNow(new Date(notification.created_at), {
            addSuffix: true,
            locale: dateLocale
          })}
        </p>

        {/* Action buttons */}
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            onClick={handleAccept}
            disabled={isAccepting || isRejecting}
            className="h-8 px-4 bg-primary hover:bg-primary/90"
          >
            {isAccepting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              t('friendReqAccept')
            )}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleReject}
            disabled={isAccepting || isRejecting}
            className="h-8 px-4"
          >
            {isRejecting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <X className="w-4 h-4 mr-1" />
                {t('friendReqReject')}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Unread indicator */}
      {!notification.read && (
        <div className="w-2.5 h-2.5 bg-gold rounded-full flex-shrink-0 mt-2 shadow-[0_0_8px_hsl(var(--gold-glow))] animate-pulse" />
      )}
    </div>
  );
}
