/**
 * AppError — Standardized error handling for FUN Profile
 *
 * Usage:
 *   throw new AppError('NOT_FOUND', 'Post not found');
 *   catch (err) { if (err instanceof AppError) ... }
 */

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'DUPLICATE'
  | 'RATE_LIMITED'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'WALLET_ERROR'
  | 'REWARD_LOCKED'
  | 'ACCOUNT_LIMITED'
  | 'BANNED'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly statusCode: number;

  constructor(code: ErrorCode, userMessage: string, options?: { cause?: unknown; statusCode?: number }) {
    super(userMessage);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = userMessage;
    this.statusCode = options?.statusCode ?? ERROR_STATUS_MAP[code] ?? 500;
  }
}

const ERROR_STATUS_MAP: Partial<Record<ErrorCode, number>> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  DUPLICATE: 409,
  RATE_LIMITED: 429,
  NETWORK: 503,
  TIMEOUT: 408,
  INTERNAL: 500,
};

/**
 * Extract a user-friendly message from any error shape.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Đã xảy ra lỗi không xác định';
}

/**
 * describeBackendError — chuẩn hoá lỗi từ Data API (PostgrestError) / RPC /
 * edge function thành thông báo tiếng Việt rõ ràng cho admin.
 *
 * LƯU Ý: PostgrestError KHÔNG phải instance của `Error`, nên `err instanceof Error`
 * sẽ bỏ sót và làm mất toàn bộ message/code/details/hint.
 */
export function describeBackendError(error: unknown, fallback = 'Không thể thực hiện hành động'): string {
  if (error instanceof AppError) return error.userMessage;
  if (typeof error === 'string' && error.trim()) return error;

  const e = (error ?? {}) as Record<string, unknown>;
  const code = typeof e.code === 'string' ? e.code : '';
  const raw = [e.message, e.details, e.hint, e.error_description]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .join(' — ');
  const lower = `${code} ${raw}`.toLowerCase();

  if (code === '42501' || lower.includes('permission denied') || lower.includes('row-level security')) {
    return 'Tài khoản của bạn chưa có quyền admin trên hệ thống (hoặc phiên đăng nhập đã hết hạn). Hãy đăng nhập lại rồi thử lại.';
  }
  if (code === 'PGRST116' || lower.includes('0 rows')) {
    return 'Không tìm thấy hoặc không có quyền cập nhật user này.';
  }
  if (lower.includes('user not found or not banned')) {
    return 'User này hiện không bị cấm.';
  }
  if (lower.includes('only admins')) {
    return 'Chỉ admin mới thực hiện được hành động này.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
    return 'Không kết nối được tới máy chủ. Vui lòng kiểm tra mạng và thử lại.';
  }

  if (raw) return code ? `${raw} (mã lỗi ${code})` : raw;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}


/**
 * Standard edge function error response shape.
 */
export interface EdgeErrorResponse {
  error: string;
  code?: ErrorCode;
}

/**
 * Standard edge function success response shape.
 */
export interface EdgeSuccessResponse<T = unknown> {
  success: true;
  data?: T;
}

export type EdgeResponse<T = unknown> = EdgeSuccessResponse<T> | EdgeErrorResponse;
