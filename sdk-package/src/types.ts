/**
 * Fun Profile SSO SDK - Type Definitions
 */

// Client configuration
export interface FunProfileConfig {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  baseUrl?: string;
  scopes?: string[];
  storage?: TokenStorage;
  autoRefresh?: boolean;
}

// Token storage interface
export interface TokenStorage {
  getTokens(): Promise<TokenData | null>;
  setTokens(tokens: TokenData): Promise<void>;
  clearTokens(): Promise<void>;
}

// OAuth tokens
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
}

// User profile
export interface FunUser {
  id: string;
  funId: string;
  username: string;
  fullName?: string;
  avatarUrl?: string;
  email?: string;
  walletAddress?: string;
  /** @deprecated Custodial wallet has been removed. Always null. */
  externalWalletAddress?: string;
  
  soul?: SoulNft;
  rewards?: UserRewards;
  financialData?: FinancialData;
  tokenType?: 'jwt' | 'opaque';
}

export interface SoulNft {
  element: string;
  level: number;
  tokenId?: string;
  mintedAt?: string;
  isMinted?: boolean;
}

export interface UserRewards {
  pending: number;
  approved: number;
  claimed: number;
  status: string;
  total?: number;
}

// Financial data (cross-platform aggregated)
export interface FinancialData {
  totalDeposit: number;
  totalWithdraw: number;
  totalBet: number;
  totalWin: number;
  totalLoss: number;
  totalProfit: number;
}

// Financial delta for incremental updates
export interface FinancialDelta {
  depositDelta?: number;
  withdrawDelta?: number;
  betDelta?: number;
  winDelta?: number;
  lossDelta?: number;
  profitDelta?: number;
}

// Financial action types per Data Contract
export type FinancialAction = 
  | 'CLAIM_REWARD'
  | 'SEND_MONEY'
  | 'RECEIVE_MONEY'
  | 'DEPOSIT'
  | 'WITHDRAW'
  | 'BET'
  | 'WIN'
  | 'LOSS'
  | 'ADJUSTMENT_ADD'
  | 'ADJUSTMENT_SUB';

// Financial transaction sync options
export interface FinancialTransactionOptions {
  action: FinancialAction;
  amount: number;
  transactionId: string;
  currency?: string;
  platformKey?: string;
  metadata?: Record<string, unknown>;
}

// Financial transaction result (idempotent)
export interface FinancialTransactionResult {
  success: boolean;
  alreadyProcessed: boolean;
  transactionId: string;
  action: FinancialAction;
  amount: number;
  currency?: string;
  internalId?: string;
  syncedAt: string;
  newBalance?: FinancialData;
  message?: string;
}

// Registration options
export interface RegisterOptions {
  email?: string;
  phone?: string;
  username?: string;
  fullName?: string;
  avatarUrl?: string;
  platformData?: Record<string, unknown>;
}

// Sync options - now supports delta mode and financial data
export interface SyncOptions {
  mode: 'merge' | 'replace' | 'append' | 'delta';
  data?: Record<string, unknown>;
  financialData?: Partial<FinancialData>;
  financialDelta?: FinancialDelta;
  categories?: string[];
  clientTimestamp?: string;
}

// Response types
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  user: FunUser;
  isNewUser?: boolean;
}

export interface SyncResult {
  success: boolean;
  syncedAt: string;
  syncMode: string;
  syncCount: number;
  categoriesUpdated: string[];
  dataSize: number;
  financialData?: FinancialData;
}

// Request options
export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

// Error types
export interface SSOError {
  error: string;
  errorDescription: string;
  details?: Record<string, unknown>;
}

// JWT Claims (for reference)
export interface JWTClaims {
  sub: string;         // user_id
  fun_id: string;      // FUN ID
  username: string;    // Display username
  custodial_wallet: string | null;
  scope: string[];     // Granted scopes
  iss: string;         // Issuer (fun_profile)
  iat: number;         // Issued at
  exp: number;         // Expiration
}

// ============================================
// OTP Authentication Types
// ============================================

export interface OtpRequestOptions {
  /** Email or phone number to send OTP to */
  identifier: string;
  /** Type of identifier (default: 'email') */
  type?: 'email' | 'phone';
}

export interface OtpRequestResult {
  success: boolean;
  message: string;
  emailSent?: boolean;
  expiresInSeconds: number;
}

export interface OtpVerifyOptions {
  /** Email or phone that received OTP */
  identifier: string;
  /** 6-digit OTP code */
  code: string;
}

// ============================================
// Web3 Authentication Types
// ============================================

export interface Web3AuthOptions {
  /** Ethereum wallet address (checksummed) */
  walletAddress: string;
  /** Signature from personal_sign */
  signature: string;
  /** Message that was signed */
  message: string;
}

export interface Web3AuthResult {
  success: boolean;
  message?: string;
  userId: string;
  isNewUser: boolean;
  tokenHash?: string;
}

export interface Web3SignMessageOptions {
  /** Custom nonce (auto-generated if not provided) */
  nonce?: string;
  /** Custom statement for SIWE message */
  statement?: string;
  /** Expiration time for message (default: 10 minutes) */
  expirationTime?: Date;
}
