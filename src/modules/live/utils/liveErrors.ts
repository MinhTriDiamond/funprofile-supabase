export type FriendlyLiveErrorCode =
  | 'AGORA_QUOTA_EXCEEDED'
  | 'AGORA_GATEWAY_UNAVAILABLE'
  | 'LIVE_NETWORK_ERROR'
  | 'LIVE_TIMEOUT'
  | 'LIVE_PERMISSION_DENIED'
  | 'LIVE_DEVICE_NOT_FOUND'
  | 'LIVE_TOKEN_ERROR'
  | 'LIVE_SESSION_NOT_FOUND'
  | 'LIVE_UNKNOWN_ERROR';

export interface FriendlyLiveError {
  code: FriendlyLiveErrorCode;
  title: string;
  message: string;
  statusText: string;
  retryable: boolean;
  internalMessage: string;
}

export const LIVE_CONNECT_ERROR_TITLE = 'Phiên LIVE tạm thời chưa thể kết nối';
export const LIVE_CONNECT_ERROR_MESSAGE =
  'Hệ thống livestream đang tạm thời đạt giới hạn sử dụng hoặc kết nối realtime bị gián đoạn. Vui lòng thử lại sau ít phút hoặc liên hệ Admin FUN Profile để được hỗ trợ.';
export const LIVE_QUOTA_ERROR_MESSAGE =
  'Hiện tại hệ thống livestream đang đạt giới hạn sử dụng trong tháng. FUN Profile sẽ sớm mở lại tính năng LIVE. Cảm ơn bạn đã thông cảm 💚';
export const LIVE_SESSION_NOT_FOUND_TITLE = 'Phiên LIVE đã kết thúc';
export const LIVE_SESSION_NOT_FOUND_MESSAGE =
  'Phiên LIVE này không còn hoạt động hoặc đã bị đóng. Bạn có thể bắt đầu phiên LIVE mới hoặc quay về trang chủ.';

export function buildSessionNotFoundError(): FriendlyLiveError {
  return {
    code: 'LIVE_SESSION_NOT_FOUND',
    title: LIVE_SESSION_NOT_FOUND_TITLE,
    message: LIVE_SESSION_NOT_FOUND_MESSAGE,
    statusText: 'Phiên LIVE không còn khả dụng.',
    retryable: false,
    internalMessage: 'live session not found after grace period',
  };
}

function readErrorMessage(error: unknown): string {
  if (!error) return '';
  if (error instanceof Error) return error.message || error.name || '';
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function readErrorName(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

export function normalizeLiveError(error: unknown): FriendlyLiveError {
  const name = readErrorName(error);
  const message = readErrorMessage(error);
  const raw = `${name} ${message}`.trim();
  const lower = raw.toLowerCase();

  if (lower.includes('agora_quota_exceeded') || lower.includes('quota')) {
    return {
      code: 'AGORA_QUOTA_EXCEEDED',
      title: LIVE_CONNECT_ERROR_TITLE,
      message: LIVE_QUOTA_ERROR_MESSAGE,
      statusText: 'LIVE đang tạm dừng vì hệ thống đạt giới hạn sử dụng.',
      retryable: false,
      internalMessage: raw,
    };
  }

  if (
    lower.includes('can_not_get_gateway_server') ||
    lower.includes('gateway') ||
    lower.includes('flag: 4096')
  ) {
    return {
      code: 'AGORA_GATEWAY_UNAVAILABLE',
      title: LIVE_CONNECT_ERROR_TITLE,
      message: LIVE_CONNECT_ERROR_MESSAGE,
      statusText: 'Đang khôi phục kết nối LIVE...',
      retryable: true,
      internalMessage: raw,
    };
  }

  if (name === 'NotAllowedError' || lower.includes('permission denied') || lower.includes('notallowed')) {
    return {
      code: 'LIVE_PERMISSION_DENIED',
      title: 'Chưa có quyền camera/micro',
      message: 'Bạn chưa cấp quyền camera hoặc micro. Vui lòng cho phép quyền truy cập rồi thử lại.',
      statusText: 'Bạn chưa cấp quyền camera/micro.',
      retryable: false,
      internalMessage: raw,
    };
  }

  if (name === 'NotFoundError' || lower.includes('notfound') || lower.includes('device not found')) {
    return {
      code: 'LIVE_DEVICE_NOT_FOUND',
      title: 'Không tìm thấy camera/micro',
      message: 'FUN Profile không tìm thấy thiết bị camera hoặc micro. Vui lòng kiểm tra thiết bị rồi thử lại.',
      statusText: 'Không tìm thấy thiết bị camera/micro.',
      retryable: false,
      internalMessage: raw,
    };
  }

  if (lower.includes('token') || lower.includes('unauthorized') || lower.includes('invalid live-token')) {
    return {
      code: 'LIVE_TOKEN_ERROR',
      title: LIVE_CONNECT_ERROR_TITLE,
      message: LIVE_CONNECT_ERROR_MESSAGE,
      statusText: 'Đang cấp lại quyền kết nối LIVE...',
      retryable: true,
      internalMessage: raw,
    };
  }

  if (lower.includes('timeout')) {
    return {
      code: 'LIVE_TIMEOUT',
      title: LIVE_CONNECT_ERROR_TITLE,
      message: LIVE_CONNECT_ERROR_MESSAGE,
      statusText: 'Kết nối LIVE quá chậm, đang thử lại...',
      retryable: true,
      internalMessage: raw,
    };
  }

  if (lower.includes('network') || lower.includes('fetch') || lower.includes('disconnected')) {
    return {
      code: 'LIVE_NETWORK_ERROR',
      title: LIVE_CONNECT_ERROR_TITLE,
      message: LIVE_CONNECT_ERROR_MESSAGE,
      statusText: 'Đang khôi phục kết nối LIVE...',
      retryable: true,
      internalMessage: raw,
    };
  }

  return {
    code: 'LIVE_UNKNOWN_ERROR',
    title: LIVE_CONNECT_ERROR_TITLE,
    message: LIVE_CONNECT_ERROR_MESSAGE,
    statusText: 'Không thể kết nối LIVE.',
    retryable: true,
    internalMessage: raw || 'Unknown live error',
  };
}

export class NormalizedLiveError extends Error {
  friendly: FriendlyLiveError;
  originalError: unknown;

  constructor(error: unknown) {
    const friendly = normalizeLiveError(error);
    super(friendly.message);
    this.name = 'NormalizedLiveError';
    this.friendly = friendly;
    this.originalError = error;
  }
}

export function toFriendlyLiveError(error: unknown): FriendlyLiveError {
  if (error instanceof NormalizedLiveError) return error.friendly;
  const maybeFriendly = (error as { friendly?: FriendlyLiveError } | null)?.friendly;
  if (maybeFriendly?.code) return maybeFriendly;
  return normalizeLiveError(error);
}
