/**
 * Admin navigation config — Single source of truth cho sidebar Admin Console.
 *
 * Phase 2.1:
 *  - Federation lên trên Security (strategic module).
 *  - Federation dùng nested route: /admin/federation, /admin/federation/backfill, ...
 *  - Không duy trì song song slug dạng flat `federation-backfill` để tránh duplicate.
 */
import {
  LayoutDashboard,
  Users,
  UserCheck,
  ShieldCheck,
  Coins,
  Gift,
  Vault,
  FileBarChart,
  Sparkles,
  Hammer,
  LineChart,
  FileText,
  MessageSquare,
  Radio,
  Boxes,
  Trophy,
  PackageOpen,
  Award,
  Fingerprint,
  BadgeCheck,
  ListChecks,
  GitMerge,
  RefreshCw,
  Database,
  AlertOctagon,
  Activity,
  Lock,
  ShieldAlert,
  BellRing,
  Scale,
  ScrollText,
  PowerOff,
  Settings,
  Flag,
  Cog,
  History,
  Link2,
  DatabaseZap,
  KeyRound,
  type LucideIcon,
} from "lucide-react";

export type AdminItemStatus = "live" | "coming-soon";
export type AdminGroupStatusKey = "security" | "federation" | "treasury" | "system";

export interface AdminNavItem {
  /** Có thể chứa dấu `/` để biểu diễn nested route, ví dụ `federation/backfill`. */
  slug: string;
  label: string;
  icon: LucideIcon;
  status: AdminItemStatus;
  legacyTabs?: string[];
}

