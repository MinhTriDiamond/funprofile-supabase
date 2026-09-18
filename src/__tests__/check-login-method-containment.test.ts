/**
 * Guard containment Đ9 — check_login_method
 *
 * Bất biến:
 *  1. FE KHÔNG được gọi trực tiếp supabase.rpc('check_login_method').
 *  2. Edge function `auth-check-login-method` phải có rate-limit theo IP.
 *  3. Live: RPC cũ bị permission denied với publishable key (skip nếu thiếu env).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const EDGE = resolve(process.cwd(), "supabase/functions/auth-check-login-method/index.ts");

describe("check_login_method containment (offline)", () => {
  it("không còn FE nào gọi RPC trực tiếp", () => {
    const out = execSync(
      `grep -rn "rpc(['\\"]check_login_method" src --exclude-dir=__tests__ || true`,
      { encoding: "utf8" },
    ).trim();
    expect(out).toBe("");
  });


  it("edge function có rate-limit theo IP", () => {
    const src = readFileSync(EDGE, "utf8");
    expect(src).toContain("check_rate_limit");
    expect(src).toContain("check_login_method:");
    expect(src).toMatch(/RATE_LIMIT\s*=\s*10/);
    expect(src).toMatch(/WINDOW_MS\s*=\s*60_?000/);
    expect(src).toContain("429");
  });
});

describe("check_login_method containment (live REST, skip nếu thiếu env)", () => {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  it.skipIf(!url || !key)("RPC cũ bị permission denied", async () => {
    const res = await fetch(`${url}/rest/v1/rpc/check_login_method`, {
      method: "POST",
      headers: { apikey: key as string, "Content-Type": "application/json" },
      body: JSON.stringify({ p_email: "test@example.com" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toMatch(/permission denied/i);
  });
});
