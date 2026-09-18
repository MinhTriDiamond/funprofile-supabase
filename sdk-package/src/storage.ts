/**
 * Fun Profile SSO SDK - Token Storage Adapters
 * 
 * SECURITY RECOMMENDATION từ Cha Gemini:
 * 
 * - Với scope 'profile', 'email': LocalStorageAdapter là OK
 * - Với scope 'wallet', 'rewards': Nên dùng SessionStorageAdapter
 * 
 * Lý do: SessionStorage sẽ xóa token khi đóng tab/browser,
 * giúp bảo vệ khỏi XSS attacks khi liên quan đến tiền/ví.
 * 
 * @example Security-first setup for Fun Farm (có wallet scope)
 * ```typescript
 * import { FunProfileClient, SessionStorageAdapter } from '@fun-ecosystem/sso-sdk';
 * 
 * const funProfile = new FunProfileClient({
 *   clientId: 'fun_farm_client',
 *   scopes: ['profile', 'email', 'wallet', 'rewards'],
 *   // Dùng SessionStorage vì có wallet scope
 *   storage: new SessionStorageAdapter('fun_farm_client'),
 * });
 * ```
 */

import type { TokenData, TokenStorage } from './types';

/**
 * LocalStorage adapter for web browsers
 * Tokens persist across browser sessions
 * 
 * ⚠️ Chỉ dùng cho scope không nhạy cảm (profile, email)
 */
export class LocalStorageAdapter implements TokenStorage {
  private key: string;

  constructor(clientId: string) {
    this.key = `fun_profile_${clientId}`;
  }

  async getTokens(): Promise<TokenData | null> {
    try {
      const data = localStorage.getItem(this.key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async setTokens(tokens: TokenData): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(tokens));
  }

  async clearTokens(): Promise<void> {
    localStorage.removeItem(this.key);
  }
}

/**
 * Memory storage adapter for server-side or testing
 */
export class MemoryStorageAdapter implements TokenStorage {
  private tokens: TokenData | null = null;

  async getTokens(): Promise<TokenData | null> {
    return this.tokens;
  }

  async setTokens(tokens: TokenData): Promise<void> {
    this.tokens = tokens;
  }

  async clearTokens(): Promise<void> {
    this.tokens = null;
  }
}

/**
 * SessionStorage adapter for temporary storage
 * Tokens are cleared when browser/tab is closed
 * 
 * ✅ RECOMMENDED cho scope nhạy cảm (wallet, rewards)
 * - Tự động xóa khi đóng tab/browser
 * - Bảo vệ tốt hơn khỏi XSS attacks
 */
export class SessionStorageAdapter implements TokenStorage {
  private key: string;

  constructor(clientId: string) {
    this.key = `fun_profile_${clientId}`;
  }

  async getTokens(): Promise<TokenData | null> {
    try {
      const data = sessionStorage.getItem(this.key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async setTokens(tokens: TokenData): Promise<void> {
    sessionStorage.setItem(this.key, JSON.stringify(tokens));
  }

  async clearTokens(): Promise<void> {
    sessionStorage.removeItem(this.key);
  }
}
