// JSON-RPC client cho BSC với rotation nhiều endpoint công khai.
// Bối cảnh: Moralis quota 40k/ngày đã cạn 2 lần (17-18/08/2026) ⇒ chuyển nguồn
// quét chính sang RPC công khai. Danh sách endpoint đã kiểm chứng 18/08/2026.
// 15/09/2026: thêm QuickNode (secret QUICKNODE_BSC_RPC_URL) làm endpoint ƯU TIÊN —
// Moralis Free bị pause hoàn toàn, endpoint công khai chỉ còn vai trò dự phòng.
// 15/09/2026: thêm Alchemy (secret ALCHEMY_BSC_RPC_URL) để test so sánh
// eth_getLogs và độ ổn định với QuickNode free + endpoint công khai.

/** Endpoint QuickNode trả phí (URL chứa token — TUYỆT ĐỐI không log nguyên văn). */
export function quickNodeUrl(): string | null {
  const u = Deno.env.get("QUICKNODE_BSC_RPC_URL");
  return u && u.startsWith("https://") ? u : null;
}

/** Endpoint Alchemy trả phí (URL chứa api-key — TUYỆT ĐỐI không log nguyên văn). */
export function alchemyUrl(): string | null {
  const u = Deno.env.get("ALCHEMY_BSC_RPC_URL");
  return u && u.startsWith("https://") ? u : null;
}

/** Che token/api-key trong URL trước khi đưa vào log / thống kê. */
export function maskEndpoint(url: string): string {
  if (url.includes("quiknode.pro")) return "quicknode(***)";
  if (url.includes("g.alchemy.com")) return "alchemy(***)";
  return url;
}

// 13/10/2026: loại meowrpc + 48.club (hỏng 100% trong thống kê tick 3 ngày:
// 3.196/3.196 và 2.785/2.785 lượt gọi lỗi — giữ lại chỉ đốt lượt thử + timeout).
export const BSC_RPC_ENDPOINTS = [
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-rpc.publicnode.com",
  "https://1rpc.io/bnb",
  "https://bsc.blockrazor.xyz",
  "https://bsc.rpc.blxrbdn.com",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed2.defibit.io",
];

/**
 * Endpoint hỗ trợ `eth_getLogs` + span tối đa đã đo thực tế 20/08/2026.
 * Các dataseed/publicnode/meowrpc bị loại: trả "limit exceeded" /
 * "Archive requests require a personal token" / không hỗ trợ getLogs.
 * Xếp theo span giảm dần để ưu tiên endpoint quét nhanh nhất.
 */
export interface LogsEndpoint {
  url: string;
  maxSpan: number;
}

export const BSC_LOGS_ENDPOINTS: LogsEndpoint[] = [
  { url: "https://bsc.rpc.blxrbdn.com", maxSpan: 5000 },
  { url: "https://1rpc.io/bnb", maxSpan: 50 },
  { url: "https://bsc.blockrazor.xyz", maxSpan: 25 },
];

/** Danh sách endpoint đầy đủ: Alchemy → QuickNode (nếu có) → free làm dự phòng. */
export function rpcEndpoints(): string[] {
  const alchemy = alchemyUrl();
  const qn = quickNodeUrl();
  const paid = [alchemy, qn].filter((u): u is string => !!u);
  return paid.length > 0 ? [...paid, ...BSC_RPC_ENDPOINTS] : [...BSC_RPC_ENDPOINTS];
}

/** Endpoint getLogs.
 * 15/09/2026: Alchemy/QuickNode gói free giới hạn getLogs 5–10 block/lần và
 * dính rate limit ⇒ khi đó chỉ dùng endpoint công khai đã kiểm chứng
 * (blxrbdn 5.000 block, 1rpc 50 block, blockrazor 25 block).
 * 13/10/2026: Alchemy trở thành nguồn getLogs khi có span đo thật qua biến
 * môi trường ALCHEMY_LOGS_MAX_SPAN (đo bằng hàm tạm alchemy-logs-span-probe,
 * đặt qua Secrets — chỉnh span KHÔNG cần deploy lại). Chưa đặt biến này thì
 * hành vi y như cũ. Danh sách luôn xếp span giảm dần (ưu tiên quét nhanh). */
export function logsEndpoints(): LogsEndpoint[] {
  const out: LogsEndpoint[] = [...BSC_LOGS_ENDPOINTS];
  const alchemy = alchemyUrl();
  const span = Number(Deno.env.get("ALCHEMY_LOGS_MAX_SPAN") ?? "0");
  if (alchemy && Number.isFinite(span) && span >= 100) {
    out.push({ url: alchemy, maxSpan: Math.floor(span) });
  }
  out.sort((a, b) => b.maxSpan - a.maxSpan);
  return out;
}


