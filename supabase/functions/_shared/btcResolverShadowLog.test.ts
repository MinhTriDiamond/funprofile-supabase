/**
 * Test cho _shared/btcResolverShadowLog.ts — fail-open bắt buộc (Phase 2, mục 2).
 * Chạy: deno test supabase/functions/_shared/btcResolverShadowLog.test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  logBtcResolverShadowComparison,
  dispatchBtcResolverShadowLog,
} from "./btcResolverShadowLog.ts";

const BASE_INPUT = {
  address: "bc1qtest",
  callSite: "test:call-site",
  legacyUserId: "11111111-1111-1111-1111-111111111111",
  legacySource: "testMap",
  idempotencyKey: "test-key-1",
  createdBy: "test-runner",
};

Deno.test("fail-open: RPC trả { error } không throw ra ngoài", async () => {
  const fakeAdmin = {
    rpc: (_fn: string, _args: unknown) =>
      Promise.resolve({ data: null, error: { message: "simulated db error" } }),
  } as any;

  // Nếu hàm throw, await này sẽ ném lỗi và test fail — đúng cái ta cần chứng minh KHÔNG xảy ra.
  await logBtcResolverShadowComparison(fakeAdmin, BASE_INPUT);
});

Deno.test("fail-open: .rpc() throw exception đồng bộ không throw ra ngoài", async () => {
  const fakeAdmin = {
    rpc: (_fn: string, _args: unknown) => {
      throw new Error("simulated synchronous throw");
    },
  } as any;

  await logBtcResolverShadowComparison(fakeAdmin, BASE_INPUT);
});

Deno.test("fail-open: .rpc() reject (network error) không throw ra ngoài", async () => {
  const fakeAdmin = {
    rpc: (_fn: string, _args: unknown) => Promise.reject(new Error("simulated network failure")),
  } as any;

  await logBtcResolverShadowComparison(fakeAdmin, BASE_INPUT);
});

Deno.test("fail-open + timeout: .rpc() treo vô thời hạn vẫn return trong ~1.5s, không throw", async () => {
  const fakeAdmin = {
    rpc: (_fn: string, _args: unknown) => new Promise(() => {}), // không bao giờ resolve/reject
  } as any;

  const start = performance.now();
  await logBtcResolverShadowComparison(fakeAdmin, BASE_INPUT);
  const elapsedMs = performance.now() - start;

  // Phải quay lại trong khoảng SHADOW_LOG_TIMEOUT_MS (1500ms) + biên độ nhỏ, không treo vô hạn.
  assertEquals(elapsedMs < 2000, true, `elapsed=${elapsedMs}ms, phải < 2000ms`);
  assertEquals(elapsedMs >= 1500, true, `elapsed=${elapsedMs}ms, phải >= 1500ms (đúng timeout)`);
});

Deno.test("dispatch (fire-and-forget): return NGAY LẬP TỨC dù .rpc() treo vô thời hạn", async () => {
  const fakeAdmin = {
    rpc: (_fn: string, _args: unknown) => new Promise(() => {}), // treo vô thời hạn
  } as any;

  const start = performance.now();
  dispatchBtcResolverShadowLog(fakeAdmin, BASE_INPUT); // KHÔNG await — đúng cách dùng thật
  const elapsedMs = performance.now() - start;

  // Không có EdgeRuntime trong Deno test runner ⇒ rơi về "không await" — hàm phải return
  // gần như tức thì (< 50ms), hoàn toàn không phụ thuộc thời gian .rpc() bên trong.
  assertEquals(elapsedMs < 50, true, `elapsed=${elapsedMs}ms, phải < 50ms (không blocking)`);
});

Deno.test("dispatch: vẫn gọi đúng RPC với đúng tham số ở nền, dù không await", async () => {
  let capturedArgs: unknown = null;
  let resolveCapture: () => void;
  const captured = new Promise<void>((r) => (resolveCapture = r));

  const fakeAdmin = {
    rpc: (fn: string, args: unknown) => {
      capturedArgs = args;
      assertEquals(fn, "log_btc_resolver_shadow_comparison");
      resolveCapture();
      return Promise.resolve({ data: { id: "row-1" }, error: null });
    },
  } as any;

  dispatchBtcResolverShadowLog(fakeAdmin, BASE_INPUT);
  await captured; // chờ tới khi RPC nền thực sự được gọi (không chờ nó hoàn tất)
  assertEquals((capturedArgs as any).p_call_site, "test:call-site");
});

Deno.test("happy path: .rpc() thành công, không có side-effect lỗi", async () => {
  let capturedArgs: unknown = null;
  const fakeAdmin = {
    rpc: (fn: string, args: unknown) => {
      capturedArgs = args;
      assertEquals(fn, "log_btc_resolver_shadow_comparison");
      return Promise.resolve({ data: { id: "row-1" }, error: null });
    },
  } as any;

  await logBtcResolverShadowComparison(fakeAdmin, BASE_INPUT);
  assertEquals((capturedArgs as any).p_address, "bc1qtest");
  assertEquals((capturedArgs as any).p_call_site, "test:call-site");
  assertEquals((capturedArgs as any).p_legacy_user_id, "11111111-1111-1111-1111-111111111111");
  assertEquals((capturedArgs as any).p_idempotency_key, "test-key-1");
});
