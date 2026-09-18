import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type StatusLevel = "ok" | "warn" | "critical" | "unknown";

const COLOR: Record<StatusLevel, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  critical: "bg-rose-500",
  unknown: "bg-muted-foreground/40",
};

const LABEL: Record<StatusLevel, string> = {
  ok: "Bình thường",
  warn: "Cần chú ý",
  critical: "Nguy hiểm",
  unknown: "Chưa rõ",
};

interface StatusPillProps {
  level: StatusLevel;
  label?: string;
  tooltip?: string;
  showLabel?: boolean;
  className?: string;
  /** Hiển thị nhãn "mock" để admin biết đây là dữ liệu placeholder. */
  mock?: boolean;
}

/**
 * Chấm tròn trạng thái + (tuỳ chọn) nhãn text + tooltip.
 * Phase 2: cho phép `mock` để gắn nhãn rõ ràng.
 */
export function StatusPill({
  level,
  label,
  tooltip,
  showLabel = false,
  className,
  mock = false,
}: StatusPillProps) {
  const text = label ?? LABEL[level];
  const tip = tooltip ?? text + (mock ? " (mock — Phase 2 placeholder)" : "");
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-[11px] leading-none text-muted-foreground",
              className,
            )}
          >
            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", COLOR[level])} />
            {showLabel && <span className="truncate">{text}</span>}
            {mock && showLabel && (
              <span className="rounded bg-muted px-1 text-[9px] uppercase tracking-wide text-muted-foreground">
                mock
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default StatusPill;
