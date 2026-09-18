/**
 * Đồng bộ src/config/cascade-constants.ts từ DB.
 * Chạy trước build (prebuild) để đảm bảo docs luôn khớp logic backend.
 *
 * Usage: bun run scripts/sync-cascade-constants.ts
 *
 * Yêu cầu env: VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (đã có sẵn từ .env)
 */
import { writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const TARGET = resolve(process.cwd(), "src/config/cascade-constants.ts");

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("[sync-cascade] Missing env, skipping sync (giữ nguyên file hiện tại).");
    process.exit(0);
  }

  const url = `${SUPABASE_URL}/rest/v1/epoch_config?is_active=eq.true&select=config_key,system_stage,soft_ceiling,user_pool_pct,ecosystem_pool_pct,treasury_pool_pct,strategic_pool_pct,resilience_pool_pct,instant_portion_pct,locked_portion_pct,base_vesting_days,max_share_per_user`;

  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) {
    console.error("[sync-cascade] Fetch failed:", res.status, await res.text());
    process.exit(0); // không fail build
  }
  const rows = (await res.json()) as any[];
  if (!rows.length) {
    console.warn("[sync-cascade] Không có epoch_config active, skip.");
    process.exit(0);
  }
  const c = rows[0];

  const sumPools =
    Number(c.user_pool_pct) +
    Number(c.ecosystem_pool_pct) +
    Number(c.treasury_pool_pct) +
    Number(c.strategic_pool_pct) +
    Number(c.resilience_pool_pct);

  if (Math.abs(sumPools - 1) > 1e-6) {
    console.error(`[sync-cascade] ❌ DRIFT: tổng pool = ${sumPools} ≠ 1.0`);
    process.exit(1); // fail build
  }

  const current = readFileSync(TARGET, "utf8");
  const next = current
    .replace(/Đồng bộ lúc: .*/, `Đồng bộ lúc: ${new Date().toISOString()}`)
    .replace(/softCeiling: [\d_]+,/, `softCeiling: ${Number(c.soft_ceiling)},`)
    .replace(/systemStage: "[^"]+"/, `systemStage: "${c.system_stage}"`)
    .replace(/user: [\d.]+,/, `user: ${Number(c.user_pool_pct)},`)
    .replace(/ecosystem: [\d.]+,/, `ecosystem: ${Number(c.ecosystem_pool_pct)},`)
    .replace(/treasury: [\d.]+,/, `treasury: ${Number(c.treasury_pool_pct)},`)
    .replace(/strategic: [\d.]+,/, `strategic: ${Number(c.strategic_pool_pct)},`)
    .replace(/resilience: [\d.]+,/, `resilience: ${Number(c.resilience_pool_pct)},`)
    .replace(/maxSharePerUser: [\d.]+,/, `maxSharePerUser: ${Number(c.max_share_per_user)},`)
    .replace(/instantPortionPct: [\d.]+,/, `instantPortionPct: ${Number(c.instant_portion_pct)},`)
    .replace(/lockedPortionPct: [\d.]+,/, `lockedPortionPct: ${Number(c.locked_portion_pct)},`)
    .replace(/baseVestingDays: \d+,/, `baseVestingDays: ${Number(c.base_vesting_days)},`);

  writeFileSync(TARGET, next, "utf8");
  console.log(
    `[sync-cascade] ✅ Synced: stage=${c.system_stage} ceiling=${c.soft_ceiling} pools=${(sumPools * 100).toFixed(0)}%`,
  );
}

main().catch((e) => {
  console.error("[sync-cascade] Error:", e);
  process.exit(0);
});
