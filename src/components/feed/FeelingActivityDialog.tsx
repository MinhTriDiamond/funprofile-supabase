import { useState } from 'react';
import { ChevronLeft, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Danh sách cảm xúc theo Facebook
const FEELINGS = [
  { emoji: '😊', label: 'hạnh phúc' },
  { emoji: '🥰', label: 'có phúc' },
  { emoji: '😍', label: 'được yêu' },
  { emoji: '😢', label: 'buồn' },
  { emoji: '🥺', label: 'đáng yêu' },
  { emoji: '🙏', label: 'biết ơn' },
  { emoji: '🤩', label: 'hào hứng' },
  { emoji: '💕', label: 'đang yêu' },
  { emoji: '🤪', label: 'điên' },
  { emoji: '😲', label: 'cảm kích' },
  { emoji: '😄', label: 'sung sướng' },
  { emoji: '✨', label: 'tuyệt vời' },
  { emoji: '😌', label: 'thư thái' },
  { emoji: '💪', label: 'mạnh mẽ' },
  { emoji: '🎉', label: 'phấn khích' },
  { emoji: '😴', label: 'mệt mỏi' },
  { emoji: '😤', label: 'tức giận' },
  { emoji: '🤔', label: 'suy nghĩ' },
  { emoji: '😎', label: 'cool' },
  { emoji: '🥳', label: 'vui vẻ' },
  { emoji: '😇', label: 'may mắn' },
  { emoji: '🤗', label: 'ấm áp' },
  { emoji: '😋', label: 'ngon miệng' },
  { emoji: '🥱', label: 'buồn ngủ' },
];

const ACTIVITIES = [
  { emoji: '🎉', label: 'Đang ăn mừng' },
  { emoji: '👀', label: 'Đang xem' },
  { emoji: '🎮', label: 'Đang chơi' },
  { emoji: '🎧', label: 'Đang nghe' },
  { emoji: '🍽️', label: 'Đang ăn' },
  { emoji: '☕', label: 'Đang uống' },
  { emoji: '✈️', label: 'Đang đi đến' },
  { emoji: '📚', label: 'Đang đọc' },
  { emoji: '💼', label: 'Đang làm việc' },
  { emoji: '🏃', label: 'Đang tập thể dục' },
  { emoji: '🛒', label: 'Đang mua sắm' },
  { emoji: '🎬', label: 'Đang xem phim' },
  { emoji: '🎤', label: 'Đang hát' },
  { emoji: '💻', label: 'Đang code' },
  { emoji: '🎨', label: 'Đang vẽ' },
  { emoji: '📝', label: 'Đang viết' },
  { emoji: '🧘', label: 'Đang thiền' },
  { emoji: '🎸', label: 'Đang chơi nhạc' },
  { emoji: '🏠', label: 'Đang ở nhà' },
  { emoji: '🌙', label: 'Đang ngủ' },
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
  const [activeTab, setActiveTab] = useState<'feeling' | 'activity'>('feeling');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = activeTab === 'feeling'
    ? FEELINGS.filter(f => f.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : ACTIVITIES.filter(a => a.label.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleSelect = (item: { emoji: string; label: string }) => {
    onSelect({ ...item, type: activeTab });
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
              Bạn đang cảm thấy thế nào?
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
            Cảm xúc
          </button>
          <button
            className={`flex-1 py-3 font-semibold transition-colors ${
              activeTab === 'activity'
                ? 'text-primary border-b-2 border-primary'
                : 'text-muted-foreground hover:bg-muted/50'
            }`}
            onClick={() => setActiveTab('activity')}
          >
            Hoạt động
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-full">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              placeholder="Tìm kiếm"
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
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-2 py-8 text-center text-muted-foreground">
              Không tìm thấy kết quả
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
