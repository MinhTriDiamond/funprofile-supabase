/**
 * Test cho _shared/btcAmount.ts
 * Chạy: deno test supabase/functions/_shared/btcAmount.test.ts
 */

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { satsToBtc } from "./btcAmount.ts";

Deno.test("satsToBtc: 1 sat → 0.00000001", () => {
  assertEquals(satsToBtc(1), "0.00000001");
});

Deno.test("satsToBtc: 100000000 sat → 1 (nguyên, không dấu chấm)", () => {
  assertEquals(satsToBtc(100000000), "1");
});

Deno.test("satsToBtc: 1160801899 sat → 11.60801899 (case P0 thực tế)", () => {
  assertEquals(satsToBtc(1160801899), "11.60801899");
});

Deno.test("satsToBtc: 1000000000 sat → 10 (không được strip nhầm thành 1)", () => {
  assertEquals(satsToBtc(1000000000), "10");
});

Deno.test("satsToBtc: 0 → 0", () => {
  assertEquals(satsToBtc(0), "0");
});

Deno.test("satsToBtc: chấp nhận BigInt", () => {
  assertEquals(satsToBtc(1160801899n), "11.60801899");
});

Deno.test("satsToBtc: chấp nhận string số nguyên", () => {
  assertEquals(satsToBtc("1160801899"), "11.60801899");
});

Deno.test("satsToBtc: trim trailing zero nhưng giữ số có nghĩa", () => {
  // 12345000 sat = 0.12345 BTC (không phải 0.12345000)
  assertEquals(satsToBtc(12345000), "0.12345");
});

Deno.test("satsToBtc: từ chối float", () => {
  assertThrows(() => satsToBtc(1.5), Error);
});

Deno.test("satsToBtc: từ chối chuỗi có dấu chấm", () => {
  assertThrows(() => satsToBtc("1.5"), Error);
});
