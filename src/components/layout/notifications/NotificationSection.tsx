/**
 * NotificationSection - Section with title for grouped notifications
 */

import { cn } from '@/lib/utils';
import type { NotificationWithDetails } from './types';
import { NotificationItem } from './NotificationItem';
import { FriendRequestItem } from './FriendRequestItem';
import { getSectionTitle } from './utils';
import type { NotificationGroups } from './types';
import { useLanguage } from '@/i18n/LanguageContext';

interface NotificationSectionProps {
  sectionKey: keyof NotificationGroups;
  notifications: NotificationWithDetails[];
  onNotificationClick: (notification: NotificationWithDetails) => void;
  onAcceptFriendRequest: (notification: NotificationWithDetails) => Promise<void>;
  onRejectFriendRequest: (notification: NotificationWithDetails) => Promise<void>;
}

export function NotificationSection({
  sectionKey,
  notifications,
  onNotificationClick,
  onAcceptFriendRequest,
  onRejectFriendRequest,
}: NotificationSectionProps) {
  const { t } = useLanguage();
  if (notifications.length === 0) return null;

  const title = getSectionTitle(sectionKey, t);

  return (
    <div>
      {/* Section header */}
      <div className="px-4 py-2 bg-muted/30 border-b border-border/30">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>

      {/* Notifications */}
      {notifications.map((notification) => {
        if (notification.type === 'friend_request') {
          return (
            <FriendRequestItem
              key={notification.id}
              notification={notification}
              onAccept={onAcceptFriendRequest}
              onReject={onRejectFriendRequest}
              onNavigate={onNotificationClick}
            />
          );
        }

        return (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onClick={onNotificationClick}
          />
        );
      })}
    </div>
  );
}
