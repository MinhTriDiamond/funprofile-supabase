/**
 * BTC Attribution Resolver — Phase 2 (shadow mode).
 *
 * Helper DÙNG CHUNG cho mọi điểm code RC4 sẽ gắn shadow-log (xem HANDOFF.md — CHƯA gắn vào
 * bất kỳ file nào, chờ CTO duyệt danh sách 7 điểm). Bọc lời gọi RPC
 * `log_btc_resolver_shadow_comparison` (migration 20260824011216).
 *
 * FAIL-OPEN BẮT BUỘC: 2 hàm export bên dưới KHÔNG BAO GIỜ throw. Mọi lỗi (RPC trả error,
 * network timeout, exception bất kỳ) đều bị nuốt, chỉ console.warn.
 *
 * 2 CÁCH DÙNG — chọn đúng theo khối lượng gọi tại từng điểm code (đừng dùng nhầm):
 *
 *  1. `logBtcResolverShadowComparison()` — có `await`, bound bởi timeout cứng (mặc định
 *     1.5s). Chỉ an toàn khi 1 request thật chỉ gọi hàm này MỘT LẦN hoặc rất ít lần (vd 1 tx
 *     đơn lẻ trong `record-donation`, 1 lần recheck thủ công). await tuần tự N lần trong 1
 *     vòng lặp lớn vẫn cộng dồn N × timeout khi resolver chậm/treo hàng loạt — KHÔNG dùng
 *     cách này cho vòng lặp nhiều địa chỉ/tx (vd wallet-reconciliation-cron: tối đa 15 địa
 *     chỉ/lần × tới 50 tx/địa chỉ từ mempool.space × nhiều vout/tx — có thể tới ~1.800 lần
 *     gọi tiềm năng trong 1 lần chạy cron; ở timeout 1.5s, worst-case tuần tự ≈ 45 phút, đủ để
 *     treo cả cron dù mỗi lần gọi tự nó fail-open không throw).
 *
 *  2. `dispatchBtcResolverShadowLog()` — KHÔNG `await`, giao việc cho
 *     `EdgeRuntime.waitUntil()` (đúng pattern nền tảng đã dùng ở `create-post`,
 *     `fetch-wallet-history`, `live-replay-stream-ingest`) — luồng chính tiếp tục ngay lập
 *     tức, thời gian shadow-log hoàn toàn tách khỏi thời gian luồng chính, kể cả khi gọi hàng
 *     nghìn lần trong 1 vòng lặp. BẮT BUỘC dùng cách này cho mọi điểm code xử lý nhiều địa
 *     chỉ/tx trong 1 lần invoke (wallet-reconciliation-cron, scan-btc-transactions vòng lặp
 *     vout, btc-history-repair, btc-ownership-reverify, btc-parser-v2).
 */
const SHADOW_LOG_TIMEOUT_MS = 1500;
const SHADOW_FLAG_CACHE_MS = 10_000;

let shadowFlagCache: { enabled: boolean; checkedAt: number } | null = null;

/**
 * Interface cấu trúc tối thiểu (chỉ `.rpc()`) thay vì `SupabaseClient` cụ thể — các điểm gọi
 * (scan-btc-transactions, btc-wallet-audit, v.v.) import `@supabase/supabase-js` qua nhiều
 * specifier khác nhau (`npm:...` vs `https://esm.sh/...`), sinh ra 2 kiểu nominal riêng biệt
 * dù cùng version → TS2345 giả (không phải lỗi thật, xác nhận bằng deno check trước/sau khi
 * đổi sang interface này: lỗi biến mất, hành vi runtime không đổi vì chỉ dùng `.rpc()`).
 */
interface RpcCapableClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): PromiseLike<{ data: { value?: unknown } | null; error: { message: string } | null }>;
      };
    };
  };
}

