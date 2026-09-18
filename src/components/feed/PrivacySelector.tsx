import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Globe, Users, Lock, ChevronDown, Check } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface PrivacyOption {
  value: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface PrivacySelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const PrivacySelector = ({ value, onChange, disabled }: PrivacySelectorProps) => {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const PRIVACY_OPTIONS: PrivacyOption[] = [
    {
      value: 'public',
      label: language === 'vi' ? 'Công khai' : 'Public',
      icon: Globe,
      description: language === 'vi' ? 'Bất kỳ ai ở trên hoặc ngoài FUN Profile' : 'Anyone on or off FUN Profile',
    },
    {
      value: 'friends',
      label: language === 'vi' ? 'Bạn bè' : 'Friends',
      icon: Users,
      description: language === 'vi' ? 'Bạn bè của bạn trên FUN Profile' : 'Your friends on FUN Profile',
    },
    {
      value: 'private',
      label: language === 'vi' ? 'Chỉ mình tôi' : 'Only me',
      icon: Lock,
      description: language === 'vi' ? 'Chỉ bạn có thể xem bài viết này' : 'Only you can see this post',
    },
  ];

  const selectedOption = PRIVACY_OPTIONS.find((opt) => opt.value === value) || PRIVACY_OPTIONS[0];
  const SelectedIcon = selectedOption.icon;

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <>
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-1 h-8 gap-1.5 rounded-full border border-border/70 bg-muted/70 px-2.5 text-xs font-semibold shadow-sm transition-all duration-200 hover:bg-primary/10 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setIsOpen(true);
              }}
              disabled={disabled}
            >
              <SelectedIcon className="h-3.5 w-3.5" />
              {selectedOption.label}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {value === 'public' ? 'Mọi người đều có thể xem bài viết này' : selectedOption.description}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={isOpen} onOpenChange={setIsOpen} modal>
        <DialogContent className="z-[200] overflow-hidden rounded-2xl p-0 shadow-2xl sm:max-w-[400px]">
          <DialogHeader className="border-b border-border p-4">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="absolute left-4 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-secondary"
                aria-label="Quay lại"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <DialogTitle className="flex-1 text-center text-lg font-bold">
                {language === 'vi' ? 'Đối tượng của bài viết' : 'Post audience'}
              </DialogTitle>
            </div>
          </DialogHeader>

          <div className="p-4">
            <p className="mb-4 text-sm text-muted-foreground">
              {language === 'vi' ? 'Ai có thể xem bài viết của bạn?' : 'Who can see your post?'}
            </p>

            <div className="space-y-1">
              {PRIVACY_OPTIONS.map((option) => {
                const OptionIcon = option.icon;
                const isSelected = value === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option.value)}
                    className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      isSelected ? 'bg-primary/10 shadow-sm' : 'hover:bg-secondary'
                    }`}
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full ${isSelected ? 'bg-primary/10' : 'bg-secondary'}`}>
                      <OptionIcon className={`h-6 w-6 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{option.label}</p>
                      <p className="truncate text-sm text-muted-foreground">{option.description}</p>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
                      {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
