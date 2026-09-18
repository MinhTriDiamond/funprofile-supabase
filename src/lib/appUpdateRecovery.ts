import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RECOVERY_KEY = "fun_profile_chunk_recovery";
const CHUNK_RECOVERY_RETURN_TO_KEY = "fun_profile_chunk_recovery_return_to";
const CHUNK_EMERGENCY_RECOVERY_KEY = "fun_profile_chunk_emergency_recovery";
const SPA_FALLBACK_RECOVERY_KEY = "fun_profile_spa_fallback_recovery";
const CHUNK_RECOVERY_WINDOW_MS = 60_000;
const CHUNK_EMERGENCY_RECOVERY_WINDOW_MS = 10 * 60_000;
const CHUNK_RECOVERY_MAX_AUTO_RELOADS = 3;
const CHUNK_EMERGENCY_MAX_AUTO_RELOADS = 1;
// Cloudflare Pages atomic-deploy race: index.html mới có thể trỏ tới chunk chưa
// propagate xong tới PoP của user (SPA fallback trả HTML). Cho phép cửa sổ retry
// riêng RỘNG HƠN với backoff để tránh hit limit sớm.
const SPA_FALLBACK_MAX_RETRIES = 4;
const SPA_FALLBACK_WINDOW_MS = 5 * 60_000;
const SPA_FALLBACK_BACKOFF_MS = [700, 1500, 3000, 6000];
const RECOVERY_HEALTHY_RESET_MS = 12_000;
const HARD_UPDATE_FALLBACK_RELOAD_MS = 2_500;
const MISSING_DEFAULT_CODE = "FUN_LAZY_MISSING_DEFAULT";
const RESCUE_QUERY_PARAM = "__fun_rescue";
const HARD_UPDATE_QUERY_PARAM = "__fun_hard";
// Sau hotfix "Web3 Root Decoupling": Web3Provider chỉ lazy-load on-demand
// trong modal quà/ví và có local boundary nuốt lỗi → KHÔNG còn root-critical.
// Một chunk Web3Provider lỗi không được phép đá user về `/` và cache-bust toàn app.
const ROOT_CRITICAL_LAZY_LABELS = new Set<string>();

let hardUpdateInProgress = false;

export type AppUpdateRecoveryReason =
  | "chunk-load-error"
  | "missing-default"
  | "mime-html"
  | "rpc-400"
  | "runtime-error"
  | "unknown";

type ChunkRecoveryState = {
  count: number;
  firstAt: number;
  lastAt?: number;
  lastPath?: string;
};

type EmergencyRecoveryState = {
  count: number;
  firstAt: number;
};

type HardUpdateOptions = {
  fallbackToHome?: boolean;
  resetRecovery?: boolean;
  rescue?: boolean;
  reason?: AppUpdateRecoveryReason;
};

type LazyModule<T extends ComponentType<any>> =
  | ({ default?: T } & Record<string, unknown>)
  | Record<string, unknown>
  | null
  | undefined;

export type LazyImportError = Error & {
  code?: string;
  lazyLabel?: string;
};

