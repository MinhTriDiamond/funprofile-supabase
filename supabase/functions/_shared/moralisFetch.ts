// Shared Moralis fetch helper với fallback API key + circuit-breaker.
//
// Ưu tiên MORALIS_API_KEY (primary). Khi gặp 429 (rate limit) hoặc 402/401
// (quota exhausted / key bị chặn) sẽ thử key backup nếu có.
//
// CIRCUIT-BREAKER (19/08/2026): trước đây khi cả 3 key đều cạn quota, mỗi call
// logic biến thành 3 HTTP call ⇒ đốt counter quota gấp 3 lần vô ích. Nay key nào
// trả lỗi quota sẽ bị "tạm ngừng" trong bộ nhớ tới khi quota reset (00:00 UTC),
// và nếu CẢ các key đều bị ngừng thì fail nhanh, KHÔNG gọi HTTP nào.

export function getMoralisKeys(): string[] {
  const keys = [
    Deno.env.get("MORALIS_API_KEY") ?? "",
    Deno.env.get("MORALIS_API_KEY_2") ?? "",
    Deno.env.get("MORALIS_API_KEY_3") ?? "",
  ].filter((k) => k.trim().length > 0);
  return keys;
}

export function hasMoralisKey(): boolean {
  return getMoralisKeys().length > 0;
}

export interface MoralisFetchResult {
  response: Response;
  keyIndex: number; // 0 = primary, 1 = backup
  attempts: number;
}

// ---------------------------------------------------------------------------
// Circuit-breaker state
// ---------------------------------------------------------------------------

interface BreakerEntry {
  until: number; // epoch ms
  status: number;
  reason: string;
}

const breakers = new Map<string, BreakerEntry>();

/** Lỗi quota/khoá key ⇒ ngừng tới khi quota reset 00:00 UTC. */
const QUOTA_STATUSES = [401, 402, 403];
/** Rate limit tạm thời ⇒ ngừng ngắn 60s. */
const RATE_LIMIT_STATUS = 429;
const RATE_LIMIT_COOLDOWN_MS = 60_000;

export function nextUtcMidnight(now: number = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
}

function keyId(key: string): string {
  return key.slice(-6);
}

export function isKeyTripped(key: string, now: number = Date.now()): boolean {
  const entry = breakers.get(keyId(key));
  if (!entry) return false;
  if (entry.until <= now) {
    breakers.delete(keyId(key));
    return false;
  }
  return true;
}

/**
 * Sự kiện trip trong lần chạy này — dùng để cảnh báo admin NGAY LẦN ĐẦU
 * key bị cạn quota (không chờ ngưỡng % của bộ đếm nội bộ, vì bộ đếm đã được
 * xác nhận không phản ánh giới hạn thật của Moralis — sự cố 20/08/2026).
 */
export interface TripEvent {
  keyId: string;
  status: number;
  reason: string;
  at: string;
  until: string;
}

const tripEvents: TripEvent[] = [];

export function getMoralisTripEvents(): TripEvent[] {
  return [...tripEvents];
}

export function tripKey(key: string, status: number, reason = ""): void {
  const now = Date.now();
  const until = status === RATE_LIMIT_STATUS
    ? now + RATE_LIMIT_COOLDOWN_MS
    : nextUtcMidnight(now);
  const alreadyTripped = breakers.has(keyId(key));
  breakers.set(keyId(key), { until, status, reason: reason.slice(0, 200) });
  if (!alreadyTripped && status !== RATE_LIMIT_STATUS) {
    tripEvents.push({
      keyId: keyId(key),
      status,
      reason: reason.slice(0, 200),
      at: new Date(now).toISOString(),
      until: new Date(until).toISOString(),
    });
  }
  console.warn(
    `[moralisFetch] circuit-breaker: key …${keyId(key)} tạm ngừng tới ${
      new Date(until).toISOString()
    } (status ${status})`,
  );
}


/** true khi mọi key hiện có đều đang bị ngừng (hoặc không có key nào). */
export function areAllMoralisKeysTripped(keys = getMoralisKeys()): boolean {
  if (keys.length === 0) return true;
  return keys.every((k) => isKeyTripped(k));
}

export function getTrippedKeys(): { key: string; until: string; status: number }[] {
  const now = Date.now();
  const out: { key: string; until: string; status: number }[] = [];
  for (const [id, e] of breakers.entries()) {
    if (e.until > now) {
      out.push({ key: `…${id}`, until: new Date(e.until).toISOString(), status: e.status });
    }
  }
  return out;
}

/** Chỉ dùng trong test. */
export function resetMoralisBreakers(): void {
  breakers.clear();
  tripEvents.length = 0;
}


