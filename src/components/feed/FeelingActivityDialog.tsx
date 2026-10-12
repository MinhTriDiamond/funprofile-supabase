import { useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { ChevronLeft, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Danh sách cảm xúc theo Facebook
const FEELINGS = [
  { emoji: '😊', labelKey: 'feelHappy' },
  { emoji: '🥰', labelKey: 'feelBlessed' },
  { emoji: '😍', labelKey: 'feelLoved' },
  { emoji: '😢', labelKey: 'fadFeelingSad' },
  { emoji: '🥺', labelKey: 'feelLovely' },
  { emoji: '🙏', labelKey: 'feelGrateful' },
  { emoji: '🤩', labelKey: 'feelExcited' },
  { emoji: '💕', labelKey: 'feelInLove' },
  { emoji: '🤪', labelKey: 'feelCrazy' },
  { emoji: '😲', labelKey: 'feelAppreciative' },
  { emoji: '😄', labelKey: 'feelJoyful' },
  { emoji: '✨', labelKey: 'fadFeelingFantastic' },
  { emoji: '😌', labelKey: 'feelRelaxed' },
  { emoji: '💪', labelKey: 'feelStrong' },
  { emoji: '🎉', labelKey: 'feelThrilled' },
  { emoji: '😴', labelKey: 'feelTired' },
  { emoji: '😤', labelKey: 'fadFeelingAngry' },
  { emoji: '🤔', labelKey: 'feelThoughtful' },
  { emoji: '😎', labelKey: 'fadFeelingCool' },
  { emoji: '🥳', labelKey: 'feelFun' },
  { emoji: '😇', labelKey: 'fadFeelingLucky' },
  { emoji: '🤗', labelKey: 'feelWarm' },
  { emoji: '😋', labelKey: 'fadFeelingYummy' },
  { emoji: '🥱', labelKey: 'feelSleepy' },
];

const ACTIVITIES = [
  { emoji: '🎉', labelKey: 'actCelebrating' },
  { emoji: '👀', labelKey: 'actWatching' },
  { emoji: '🎮', labelKey: 'actPlaying' },
  { emoji: '🎧', labelKey: 'actListening' },
  { emoji: '🍽️', labelKey: 'actEating' },
  { emoji: '☕', labelKey: 'actDrinking' },
  { emoji: '✈️', labelKey: 'actTravelingTo' },
  { emoji: '📚', labelKey: 'actReading' },
  { emoji: '💼', labelKey: 'actWorking' },
  { emoji: '🏃', labelKey: 'actExercising' },
  { emoji: '🛒', labelKey: 'actShopping' },
  { emoji: '🎬', labelKey: 'actMovie' },
  { emoji: '🎤', labelKey: 'actSinging' },
  { emoji: '💻', labelKey: 'actCoding' },
  { emoji: '🎨', labelKey: 'actPainting' },
  { emoji: '📝', labelKey: 'actWriting' },
  { emoji: '🧘', labelKey: 'actMeditating' },
  { emoji: '🎸', labelKey: 'actMusic' },
  { emoji: '🏠', labelKey: 'actAtHome' },
  { emoji: '🌙', labelKey: 'actSleeping' },
];

export interface FeelingActivity {
  emoji: string;
  label: string;
  type: 'feeling' | 'activity';
}

interface FeelingActivityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (feeling: FeelingActivity) => void;
}

export const FeelingActivityDialog = ({ isOpen, onClose, onSelect }: FeelingActivityDialogProps) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'feeling' | 'activity'>('feeling');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = activeTab === 'feeling'
    ? FEELINGS.filter(f => t(f.labelKey).toLowerCase().includes(searchQuery.toLowerCase()))
    : ACTIVITIES.filter(a => t(a.labelKey).toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSelect = (item: { emoji: string; labelKey: string }) => {
    onSelect({ emoji: item.emoji, label: t(item.labelKey), type: activeTab });
    setSearchQuery('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[400px] p-0 max-h-[80vh] flex flex-col z-[200]">
        <DialogHeader className="p-4 border-b shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-secondary rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <DialogTitle className="flex-1 text-center font-bold pr-9">
              {t('fadTitle')}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b shrink-0">
          <button
            className={`flex-1 py-3 font-semibold transition-colors ${
              activeTab === 'feeling'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:bg-muted/50'
            }`}
            onClick={() => setActiveTab('feeling')}
          >
            {t('emotionsTitle')}
          </button>
          <button
            className={`flex-1 py-3 font-semibold transition-colors ${
              activeTab === 'activity'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:bg-muted/50'
            }`}
            onClick={() => setActiveTab('activity')}
          >
            {t('emojiActivities')}
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-full">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              placeholder={t('search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none flex-1 text-sm"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-1 p-3 overflow-y-auto flex-1">
          {filteredItems.map((item, index) => (
            <button
              key={`${item.emoji}-${index}`}
              onClick={() => handleSelect(item)}
              className="flex items-center gap-3 p-3 hover:bg-secondary rounded-lg transition-colors text-left"
            >
              <span className="text-2xl">{item.emoji}</span>
              <span className="text-sm">{t(item.labelKey)}</span>
            </button>
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-2 py-8 text-center text-muted-foreground">
              {t('noResults')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
