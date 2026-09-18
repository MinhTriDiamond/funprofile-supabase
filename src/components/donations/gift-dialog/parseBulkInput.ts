/**
 * Bulk recipient input parser.
 * Supports: pasted text (mixed @usernames, 0x addresses, link profile fun.rich/<username>),
 *           và CSV (address,amount per line hoặc username,amount).
 *
 * v3 (06/2026):
 *  - Nhận diện link profile (fun.rich, funprofile.lovable.app, id-preview--*.lovable.app)
 *    và tự tách username.
 *  - Phát hiện sớm trùng username/address ngay trong cùng batch, kèm số dòng đầu tiên xuất hiện.
 */

import { supabase } from '@/integrations/supabase/client';
import type { ResolvedRecipient } from './types';

export interface ParsedToken {
  raw: string;
  kind: 'username' | 'address' | 'invalid';
  amount?: string;
  lineNo: number;
  /** Lý do invalid (chỉ set khi kind === 'invalid'). */
  invalidReason?: string;
}

export interface BulkInvalidEntry {
  raw: string;
  lineNo: number;
  reason: string;
}

export interface BulkParseResult {
  resolved: ResolvedRecipient[];
  amounts: Record<string, string>;        // recipientId -> amount (per-row override)
  duplicates: BulkInvalidEntry[];
  notFound: BulkInvalidEntry[];
  invalid: BulkInvalidEntry[];
  selfReferences: BulkInvalidEntry[];
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const USERNAME_RE = /^@?[a-zA-Z0-9_.-]{2,30}$/;

/** Host hợp lệ cho link profile FUN.RICH ecosystem. */
const PROFILE_HOST_WHITELIST = [
  'fun.rich',
  'www.fun.rich',
  'funprofile.lovable.app',
  'www.funprofile.lovable.app',
];

/** Các route hệ thống — segment đầu tiên KHÔNG được coi là username. */
const RESERVED_ROUTES = new Set([
  'wallet', 'settings', 'post', 'live', 'reels', 'auth', 'identity',
  'connector', 'pet', 'quests', 'chat', 'donations', 'founder', 'admin',
  'docs', 'feed', 'notifications', 'search', 'home', 'profile', 'login',
  'register', 'signup', 'logout', 'verify-email', 'set-password', 'sso',
  'api', 'mystery-box', 'security',
]);

/**
 * Trích username từ link profile.
 * Trả về:
 *  - { username: 'leminhtri' } nếu thành công
 *  - { reservedRoute: 'wallet' } nếu segment là route hệ thống
 *  - null nếu không phải URL hoặc không khớp whitelist
 */
function extractUsernameFromUrl(
  raw: string,
): { username?: string; reservedRoute?: string } | null {
  if (!raw) return null;
  // Phát hiện thô — chuỗi phải chứa "://" hoặc bắt đầu bằng host có "." (vd www.fun.rich/abc)
  const looksLikeUrl = /:\/\//.test(raw) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(raw);
  if (!looksLikeUrl) return null;
  let url: URL;
  try {
    const withScheme = /:\/\//.test(raw) ? raw : `https://${raw}`;
    url = new URL(withScheme);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const matchesWhitelist =
    PROFILE_HOST_WHITELIST.includes(host) ||
    /^id-preview--[a-z0-9-]+\.lovable\.app$/.test(host) ||
    /\.lovable\.app$/.test(host);
  if (!matchesWhitelist) return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  let first = segments[0];
  if (first.startsWith('@')) first = first.slice(1);
  first = first.toLowerCase();
  if (!first) return null;
  if (RESERVED_ROUTES.has(first)) return { reservedRoute: first };
  if (!USERNAME_RE.test(first)) return null;
  return { username: first };
}

/** Validate amount string: phải là số dương hữu hạn. */
function validateAmount(amount: string | undefined): { valid: boolean; reason?: string } {
  if (amount === undefined || amount === '') return { valid: true };
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n <= 0) {
    return { valid: false, reason: `Số tiền không hợp lệ ("${amount}")` };
  }
  return { valid: true };
}

/** Split a free-form paste into tokens (1 token per recipient, optional amount after comma). */
export function tokenize(input: string): ParsedToken[] {
  if (!input?.trim()) return [];
  const rawLines = input.split(/\n/);
  const tokens: ParsedToken[] = [];

  rawLines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const subLines = rawLine.split(/;/).map(s => s.trim()).filter(Boolean);
    for (const line of subLines) {
      if (line.includes(',')) {
        const parts = line.split(',').map(p => p.trim()).filter(Boolean);
        if (parts.length === 0) continue;
        const id = parts[0];
        const amount = parts[1];
        tokens.push(classify(id, amount, lineNo));
      } else {
        // Tránh tách URL theo khoảng trắng → giữ nguyên 1 token nếu trông như URL.
        if (/^https?:\/\//i.test(line) || /^(www\.)?[a-z0-9-]+\.[a-z]{2,}\//i.test(line)) {
          tokens.push(classify(line, undefined, lineNo));
        } else {
          const pieces = line.split(/\s+/).map(p => p.trim()).filter(Boolean);
          for (const piece of pieces) tokens.push(classify(piece, undefined, lineNo));
        }
      }
    }
  });
  return tokens;
}