async function isBtcShadowWriteEnabled(admin: RpcCapableClient): Promise<boolean> {
  const now = Date.now();
  if (shadowFlagCache && now - shadowFlagCache.checkedAt < SHADOW_FLAG_CACHE_MS) {
    return shadowFlagCache.enabled;
  }

  try {
    const { data, error } = await admin
      .from("system_config")
      .select("value")
      .eq("key", "btc_shadow_write_enabled")
      .maybeSingle();

    if (error) {
      console.warn("[btc-shadow-log] đọc cờ btc_shadow_write_enabled lỗi; bỏ ghi shadow-log:", error.message);
      shadowFlagCache = { enabled: false, checkedAt: now };
      return false;
    }

    const value = data?.value;
    const enabled = Boolean(
      value && typeof value === "object" && "enabled" in value && (value as { enabled?: unknown }).enabled === true,
    );
    shadowFlagCache = { enabled, checkedAt: now };
    return enabled;
  } catch (e) {
    console.warn(
      "[btc-shadow-log] đọc cờ btc_shadow_write_enabled threw; bỏ ghi shadow-log:",
      e instanceof Error ? e.message : e,
    );
    shadowFlagCache = { enabled: false, checkedAt: now };
    return false;
  }
}

export interface BtcShadowLogInput {
  /** Địa chỉ RAW như logic cũ đang cầm (chưa cần normalize — hàm SQL tự normalize). */
  address: string;
  /** Tên điểm code gọi tới, vd 'scan-btc-transactions:sender'. */
  callSite: string;
  /** Kết quả logic cũ suy ra (user_id), null nếu logic cũ không tìm thấy owner. */
  legacyUserId: string | null;
  /** Nhãn nguồn logic cũ dùng, vd 'btcToProfile', 'internalBtc', 'hd_change_verified'. */
  legacySource: string;
  /**
   * Khoá chống ghi trùng khi retry cùng 1 sự kiện — PHẢI xác định duy nhất theo
   * (call_site, tx_hash hoặc tương đương, address) tại nơi gọi. Vd:
   * `scan-btc-transactions:sender:${txid}:${address}`.
   */
  idempotencyKey: string;
  /** Tên function/cron đang gọi (không phải actor người dùng). */
  createdBy: string;
  /** Thời điểm giao dịch thật (block_time) — mặc định now() nếu bỏ trống. */
  eventAt?: string;
  txHash?: string;
  /** Địa chỉ RAW logic cũ dùng để tra map (trước mọi biến đổi) — để phân loại nghi legacy-format. */
  rawAddressLegacySide?: string;
  requestId?: string;
}

export async function logBtcResolverShadowComparison(
  admin: RpcCapableClient,
  input: BtcShadowLogInput,
): Promise<void> {
  try {
    const enabled = await isBtcShadowWriteEnabled(admin);
    if (!enabled) return;

    const rpcPromise = admin.rpc("log_btc_resolver_shadow_comparison", {
      p_address: input.address,
      p_call_site: input.callSite,
      p_legacy_user_id: input.legacyUserId,
      p_legacy_source: input.legacySource,
      p_idempotency_key: input.idempotencyKey,
      p_created_by: input.createdBy,
      p_event_at: input.eventAt ?? null,
      p_tx_hash: input.txHash ?? null,
      p_raw_address_legacy_side: input.rawAddressLegacySide ?? null,
      p_request_id: input.requestId ?? null,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("btc_shadow_log_timeout")), SHADOW_LOG_TIMEOUT_MS);
    });

    const { error } = await Promise.race([rpcPromise, timeoutPromise]);
    if (error) {
      console.warn(
        `[btc-shadow-log] RPC lỗi (fail-open, KHÔNG ảnh hưởng luồng chính) call_site=${input.callSite}:`,
        error.message,
      );
    }
  } catch (e) {
    console.warn(
      `[btc-shadow-log] threw/timeout (fail-open, KHÔNG ảnh hưởng luồng chính) call_site=${input.callSite}:`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Bản KHÔNG-BLOCKING cho các điểm code gọi nhiều lần/1 invoke (xem so sánh 2 cách dùng ở đầu
 * file). Không `await` — giao cho `EdgeRuntime.waitUntil()` nếu runtime có hỗ trợ (Supabase
 * edge production luôn có); rơi về gọi trực tiếp không-chờ nếu chạy ở môi trường không có
 * `EdgeRuntime` (vd local test) — vẫn không throw vì bản thân promise nội bộ luôn tự bắt lỗi.
 */
export function dispatchBtcResolverShadowLog(
  admin: RpcCapableClient,
  input: BtcShadowLogInput,
): void {
  const work = logBtcResolverShadowComparison(admin, input);
  const edgeRuntime = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(work);
  }
  // Không có EdgeRuntime (vd chạy local qua `deno run`/test): promise vẫn chạy nền, không await
  // ở đây — cố ý, để giữ đúng ngữ nghĩa "không chờ" bất kể môi trường.
}
