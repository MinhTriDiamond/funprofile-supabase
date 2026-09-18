import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Smile } from 'lucide-react';
import { TwemojiImage } from '@/components/ui/TwemojiImage';
import { useLanguage } from '@/i18n/LanguageContext';

const EMOJI_DATA = {
  emojiSmileys: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐'],
  emojiGestures: ['👍', '👎', '👊', '✊', '🤛', '🤜', '🤝', '👏', '🙌', '👐', '🤲', '🤞', '✌️', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '💪', '🙏'],
  emojiHearts: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
  emojiActivities: ['🎉', '🎊', '🎂', '🎁', '🎈', '🎄', '🎃', '🎗️', '🏆', '🥇', '🥈', '🥉', '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎮', '🎯', '🎲'],
  emojiFood: ['🍕', '🍔', '🍟', '🌭', '🍿', '🧂', '🥓', '🥚', '🍳', '🧇', '🥞', '🧈', '🍞', '🥐', '🥖', '🥨', '🧀', '🥗', '🍱', '🍜', '🍝', '🍰', '🎂', '🍩', '🍪', '🍫', '🍬', '☕', '🍵', '🥤', '🍺', '🍷'],
  emojiNature: ['🌸', '🌺', '🌻', '🌹', '🌷', '🌼', '💐', '🌱', '🌲', '🌳', '🌴', '🌵', '🍀', '🍁', '🍂', '🍃', '🌿', '☀️', '🌙', '⭐', '🌈', '☁️', '⛈️', '❄️', '🔥', '💧'],
};

type EmojiCategoryKey = keyof typeof EMOJI_DATA;

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
}

export const EmojiPicker = ({ onEmojiSelect }: EmojiPickerProps) => {
  const [selectedCategory, setSelectedCategory] = useState<EmojiCategoryKey>('emojiSmileys');
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useLanguage();

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji);
    setIsOpen(false);
  };

  const categoryKeys = Object.keys(EMOJI_DATA) as EmojiCategoryKey[];

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <PopoverTrigger asChild>
        <button type="button" className="w-9 h-9 rounded-full hover:bg-secondary flex items-center justify-center transition-colors">
          <Smile className="w-6 h-6 text-gold" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 z-[9999]" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Category Tabs */}
        <div className="flex gap-1 p-2 border-b border-border overflow-x-auto scrollbar-none">
          {categoryKeys.map((catKey) => (
            <Button
              key={catKey}
              variant={selectedCategory === catKey ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setSelectedCategory(catKey)}
              className="text-xs whitespace-nowrap"
            >
              {t(catKey)}
            </Button>
          ))}
        </div>

        {/* Emoji Grid */}
        <div className="p-2 grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
          {EMOJI_DATA[selectedCategory].map((emoji, index) => (
            <button
              key={index}
              onClick={() => handleEmojiClick(emoji)}
              className="w-8 h-8 flex items-center justify-center hover:bg-secondary rounded transition-all hover:scale-110"
            >
              <TwemojiImage emoji={emoji} size={22} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
