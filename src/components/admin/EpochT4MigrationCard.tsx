import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Sparkles, Eye, Rocket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MigrationSummary {
  epoch_id?: string;
  epoch_month?: string;
  current_total_cap?: number;
  new_total_cap?: number;
  eligible_allocations?: number;
  stuck_requests?: number;
  vesting_created?: number;
  requests_reset?: number;
  dry_run?: boolean;
}

const EpochT4MigrationCard = () => {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ mode: string; summary: MigrationSummary } | null>(null);

  const callMigration = async (dryRun: boolean) => {
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("migrate-stuck-epoch-april", {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      setResult(data);
      if (dryRun) {
        toast.info(`Dry-run OK — ${data?.summary?.stuck_requests ?? 0} requests sẵn sàng migrate`);
      } else {
        toast.success(
          `Migration hoàn tất: reset ${data?.summary?.requests_reset ?? 0} requests, tạo ${data?.summary?.vesting_created ?? 0} vesting schedules`,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown";
      console.error("[T4 Migration]", msg);
      toast.error("Lỗi: " + msg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="border-amber-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          Migration Epoch T4/2026 (stuck → vesting v1)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1 text-muted-foreground">
            <p>
              Chuyển 26 requests <strong>signed/failed</strong> tháng 4/2026 sang flow vesting v1
              (15% instant + 85% locked, 28 ngày), tăng cap epoch lên <strong>20M FUN</strong> và
              reset về <code>pending_sig</code> để auto-resubmit.
            </p>
            <p className="text-xs">Luôn chạy <strong>Dry-run</strong> trước.</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => callMigration(true)}
            disabled={running}
            className="gap-2"
          >
            <Eye className="w-4 h-4" />
            {running ? "Đang xử lý..." : "Dry-run (xem trước)"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={running} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
                <Rocket className="w-4 h-4" />
                Execute Migration
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xác nhận migration epoch T4?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hành động này sẽ thay đổi state của 26 mint requests, tạo vesting schedules và
                  tăng total_cap epoch T4 lên 20M FUN. Toàn bộ sẽ được log vào{" "}
                  <code>pplp_v2_event_log</code>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction onClick={() => callMigration(false)}>
                  Tôi hiểu — Execute
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {result && (
          <div className="rounded-lg bg-muted p-4 text-sm space-y-1 font-mono">
            <p>Mode: <strong>{result.mode}</strong></p>
            <p>Epoch: <strong>{result.summary?.epoch_month}</strong></p>
            <p>Cap: {result.summary?.current_total_cap?.toLocaleString()} → <strong>{result.summary?.new_total_cap?.toLocaleString()}</strong> FUN</p>
            <p>Eligible allocations: <strong>{result.summary?.eligible_allocations}</strong></p>
            <p>Stuck requests: <strong>{result.summary?.stuck_requests}</strong></p>
            {result.mode === "executed" && (
              <>
                <p className="text-emerald-600">✓ Vesting schedules tạo: <strong>{result.summary?.vesting_created}</strong></p>
                <p className="text-emerald-600">✓ Requests reset: <strong>{result.summary?.requests_reset}</strong></p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EpochT4MigrationCard;