export function getChunkErrorMessage(reason: unknown) {
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`;
  if (typeof reason === "string") return reason;
  if (typeof reason === "object" && reason !== null && "message" in reason) {
    const message = (reason as { message?: unknown }).message;
    return typeof message === "string" ? message : String(message ?? "");
  }
  return "";
}

export function classifyAppUpdateRecoveryReason(reason: unknown): AppUpdateRecoveryReason {
  const normalized = getChunkErrorMessage(reason).toLowerCase();
  const maybeStatus = typeof reason === "object" && reason !== null && "status" in reason
    ? (reason as { status?: unknown }).status
    : undefined;

  if (maybeStatus === 400 || normalized.includes("status code 400") || normalized.includes("http 400")) {
    return "rpc-400";
  }

  if (isMissingDefaultExportError(reason)) {
    return "missing-default";
  }

  if (
    (normalized.includes("failed to load module script") && normalized.includes("text/html")) ||
    (normalized.includes("mime type") && normalized.includes("text/html")) ||
    normalized.includes("expected a javascript module script")
  ) {
    return "mime-html";
  }

  if (
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("importing a module script failed") ||
    normalized.includes("error loading dynamically imported module") ||
    normalized.includes("vite:preloaderror") ||
    normalized.includes("loading chunk") ||
    normalized.includes("chunkloaderror")
  ) {
    return "chunk-load-error";
  }

  if (reason instanceof Error || normalized) return "runtime-error";
  return "unknown";
}

export function isDynamicImportError(reason: unknown) {
  const group = classifyAppUpdateRecoveryReason(reason);
  return group === "chunk-load-error" || group === "mime-html" || group === "missing-default";
}

export function shouldAutoRecoverFromUpdateError(reason: unknown) {
  const group = classifyAppUpdateRecoveryReason(reason);
  // "missing-default" cũng là dấu hiệu index.html cũ trỏ vào chunk đã bị thay
  // (asset cũ trả về SPA fallback HTML) ⇒ phải tự cập nhật như chunk-load-error.
  return group === "chunk-load-error" || group === "mime-html" || group === "missing-default";
}


function readRecoveryState(): ChunkRecoveryState {
  try {
    const raw = sessionStorage.getItem(CHUNK_RECOVERY_KEY);
    if (!raw) return { count: 0, firstAt: Date.now() };
    const parsed = JSON.parse(raw) as Partial<ChunkRecoveryState>;
    if (
      typeof parsed.count !== "number" ||
      typeof parsed.firstAt !== "number" ||
      Date.now() - parsed.firstAt > CHUNK_RECOVERY_WINDOW_MS
    ) {
      return { count: 0, firstAt: Date.now() };
    }
    return { count: parsed.count, firstAt: parsed.firstAt };
  } catch {
    return { count: 0, firstAt: Date.now() };
  }
}

function writeRecoveryState(state: ChunkRecoveryState) {
  try {
    sessionStorage.setItem(CHUNK_RECOVERY_KEY, JSON.stringify(state));
  } catch {
    // Best effort only.
  }
}

function clearRecoveryState() {
  try {
    sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
    sessionStorage.removeItem(CHUNK_RECOVERY_RETURN_TO_KEY);
    sessionStorage.removeItem(SPA_FALLBACK_RECOVERY_KEY);
    // Tải lại bản mới = rời chế độ rescue.
    sessionStorage.removeItem('fun_profile_force_no_web3');
  } catch {
    // Best effort only.
  }
  try {
    localStorage.removeItem(CHUNK_RECOVERY_KEY);
    localStorage.removeItem(CHUNK_RECOVERY_RETURN_TO_KEY);
    localStorage.removeItem(CHUNK_EMERGENCY_RECOVERY_KEY);
    localStorage.removeItem(SPA_FALLBACK_RECOVERY_KEY);
  } catch {
    // Best effort only.
  }
}

// ────────────────────────────────────────────────────────────────────
// SPA fallback race (Cloudflare atomic-deploy) — retry riêng, rộng hơn.
// ────────────────────────────────────────────────────────────────────
function isSpaFallbackError(reason: unknown) {
  const group = classifyAppUpdateRecoveryReason(reason);
  // "mime-html" = server trả HTML thay vì JS (SPA fallback race).
  // "missing-default" = chunk resolve nhưng default export không phải component
  //   → thực tế production luôn là hệ quả deploy race, cùng cách xử lý (retry
  //   backoff giới hạn) sẽ tự hồi phục mà không cần user bấm "Tải lại trang".
  return group === "mime-html" || group === "missing-default";
}

function readSpaFallbackState(): ChunkRecoveryState {
  try {
    const raw = sessionStorage.getItem(SPA_FALLBACK_RECOVERY_KEY);
    if (!raw) return { count: 0, firstAt: Date.now() };
    const parsed = JSON.parse(raw) as Partial<ChunkRecoveryState>;
    if (
      typeof parsed.count !== "number" ||
      typeof parsed.firstAt !== "number" ||
      Date.now() - parsed.firstAt > SPA_FALLBACK_WINDOW_MS
    ) {
      return { count: 0, firstAt: Date.now() };
    }
    return { count: parsed.count, firstAt: parsed.firstAt };
  } catch {
    return { count: 0, firstAt: Date.now() };
  }
}

function writeSpaFallbackState(state: ChunkRecoveryState) {
  try {
    sessionStorage.setItem(SPA_FALLBACK_RECOVERY_KEY, JSON.stringify(state));
  } catch {
    // Best effort only.
  }
}


function readEmergencyRecoveryState(): EmergencyRecoveryState {
  try {
    const raw = localStorage.getItem(CHUNK_EMERGENCY_RECOVERY_KEY);
    if (!raw) return { count: 0, firstAt: Date.now() };
    const parsed = JSON.parse(raw) as Partial<EmergencyRecoveryState>;
    if (
      typeof parsed.count !== "number" ||
      typeof parsed.firstAt !== "number" ||
      Date.now() - parsed.firstAt > CHUNK_EMERGENCY_RECOVERY_WINDOW_MS
    ) {
      return { count: 0, firstAt: Date.now() };
    }
    return { count: parsed.count, firstAt: parsed.firstAt };
  } catch {
    return { count: 0, firstAt: Date.now() };
  }
}

function writeEmergencyRecoveryState(state: EmergencyRecoveryState) {
  try {
    localStorage.setItem(CHUNK_EMERGENCY_RECOVERY_KEY, JSON.stringify(state));
  } catch {
    // Best effort only.
  }
}

function clearEmergencyRecoveryState() {
  try {
    localStorage.removeItem(CHUNK_EMERGENCY_RECOVERY_KEY);
  } catch {
    // Best effort only.
  }
}

export function clearAppUpdateRecoveryState() {
  clearRecoveryState();
}

export function getLazyImportLabel(reason: unknown) {
  if (reason instanceof Error && "lazyLabel" in reason) {
    const label = (reason as LazyImportError).lazyLabel;
    if (typeof label === "string" && label.trim()) return label;
  }
  if (typeof reason === "object" && reason !== null && "lazyLabel" in reason) {
    const label = (reason as { lazyLabel?: unknown }).lazyLabel;
    if (typeof label === "string" && label.trim()) return label;
  }

  const message = getChunkErrorMessage(reason);
  const match = message.match(/Dynamic import resolved without default export:\s*([^\n]+)/i);
  return match?.[1]?.trim() || null;
}

function isMissingDefaultExportError(reason: unknown) {
  if (reason instanceof Error && "code" in reason) {
    return (reason as LazyImportError).code === MISSING_DEFAULT_CODE;
  }
  return getChunkErrorMessage(reason).toLowerCase().includes("dynamic import resolved without default export");
}

function rememberCurrentRouteForFallback() {
  try {
    const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (route && route !== "/") {
      sessionStorage.setItem(CHUNK_RECOVERY_RETURN_TO_KEY, route);
    }
  } catch {
    // Best effort only.
  }
}

export async function clearAppCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Best effort only.
  }

  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Best effort only.
  }
}

async function warmFreshAppShell() {
  try {
    const response = await fetch(`/index.html?__fun_probe=${Date.now()}`, {
      cache: "reload",
      credentials: "same-origin",
      headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
    });

    if (response.ok) {
      return true;
    }
  } catch {
    // Network/CDN errors should not block the hard reload attempt.
  }
  return false;
}

function extractAssetUrl(reason: unknown): string | null {
  const message = getChunkErrorMessage(reason);
  const match = message.match(/https?:\/\/[^\s)"']+\/assets\/[^\s)"']+\.js|\/assets\/[^\s)"']+\.js/i);
  if (!match?.[0]) return null;
  try {
    return new URL(match[0], window.location.origin).toString();
  } catch {
    return null;
  }
}

async function verifyJavascriptAsset(reason: unknown) {
  const assetUrl = extractAssetUrl(reason);
  if (!assetUrl) return { checked: false, ok: false, assetUrl: null, status: null, contentType: null };

  try {
    const response = await fetch(assetUrl, {
      method: "HEAD",
      cache: "no-store",
      credentials: "same-origin",
    });
    const contentType = response.headers.get("content-type");
    const ok = response.ok && /javascript|ecmascript/i.test(contentType ?? "");
    return { checked: true, ok, assetUrl, status: response.status, contentType };
  } catch {
    return { checked: true, ok: false, assetUrl, status: null, contentType: null };
  }
}

function scheduleVerifiedHardUpdate(
  reason: unknown,
  options: HardUpdateOptions,
  delayMs = 0,
) {
  window.setTimeout(() => {
    void verifyJavascriptAsset(reason).then((asset) => {
      console.warn("[appUpdateRecovery] hard-reload-check", {
        reason: classifyAppUpdateRecoveryReason(reason),
        message: getChunkErrorMessage(reason),
        asset,
      });
      if (asset.checked && asset.ok) {
        console.warn("[appUpdateRecovery] asset is valid javascript; hard reload skipped", {
          reason: classifyAppUpdateRecoveryReason(reason),
          asset,
        });
        return;
      }
      applyHardUpdate(options);
    });
  }, delayMs);
}

// Ngân sách reload toàn cục (localStorage, sống qua mọi lần reload/tab).
// Chống vòng lặp "nhấp nháy": nếu app đã tự tải lại quá nhiều lần trong cửa sổ
// ngắn thì dừng auto-reload, để user thấy màn hình lỗi và tự bấm.
const RELOAD_BUDGET_KEY = "fun_profile_reload_budget";
const RELOAD_BUDGET_MAX = 3;
const RELOAD_BUDGET_WINDOW_MS = 5 * 60_000;

function takeReloadBudget() {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(RELOAD_BUDGET_KEY);
    const parsed = raw ? (JSON.parse(raw) as { count?: number; firstAt?: number }) : null;
    const state =
      parsed &&
      typeof parsed.count === "number" &&
      typeof parsed.firstAt === "number" &&
      now - parsed.firstAt <= RELOAD_BUDGET_WINDOW_MS
        ? { count: parsed.count, firstAt: parsed.firstAt }
        : { count: 0, firstAt: now };

    if (state.count >= RELOAD_BUDGET_MAX) return false;
    localStorage.setItem(
      RELOAD_BUDGET_KEY,
      JSON.stringify({ count: state.count + 1, firstAt: state.firstAt }),
    );
    return true;
  } catch {
    return true;
  }
}

export function clearReloadBudget() {
  try {
    localStorage.removeItem(RELOAD_BUDGET_KEY);
  } catch {
    // best effort
  }
}

export function reloadWithCacheBust(
  options: Pick<HardUpdateOptions, "fallbackToHome" | "rescue"> & { hard?: boolean } = {},
) {
  if (!takeReloadBudget()) {
    console.warn("[appUpdateRecovery] reload budget exhausted; staying on page to avoid reload loop");
    hardUpdateInProgress = false;
    return;
  }
  const url = options.fallbackToHome
    ? new URL("/", window.location.origin)
    : new URL(window.location.href);
  const stamp = String(Date.now());
  url.searchParams.set("__fun_update", stamp);
  url.searchParams.set("__fun_reload", stamp);
  if (options.rescue) {
    url.searchParams.set(RESCUE_QUERY_PARAM, stamp);
  }
  if (options.hard) {
    url.searchParams.set(HARD_UPDATE_QUERY_PARAM, stamp);
  }
  window.location.replace(url.toString());
}


export function applyHardUpdate(options: HardUpdateOptions = {}) {
  console.warn("[appUpdateRecovery] apply-hard-update", {
    reason: options.reason ?? "unknown",
    fallbackToHome: options.fallbackToHome ?? false,
    resetRecovery: options.resetRecovery ?? false,
    rescue: options.rescue ?? false,
  });
  hardUpdateInProgress = true;
  const rescue = options.rescue ?? options.fallbackToHome === true;
  if (options.resetRecovery) {
    clearRecoveryState();
    clearEmergencyRecoveryState();
  }
  if (options.fallbackToHome) {
    rememberCurrentRouteForFallback();
  }

  const fallbackTimer = window.setTimeout(() => {
    reloadWithCacheBust({ fallbackToHome: options.fallbackToHome, rescue, hard: true });
  }, HARD_UPDATE_FALLBACK_RELOAD_MS);

  clearAppCaches()
    .then(warmFreshAppShell)
    .then((freshShellReady) => {
      if (freshShellReady && options.resetRecovery) {
        clearRecoveryState();
        clearEmergencyRecoveryState();
      }
    })
    .finally(() => {
      window.clearTimeout(fallbackTimer);
      reloadWithCacheBust({ fallbackToHome: options.fallbackToHome, rescue, hard: true });
    });
}


export function recoverFromChunkLoadError(reason: unknown) {
  const errorGroup = classifyAppUpdateRecoveryReason(reason);
  console.warn("[appUpdateRecovery] recovery-classified", {
    reason: errorGroup,
    message: getChunkErrorMessage(reason),
    label: getLazyImportLabel(reason),
  });

  if (errorGroup === "rpc-400" || errorGroup === "runtime-error" || errorGroup === "unknown") {
    return false;
  }

  // "missing-default" trong production hầu như luôn là hậu quả của deploy race
  // (chunk mới bị Cloudflare/CDN trả về stale hoặc SPA-fallback HTML được eval
  // như JS ⇒ module resolve nhưng thiếu default). Xử lý như SPA-fallback race:
  // retry backoff giới hạn, nếu vẫn lặp thì mới bail sang màn hình manual.
  if (errorGroup === "missing-default") {
    console.warn("[appUpdateRecovery] missing-default → treating as deploy race, scheduling backoff reload", {
      label: getLazyImportLabel(reason),
      message: getChunkErrorMessage(reason),
    });
  }

  const label = getLazyImportLabel(reason);
  const spaFallback = isSpaFallbackError(reason);

  console.warn(`[appUpdateRecovery] ${errorGroup}`, {
    label,
    message: getChunkErrorMessage(reason),
  });

  // ── Nhóm 1: SPA fallback race (chunk mới chưa propagate xong).
  // Dùng cửa sổ retry riêng 5 phút + backoff để tránh hit limit sớm.
  if (spaFallback) {
    const spaState = readSpaFallbackState();
    if (spaState.count >= SPA_FALLBACK_MAX_RETRIES) {
      console.warn("[appUpdateRecovery] spa-fallback-race retry limit reached", {
        count: spaState.count,
        label,
      });
      // Rơi xuống flow chunk-load-error thường (sẽ hiện màn manual nếu vượt limit).
    } else {
      const nextCount = spaState.count + 1;
      writeSpaFallbackState({
        count: nextCount,
        firstAt: spaState.firstAt,
        lastAt: Date.now(),
        lastPath: `${window.location.pathname}${window.location.search}`,
      });
      const delayMs =
        SPA_FALLBACK_BACKOFF_MS[Math.min(nextCount - 1, SPA_FALLBACK_BACKOFF_MS.length - 1)];
      console.warn("[appUpdateRecovery] spa-fallback-race scheduling backoff reload", {
        attempt: nextCount,
        delayMs,
        label,
      });
      scheduleVerifiedHardUpdate(
        reason,
        { resetRecovery: false, fallbackToHome: false, rescue: false, reason: errorGroup },
        delayMs,
      );
      return true;
    }
  }

  const state = readRecoveryState();
  const isRootCriticalModule = Boolean(label && ROOT_CRITICAL_LAZY_LABELS.has(label));
  if (state.count >= CHUNK_RECOVERY_MAX_AUTO_RELOADS) {
    if (isRootCriticalModule) {
      const emergencyState = readEmergencyRecoveryState();
      if (emergencyState.count < CHUNK_EMERGENCY_MAX_AUTO_RELOADS) {
        writeEmergencyRecoveryState({
          count: emergencyState.count + 1,
          firstAt: emergencyState.firstAt,
        });
        console.warn("[appUpdateRecovery] Emergency root chunk recovery", {
          count: emergencyState.count + 1,
          label,
          message: getChunkErrorMessage(reason),
        });
        scheduleVerifiedHardUpdate(reason, {
          resetRecovery: true,
          fallbackToHome: true,
          rescue: true,
          reason: errorGroup,
        });
        return true;
      }
    }
    console.warn("[appUpdateRecovery] Auto recovery limit reached; waiting for manual hard update", {
      count: state.count,
      label,
      group: errorGroup,
    });
    return false;
  }

  const nextCount = state.count + 1;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const isFeedOrHome = isRootCriticalModule || window.location.pathname === "/";
  const shouldFallbackToHome = nextCount >= CHUNK_RECOVERY_MAX_AUTO_RELOADS || isFeedOrHome;
  writeRecoveryState({
    count: nextCount,
    firstAt: state.firstAt,
    lastAt: Date.now(),
    lastPath: currentPath,
  });
  scheduleVerifiedHardUpdate(reason, {
    fallbackToHome: shouldFallbackToHome,
    rescue: shouldFallbackToHome || isFeedOrHome,
    reason: errorGroup,
  });
  return true;
}


function createMissingDefaultError(label?: string) {
  const error = new Error(
    `Dynamic import resolved without default export${label ? `: ${label}` : ""}`,
  ) as LazyImportError;
  error.name = "LazyImportMissingDefaultError";
  error.code = MISSING_DEFAULT_CODE;
  error.lazyLabel = label;
  return error;
}

function AppUpdatePending() {
  return null;
}

function isLikelyComponent(value: unknown): value is ComponentType<any> {
  if (typeof value === "function") return true;
  if (typeof value !== "object" || value === null) return false;
  const maybeReactWrapper = value as { $$typeof?: unknown; render?: unknown; type?: unknown };
  return Boolean(maybeReactWrapper.$$typeof || maybeReactWrapper.render || maybeReactWrapper.type);
}

function findFallbackExport<T extends ComponentType<any>>(
  module: Record<string, unknown> | null | undefined,
  label?: string,
): T | null {
  if (!module) return null;

  const labelFallback = label ? module[label] : undefined;
  if (isLikelyComponent(labelFallback)) return labelFallback as T;

  for (const [key, value] of Object.entries(module)) {
    if (key === "default") continue;
    if (isLikelyComponent(value)) return value as T;
  }

  return null;
}

// React.lazy helpers must accept components with arbitrary props and preserve T.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureLazyDefault<T extends ComponentType<any>>(
  module: LazyModule<T>,
  label?: string,
): { default: T } {
  const defaultExport = module && "default" in module ? module.default : undefined;
  if (isLikelyComponent(defaultExport)) {
    return { default: defaultExport as T };
  }

  const namedFallback = findFallbackExport<T>(module, label);
  if (namedFallback) {
    console.warn("[appUpdateRecovery] Dynamic import using named export fallback", {
      label,
      moduleKeys: module ? Object.keys(module) : [],
    });
    return { default: namedFallback };
  }

  const error = createMissingDefaultError(label);
  console.error("[appUpdateRecovery] Dynamic import missing default export", {
    label,
    moduleKeys: module ? Object.keys(module) : [],
  });
  if (hardUpdateInProgress) {
    return { default: AppUpdatePending as unknown as T };
  }
  throw error;
}

export function cleanupRecoveryQueryParams() {
  try {
    const url = new URL(window.location.href);
    let changed = false;
    // "Cập nhật ngay" (hard update) → boot thành công = xoá toàn bộ recovery state
    // ngay lập tức, không đợi delay 12s. Bảo đảm user thoát vòng lặp trong 1 click.
    if (url.searchParams.has(HARD_UPDATE_QUERY_PARAM)) {
      clearRecoveryState();
      clearEmergencyRecoveryState();
      url.searchParams.delete(HARD_UPDATE_QUERY_PARAM);
      changed = true;
      console.info("[appUpdateRecovery] hard-update boot: cleared all recovery state");
    }
    if (url.searchParams.has("__fun_update")) {
      url.searchParams.delete("__fun_update");
      changed = true;
    }
    if (url.searchParams.has("__fun_reload")) {
      url.searchParams.delete("__fun_reload");
      changed = true;
    }
    if (url.searchParams.has("__fun_probe")) {
      url.searchParams.delete("__fun_probe");
      changed = true;
    }
    if (url.searchParams.has(RESCUE_QUERY_PARAM)) {
      url.searchParams.delete(RESCUE_QUERY_PARAM);
      changed = true;
    }
    if (url.searchParams.has("__fun_no_web3")) {
      // Snapshot trước khi xóa: ConditionalWeb3Provider + OptionalWeb3Provider
      // sẽ đọc cờ này từ sessionStorage trong suốt phiên rescue.
      try {
        sessionStorage.setItem('fun_profile_force_no_web3', '1');
      } catch {
        // best effort
      }
      url.searchParams.delete("__fun_no_web3");
      changed = true;
    }
    if (changed) {
      window.history.replaceState(window.history.state, "", url.toString());
    }
  } catch {
    // Best effort only.
  }
}

export function resetChunkRecoveryAfterHealthyLoad(delayMs = RECOVERY_HEALTHY_RESET_MS) {
  // Dọn URL ngay để user không thấy ?__fun_update=... sau khi reload thành công.
  cleanupRecoveryQueryParams();
  window.setTimeout(() => {
    const state = readRecoveryState();
    if (state.count > 0) {
      clearRecoveryState();
    }
    clearEmergencyRecoveryState();
    // App đã boot khoẻ → trả lại ngân sách reload.
    clearReloadBudget();
    // SPA-fallback state cũng reset khi app đã boot healthy đủ lâu.
    try {
      sessionStorage.removeItem(SPA_FALLBACK_RECOVERY_KEY);
    } catch {
      // best effort
    }

  }, delayMs);
}


// Siết type: factory BẮT BUỘC resolve về module có `default: T`.
// TS sẽ chặn tại build nếu ai đó lỡ trỏ `lazyWithChunkRecovery` vào một
// module chỉ có named export (như incident FacebookCreatePost 2026-07-16).
// Nếu module chỉ có named export, hãy dùng `lazyNamedWithChunkRecovery`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithChunkRecovery<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  label?: string,
): LazyExoticComponent<T> {
  return lazy(() =>
    factory()
      .then((module) => ensureLazyDefault(module, label))
      .catch((error) => {
        recoverFromChunkLoadError(error);
        throw error;
      }),
  );
}

export function lazyNamedWithChunkRecovery<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends ComponentType<any>,
  M extends Record<string, unknown>,
>(
  factory: () => Promise<M>,
  exportName: keyof M & string,
): LazyExoticComponent<T> {
  return lazy(() =>
    factory()
      .then((module) =>
        ensureLazyDefault(
          { default: module?.[exportName] as T | undefined },
          exportName,
        ),
      )
      .catch((error) => {
        recoverFromChunkLoadError(error);
        throw error;
      }),
  );
}
