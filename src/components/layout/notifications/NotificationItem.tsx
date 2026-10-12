/**
 * NotificationItem - Single notification display component
 * Supports collapsible details for fraud notifications + red alert avatar
 */

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/hooks/useDateLocale';
import { cn } from '@/lib/utils';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import type { NotificationWithDetails } from './types';
import { getNotificationIcon, getNotificationText } from './utils';
import funLogo from '@/assets/fun-profile-logo.png';
import { useLanguage } from '@/i18n/LanguageContext';

const FRAUD_TYPES = ['admin_shared_device', 'admin_email_farm', 'admin_blacklisted_ip', 'admin_fraud_daily'];
const SYSTEM_TYPES = ['epoch_claim_ready', 'epoch_reset_info', 'reward_adjustment', 'reward_approved', 'reward_rejected', 'claim_reward', 'account_banned', 'mint_request_rejected', 'fun_mint_signed', 'fun_mint_confirmed'];

/** Render detailed fraud info when expanded */
function FraudDetails({ notification }: { notification: NotificationWithDetails }) {
  const m = notification.metadata;
  if (!m) return null;

  const formatUser = (name: string) => {
    const email = m.flagged_emails?.[name];
    return email ? `${name} (${email})` : name;
  };

  const items: string[] = [];

  if (notification.type === 'admin_shared_device' && m.usernames?.length) {
    items.push(...m.usernames.map(u => `• ${formatUser(u)}`));
  } else if (notification.type === 'admin_email_farm') {
    if (m.usernames?.length) {
      items.push(...m.usernames.map(u => `• ${formatUser(u)}`));
    } else if (m.emails?.length) {
      items.push(...m.emails.map(e => `• ${e}`));
    }
  } else if (notification.type === 'admin_blacklisted_ip') {
    if (m.reason) items.push(`• ${m.reason}`);
    if (m.known_usernames?.length) {
      items.push(...m.known_usernames.map(u => `• ${formatUser(u)}`));
    }
  } else if (notification.type === 'admin_fraud_daily' && m.alerts?.length) {
    items.push(...m.alerts.map(a => `• ${a}`));
  }

  if (!items.length) return null;

  return (
    <div className="mt-1.5 text-xs text-muted-foreground space-y-0.5 max-h-32 overflow-y-auto">
      {items.map((item, i) => (
        <p key={i} className="leading-relaxed">{item}</p>
      ))}
    </div>
  );
}

interface NotificationItemProps {
  notification: NotificationWithDetails;
  onClick: (notification: NotificationWithDetails) => void;
}

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const [expanded, setExpanded] = useState(false);
  const dateLocale = useDateLocale();
  const { t, language } = useLanguage();
  const isFraud = FRAUD_TYPES.includes(notification.type);
  const isSystem = SYSTEM_TYPES.includes(notification.type);

  const { main: notificationText, snippet } = getNotificationText(
    notification.type,
    notification.actor?.username || t('notifGenericUser'),
    notification.post?.content,
    notification.metadata,
    t,
    language
  );

  const toggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => !prev);
  };

  return (
    <button
      onClick={() => onClick(notification)}
      className={cn(
        "w-full p-3 sm:p-4 flex items-start gap-3 hover:bg-muted/50 transition-all duration-200 border-b border-border/30 text-left",
        !notification.read && "bg-gradient-to-r from-gold/10 via-gold/5 to-transparent shadow-[inset_0_0_20px_hsl(var(--gold-glow)/0.1)]"
      )}
    >
      {/* Avatar: Red alert for fraud, normal for others */}
      <div className="relative flex-shrink-0">
        {isFraud ? (
          <div className={cn(
            "w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center",
            "bg-gradient-to-br from-destructive to-destructive/80 border-2 border-destructive/60",
            !notification.read && "animate-pulse shadow-[0_0_12px_hsl(0_84%_60%/0.5)]"
          )}>
            <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
        ) : (
          <>
            <Avatar className={cn(
              "w-10 h-10 sm:w-12 sm:h-12 border-2 transition-all",
              !notification.read ? "border-gold/50 shadow-[0_0_10px_hsl(var(--gold-glow)/0.3)]" : "border-transparent"
            )}>
              <AvatarImage src={isSystem ? funLogo : notification.actor?.avatar_url || undefined} skipTransform={isSystem} />
              <AvatarFallback className="bg-primary/20 text-primary">
                {isSystem ? 'FR' : (notification.actor?.username?.[0]?.toUpperCase() || 'U')}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 sm:w-6 sm:h-6 bg-card rounded-full flex items-center justify-center border border-border shadow-sm">
              {getNotificationIcon(notification.type)}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm leading-relaxed",
          !notification.read ? "text-foreground" : "text-muted-foreground"
        )}>
          {notificationText}
        </p>
        
        {/* Post snippet */}
        {snippet && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">
            "{snippet}"
          </p>
        )}

        {/* Fraud: toggle details button */}
        {isFraud && (
          <button
            onClick={toggleExpand}
            className="mt-1 text-xs text-primary hover:text-primary/80 flex items-center gap-1 font-medium"
          >
            {expanded ? (
              <>{t('notifHideDetails')} <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>{t('notifShowDetails')} <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
        )}

        {/* Expanded fraud details */}
        {isFraud && expanded && <FraudDetails notification={notification} />}
        
        <p className={cn(
          "text-xs mt-1",
          !notification.read ? "text-gold" : "text-muted-foreground"
        )}>
          {formatDistanceToNow(new Date(notification.created_at), {
            addSuffix: true,
            locale: dateLocale
          })}
        </p>
      </div>

      {/* Unread indicator */}
      {!notification.read && (
        <div className="w-2.5 h-2.5 bg-gold rounded-full flex-shrink-0 mt-2 shadow-[0_0_8px_hsl(var(--gold-glow))] animate-pulse" />
      )}
    </button>
  );
}
