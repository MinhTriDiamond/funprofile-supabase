import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ChevronLeft, ChevronRight, UserPlus, X, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";
import { PetMiniBadge } from "@/modules/pet/components/PetMiniBadge";

interface FriendCardData {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  created_at?: string;
  friendship_id?: string;
}

interface FriendCarouselProps {
  title: string;
  subtitle?: string;
  items: FriendCardData[];
  type: 'sent' | 'suggestion' | 'request';
  onAction?: (id: string, action: string) => void;
  onDismiss?: (id: string) => void;
  showMoreOptions?: boolean;
}

// Gradient backgrounds for users without avatars
const gradientColors = [
  'from-pink-200 to-pink-300',
  'from-green-200 to-green-300',
  'from-purple-200 to-purple-300',
  'from-blue-200 to-blue-300',
  'from-yellow-200 to-yellow-300',
  'from-orange-200 to-orange-300',
  'from-cyan-200 to-cyan-300',
  'from-indigo-200 to-indigo-300',
];

const getGradient = (index: number) => gradientColors[index % gradientColors.length];

export const FriendCarousel = ({
  title,
  subtitle,
  items,
  type,
  onAction,
  onDismiss,
  showMoreOptions = false,
}: FriendCarouselProps) => {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const checkScrollButtons = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 0);
      setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
      setTimeout(checkScrollButtons, 300);
    }
  };

  const getActionButton = (item: FriendCardData) => {
    switch (type) {
      case 'sent':
        return (
          <Button
            variant="outline"
            size="sm"
            className="w-full rounded-full text-sm h-9 border-border/50"
            onClick={() => onAction?.(item.friendship_id || item.id, 'cancel')}
          >
            Hủy lời mời
          </Button>
        );
      case 'request':
        return (
          <div className="space-y-2">
            <Button
              size="sm"
              className="w-full text-sm h-9"
              onClick={() => onAction?.(item.friendship_id || item.id, 'accept')}
            >
              Xác nhận
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full text-sm h-9"
              onClick={() => onAction?.(item.friendship_id || item.id, 'reject')}
            >
              Xóa
            </Button>
          </div>
        );
      case 'suggestion':
        return (
          <Button
            size="sm"
            className="w-full text-sm h-9"
            onClick={() => onAction?.(item.id, 'add')}
          >
            <UserPlus className="w-4 h-4 mr-1.5" />
            Thêm bạn bè
          </Button>
        );
      default:
        return null;
    }
  };

  if (items.length === 0) return null;

  return (
    <section className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {subtitle && (
            <p className="text-sm text-primary">{subtitle}</p>
          )}
        </div>
        {showMoreOptions && (
          <button className="p-2 rounded-full hover:bg-muted">
            <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Carousel Container */}
      <div className="relative group">
        {/* Left Arrow */}
        {showLeftArrow && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-card shadow-lg border border-border/50 flex items-center justify-center hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Scrollable Container */}
        <div
          ref={scrollRef}
          onScroll={checkScrollButtons}
          className="flex gap-3 overflow-x-auto scrollbar-hide px-4 pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex-shrink-0 w-[160px] bg-card/70 rounded-xl shadow-sm overflow-hidden border border-border/30"
            >
              {/* Avatar/Image Area */}
              <div className="relative aspect-square">
                {/* Status badge for sent requests */}
                {type === 'sent' && (
                  <div className="absolute top-2 left-2 z-10 px-2 py-1 bg-primary/90 text-primary-foreground text-xs font-medium rounded">
                    Đang chờ
                  </div>
                )}

                {/* Dismiss button for suggestions */}
                {type === 'suggestion' && onDismiss && (
                  <button
                    onClick={() => onDismiss(item.id)}
                    className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/70 transition-colors"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                )}

                <Avatar 
                  className="w-full h-full rounded-none cursor-pointer"
                  onClick={() => navigate(`/profile/${item.id}`)}
                >
                  <AvatarImage 
                    src={item.avatar_url || undefined} 
                    sizeHint="lg"
                    className="object-cover"
                  />
                  <AvatarFallback className={`rounded-none text-4xl font-bold text-white/80 bg-gradient-to-br ${getGradient(index)}`}>
                    {(item.full_name || item.username)?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                {/* Lumi mini badge — góc dưới-phải avatar */}
                <div className="absolute bottom-2 right-2 z-20">
                  <PetMiniBadge userId={item.id} size="md" />
                </div>
              </div>

              {/* Info Area */}
              <div className="p-3">
                <h3
                  className="font-semibold text-sm truncate cursor-pointer hover:underline"
                  onClick={() => navigate(`/profile/${item.id}`)}
                >
                  {item.full_name || item.username}
                </h3>
                {type === 'sent' && item.created_at && (
                  <p className="text-xs text-muted-foreground mb-2">
                    {format(new Date(item.created_at), 'd/M/yyyy')}
                  </p>
                )}
                <div className="mt-2">
                  {getActionButton(item)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right Arrow */}
        {showRightArrow && items.length > 2 && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-card shadow-lg border border-border/50 flex items-center justify-center hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </section>
  );
};
