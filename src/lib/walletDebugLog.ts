/**
 * Wallet debug ring buffer — giữ 50 sự kiện ví gần nhất để user có thể "Báo lỗi"
 * gửi cho team Fun.Rich khi ví hành xử lạ trên mobile.
 *
 * KHÔNG ghi private key, signature payload, hay PII nhạy cảm.
 * Chỉ event name + metadata kỹ thuật (chain id, connector, user agent…).
 */
import logger from './logger';

export type WalletDebugEvent = {
  ts: number;
  event: string;
  data?: Record<string, unknown>;
};

const MAX_EVENTS = 50;
const STORAGE_KEY = 'fun.walletDebugLog';
const buffer: WalletDebugEvent[] = [];

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(buffer.slice(-MAX_EVENTS)));
  } catch {}
}

function hydrate() {
  if (typeof window === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) buffer.push(...arr.slice(-MAX_EVENTS));
  } catch {}
}
hydrate();

function sanitize(data?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (/key|secret|signature|seed|mnemonic|password/i.test(k)) continue;
    if (typeof v === 'string' && v.length > 200) {
      out[k] = v.slice(0, 200) + '…';
    } else if (typeof v === 'object' && v !== null) {
      try { out[k] = JSON.parse(JSON.stringify(v)); } catch { out[k] = '[unserializable]'; }
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function logWalletEvent(event: string, data?: Record<string, unknown>) {
  const entry: WalletDebugEvent = { ts: Date.now(), event, data: sanitize(data) };
  buffer.push(entry);
  if (buffer.length > MAX_EVENTS) buffer.shift();
  persist();
  logger.debug(`[WALLET] ${event}`, entry.data ?? '');
}

export function getWalletDebugLog(): WalletDebugEvent[] {
  return [...buffer];
}

export function clearWalletDebugLog() {
  buffer.length = 0;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

function buildLogText(): string {
  const meta = {
    ts: new Date().toISOString(),
    href: typeof window !== 'undefined' ? window.location.href : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    platform: typeof navigator !== 'undefined' ? navigator.platform : '',
    language: typeof navigator !== 'undefined' ? navigator.language : '',
    viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
  };
  const head = `# Fun.Rich wallet debug log\n${JSON.stringify(meta, null, 2)}\n\n`;
  const body = buffer
    .map(e => `[${new Date(e.ts).toISOString()}] ${e.event}${e.data ? ' ' + JSON.stringify(e.data) : ''}`)
    .join('\n');
  return head + body + '\n';
}

export function exportWalletDebugLog() {
  if (typeof window === 'undefined') return;
  try {
    const blob = new Blob([buildLogText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `funrich-wallet-debug-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    logger.warn('[WALLET] export debug log failed', e);
  }
}

export async function copyWalletDebugLogToClipboard(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildLogText());
    return true;
  } catch {
    return false;
  }
}