function classify(raw: string, amount: string | undefined, lineNo: number): ParsedToken {
  const amtCheck = validateAmount(amount);
  if (!amtCheck.valid) {
    return { raw, kind: 'invalid', amount, lineNo, invalidReason: amtCheck.reason };
  }

  // 1) URL profile
  const urlMatch = extractUsernameFromUrl(raw);
  if (urlMatch) {
    if (urlMatch.reservedRoute) {
      return {
        raw,
        kind: 'invalid',
        amount,
        lineNo,
        invalidReason: `Đây là trang hệ thống ("/${urlMatch.reservedRoute}"), không phải username`,
      };
    }
    if (urlMatch.username) {
      return { raw: urlMatch.username, kind: 'username', amount, lineNo };
    }
  }

  // 2) Address 0x...
  if (ADDRESS_RE.test(raw)) return { raw: raw.toLowerCase(), kind: 'address', amount, lineNo };

  // 3) Username trần / @username
  if (USERNAME_RE.test(raw)) return { raw: raw.replace(/^@/, '').toLowerCase(), kind: 'username', amount, lineNo };

  return {
    raw,
    kind: 'invalid',
    amount,
    lineNo,
    invalidReason: 'Không nhận dạng được — không phải @username, link profile hoặc địa chỉ 0x',
  };
}

