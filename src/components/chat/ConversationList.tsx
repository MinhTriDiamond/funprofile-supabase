import { Conversation, ConversationParticipant } from '@/hooks/useConversations';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { vi, enUS, zhCN, ja, ko, th, id, fr, es, de, pt, ru, ar } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/i18n/LanguageContext';
import { Users } from 'lucide-react';
import type { Locale } from 'date-fns';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  currentUserId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
}

const dateLocales: Record<string, Locale> = {
  vi, en: enUS, zh: zhCN, ja, ko, th, id, fr, es, de, pt, ru, ar
};

export function ConversationList({
  conversations,
  selectedId,
  currentUserId,
  onSelect,
  isLoading,
}: ConversationListProps) {
  const { t, language } = useLanguage();
  const dateLocale = dateLocales[language] || enUS;

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-muted-foreground">
        <p>{t('noConversations')}</p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-2">
        {conversations.map((conversation) => {
          const isGroup = conversation.type === 'group';
          const otherParticipant = conversation.participants?.find(
            (p: ConversationParticipant) => p.user_id !== currentUserId && !p.left_at
          );
          const profile = otherParticipant?.profile;
          const participantCount = conversation.participants?.filter(
            (p: ConversationParticipant) => !p.left_at
          ).length || 0;

          const displayName = isGroup
            ? conversation.name
            : profile?.username || t('user');

          const avatarUrl = isGroup
            ? conversation.avatar_url
            : profile?.avatar_url;

          return (
            <button
              key={conversation.id}
              onClick={() => onSelect(conversation.id)}
              className={cn(
                'w-full flex items-center gap-3 p-3 rounded-full text-left transition-all duration-300 border hover:bg-white hover:shadow-[0_0_12px_rgba(34,197,94,0.5)]',
                selectedId === conversation.id ? 'bg-primary/10 border-[#C9A84C]/60' : 'border-transparent hover:border-[#C9A84C]/40'
              )}
            >
              <div className="relative">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={avatarUrl || undefined} alt={displayName || ''} />
                  <AvatarFallback>
                    {isGroup ? (
                      <Users className="h-5 w-5" />
                    ) : (
                      (displayName || 'U')[0].toUpperCase()
                    )}
                  </AvatarFallback>
                </Avatar>
                {isGroup && (
                  <div className="absolute -bottom-1 -right-1 bg-primary rounded-full p-0.5">
                    <Users className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{displayName}</span>
                    {isGroup && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {participantCount}
                      </Badge>
                    )}
                  </div>
                  {conversation.last_message_at && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatDistanceToNow(new Date(conversation.last_message_at), {
                        addSuffix: false,
                        locale: dateLocale,
                      })}
                    </span>
                  )}
                </div>
                {conversation.last_message_preview && (
                  <p className="text-sm text-muted-foreground truncate">
                    {conversation.last_message_preview}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