/**
 * Trần thời gian mỗi HTTP request RPC (ms).
 * Sự cố 03/09/2026: fetch không có timeout ⇒ 1 endpoint công khai treo vô hạn
 * làm cả tick scanner bị kill ở mốc 150s, không bao giờ chạy tới bước đối chiếu
 * DB và cảnh báo admin. Mọi fetch RPC BẮT BUỘC có AbortSignal.timeout.
 */
export const RPC_TIMEOUT_MS = 12_000;
export const RPC_LOGS_TIMEOUT_MS = 20_000;

export interface RpcCall {
  method: string;
  // deno-lint-ignore no-explicit-any
  params: any[];
}

export interface RpcEndpointStat {
  url: string;
  attempts: number;
  failures: number;
  timeouts: number;
}

export class RpcRotator {
  private endpoints: string[];
  private cursor = 0;
  private failures = new Map<string, number>();
  private attempts = new Map<string, number>();
  private timeouts = new Map<string, number>();
  private maxFailures: number;

  constructor(endpoints: string[] = rpcEndpoints(), maxFailures = 3) {
    this.endpoints = [...endpoints];
    this.maxFailures = maxFailures;
  }

  /** Endpoint còn sống trong tick hiện tại. */
  healthy(): string[] {
    return this.endpoints.filter(
      (e) => (this.failures.get(e) ?? 0) < this.maxFailures,
    );
  }

  private next(): string | null {
    const pool = this.healthy();
    if (pool.length === 0) return null;
    const ep = pool[this.cursor % pool.length];
    this.cursor++;
    return ep;
  }

  private markAttempt(endpoint: string): void {
    this.attempts.set(endpoint, (this.attempts.get(endpoint) ?? 0) + 1);
  }

  private markFailure(endpoint: string, err?: unknown): void {
    this.failures.set(endpoint, (this.failures.get(endpoint) ?? 0) + 1);
    const name = (err as Error | undefined)?.name ?? "";
    if (name === "TimeoutError" || name === "AbortError") {
      this.timeouts.set(endpoint, (this.timeouts.get(endpoint) ?? 0) + 1);
    }
    // Chẩn đoán endpoint hỏng (15/09/2026: QuickNode bị từ chối). URL đã che token.
    const msg = err instanceof Error ? err.message : String(err ?? "");
    console.warn(
      `[rpcClient] fail ${maskEndpoint(endpoint)}: ${msg.slice(0, 160)}`,
    );
  }

  /**
   * Thống kê từng endpoint trong tick hiện tại — phục vụ theo dõi độ tin cậy
   * RPC miễn phí (quyết định có cần endpoint trả phí dự phòng hay không).
   */
  endpointStats(): RpcEndpointStat[] {
    const urls = new Set<string>([
      ...this.endpoints,
      ...logsEndpoints().map((e) => e.url),
    ]);
    return [...urls]
      .map((url) => ({
        url: maskEndpoint(url),
        attempts: this.attempts.get(url) ?? 0,
        failures: this.failures.get(url) ?? 0,
        timeouts: this.timeouts.get(url) ?? 0,
      }))
      .filter((s) => s.attempts > 0);
  }

  /** Gọi 1 method, thử tối đa `tries` endpoint khác nhau. */
  // deno-lint-ignore no-explicit-any
  async call(method: string, params: any[], tries = 4): Promise<any> {
    let lastErr: unknown = null;
    for (let i = 0; i < tries; i++) {
      const ep = this.next();
      if (!ep) break;
      this.markAttempt(ep);
      try {
        const res = await fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
        });
        const resText = await res.text();
        if (!res.ok) {
          console.warn(
            `[rpcClient] HTTP ${res.status} from ${maskEndpoint(ep)}: ${resText.slice(0, 200)}`,
          );
          lastErr = new Error(`${maskEndpoint(ep)} HTTP ${res.status}`);
          this.markFailure(ep, lastErr);
          continue;
        }
        const json = JSON.parse(resText);
        if (json.error) {
          console.warn(
            `[rpcClient] rpc error from ${maskEndpoint(ep)}: ${JSON.stringify(json.error).slice(0, 200)}`,
          );
          lastErr = new Error(`${maskEndpoint(ep)} rpc error ${JSON.stringify(json.error).slice(0, 160)}`);
          this.markFailure(ep, lastErr);
          continue;
        }
        return json.result;
      } catch (e) {
        this.markFailure(ep, e);
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("no healthy RPC endpoint");
  }

