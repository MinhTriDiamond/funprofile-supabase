/**
 * Wallet Auth Flow - Shared Types & Helpers
 * Adapted to use existing sso-web3-auth edge function
 */

import { bsc } from 'wagmi/chains';
import { supabase } from '@/integrations/supabase/client';
import { getDeviceHash } from '@/utils/deviceFingerprint';

export const AUTH_CHAIN_ID = bsc.id; // 56
export const WALLET_AUTH_SNAPSHOT_KEY = 'fun_wallet_auth_flow';

// ─── Types ───

export type WalletAuthMode = 'injected_mobile_browser' | 'wallet_modal_or_walletconnect';

export type NoncePayload = { nonce: string; message: string; expiresAt?: string };

export type WalletAuthErrorCode =
  | 'pending_request' | 'user_rejected' | 'nonce_invalid' | 'nonce_expired'
  | 'wrong_chain' | 'verification_failed' | 'account_changed'
  | 'chain_changed' | 'disconnected' | 'provider_unavailable'
  | 'session_expired' | 'unknown';

export type WalletAuthError = { code: WalletAuthErrorCode; message: string };

export type WalletFlowPhase =
  | 'idle' | 'connecting' | 'connected' | 'wrong_chain'
  | 'ready_to_sign' | 'signing' | 'signing_pending_wallet'
  | 'verifying' | 'authenticated' | 'error';

export type WalletAuthSnapshot = {
  purpose: 'login';
  phase: WalletFlowPhase;
  authMode: WalletAuthMode;
  account: string;
  chainId: number | null;
  connectorType: string;
  nonce?: string;
  message?: string;
  expiresAt?: string;
  signRequestStarted: boolean;
  pendingRequestDetected: boolean;
  updatedAt: string;
};

// ─── Helpers ───

const EVM_REGEX = /^0x[0-9a-f]{40}$/;

export function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEvmAddress(value: string | null | undefined): value is `0x${string}` {
  return Boolean(value && EVM_REGEX.test(normalizeAddress(value)));
}

export function getConnectorType(input?: { connectorName?: string | null }): string {
  const name = input?.connectorName?.toLowerCase() ?? '';
  if (name.includes('walletconnect')) return 'walletconnect';
  if (name.includes('trust')) return 'trustwallet';
  if (name.includes('meta')) return 'metamask';
  if (name.includes('bitget') || name.includes('bitkeep')) return 'bitget';
  return name || 'unknown';
}