/** Resolve a batch of parsed tokens via Supabase profiles lookup. */
export async function resolveBulkTokens(
  tokens: ParsedToken[],
  senderUserId: string | null,
  existingRecipients: ResolvedRecipient[] = [],
): Promise<BulkParseResult> {
  const result: BulkParseResult = {
    resolved: [],
    amounts: {},
    duplicates: [],
    notFound: [],
    invalid: [],
    selfReferences: [],
  };

  const existingIds = new Set(existingRecipients.map(r => r.id));
  const existingUsernames = new Set(
    existingRecipients.map(r => r.username?.toLowerCase()).filter((u): u is string => !!u),
  );
  const existingWallets = new Set(
    existingRecipients
      .map(r => r.walletAddress?.toLowerCase())
      .filter((w): w is string => !!w),
  );
  const seenInBatch = new Set<string>();
  const seenWalletsInBatch = new Map<string, number>(); // walletLower -> firstLineNo
  const seenUsernamesInBatch = new Map<string, number>(); // usernameLower -> firstLineNo
  const seenAddressTokens = new Map<string, number>(); // addressLower -> firstLineNo

  const usernames: { token: string; amount?: string; lineNo: number }[] = [];
  const addresses: { token: string; amount?: string; lineNo: number }[] = [];

  // Early-detect: trùng username/address trong cùng batch — không cần gọi Supabase.
  for (const t of tokens) {
    if (t.kind === 'invalid') {
      result.invalid.push({
        raw: t.raw,
        lineNo: t.lineNo,
        reason: t.invalidReason || 'Không hợp lệ',
      });
      continue;
    }
    if (t.kind === 'username') {
      const key = t.raw;
      if (existingUsernames.has(key)) {
        result.duplicates.push({
          raw: '@' + key,
          lineNo: t.lineNo,
          reason: `Đã có @${key} trong danh sách người nhận`,
        });
        continue;
      }
      const firstLine = seenUsernamesInBatch.get(key);
      if (firstLine !== undefined) {
        result.duplicates.push({
          raw: '@' + key,
          lineNo: t.lineNo,
          reason: `Trùng @${key} với dòng ${firstLine} trong danh sách dán`,
        });
        continue;
      }
      seenUsernamesInBatch.set(key, t.lineNo);
      usernames.push({ token: key, amount: t.amount, lineNo: t.lineNo });
    } else {
      // address
      const key = t.raw;
      const short = key.slice(0, 6) + '...' + key.slice(-4);
      if (existingWallets.has(key)) {
        result.duplicates.push({
          raw: short,
          lineNo: t.lineNo,
          reason: `Đã có địa chỉ ví ${short} trong danh sách người nhận`,
        });
        continue;
      }
      const firstLine = seenAddressTokens.get(key);
      if (firstLine !== undefined) {
        result.duplicates.push({
          raw: short,
          lineNo: t.lineNo,
          reason: `Trùng địa chỉ ví ${short} với dòng ${firstLine} trong danh sách dán`,
        });
        continue;
      }
      seenAddressTokens.set(key, t.lineNo);
      addresses.push({ token: key, amount: t.amount, lineNo: t.lineNo });
    }
  }

  const selectFields =
    'id, username, display_name, avatar_url, wallet_address, public_wallet_address, external_wallet_address';

  // Batch resolve usernames in chunks of 100
  const usernameProfiles = new Map<string, any>();
  for (let i = 0; i < usernames.length; i += 100) {
    const chunk = usernames.slice(i, i + 100).map(u => u.token);
    const { data } = await supabase
      .from('profiles')
      .select(selectFields)
      .in('username_normalized', chunk);
    for (const p of data || []) {
      usernameProfiles.set((p as any).username?.toLowerCase?.() || '', p);
    }
  }

  // Batch resolve addresses in chunks of 100
  const addressProfiles = new Map<string, any>();
  for (let i = 0; i < addresses.length; i += 100) {
    const chunk = addresses.slice(i, i + 100).map(a => a.token);
    const { data: a1 } = await supabase
      .from('profiles')
      .select(selectFields)
      .in('public_wallet_address', chunk);
    const { data: a2 } = await supabase
      .from('profiles')
      .select(selectFields)
      .in('external_wallet_address', chunk);
    for (const p of [...(a1 || []), ...(a2 || [])]) {
      const addr = ((p as any).public_wallet_address || (p as any).external_wallet_address || '').toLowerCase();
      if (addr) addressProfiles.set(addr, p);
    }
  }

  const pushResolved = (profile: any, lineNo: number, displayRaw: string, amount?: string) => {
    const walletAddress =
      (profile.public_wallet_address || profile.external_wallet_address || profile.wallet_address || null) as string | null;
    if (!profile.id) return;
    if (profile.id === senderUserId) {
      result.selfReferences.push({
        raw: displayRaw,
        lineNo,
        reason: 'Tự gửi cho chính mình',
      });
      return;
    }
    const walletLower = walletAddress?.toLowerCase();
    if (existingIds.has(profile.id)) {
      result.duplicates.push({
        raw: displayRaw,
        lineNo,
        reason: `Đã có @${profile.username} trong danh sách người nhận`,
      });
      return;
    }
    if (seenInBatch.has(profile.id)) {
      result.duplicates.push({
        raw: displayRaw,
        lineNo,
        reason: `Trùng @${profile.username} (đã xuất hiện ở dòng trước trong batch)`,
      });
      return;
    }
    if (walletLower && existingWallets.has(walletLower)) {
      result.duplicates.push({
        raw: displayRaw,
        lineNo,
        reason: `Trùng địa chỉ ví của @${profile.username} với người nhận đã có`,
      });
      return;
    }
    if (walletLower && seenWalletsInBatch.has(walletLower)) {
      const firstLine = seenWalletsInBatch.get(walletLower)!;
      result.duplicates.push({
        raw: displayRaw,
        lineNo,
        reason: `Trùng ví của @${profile.username} với dòng ${firstLine}`,
      });
      return;
    }
    seenInBatch.add(profile.id);
    if (walletLower) seenWalletsInBatch.set(walletLower, lineNo);
    const recipient: ResolvedRecipient = {
      id: profile.id,
      username: profile.username,
      displayName: profile.display_name || null,
      avatarUrl: profile.avatar_url,
      walletAddress,
      hasVerifiedWallet: !!(profile.public_wallet_address || profile.external_wallet_address),
    };
    result.resolved.push(recipient);
    if (amount) result.amounts[profile.id] = amount;
  };

  for (const u of usernames) {
    const profile = usernameProfiles.get(u.token);
    const display = '@' + u.token;
    if (profile) pushResolved(profile, u.lineNo, display, u.amount);
    else result.notFound.push({ raw: display, lineNo: u.lineNo, reason: 'Không tìm thấy user' });
  }

  for (const a of addresses) {
    const profile = addressProfiles.get(a.token);
    const display = a.token.slice(0, 6) + '...' + a.token.slice(-4);
    if (profile) {
      pushResolved(profile, a.lineNo, display, a.amount);
    } else {
      // Address valid nhưng chưa có profile → gửi tới address thô.
      const walletLower = a.token.toLowerCase();
      // Tự loop trong batch đã được early-detect bên trên,
      // nhưng vẫn check lại phòng trường hợp đã được pushResolved (qua username) chiếm ví.
      if (seenWalletsInBatch.has(walletLower)) {
        const firstLine = seenWalletsInBatch.get(walletLower)!;
        result.duplicates.push({
          raw: display,
          lineNo: a.lineNo,
          reason: `Trùng địa chỉ ví với dòng ${firstLine}`,
        });
        continue;
      }
      seenWalletsInBatch.set(walletLower, a.lineNo);
      const syntheticId = `addr:${a.token}`;
      result.resolved.push({
        id: syntheticId,
        username: a.token.slice(0, 6) + '...' + a.token.slice(-4),
        displayName: null,
        avatarUrl: null,
        walletAddress: a.token,
        hasVerifiedWallet: false,
      });
      if (a.amount) result.amounts[syntheticId] = a.amount;
    }
  }

  return result;
}
