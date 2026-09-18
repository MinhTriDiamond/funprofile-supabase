import { cn } from '@/lib/utils';
import { Heart, HandHeart, ThumbsUp, Sparkles, MessageCircleHeart, Pencil } from 'lucide-react';
import { useMemo } from 'react';

export interface MessageTemplate {
  id: string;
  label: string;
  message: string;
  icon: React.ReactNode;
  color: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    id: 'grateful',
    label: 'Biết ơn',
    message: 'Cảm ơn bạn rất nhiều! 🙏',
    icon: <HandHeart className="w-4 h-4" />,
    color: 'text-emerald-500',
  },
  {
    id: 'love',
    label: 'Yêu thương',
    message: 'Gửi tặng bạn với tình yêu thương! ❤️',
    icon: <Heart className="w-4 h-4" />,
    color: 'text-pink-500',
  },
  {
    id: 'admire',
    label: 'Ngưỡng mộ',
    message: 'Ngưỡng mộ sự cống hiến của bạn! 👏',
    icon: <ThumbsUp className="w-4 h-4" />,
    color: 'text-blue-500',
  },
  {
    id: 'support',
    label: 'Ủng hộ',
    message: 'Ủng hộ bạn hết mình! 💪',
    icon: <Sparkles className="w-4 h-4" />,
    color: 'text-amber-500',
  },
  {
    id: 'encourage',
    label: 'Khích lệ',
    message: 'Tiếp tục phát huy nhé! 🌟',
    icon: <MessageCircleHeart className="w-4 h-4" />,
    color: 'text-purple-500',
  },
  {
    id: 'custom',
    label: 'Tùy chỉnh',
    message: '',
    icon: <Pencil className="w-4 h-4" />,
    color: 'text-muted-foreground',
  },
];

/** Token-specific quick amount configs */
const QUICK_AMOUNTS_MAP: Record<string, number[]> = {
  FUN: [10, 50, 100, 500, 1000],
  CAMLY: [10000, 50000, 100000, 500000, 1000000],
  BNB: [0.01, 0.05, 0.1, 0.5],
  USDT: [5, 10, 50, 100],
  BTCB: [0.001, 0.005, 0.01, 0.05],
};

const DEFAULT_QUICK_AMOUNTS = [10, 50, 100, 500, 1000];

/** Format number for Vietnamese display (dot = thousands, comma = decimal) */
const formatViNumber = (num: number): string => {
  if (Number.isInteger(num)) {
    return num.toLocaleString('vi-VN');
  }
  // For decimals, use vi-VN locale which uses comma for decimal
  return num.toLocaleString('vi-VN', { maximumFractionDigits: 6 });
};

interface QuickGiftPickerProps {
  selectedTemplate: MessageTemplate | null;
  onSelectTemplate: (template: MessageTemplate) => void;
  onSelectAmount: (amount: number) => void;
  currentAmount: string;
  tokenSymbol?: string;
}

export const QuickGiftPicker = ({
  selectedTemplate,
  onSelectTemplate,
  onSelectAmount,
  currentAmount,
  tokenSymbol = 'FUN',
}: QuickGiftPickerProps) => {
  const quickAmounts = useMemo(() => {
    return QUICK_AMOUNTS_MAP[tokenSymbol] || DEFAULT_QUICK_AMOUNTS;
  }, [tokenSymbol]);

  return (
    <div className="space-y-4">
      {/* Quick amounts */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">
          Số lượng nhanh:
        </label>
        <div className="flex flex-wrap gap-2">
          {quickAmounts.map((amount) => (
            <button
              key={amount}
              type="button"
              onClick={() => onSelectAmount(amount)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-all border',
                currentAmount === amount.toString()
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted hover:bg-muted/80 border-border hover:border-primary/50'
              )}
            >
              {formatViNumber(amount)}
            </button>
          ))}
        </div>
      </div>

      {/* Message templates */}
      <div>
        <label className="text-sm font-medium text-muted-foreground mb-2 block">
          Lời nhắn mẫu:
        </label>
        <div className="grid grid-cols-3 gap-2">
          {MESSAGE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => onSelectTemplate(template)}
              className={cn(
                'flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border',
                selectedTemplate?.id === template.id
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-muted hover:bg-muted/80 border-border hover:border-primary/50',
                template.color
              )}
            >
              {template.icon}
              <span>{template.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