export function logWalletAuth(event: string, payload: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[wallet-auth] ${event}`, payload);
  }
}

// ─── Snapshot Persistence ───

export function loadWalletAuthSnapshot(): WalletAuthSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WALLET_AUTH_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WalletAuthSnapshot;
  } catch { return null; }
}

export function saveWalletAuthSnapshot(snapshot: WalletAuthSnapshot | null) {
  if (typeof window === 'undefined') return;
  try {
    if (!snapshot) {
      window.localStorage.removeItem(WALLET_AUTH_SNAPSHOT_KEY);
      return;
    }
    window.localStorage.setItem(WALLET_AUTH_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch { /* ignore */ }
}

export function clearWalletAuthSnapshot() {
  saveWalletAuthSnapshot(null);
}

// ─── Error Classification ───

function extractErrorCode(error: unknown): number | string | null {
  if (!error || typeof error !== 'object') return null;
  const c = error as { code?: unknown; cause?: { code?: unknown }; data?: { code?: unknown } };
  return (c.code ?? c.cause?.code ?? c.data?.code ?? null) as number | string | null;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return String(error ?? '');
  const c = error as { message?: unknown; shortMessage?: unknown; cause?: { message?: unknown } };
  const parts = [c.message, c.shortMessage, c.cause?.message];
  const first = parts.find(p => typeof p === 'string' && p.trim());
  return typeof first === 'string' ? first : String(error);
}

export function classifyWalletError(error: unknown): WalletAuthError {
  const message = extractErrorMessage(error).trim() || 'Đã có lỗi xảy ra trong quá trình xác thực ví.';
  const lower = message.toLowerCase();
  const code = extractErrorCode(error);

  if (code === -32002 || lower.includes('already pending') || lower.includes("request of type 'personal_sign' already pending")) {
    return { code: 'pending_request', message: 'Yêu cầu ký đang chờ xử lý trong ví. Vui lòng mở lại cửa sổ xác nhận trong ví để tiếp tục.' };
  }
  if (code === 4001 || lower.includes('user rejected') || lower.includes('rejected the request') || lower.includes('hủy')) {
    return { code: 'user_rejected', message: 'Bạn đã hủy xác nhận chữ ký.' };
  }
  if (lower.includes('walletconnect') && (lower.includes('expired') || lower.includes('session'))) {
    return { code: 'session_expired', message: 'Phiên WalletConnect đã hết hạn. Vui lòng thử kết nối lại.' };
  }
  if (lower.includes('provider') || lower.includes('connector') || lower.includes('not installed') || lower.includes('not found')) {
    return { code: 'provider_unavailable', message: 'Không tìm thấy ví phù hợp. Vui lòng mở trực tiếp MetaMask, Trust Wallet, Bitget Wallet hoặc thử WalletConnect.' };
  }
  if (lower.includes('nonce') && lower.includes('expired')) {
    return { code: 'nonce_expired', message: 'Nonce đã hết hạn. Vui lòng thử lại.' };
  }
  if (lower.includes('nonce')) {
    return { code: 'nonce_invalid', message: 'Nonce không hợp lệ. Vui lòng thử lại.' };
  }
  if (lower.includes('wrong_chain') || lower.includes('đúng mạng')) {
    return { code: 'wrong_chain', message: 'Vui lòng chuyển sang đúng mạng để tiếp tục.' };
  }
  if (lower.includes('signature') || lower.includes('verify') || lower.includes('verification')) {
    return { code: 'verification_failed', message };
  }
  return { code: 'unknown', message };
}

// ─── Backend Calls (using existing sso-web3-auth edge function) ───

export async function requestBackendNonce(input: {
  address: string;
  chainId?: number | null;
}): Promise<NoncePayload> {
  const address = normalizeAddress(input.address);

  const { data, error } = await supabase.functions.invoke('sso-web3-auth', {
    body: { action: 'challenge', wallet_address: address },
  });

  if (error || !data?.nonce) {
    throw new Error(data?.error || error?.message || 'Không thể tạo nonce.');
  }

  return {
    nonce: data.nonce,
    message: data.message,
    expiresAt: data.expiresAt,
  };
}

export async function verifyWalletLoginSignature(input: {
  address: string;
  nonce: string;
  message: string;
  signature: string;
}) {
  // Gửi kèm dấu vân tay thiết bị để phía server áp chốt chặn đăng ký cho tài khoản MỚI
  const deviceHash = await getDeviceHash().catch(() => null);

  const { data, error } = await supabase.functions.invoke('sso-web3-auth', {
    body: {
      wallet_address: normalizeAddress(input.address),
      signature: input.signature,
      message: input.message,
      nonce: input.nonce,
      device_hash: deviceHash ?? undefined,
    },
  });

  if (error) {
    // Chốt chặn đăng ký trả 403 kèm message thân thiện trong thân phản hồi — đọc ra để hiển thị cho người dùng
    let blockedMessage: string | null = null;
    try {
      const ctx = (error as unknown as { context?: Response })?.context;
      const body = ctx ? await ctx.clone().json() : null;
      if (body?.error === 'signup_blocked') {
        blockedMessage = body?.message || 'Không thể tạo tài khoản mới với thông tin này. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ đội hỗ trợ FUN Profile để được xem xét.';
      }
    } catch { /* bỏ qua — dùng lỗi gốc bên dưới */ }
    if (blockedMessage) throw new Error(blockedMessage);
    throw new Error(data?.error || error.message || 'Không thể xác thực ví.');
  }

  if (!data?.success || !data?.token_hash || !data?.user_id) {
    throw new Error(data?.error === 'signup_blocked'
      ? (data?.message || 'Không thể tạo tài khoản mới với thông tin này. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ đội hỗ trợ FUN Profile để được xem xét.')
      : (data?.error || 'Không thể hoàn tất xác thực ví.'));
  }

  return {
    user_id: data.user_id as string,
    isNewUser: Boolean(data.is_new_user),
    token_hash: data.token_hash as string,
  };
}

export async function completeSupabaseWalletSession(tokenHash: string) {
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  });
  if (error) throw new Error(error.message || 'Không thể tạo phiên đăng nhập.');
}
