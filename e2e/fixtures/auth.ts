import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Nạp Supabase session đã đăng nhập từ e2e/.auth/user.json (không commit).
 * Tạo file này 1 lần bằng cách đăng nhập thủ công rồi export localStorage:
 *   JSON.stringify({ localStorage: Object.entries(localStorage) })
 * Nếu thiếu file → test sẽ skip auth-required steps qua biến trả về.
 */
export interface AuthState {
  loaded: boolean;
  storage?: Record<string, string>;
}

export async function loadAuth(page: Page): Promise<AuthState> {
  const file = path.resolve('e2e/.auth/user.json');
  if (!fs.existsSync(file)) return { loaded: false };
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { localStorage: [string, string][] };
  const storage = Object.fromEntries(raw.localStorage);
  await page.addInitScript((entries) => {
    for (const [k, v] of entries) {
      try { localStorage.setItem(k, v); } catch { /* ignore */ }
    }
  }, raw.localStorage);
  return { loaded: true, storage };
}