  /** Batch nhiều call trong 1 HTTP request (JSON-RPC batch). */
  // deno-lint-ignore no-explicit-any
  async batch(calls: RpcCall[], tries = 4): Promise<(any | null)[]> {
    if (calls.length === 0) return [];
    let lastErr: unknown = null;
    for (let i = 0; i < tries; i++) {
      const ep = this.next();
      if (!ep) break;
      try {
        this.markAttempt(ep);
        const body = calls.map((c, idx) => ({
          jsonrpc: "2.0",
          id: idx,
          method: c.method,
          params: c.params,
        }));
        const res = await fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
        });
        const resText = await res.text();
        if (!res.ok) {
          console.warn(
            `[rpcClient] batch HTTP ${res.status} from ${maskEndpoint(ep)}: ${resText.slice(0, 200)}`,
          );
          lastErr = new Error(`${maskEndpoint(ep)} HTTP ${res.status}`);
          this.markFailure(ep, lastErr);
          continue;
        }
        const json = JSON.parse(resText);
        if (!Array.isArray(json)) {
          console.warn(
            `[rpcClient] batch non-array from ${maskEndpoint(ep)}: ${resText.slice(0, 200)}`,
          );
          lastErr = new Error(`${maskEndpoint(ep)} batch response không phải array`);
          this.markFailure(ep, lastErr);
          continue;
        }
        // deno-lint-ignore no-explicit-any
        const out: (any | null)[] = new Array(calls.length).fill(null);
        for (const item of json) {
          const idx = Number(item.id);
          if (Number.isInteger(idx) && idx >= 0 && idx < calls.length) {
            out[idx] = item.error ? null : (item.result ?? null);
          }
        }
        return out;
      } catch (e) {
        this.markFailure(ep, e);
        lastErr = e;
      }
    }
    throw lastErr ?? new Error("no healthy RPC endpoint");
  }

  allDead(): boolean {
    return this.healthy().length === 0;
  }

  /**
   * `eth_getLogs` an toàn: chỉ dùng endpoint hỗ trợ getLogs và TỰ CẮT span theo
   * giới hạn thật của endpoint đó. Trả về null khi không endpoint nào đọc được
   * (caller phải ghi gap, KHÔNG được đẩy watermark).
   *
   * @returns { logs, to } — `to` là block cuối cùng THỰC SỰ đã quét được.
   */
  async getLogsCapped(
    // deno-lint-ignore no-explicit-any
    filter: Record<string, any>,
    from: number,
    to: number,
    // deno-lint-ignore no-explicit-any
  ): Promise<{ logs: any[]; to: number } | null> {
    let lastErr: unknown = null;
    for (const ep of logsEndpoints()) {
      if ((this.failures.get(ep.url) ?? 0) >= this.maxFailures) continue;
      const segTo = Math.min(to, from + ep.maxSpan - 1);
      this.markAttempt(ep.url);
      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getLogs",
            params: [{
              ...filter,
              fromBlock: toHexBlock(from),
              toBlock: toHexBlock(segTo),
            }],
          }),
          signal: AbortSignal.timeout(RPC_LOGS_TIMEOUT_MS),
        });
        const resText = await res.text();
        if (!res.ok) {
          console.warn(
            `[rpcClient] getLogs HTTP ${res.status} from ${maskEndpoint(ep.url)}: ${resText.slice(0, 200)}`,
          );
          lastErr = new Error(`${maskEndpoint(ep.url)} HTTP ${res.status}`);
          this.markFailure(ep.url, lastErr);
          continue;
        }
        const json = JSON.parse(resText);
        if (json.error) {
          console.warn(
            `[rpcClient] getLogs rpc error from ${maskEndpoint(ep.url)}: ${JSON.stringify(json.error).slice(0, 200)}`,
          );
          lastErr = new Error(
            `${maskEndpoint(ep.url)} rpc error ${JSON.stringify(json.error).slice(0, 160)}`,
          );
          this.markFailure(ep.url, lastErr);
          continue;
        }
        return { logs: Array.isArray(json.result) ? json.result : [], to: segTo };
      } catch (e) {
        this.markFailure(ep.url, e);
        lastErr = e;
      }
    }
    console.error(
      "[rpcClient] getLogs thất bại toàn bộ endpoint:",
      lastErr instanceof Error ? lastErr.message : lastErr,
    );
    return null;
  }
}


export function hexToBigInt(hex: string | null | undefined): bigint {
  if (!hex) return 0n;
  return BigInt(hex);
}

export function toHexBlock(n: number | bigint): string {
  return "0x" + BigInt(n).toString(16);
}

/** Chuyển raw amount (BigInt string) sang chuỗi thập phân, không dùng float. */
export function formatUnitsString(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const v = neg ? -raw : raw;
  const divisor = 10n ** BigInt(decimals);
  const intPart = v / divisor;
  const frac = (v % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  const s = frac.length > 0 ? `${intPart}.${frac}` : intPart.toString();
  return neg ? `-${s}` : s;
}
