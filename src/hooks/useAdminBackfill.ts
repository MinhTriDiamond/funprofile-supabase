import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { describeBackendError } from "@/lib/errors";

export type BackfillScope = "all" | "single" | "multi";

export type BackfillClassification =
  | "internal"
  | "external_in"
  | "swap_suspect"
  | "dust_filtered"
  | "already_in_db";

export interface BackfillJob {
  id: string;
  scope: BackfillScope;
  wallets: string[] | null;
  from_block: number | null;
  to_block: number | null;
  cursor_block: number | null;
  from_ts: string;
  to_ts: string;
  status: string;
  progress_pct: number | null;
  stats: Record<string, number> | null;
  error: string | null;
  created_at: string;
}

export interface BackfillCandidate {
  id: string;
  tx_hash: string;
  log_index: number;
  block_number: number;
  from_address: string;
  to_address: string;
  token_symbol: string;
  amount_display: string | null;
  amount_raw: string;
  usd_value: number | null;
  classification: BackfillClassification;
  matched_user_id: string | null;
  selected: boolean;
  written: boolean;
  skip_reason: string | null;
}

const TERMINAL = ["preview_ready", "done", "failed", "cancelled"];

export function useAdminBackfill() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<BackfillJob | null>(null);
  const [candidates, setCandidates] = useState<BackfillCandidate[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const cancelRef = useRef(false);

  const refresh = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc("admin_backfill_job_view", { p_job_id: id });
    if (error) {
      toast.error(describeBackendError(error));
      return null;
    }
    const payload = data as unknown as { job: BackfillJob; candidates: BackfillCandidate[] };
    setJob(payload.job);
    setCandidates(payload.candidates ?? []);
    return payload.job;
  }, []);

  /** Gọi worker quét nhiều lượt tới khi hết range (mỗi lượt < 60s). */
  const runScanLoop = useCallback(
    async (id: string) => {
      setIsScanning(true);
      cancelRef.current = false;
      try {
        for (let i = 0; i < 200; i++) {
          if (cancelRef.current) break;
          const { data, error } = await supabase.functions.invoke("admin-backfill-scan", {
            body: { job_id: id },
          });
          if (error) {
            toast.error(describeBackendError(error));
            break;
          }
          const res = data as { ok?: boolean; status?: string; error?: string };
          if (!res?.ok) {
            toast.error(res?.error ?? "Quét thất bại");
            break;
          }
          const current = await refresh(id);
          if (res.status !== "scanning" || (current && TERMINAL.includes(current.status))) break;
        }
      } finally {
        setIsScanning(false);
        await refresh(id);
      }
    },
    [refresh],
  );

  const createJob = useCallback(
    async (params: { scope: BackfillScope; wallets: string[]; fromTs: string; toTs: string }) => {
      setIsCreating(true);
      try {
        const { data, error } = await supabase.rpc("admin_backfill_create_job", {
          p_scope: params.scope,
          p_wallets: params.wallets.map((w) => w.trim().toLowerCase()).filter(Boolean),
          p_from_ts: params.fromTs,
          p_to_ts: params.toTs,
        });
        if (error) {
          toast.error(describeBackendError(error));
          return null;
        }
        const id = data as unknown as string;
        setJobId(id);
        setCandidates([]);
        await refresh(id);
        toast.success("Đã tạo lượt quét, đang chạy nền…");
        void runScanLoop(id);
        return id;
      } finally {
        setIsCreating(false);
      }
    },
    [refresh, runScanLoop],
  );

  const toggleSelection = useCallback(
    async (ids: string[], selected: boolean) => {
      if (!jobId || ids.length === 0) return;
      const { error } = await supabase.rpc("admin_backfill_toggle_selection", {
        p_job_id: jobId,
        p_candidate_ids: ids,
        p_selected: selected,
      });
      if (error) {
        toast.error(describeBackendError(error));
        return;
      }
      await refresh(jobId);
    },
    [jobId, refresh],
  );

  const writeSelected = useCallback(async () => {
    if (!jobId) return;
    setIsWriting(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-backfill-write", {
        body: { job_id: jobId },
      });
      if (error) {
        toast.error(describeBackendError(error));
        return;
      }
      const res = data as { ok?: boolean; error?: string; rows_written?: number };
      if (!res?.ok) {
        toast.error(res?.error ?? "Ghi thất bại");
        return;
      }
      toast.success(`Đã ghi ${res.rows_written ?? 0} dòng`);
      await refresh(jobId);
    } finally {
      setIsWriting(false);
    }
  }, [jobId, refresh]);

  const openJob = useCallback(
    async (id: string) => {
      setJobId(id);
      const j = await refresh(id);
      if (j && j.status === "scanning") void runScanLoop(id);
    },
    [refresh, runScanLoop],
  );

  useEffect(() => () => { cancelRef.current = true; }, []);

  return {
    jobId,
    job,
    candidates,
    isCreating,
    isScanning,
    isWriting,
    createJob,
    toggleSelection,
    writeSelected,
    refresh,
    openJob,
  };
}
