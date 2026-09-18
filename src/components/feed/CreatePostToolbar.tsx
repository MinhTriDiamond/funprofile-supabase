/**
 * CreatePostToolbar - mobile-first composer action bar.
 */
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
  const actions: ToolbarAction[] = [
    { key: 'media', label: 'Ảnh/Video', tooltip: 'Thêm ảnh/video', icon: ImagePlus, color: '#22c55e', onClick: onShowMediaUpload },
    { key: 'feeling', label: 'Cảm xúc', tooltip: 'Thêm cảm xúc', icon: SmilePlus, color: '#f59e0b', onClick: onShowFeeling },
    { key: 'location', label: 'Vị trí', tooltip: 'Thêm địa điểm', icon: MapPin, color: '#ef4444', active: hasLocation, onClick: onShowLocation },
    { key: 'friends', label: 'Bạn bè', tooltip: 'Gắn thẻ bạn bè', icon: UserPlus, color: '#1877f2', active: taggedFriendsCount > 0, onClick: onShowFriendTag },
    { key: 'voice', label: 'Voice', tooltip: 'Voice sẽ sớm ra mắt', icon: Mic, color: '#8b5cf6', onClick: onShowVoice },
    { key: 'live', label: 'Live', tooltip: 'Bắt đầu live', icon: Radio, color: '#ef4444', onClick: onShowLive },
    { key: 'ai', label: 'AI', tooltip: 'AI hỗ trợ viết bài', icon: Bot, color: '#10b981', onClick: onShowAi },
    { key: 'gift', label: 'Tặng Coin', tooltip: 'Tặng Coin sẽ sớm ra mắt', icon: Gift, color: '#d97706', onClick: onShowGiftCoin },
  ];

  return (
    <div className="rounded-3xl border border-border/70 bg-card/85 p-3 shadow-sm backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-foreground">Thêm vào bài viết</span>
        <TooltipProvider delayDuration={120}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex rounded-full transition-transform duration-200 hover:scale-105">
                <EmojiPicker onEmojiSelect={onEmojiSelect} />
              </span>
            </TooltipTrigger>
            <TooltipContent>Cảm xúc nhanh</TooltipContent>
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
