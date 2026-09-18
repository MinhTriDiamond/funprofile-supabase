/**
 * useAdminGroupStatus — Phase 2 MOCK hook.
 *
 * Trả status mock cho 4 nhóm + Top Status Bar. KHÔNG gọi API/RPC mới.
 * Phase 3 sẽ nối nguồn thật (federation health, wallet monitor, queues...).
 *
 * Lưu ý (Phase 2.1):
 *  - Federation thực tế đã PASS FP-2A end-to-end. Không hiển thị "Degraded" nữa.
 *    Tạm ghi "Pending Metrics" + level "unknown" cho tới khi nối nguồn thật.
 *  - Bổ sung `federationHealth` (Users Synced / Identity Links / Failed Queue / Last Sync)
 *    để Top Status Bar hiển thị KPI Federation.
 */
import type { AdminGroupStatusKey } from "@/config/adminNav";
import type { StatusLevel } from "./StatusPill";

export interface AdminStatusSnapshot {
  groups: Record<AdminGroupStatusKey, StatusLevel>;
  topBar: {
    funProfile: { level: StatusLevel; label: string };
    federation: { level: StatusLevel; label: string };
    walletSecurity: { level: StatusLevel; label: string };
    failedQueue: { count: number };
    lastIncident: { relative: string; description: string } | null;
    federationHealth: {
      usersSynced: number;
      identityLinks: number;
      failedQueue: number;
      lastSyncRelative: string;
    };
  };
  /** Luôn TRUE ở Phase 2. UI dùng để hiện nhãn "mock". */
  isMock: true;
}

export function useAdminGroupStatus(): AdminStatusSnapshot {
  return {
    groups: {
      security: "ok",
      federation: "unknown",
      treasury: "ok",
      system: "ok",
    },
    topBar: {
      funProfile: { level: "ok", label: "Operational" },
      federation: { level: "unknown", label: "Pending Metrics" },
      walletSecurity: { level: "ok", label: "Stable" },
      failedQueue: { count: 0 },
      lastIncident: {
        relative: "—",
        description: "Chưa nối nguồn thật (Phase 2 mock).",
      },
      federationHealth: {
        usersSynced: 160,
        identityLinks: 214,
        failedQueue: 0,
        lastSyncRelative: "2m ago",
      },
    },
    isMock: true,
  };
}