// Cho phép test inject fetch giả.
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
let fetchImpl: FetchLike = (url, init) => fetch(url, init);
/** Chỉ dùng trong test. */
export function __setMoralisFetchImpl(impl: FetchLike | null): void {
  fetchImpl = impl ?? ((url, init) => fetch(url, init));
}

/**
 * Fetch Moralis endpoint với auto-fallback sang key backup + circuit-breaker.
 */
export async function moralisFetchRaw(
  url: string,
  init: RequestInit = {},
): Promise<MoralisFetchResult> {
  const allKeys = getMoralisKeys();
  if (allKeys.length === 0) {
    throw new Error("MORALIS_API_KEY not configured");
  }

  const keys = allKeys.filter((k) => !isKeyTripped(k));

  // Fail-fast: mọi key đang bị ngừng ⇒ không gọi HTTP, trả trạng thái
  // provider_unavailable cho scanner (Silent Failure Guard vẫn đúng).
  if (keys.length === 0) {
    const body = JSON.stringify({
      message: "all Moralis keys tripped by circuit-breaker (quota exhausted)",
      tripped: getTrippedKeys(),
    });
    recordFailure(url, 402, body);
    console.error(
      "[moralisFetch] fail-fast: tất cả key Moralis đang tạm ngừng, không gọi HTTP",
    );
    return {
      response: new Response(body, {
        status: 402,
        headers: { "Content-Type": "application/json" },
      }),
      keyIndex: -1,
      attempts: 0,
    };
  }

  const baseHeaders = new Headers(init.headers ?? {});
  if (!baseHeaders.has("Accept") && !baseHeaders.has("accept")) {
    baseHeaders.set("Accept", "application/json");
  }

  let lastResponse: Response | null = null;
  let attempts = 0;

  for (let i = 0; i < keys.length; i++) {
    attempts++;
    const headers = new Headers(baseHeaders);
    headers.set("X-API-Key", keys[i]);

    callCount++;
    const res = await fetchImpl(url, { ...init, headers });

    lastResponse = res;

    const isQuotaError = QUOTA_STATUSES.includes(res.status) ||
      res.status === RATE_LIMIT_STATUS;

    let body = "";
    if (!res.ok) {
      try {
        body = await res.clone().text();
      } catch (_) {
        // ignore
      }
    }

    if (isQuotaError) {
      // Đánh dấu key này ngừng để các call sau không thử lại nữa.
      tripKey(keys[i], res.status, body);
    }

    if (!isQuotaError || i === keys.length - 1) {
      if (!res.ok) {
        // Ghi nhận lỗi provider để scanner báo cáo ra response (không im lặng)
        recordFailure(url, res.status, body);
        console.error(
          `[moralisFetch] provider error ${res.status} @ ${url.split("?")[0]}: ${body.slice(0, 200)}`,
        );
      }
      return { response: res, keyIndex: allKeys.indexOf(keys[i]), attempts };
    }

    // Tiêu thụ body để tránh leak, rồi thử key kế tiếp
    try {
      await res.arrayBuffer();
    } catch (_) {
      // ignore
    }
    console.warn(
      `[moralisFetch] key #${i} trả về ${res.status}, fallback sang key #${i + 1}`,
    );
  }

  return {
    response: lastResponse!,
    keyIndex: allKeys.indexOf(keys[keys.length - 1]),
    attempts,
  };
}

/**
 * Wrapper tiện dụng: trả về Response (giống fetch chuẩn) với auto-fallback.
 */
export async function moralisFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const { response } = await moralisFetchRaw(url, init);
  return response;
}

// ---------------------------------------------------------------------------
// Provider failure tracking
//
// Bối cảnh (17/08/2026): các scanner đều làm `if (!res.ok) { break; }` nên khi
// Moralis trả 401/402/429 (hết quota ngày / key sai / rate limit) thì vòng lặp
// dừng im lặng, function vẫn trả HTTP 200 với `newTransfers: 0` và báo
// "Không có giao dịch mới" — trong khi thực tế KHÔNG quét được gì.
// Tracker dưới đây cho phép mọi scanner báo cáo lỗi provider ra response,
// để FE/admin biết là "chưa quét được" thay vì "không có gì mới".
// ---------------------------------------------------------------------------

export interface MoralisFailure {
  status: number;
  endpoint: string;
  body: string;
  at: string;
}

const failures: MoralisFailure[] = [];

/** Mã lỗi đồng nghĩa "provider không khả dụng" (quota/key/rate-limit). */
const UNAVAILABLE_STATUSES = [401, 402, 403, 429];

