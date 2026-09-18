import { useState } from "react";
import { AlertTriangle, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import StatusPill from "./StatusPill";
import { useAdminGroupStatus } from "./useAdminGroupStatus";

/**
 * Top Status Bar — 2 tầng, sticky dưới `AdminTopHeader`.
 *   Hàng 1 (Health):  FUN Profile · Federation · Wallet Security
 *   Hàng 2 (Metrics): Users Synced · Identity Links · Failed Queue · Last Sync · Last Incident
 *
 * - Mobile (<sm): chỉ hiện hàng Health, các chip còn lại đưa vào popover "More".
 * - Tablet/desktop: hàng Metrics scroll ngang khi tràn (whitespace-nowrap + overflow-x-auto).
 * - Bỏ duplicate "Failed Queue" giữa Metrics và Secondary.
 */
export function AdminStatusBar() {
  const snap = useAdminGroupStatus();
  const [openMore, setOpenMore] = useState(false);
  const fh = snap.topBar.federationHealth;

  const healthChips = (
    <>
      <Chip
        level={snap.topBar.funProfile.level}
        title="FUN Profile"
        value={snap.topBar.funProfile.label}
      />
      <Chip
        level={snap.topBar.federation.level}
        title="Federation"
        value={snap.topBar.federation.label}
      />
      <Chip
        level={snap.topBar.walletSecurity.level}
        title="Wallet Security"
        value={snap.topBar.walletSecurity.label}
      />
    </>
  );

  const metricChips = (
    <>
      <KpiChip title="Users Synced" value={fh.usersSynced.toLocaleString()} />
      <KpiChip title="Identity Links" value={fh.identityLinks.toLocaleString()} />
      <KpiChip
        title="Failed Queue"
        value={String(fh.failedQueue)}
        warn={fh.failedQueue > 0}
      />
      <KpiChip title="Last Sync" value={fh.lastSyncRelative} />
      <KpiChip
        title="Last Incident"
        value={snap.topBar.lastIncident?.relative ?? "—"}
        icon={<AlertTriangle className="h-3 w-3" />}
        tooltip={snap.topBar.lastIncident?.description}
      />
    </>
  );

  return (
    <div className="sticky top-14 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* Hàng 1 — Health */}
      <div className="flex h-9 items-center gap-2 overflow-x-auto px-3 sm:gap-3 sm:px-4 [scrollbar-width:thin]">
        <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 md:inline">
          Health
        </span>
        <div className="flex items-center gap-2 sm:gap-3">{healthChips}</div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {snap.isMock && (
            <Badge
              variant="outline"
              className="hidden h-5 px-1.5 text-[9px] font-normal uppercase tracking-wide text-muted-foreground sm:inline-flex"
              title="Phase 2: dữ liệu mock, sẽ nối nguồn thật ở Phase 3."
            >
              Mock
            </Badge>
          )}

          {/* Mobile-only: gom Metrics vào More */}
          <Popover open={openMore} onOpenChange={setOpenMore}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] sm:hidden"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
                <span>More</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-2 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Metrics
              </p>
              <div className="flex flex-wrap gap-2">{metricChips}</div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Hàng 2 — Metrics (ẩn trên mobile, scroll ngang trên tablet) */}
      <div className="hidden h-9 items-center gap-2 overflow-x-auto whitespace-nowrap border-t border-border/50 px-3 sm:flex sm:gap-3 sm:px-4 [scrollbar-width:thin]">
        <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70 md:inline">
          Metrics
        </span>
        {metricChips}
      </div>
    </div>
  );
}

interface ChipProps {
  level: "ok" | "warn" | "critical" | "unknown";
  title: string;
  value: string;
  tooltip?: string;
}

function Chip({ level, title, value, tooltip }: ChipProps) {
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border bg-card/50 px-2 py-1 text-[11px]"
      title={tooltip}
    >
      <StatusPill level={level} tooltip={tooltip ?? `${title}: ${value}`} mock />
      <span className="text-muted-foreground">{title}:</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function KpiChip({
  title,
  value,
  warn,
  icon,
  tooltip,
}: {
  title: string;
  value: string;
  warn?: boolean;
  icon?: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border bg-card/50 px-2 py-1 text-[11px]",
        warn && "border-amber-500/40",
      )}
      title={tooltip}
    >
      {icon}
      <span className="text-muted-foreground">{title}:</span>
      <span className={cn("font-medium text-foreground", warn && "text-amber-500")}>
        {value}
      </span>
    </div>
  );
}

export default AdminStatusBar;
