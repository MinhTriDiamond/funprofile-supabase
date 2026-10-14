import { FunctionsHttpError } from '@supabase/supabase-js';

export interface RtmpFunctionError {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

const EMPTY_BODY_MESSAGE = 'Edge Function trả về lỗi không có nội dung.';
const UNREADABLE_BODY_MESSAGE = 'Không đọc được nội dung lỗi từ Edge Function.';

function redactSensitiveText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [đã ẩn]')
    .replace(/((?:stream[_ -]?key|authorization|encryption[_ -]?key)\s*[:=]\s*)[^\s,;"']+/gi, '$1[đã ẩn]');
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? redactSensitiveText(value.trim()) : undefined;
}

/** Reads an Edge Function response body once, supporting both JSON and plain text. */
export async function readFunctionError(error: unknown): Promise<RtmpFunctionError> {
  if (error instanceof FunctionsHttpError) {
    const status = error.context.status;
    try {
      const bodyText = await error.context.text();
      if (!bodyText.trim()) return { message: EMPTY_BODY_MESSAGE, status };

      try {
        const body: unknown = JSON.parse(bodyText);
        if (body && typeof body === 'object') {
          const payload = body as Record<string, unknown>;
          return {
            message: stringField(payload.error) || stringField(payload.message) || EMPTY_BODY_MESSAGE,
            code: stringField(payload.code),
            status,
            details: payload.details,
          };
        }
      } catch {
        // A non-JSON response is still useful to the caller as plain text.
      }

      return { message: redactSensitiveText(bodyText.trim()), status };
    } catch {
      return { message: UNREADABLE_BODY_MESSAGE, status };
    }
  }
  if (error instanceof Error) return { message: redactSensitiveText(error.message) };
  return { message: typeof error === 'string' ? redactSensitiveText(error) : 'Lỗi không xác định' };
}