export interface AdminNavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AdminNavItem[];
  statusKey?: AdminGroupStatusKey;
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { slug: "overview", label: "Tổng quan", icon: LayoutDashboard, status: "live", legacyTabs: ["overview"] },
    ],
  },
  {
    id: "federation",
    label: "Federation",
    icon: GitMerge,
    statusKey: "federation",
    items: [
      { slug: "federation", label: "Federation Center", icon: GitMerge, status: "live" },
      { slug: "federation/backfill", label: "Backfill Jobs", icon: Database, status: "live", legacyTabs: ["federation-backfill"] },
      { slug: "federation/sync", label: "Trạng thái đồng bộ", icon: RefreshCw, status: "coming-soon", legacyTabs: ["federation-sync"] },
      { slug: "federation/events", label: "Event Monitoring", icon: Activity, status: "coming-soon", legacyTabs: ["federation-events"] },
      { slug: "federation/failed-queue", label: "Failed Queue", icon: AlertOctagon, status: "coming-soon", legacyTabs: ["federation-failed"] },
    ],
  },
  {
    id: "security",
    label: "Bảo mật",
    icon: ShieldAlert,
    statusKey: "security",
    items: [
      { slug: "wallet-security", label: "Bảo vệ ví", icon: Lock, status: "live", legacyTabs: ["wallet-security"] },
      { slug: "transactions-trust", label: "Transaction Trust", icon: ShieldCheck, status: "live" },
      { slug: "transaction-validation", label: "Transaction Validation (M5.5)", icon: ShieldCheck, status: "live" },
      { slug: "wallet-writer-audit", label: "Wallet Writer Audit", icon: ScrollText, status: "coming-soon" },
      { slug: "bulk-alerts", label: "Bulk Update Alerts", icon: BellRing, status: "coming-soon" },
      { slug: "fraud", label: "Chống gian lận", icon: ShieldAlert, status: "live", legacyTabs: ["fraud"] },
      { slug: "reconciliation", label: "Đối soát ví", icon: Scale, status: "live", legacyTabs: ["reconciliation"] },
      { slug: "kill-switch", label: "Kill Switch", icon: PowerOff, status: "coming-soon" },
    ],
  },
  {
    id: "users",
    label: "Quản lý người dùng",
    icon: Users,
    items: [
      { slug: "users", label: "Người dùng", icon: Users, status: "live", legacyTabs: ["users"] },
      { slug: "user-verification", label: "Xác minh người dùng", icon: UserCheck, status: "coming-soon" },
      { slug: "roles", label: "Vai trò & quyền", icon: ShieldCheck, status: "coming-soon" },
    ],
  },
  {
    id: "rewards",
    label: "Thưởng & Treasury",
    icon: Coins,
    statusKey: "treasury",
    items: [
      { slug: "claims", label: "Lệnh Claim", icon: Gift, status: "live", legacyTabs: ["rewards"] },
      { slug: "treasury", label: "Treasury", icon: Vault, status: "live", legacyTabs: ["treasury"] },
      { slug: "finance", label: "Báo cáo tài chính", icon: FileBarChart, status: "live", legacyTabs: ["finance"] },
    ],
  },
  {
    id: "pplp",
    label: "Hệ thống PPLP",
    icon: Sparkles,
    items: [
      { slug: "pplp-approvals", label: "Duyệt PPLP", icon: ListChecks, status: "live", legacyTabs: ["audit"] },
      { slug: "pplp-mint", label: "PPLP Mint", icon: Hammer, status: "live", legacyTabs: ["pplp"] },
      { slug: "pplp-analytics", label: "PPLP Analytics", icon: LineChart, status: "coming-soon" },
    ],
  },
  {
    id: "moderation",
    label: "Kiểm duyệt nội dung",
    icon: FileText,
    items: [
      { slug: "moderation", label: "Bài viết", icon: FileText, status: "live", legacyTabs: ["moderation"] },
      { slug: "comments", label: "Bình luận", icon: MessageSquare, status: "coming-soon" },
      { slug: "livestream", label: "Livestream", icon: Radio, status: "live", legacyTabs: ["livestream"] },
      { slug: "spaces", label: "Spaces", icon: Boxes, status: "coming-soon" },
    ],
  },
  {
    id: "gamification",
    label: "Gamification",
    icon: Trophy,
    items: [
      { slug: "quests", label: "Quests", icon: Trophy, status: "live", legacyTabs: ["quests"] },
      { slug: "mystery-box", label: "Hộp bí ẩn", icon: PackageOpen, status: "live", legacyTabs: ["mystery-box"] },
      { slug: "achievements", label: "Thành tựu", icon: Award, status: "coming-soon" },
    ],
  },
  {
    id: "identity",
    label: "Identity & Xác minh",
    icon: Fingerprint,
    items: [
      { slug: "identity-did", label: "DID", icon: Fingerprint, status: "coming-soon" },
      { slug: "identity-kyc", label: "KYC", icon: BadgeCheck, status: "coming-soon" },
      { slug: "identity-status", label: "Trạng thái xác minh", icon: ListChecks, status: "coming-soon" },
    ],
  },
  {
    id: "ecosystem",
    label: "Hệ sinh thái",
    icon: Link2,
    items: [
      { slug: "connector", label: "Connector", icon: Link2, status: "live", legacyTabs: ["connector"] },
    ],
  },
  {
    id: "system",
    label: "Hệ thống",
    icon: Cog,
    statusKey: "system",
    items: [
      { slug: "system", label: "Cài đặt ứng dụng", icon: Settings, status: "live", legacyTabs: ["system"] },
      { slug: "backfill", label: "Backfill giao dịch", icon: DatabaseZap, status: "live", legacyTabs: ["backfill"] },
      { slug: "secrets", label: "Secrets", icon: KeyRound, status: "live" },
      { slug: "feature-flags", label: "Feature Flags", icon: Flag, status: "coming-soon" },
      { slug: "background-jobs", label: "Background Jobs", icon: RefreshCw, status: "coming-soon" },
      { slug: "audit-logs", label: "Audit Logs", icon: History, status: "coming-soon" },
    ],
  },
];

/** Map legacy `?tab=` → slug mới (có thể chứa `/` cho nested route). */
export const LEGACY_TAB_TO_SLUG: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  ADMIN_NAV.forEach((g) =>
    g.items.forEach((it) => {
      (it.legacyTabs ?? []).forEach((t) => {
        map[t] = it.slug;
      });
    }),
  );
  return map;
})();

export const ADMIN_SLUGS: string[] = ADMIN_NAV.flatMap((g) => g.items.map((i) => i.slug));

export function findAdminItem(slug: string): { group: AdminNavGroup; item: AdminNavItem } | null {
  for (const g of ADMIN_NAV) {
    const it = g.items.find((i) => i.slug === slug);
    if (it) return { group: g, item: it };
  }
  return null;
}