export function resetMoralisFailures(): void {
  failures.length = 0;
  callCount = 0;
}

// ---------------------------------------------------------------------------
// Quota tracking (18/08/2026)
// Đếm số lần gọi Moralis trong 1 lần chạy function, để scanner ghi vào
// `moralis_api_usage` (RPC `moralis_usage_record`) và báo động admin khi vượt
// ngưỡng cảnh báo quota ngày — không đợi tới lúc cháy quota mới biết.
// ---------------------------------------------------------------------------

let callCount = 0;

export function getMoralisCallCount(): number {
  return callCount;
}

/**
 * Cảnh báo admin NGAY khi có key bị cạn quota thật (401/402/403), dedupe theo
 * (key, ngày UTC). Không phụ thuộc bộ đếm nội bộ `moralis_api_usage`.
 */
export async function flushMoralisQuotaAlerts(
  // deno-lint-ignore no-explicit-any
  adminClient: any,
  source: string,
): Promise<number> {
  const events = tripEvents.splice(0, tripEvents.length);
  if (events.length === 0) return 0;
  let sent = 0;
  try {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { data: admins } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    for (const ev of events) {
      const title = `Moralis key …${ev.keyId} đã cạn quota (HTTP ${ev.status})`;
      const { data: dup } = await adminClient
        .from("notifications")
        .select("id")
        .eq("type", "moralis_quota_alert")
        .eq("title", title)
        .gte("created_at", dayStart.toISOString())
        .limit(1);
      if (dup && dup.length > 0) continue;

      const content =
        `Nguồn gọi: ${source}. Thời điểm: ${ev.at}. Lỗi provider: ${ev.reason || "quota exhausted"}. ` +
        `Key này bị tạm ngừng tới ${ev.until} (reset quota 00:00 UTC). ` +
        `CẢNH BÁO: hệ thống đang MÙ ON-CHAIN MỘT PHẦN qua Moralis tới khi quota reset — ` +
        `giao dịch mới có thể không được ghi nhận cho tới lúc đó. ` +
        `Nếu tất cả key đều cạn, mọi lượt quét Moralis sẽ dừng hoàn toàn.`;

      for (const a of admins ?? []) {
        await adminClient.from("notifications").insert({
          user_id: a.user_id,
          type: "moralis_quota_alert",
          title,
          content,
        });
      }
      sent++;
    }
  } catch (e) {
    console.error("[moralisFetch] flushMoralisQuotaAlerts failed:", e);
  }
  return sent;
}

/** Ghi số call vào bảng usage + notify admin khi vượt ngưỡng (mặc định 80%). */
export async function reportMoralisUsage(
  // deno-lint-ignore no-explicit-any
  adminClient: any,
  source: string,
): Promise<void> {
  // Ưu tiên cảnh báo 401 thật trước, kể cả khi không có call nào (fail-fast).
  await flushMoralisQuotaAlerts(adminClient, source);
  const calls = callCount;
  if (calls <= 0) return;

  try {
    const { data, error } = await adminClient.rpc("moralis_usage_record", {
      p_calls: calls,
      p_source: source,
    });
    if (error) {
      console.error("[moralisFetch] usage record error:", error.message);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.should_alert) return;

    const { data: admins } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const pct = Math.round(Number(row.pct_used || 0));
    for (const a of admins ?? []) {
      await adminClient.from("notifications").insert({
        user_id: a.user_id,
        type: "moralis_quota_alert",
        title: `Quota Moralis đã dùng ${pct}%`,
        content:
          `Hôm nay đã gọi ${row.call_count}/${row.daily_limit} lượt Moralis (${pct}%). ` +
          `Nếu cạn quota, scanner on-chain sẽ không quét được giao dịch mới. Nguồn gọi nhiều nhất: ${source}.`,
      });
    }
  } catch (e) {
    console.error("[moralisFetch] reportMoralisUsage failed:", e);
  }
}


export function getMoralisFailures(): MoralisFailure[] {
  return [...failures];
}

/** true khi có ít nhất 1 lần gọi thất bại vì quota/key/rate-limit. */
export function isMoralisUnavailable(): boolean {
  return failures.some((f) => UNAVAILABLE_STATUSES.includes(f.status));
}

function recordFailure(url: string, status: number, body: string): void {
  // Chỉ giữ tối đa 20 lỗi gần nhất để tránh phình bộ nhớ
  if (failures.length >= 20) failures.shift();
  let endpoint = url;
  try {
    endpoint = new URL(url).pathname;
  } catch (_) {
    // ignore
  }
  failures.push({
    status,
    endpoint,
    body: body.slice(0, 200),
    at: new Date().toISOString(),
  });
}
