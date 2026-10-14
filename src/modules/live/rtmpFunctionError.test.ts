import { describe, expect, it, vi } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { readFunctionError } from './rtmpFunctionError';

describe('readFunctionError', () => {
  it('extracts message and code from JSON and preserves HTTP status', async () => {
    const response = new Response(JSON.stringify({ error: 'Phiên không hợp lệ', code: 'BAD_SESSION', status: 200 }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    });
    const result = await readFunctionError(new FunctionsHttpError(response));

    expect(result).toMatchObject({ message: 'Phiên không hợp lệ', code: 'BAD_SESSION', status: 409 });
  });

  it('returns a plain text response body', async () => {
    const response = new Response('Tạm thời không thể tạo phiên', { status: 503 });
    const result = await readFunctionError(new FunctionsHttpError(response));

    expect(result).toMatchObject({ message: 'Tạm thời không thể tạo phiên', status: 503 });
  });

  it('redacts credential shaped values from messages', async () => {
    const response = new Response(JSON.stringify({ error: 'Authorization: Bearer abc123 stream_key=secret456' }), {
      status: 500,
    });
    const result = await readFunctionError(new FunctionsHttpError(response));

    expect(result.message).not.toContain('abc123');
    expect(result.message).not.toContain('secret456');
    expect(result.status).toBe(500);
  });

  it('uses a safe fallback for an empty body', async () => {
    const response = new Response('', { status: 500 });
    const result = await readFunctionError(new FunctionsHttpError(response));

    expect(result).toMatchObject({ message: 'Edge Function trả về lỗi không có nội dung.', status: 500 });
  });

  it('retains status and fallback when reading the response body fails', async () => {
    const response = new Response('', { status: 502 });
    vi.spyOn(response, 'text').mockRejectedValue(new Error('body unavailable'));
    const result = await readFunctionError(new FunctionsHttpError(response));

    expect(result).toMatchObject({ message: 'Không đọc được nội dung lỗi từ Edge Function.', status: 502 });
  });

  it('reads the response body only once', async () => {
    const response = new Response(JSON.stringify({ message: 'Lỗi có cấu trúc' }), { status: 400 });
    const readBody = vi.spyOn(response, 'text');
    await readFunctionError(new FunctionsHttpError(response));

    expect(readBody).toHaveBeenCalledTimes(1);
  });
});
