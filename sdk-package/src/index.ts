/**
 * Fun Profile SSO SDK
 * 
 * SDK for integrating Fun Farm, Fun Play, Fun Planet with Fun Profile SSO.
 * 
 * @example Basic Setup - Fun Farm
 * ```typescript
 * import { FunProfileClient, DOMAINS } from '@fun-ecosystem/sso-sdk';
 * 
 * const funProfile = new FunProfileClient({
 *   clientId: 'fun_farm_production',
 *   clientSecret: 'your_secret',
 *   redirectUri: `${DOMAINS.funFarm}/auth/callback`,
 *   scopes: ['profile', 'email', 'wallet', 'rewards']
 * });
 * ```
 * 
 * @example OAuth Login Flow
 * ```typescript
 * // Step 1: Redirect to Fun Profile login
 * const loginUrl = await funProfile.startAuth();
 * window.location.href = loginUrl;
 * 
 * // Step 2: Handle callback
 * const params = new URLSearchParams(window.location.search);
 * const result = await funProfile.handleCallback(
 *   params.get('code')!,
 *   params.get('state')!
 * );
 * console.log('Logged in as', result.user.username);
 * ```
 * 
 * @packageDocumentation
 */

// Core client
export { FunProfileClient } from './FunProfileClient';

// Types
export type {
  FunProfileConfig,
  TokenStorage,
  TokenData,
  FunUser,
  SoulNft,
  UserRewards,
  RegisterOptions,
  SyncOptions,
  AuthResult,
  SyncResult,
  RequestOptions,
  SSOError,
  // Financial types
  FinancialData,
  FinancialDelta,
  FinancialAction,
  FinancialTransactionOptions,
  FinancialTransactionResult,
  // JWT types
  JWTClaims,
  // OTP types
  OtpRequestOptions,
  OtpRequestResult,
  OtpVerifyOptions,
  // Web3 types
  Web3AuthOptions,
  Web3AuthResult,
  Web3SignMessageOptions,
} from './types';

// Errors
export {
  FunProfileError,
  TokenExpiredError,
  InvalidTokenError,
  RateLimitError,
  ValidationError,
  NetworkError,
} from './errors';

// Storage adapters
export {
  LocalStorageAdapter,
  MemoryStorageAdapter,
  SessionStorageAdapter,
} from './storage';

// Debounced Sync Manager
export { DebouncedSyncManager } from './sync-manager';
export type { SyncFunction } from './sync-manager';

// PKCE utilities
export {
  generateCodeVerifier,
  generateCodeChallenge,
  storeCodeVerifier,
  retrieveCodeVerifier,
} from './pkce';

// Constants
export {
  DOMAINS,
  API_BASE_URL,
  DEFAULT_BASE_URL,
  ENDPOINTS,
  DEFAULT_SCOPES,
  TOKEN_REFRESH_BUFFER,
  SDK_VERSION,
} from './constants';
