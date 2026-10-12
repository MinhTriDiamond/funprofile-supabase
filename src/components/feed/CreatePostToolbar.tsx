/**
 * CreatePostToolbar - mobile-first composer action bar.
 */
import { useLanguage } from '@/i18n/LanguageContext';
import { Bot, Gift, ImagePlus, MapPin, Mic, Radio, SmilePlus, UserPlus } from 'lucide-react';
import type React from 'react';
import { EmojiPicker } from './EmojiPicker';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CreatePostActionButton } from './CreatePostActionButton';

interface CreatePostToolbarProps {
  loading: boolean;
  taggedFriendsCount: number;
  hasLocation: boolean;
  onShowMediaUpload: () => void;
  onShowFriendTag: () => void;
  onShowLocation: () => void;
  onShowFeeling: () => void;
  onShowLive: () => void;
  onShowAi: () => void;
  onShowVoice: () => void;
  onShowGiftCoin: () => void;
  onEmojiSelect: (emoji: string) => void;
}

type ToolbarAction = {
  key: string;
  label: string;
  tooltip: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  active?: boolean;
  onClick: () => void;
};

export const CreatePostToolbar = ({
  loading,
  taggedFriendsCount,
  hasLocation,
  onShowMediaUpload,
  onShowFriendTag,
  onShowLocation,
  onShowFeeling,
  onShowLive,
  onShowAi,
  onShowVoice,
  onShowGiftCoin,
  onEmojiSelect,
}: CreatePostToolbarProps) => {
  const { t } = useLanguage();
  const actions: ToolbarAction[] = [
    { key: 'media', label: t('photoVideo'), tooltip: t('addPhotoVideo'), icon: ImagePlus, color: '#22c55e', onClick: onShowMediaUpload },
    { key: 'feeling', label: t('cptFeeling'), tooltip: t('cptAddFeeling'), icon: SmilePlus, color: '#f59e0b', onClick: onShowFeeling },
    { key: 'location', label: t('cptLocation'), tooltip: t('cptAddLocation'), icon: MapPin, color: '#ef4444', active: hasLocation, onClick: onShowLocation },
    { key: 'friends', label: t('privacyFriends'), tooltip: t('tagFriends'), icon: UserPlus, color: '#1877f2', active: taggedFriendsCount > 0, onClick: onShowFriendTag },
    { key: 'voice', label: t('cptVoice'), tooltip: t('cptVoiceSoon'), icon: Mic, color: '#8b5cf6', onClick: onShowVoice },
    { key: 'live', label: t('cptLive'), tooltip: t('cptStartLive'), icon: Radio, color: '#ef4444', onClick: onShowLive },
    { key: 'ai', label: t('cptAi'), tooltip: t('cptAiHelp'), icon: Bot, color: '#10b981', onClick: onShowAi },
    { key: 'gift', label: t('cptGiftCoin'), tooltip: t('cptGiftSoon'), icon: Gift, color: '#d97706', onClick: onShowGiftCoin },
  ];

  return (
    <div className="rounded-3xl border border-border/70 bg-card/85 p-3 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">{t('cptAddToPost')}</span>
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex rounded-full transition-transform duration-200 hover:scale-105">
                <EmojiPicker onEmojiSelect={onEmojiSelect} />
              </span>
            </TooltipTrigger>
            <TooltipContent>{t('cptQuickFeeling')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <TooltipProvider delayDuration={120}>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Tooltip key={action.key}>
                <TooltipTrigger asChild>
                  <CreatePostActionButton
                    onClick={action.onClick}
                    icon={<Icon style={{ color: action.color }} />}
                    label={action.label}
                    active={action.active}
                    disabled={loading}
                    variant="toolbar"
                    className="min-w-[96px]"
                  />
                </TooltipTrigger>
                <TooltipContent>{action.tooltip}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
};
