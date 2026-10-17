import { assertEquals } from 'jsr:@std/assert@1';
import { handleRequest } from './index.ts';

Deno.test('OPTIONS preflight returns CORS headers without authentication', async () => {
  const response = await handleRequest(new Request('https://function.test', { method: 'OPTIONS' }));
  assertEquals(response.status, 204);
  assertEquals(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS');
});

Deno.test('non-POST method is rejected before reading credentials', async () => {
  const response = await handleRequest(new Request('https://function.test', { method: 'GET' }));
  assertEquals(response.status, 405);
  assertEquals((await response.json()).code, 'METHOD_NOT_ALLOWED');
});

Deno.test('POST without a valid bearer token is rejected without provider access', async () => {
  const response = await handleRequest(new Request('https://function.test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ call_session_id: '00000000-0000-4000-8000-000000000000' }),
  }));
  assertEquals(response.status, 401);
  assertEquals((await response.json()).code, 'UNAUTHORIZED');
});
