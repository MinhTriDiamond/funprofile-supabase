/**
 * CASCADE CONSTANTS — Source of truth cho công thức Thác Đổ 3 Tầng
 *
 * ⚠️ FILE NÀY ĐƯỢC TỰ ĐỘNG ĐỒNG BỘ TỪ DATABASE (`epoch_config` WHERE is_active=true)
 *    bằng script `scripts/sync-cascade-constants.ts`.
 *    Mỗi lần build (Cloudflare Pages / Lovable) script chạy → cập nhật giá trị bên dưới.
 *    Trang `/docs/cascade-formula` phải đọc từ đây — KHÔNG hardcode số trong JSX.
 *
 * Nguồn: epoch_config (config_key='default', is_active=true)
 * Đồng bộ lúc: 2026-05-01T00:00:00.000Z
 */

export interface CascadeConfig {
  /** Tầng 1 — Trần mềm hệ thống mỗi tháng (FUN) */
  softCeiling: number;
  systemStage: "bootstrap" | "growth" | "mature";

  /** Tầng 2 — Pool split (tổng = 1.0) */
  pools: {
    user: number;        // 0.70
    ecosystem: number;   // 0.12
    treasury: number;    // 0.10
    strategic: number;   // 0.05
    resilience: number;  // 0.03
  };

  /** Tầng 3 — Anti-whale: tối đa user nhận trên user_pool */
  maxSharePerUser: number; // 0.03 → 1.05M nếu softCeiling=50M

  /** Vesting */
  instantPortionPct: number; // 0.15
  lockedPortionPct: number;  // 0.85
  baseVestingDays: number;   // 28
}

export const CASCADE_CONFIG: CascadeConfig = {
  softCeiling: 50_000_000,
  systemStage: "bootstrap",
  pools: {
    user: 0.70,
    ecosystem: 0.12,
    treasury: 0.10,
    strategic: 0.05,
    resilience: 0.03,
  },
  maxSharePerUser: 0.03,
  instantPortionPct: 0.15,
  lockedPortionPct: 0.85,
  baseVestingDays: 28,
};

/** Tổng % các pool — phải = 1.0 (validation invariant) */
export const POOLS_SUM = Object.values(CASCADE_CONFIG.pools).reduce((a, b) => a + b, 0);

/** Trần cá nhân tuyệt đối (FUN) = softCeiling × user_pool × max_share_per_user */
export const PER_USER_HARD_CAP =
  CASCADE_CONFIG.softCeiling *
  CASCADE_CONFIG.pools.user *
  CASCADE_CONFIG.maxSharePerUser;
