import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export type ChecklistStepStatus = 'pending' | 'active' | 'completed';

export interface ChecklistStep {
  id: string;
  title: string;
  description?: string;
  status: ChecklistStepStatus;
}

interface ProgressChecklistProps {
  title?: string;
  steps: ChecklistStep[];
  className?: string;
}

function StepStatusIcon({ status, index }: { status: ChecklistStepStatus; index: number }) {
  if (status === 'completed') {
    return (
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm transition-all duration-300 animate-in zoom-in-50"
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    );
  }

  if (status === 'active') {
    return (
      <span
        aria-hidden="true"
        className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-primary text-sm font-semibold"
      >
        <span className="absolute inset-0 rounded-full border-2 border-primary/40 animate-ping" />
        <span className="relative">{index + 1}</span>
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/30 bg-card text-sm font-medium text-muted-foreground"
    >
      {index + 1}
    </span>
  );
}

export function ProgressChecklist({ title = 'Tiến trình', steps, className }: ProgressChecklistProps) {
  const total = steps.length;
  const completed = steps.filter((s) => s.status === 'completed').length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className={cn('rounded-lg border bg-card p-4 space-y-4', className)}>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <span
            className="text-xs font-medium text-muted-foreground tabular-nums"
            aria-label={`${completed} trên ${total} bước đã hoàn tất`}
          >
            {completed}/{total}
          </span>
        </div>
        <Progress value={percent} className="h-1.5" />
      </div>

      <ol className="space-y-2" aria-label="Tiến trình phát trực tiếp">
        {steps.map((step, index) => {
          const isCompleted = step.status === 'completed';
          const isActive = step.status === 'active';

          return (
            <li
              key={step.id}
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'flex items-start gap-3 rounded-md border p-3 transition-all duration-300',
                isCompleted && 'border-emerald-500/30 bg-emerald-500/5',
                isActive && 'border-primary/40 bg-primary/5 ring-1 ring-primary/20',
                !isCompleted && !isActive && 'border-border bg-card',
              )}
            >
              <StepStatusIcon status={step.status} index={index} />
              <div className="min-w-0 flex-1 pt-0.5">
                <div
                  className={cn(
                    'text-sm font-medium leading-tight',
                    isCompleted && 'text-foreground',
                    isActive && 'text-foreground',
                    !isCompleted && !isActive && 'text-muted-foreground',
                  )}
                >
                  {isCompleted && <span className="sr-only">Đã hoàn tất: </span>}
                  {isActive && <span className="sr-only">Bước hiện tại: </span>}
                  {step.title}
                </div>
                {step.description && (
                  <div
                    className={cn(
                      'mt-0.5 text-xs leading-snug',
                      isCompleted && 'text-emerald-600 dark:text-emerald-400',
                      isActive && 'text-primary/80',
                      !isCompleted && !isActive && 'text-muted-foreground/70',
                    )}
                  >
                    {step.description}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default ProgressChecklist;
