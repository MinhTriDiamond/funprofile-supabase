import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OnboardingStep {
  key: string;
  label: string;
  description?: string;
}

export function OnboardingProgress({
  steps,
  currentIndex,
}: {
  steps: OnboardingStep[];
  currentIndex: number;
}) {
  return (
    <div className="w-full">
      <ol className="flex items-center w-full">
        {steps.map((step, idx) => {
          const isDone = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const isLast = idx === steps.length - 1;
          return (
            <li key={step.key} className={cn('flex items-center', !isLast && 'flex-1')}>
              <div className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                    isDone && 'bg-primary text-primary-foreground',
                    isCurrent && 'bg-primary/15 text-primary ring-2 ring-primary',
                    !isDone && !isCurrent && 'bg-muted text-muted-foreground'
                  )}
                >
                  {isDone ? <Check className="w-4 h-4" /> : idx + 1}
                </div>
                <span
                  className={cn(
                    'mt-1.5 text-[10px] sm:text-xs font-medium max-w-[80px] truncate',
                    isCurrent ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {step.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 mb-6 rounded-full transition-colors',
                    isDone ? 'bg-primary' : 'bg-muted'
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
