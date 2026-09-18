/**
 * Fun Profile SSO SDK - Main Client
 * 
 * Core client for OAuth 2.0 + PKCE authentication with Fun Profile.
 * Supports JWT access tokens with local verification.
 */

import type {
  FunProfileConfig,
  TokenStorage,
  TokenData,
  FunUser,
  RegisterOptions,
  SyncOptions,
  AuthResult,
  SyncResult,
  RequestOptions,
  FinancialData,
  FinancialDelta,
  FinancialTransactionOptions,
  FinancialTransactionResult,
  FinancialAction,
  OtpRequestOptions,
  OtpRequestResult,
  OtpVerifyOptions,
  Web3AuthOptions,
  Web3SignMessageOptions,
} from './types';

import {
  FunProfileError,
  TokenExpiredError,
  InvalidTokenError,
  RateLimitError,
  ValidationError,
  NetworkError,
} from './errors';

import {
  DEFAULT_BASE_URL,
  ENDPOINTS,
  DEFAULT_SCOPES,
  TOKEN_REFRESH_BUFFER,
} from './constants';

import {
  generateCodeVerifier,
  generateCodeChallenge,
  storeCodeVerifier,
  retrieveCodeVerifier,
} from './pkce';

import { LocalStorageAdapter } from './storage';
import { DebouncedSyncManager } from './sync-manager';

export class FunProfileClient {
  private config: Required<Omit<FunProfileConfig, 'clientSecret'>> & { clientSecret?: string };
  private storage: TokenStorage;
  private currentUser: FunUser | null = null;
  private syncManager: DebouncedSyncManager | null = null;
  private financialSyncManager: DebouncedSyncManager | null = null;

  constructor(config: FunProfileConfig) {
    this.config = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
      scopes: config.scopes || DEFAULT_SCOPES,
      storage: config.storage || new LocalStorageAdapter(config.clientId),
      autoRefresh: config.autoRefresh !== false,
    };
    this.storage = this.config.storage;
  }

  // ============================================
  // Authentication Methods
  // ============================================

  /**
   * Start OAuth 2.0 + PKCE authorization flow
   * @returns Authorization URL to redirect user to
   */
  async startAuth(options?: { prompt?: 'login' | 'consent' | 'none' }): Promise<string> {
    const state = this.generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);

    // Store verifier for callback
    storeCodeVerifier(codeVerifier, state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    if (options?.prompt) {
      params.set('prompt', options.prompt);
    }

    return `${this.config.baseUrl}${ENDPOINTS.authorize}?${params.toString()}`;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string, state: string): Promise<AuthResult> {
    const codeVerifier = retrieveCodeVerifier(state);
    if (!codeVerifier) {
      throw new ValidationError('Invalid state parameter - possible CSRF attack');
    }

    const response = await this.request(ENDPOINTS.token, {
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code_verifier: codeVerifier,
      },
    });

    return this.handleTokenResponse(response);
  }

  /**
   * Register a new user via the platform
   */
  async register(options: RegisterOptions): Promise<AuthResult> {
    const response = await this.request(ENDPOINTS.register, {
      method: 'POST',
      body: {
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...options,
      },
    });

    return this.handleTokenResponse(response);
  }

  /**
   * Logout and revoke tokens
   */
  async logout(): Promise<void> {
    // Flush any pending sync data first
    if (this.syncManager?.hasPendingData()) {
      try {
        await this.syncManager.flush();
      } catch {
        // Ignore sync errors on logout
      }
    }

    if (this.financialSyncManager?.hasPendingData()) {
      try {
        await this.financialSyncManager.flush();
      } catch {
        // Ignore sync errors on logout
      }
    }

    const tokens = await this.storage.getTokens();
    if (tokens) {
      try {
        await this.request(ENDPOINTS.revoke, {
          method: 'POST',
          body: {
            token: tokens.accessToken,
            client_id: this.config.clientId,
          },
        });
      } catch {
        // Ignore revoke errors
      }
    }

    await this.storage.clearTokens();
    this.currentUser = null;
    this.syncManager?.clear();
    this.financialSyncManager?.clear();
  }

  // ============================================
  // OTP Authentication Methods
  // ============================================

  /**
   * Request OTP code to be sent to email or phone
   * @example
   * ```typescript
   * await client.requestOtp({ 
   *   identifier: 'user@example.com', 
   *   type: 'email' 
   * });
   * ```
   */
  async requestOtp(options: OtpRequestOptions): Promise<OtpRequestResult> {
    const response = await this.request(ENDPOINTS.otpRequest, {
      method: 'POST',
      body: {
        identifier: options.identifier,
        type: options.type || 'email',
      },
    });

    return {
      success: response.success as boolean,
      message: response.message as string,
      emailSent: response.email_sent as boolean,
      expiresInSeconds: (response.expires_in_seconds as number) || 300,
    };
  }

  /**
   * Verify OTP code and get authentication tokens
   * @example
   * ```typescript
   * const result = await client.verifyOtp({ 
   *   identifier: 'user@example.com', 
   *   code: '123456' 
   * });
   * console.log('Logged in:', result.user.username);
   * ```
   */
  async verifyOtp(options: OtpVerifyOptions): Promise<AuthResult> {
    const response = await this.request(ENDPOINTS.otpVerify, {
      method: 'POST',
      body: {
        identifier: options.identifier,
        code: options.code,
      },
    });

    if (!response.success) {
      throw new ValidationError((response.error as string) || 'OTP verification failed');
    }

    return this.handleOtpTokenResponse(response);
  }

  // ============================================
  // Web3 Authentication Methods
  // ============================================

  /**
   * Generate message for wallet signature (SIWE-style)
   * @example
   * ```typescript
   * const message = client.generateWeb3Message();
   * const signature = await window.ethereum.request({
   *   method: 'personal_sign',
   *   params: [message, walletAddress],
   * });
   * ```
   */
  generateWeb3Message(options?: Web3SignMessageOptions): string {
    const nonce = options?.nonce || this.generateState().slice(0, 16);
    const domain = new URL(this.config.redirectUri).host;
    const statement = options?.statement || 'Sign in to Fun Ecosystem';
    const issuedAt = new Date().toISOString();
    const expirationTime = options?.expirationTime || new Date(Date.now() + 10 * 60 * 1000);

    return [
      `${domain} wants you to sign in with your Ethereum account.`,
      '',
      statement,
      '',
      `Nonce: ${nonce}`,
      `Issued At: ${issuedAt}`,
      `Expiration Time: ${expirationTime.toISOString()}`,
    ].join('\n');
  }

  /**
   * Authenticate with Web3 wallet signature
   * @example
   * ```typescript
   * const message = client.generateWeb3Message();
   * const signature = await signer.signMessage(message);
   * const result = await client.authenticateWeb3({
   *   walletAddress: '0x...',
   *   signature,
   *   message,
   * });
   * ```
   */
  async authenticateWeb3(options: Web3AuthOptions): Promise<AuthResult> {
    const response = await this.request(ENDPOINTS.web3Auth, {
      method: 'POST',
      body: {
        wallet_address: options.walletAddress,
        signature: options.signature,
        message: options.message,
      },
    });

    if (!response.success) {
      throw new ValidationError((response.error as string) || 'Web3 authentication failed');
    }

    // Web3 auth returns token_hash for Supabase magic link verification
    // Create minimal user until full session is established
    const user: FunUser = {
      id: response.user_id as string,
      funId: '',
      username: (response.username as string) || '',
      externalWalletAddress: options.walletAddress,
    };

    this.currentUser = user;

    return {
      accessToken: (response.token_hash as string) || '',
      refreshToken: '',
      expiresIn: 3600,
      scope: this.config.scopes.join(' '),
      user,
      isNewUser: response.is_new_user as boolean,
    };
  }

  // ============================================
  // Sync Managers
  // ============================================

  /**
   * Get debounced sync manager for game/platform data
   * @param debounceMs - Debounce time in milliseconds (default: 3000)
   */
  getSyncManager(debounceMs = 3000): DebouncedSyncManager {
    if (!this.syncManager) {
      this.syncManager = new DebouncedSyncManager(
        async (data) => {
          await this.syncData({
            mode: 'merge',
            data,
            clientTimestamp: new Date().toISOString(),
          });
        },
        debounceMs
      );
    }
    return this.syncManager;
  }

  /**
   * Get debounced sync manager for financial data (uses delta mode)
   * @param debounceMs - Debounce time in milliseconds (default: 5000)
   */
  getFinancialSyncManager(debounceMs = 5000): DebouncedSyncManager {
    if (!this.financialSyncManager) {
      this.financialSyncManager = new DebouncedSyncManager(
        async (data) => {
          // Accumulate deltas from batched data
          const delta: FinancialDelta = {
            depositDelta: (data.deposit_delta as number) || 0,
            withdrawDelta: (data.withdraw_delta as number) || 0,
            betDelta: (data.bet_delta as number) || 0,
            winDelta: (data.win_delta as number) || 0,
            lossDelta: (data.loss_delta as number) || 0,
            profitDelta: (data.profit_delta as number) || 0,
          };
          
          await this.syncData({
            mode: 'delta',
            financialDelta: delta,
            clientTimestamp: new Date().toISOString(),
          });
        },
        debounceMs
      );
    }
    return this.financialSyncManager;
  }

  // ============================================
  // User Data Methods
  // ============================================

  /**
   * Get current user profile
   */
  async getUser(): Promise<FunUser> {
    const response = await this.authenticatedRequest(ENDPOINTS.verify, {
      method: 'GET',
    });

    this.currentUser = this.transformUser(response);
    return this.currentUser;
  }

  /**
   * Get cached user (no API call)
   */
  getCachedUser(): FunUser | null {
    return this.currentUser;
  }

  /**
   * Sync platform data to Fun Profile
   */
  async syncData(options: SyncOptions): Promise<SyncResult> {
    const body: Record<string, unknown> = {
      sync_mode: options.mode,
      client_timestamp: options.clientTimestamp || new Date().toISOString(),
    };

    // Add game/platform data if provided
    if (options.data) {
      body.data = options.data;
    }

    // Add categories if provided
    if (options.categories) {
      body.categories = options.categories;
    }

    // Add financial data if provided (replace mode)
    if (options.financialData) {
      body.financial_data = {
        total_deposit: options.financialData.totalDeposit,
        total_withdraw: options.financialData.totalWithdraw,
        total_bet: options.financialData.totalBet,
        total_win: options.financialData.totalWin,
        total_loss: options.financialData.totalLoss,
        total_profit: options.financialData.totalProfit,
      };
    }

    // Add financial delta if provided (delta mode)
    if (options.financialDelta) {
      body.financial_delta = {
        deposit_delta: options.financialDelta.depositDelta,
        withdraw_delta: options.financialDelta.withdrawDelta,
        bet_delta: options.financialDelta.betDelta,
        win_delta: options.financialDelta.winDelta,
        loss_delta: options.financialDelta.lossDelta,
        profit_delta: options.financialDelta.profitDelta,
      };
    }

    const response = await this.authenticatedRequest(ENDPOINTS.syncData, {
      method: 'POST',
      body,
    });

    const result: SyncResult = {
      success: response.success as boolean,
      syncedAt: response.synced_at as string,
      syncMode: response.sync_mode as string,
      syncCount: response.sync_count as number,
      categoriesUpdated: response.categories_updated as string[],
      dataSize: response.data_size as number,
    };

    // Include financial data in result if returned
    if (response.financial_data) {
      const fd = response.financial_data as Record<string, number>;
      result.financialData = {
        totalDeposit: fd.total_deposit,
        totalWithdraw: fd.total_withdraw,
        totalBet: fd.total_bet,
        totalWin: fd.total_win,
        totalLoss: fd.total_loss,
        totalProfit: fd.total_profit,
      };
    }

    return result;
  }

  /**
   * Quick method to sync financial delta
   * @example
   * await client.syncFinancialDelta({ betDelta: 1000, lossDelta: 1000 });
   */
  async syncFinancialDelta(delta: FinancialDelta): Promise<SyncResult> {
    return this.syncData({
      mode: 'delta',
      financialDelta: delta,
      clientTimestamp: new Date().toISOString(),
    });
  }

  /**
   * Quick method to sync full financial data (replace)
   */
  async syncFinancialData(data: Partial<FinancialData>): Promise<SyncResult> {
    return this.syncData({
      mode: 'replace',
      financialData: data as FinancialData,
      clientTimestamp: new Date().toISOString(),
    });
  }

  /**
   * Sync a single financial transaction (Idempotent)
   * 
   * This method implements the Financial Data Contract for transaction-level sync.
   * It is idempotent: if the same transactionId is sent multiple times, 
   * only the first will be processed.
   * 
   * @example
   * ```typescript
   * // Claim reward
   * await client.syncFinancialTransaction({
   *   action: 'CLAIM_REWARD',
   *   amount: 150,
   *   transactionId: 'tx-123-456',
   *   currency: 'CAMLY'
   * });
   * 
   * // User wins a game
   * await client.syncFinancialTransaction({
   *   action: 'WIN',
   *   amount: 5000,
   *   transactionId: `win-${Date.now()}-${Math.random().toString(36).slice(2)}`,
   * });
   * ```
   */
  async syncFinancialTransaction(options: FinancialTransactionOptions): Promise<FinancialTransactionResult> {
    const body: Record<string, unknown> = {
      action: options.action,
      amount: options.amount,
      transaction_id: options.transactionId,
    };

    if (options.currency) body.currency = options.currency;
    if (options.platformKey) body.platform_key = options.platformKey;
    if (options.metadata) body.metadata = options.metadata;

    const response = await this.authenticatedRequest(ENDPOINTS.syncFinancial, {
      method: 'POST',
      body,
    });

    const result: FinancialTransactionResult = {
      success: response.success as boolean,
      alreadyProcessed: response.already_processed as boolean,
      transactionId: response.transaction_id as string,
      action: response.action as FinancialAction,
      amount: response.amount as number,
      currency: response.currency as string | undefined,
      internalId: response.internal_id as string | undefined,
      syncedAt: (response.synced_at || response.processed_at) as string,
      message: response.message as string | undefined,
    };

    // Include new balance if returned
    if (response.new_balance) {
      const nb = response.new_balance as Record<string, number>;
      result.newBalance = {
        totalDeposit: nb.total_deposit,
        totalWithdraw: nb.total_withdraw,
        totalBet: nb.total_bet,
        totalWin: nb.total_win,
        totalLoss: nb.total_loss,
        totalProfit: nb.total_profit,
      };
    }

    return result;
  }

  // ============================================
  // Token Management
  // ============================================

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    const tokens = await this.storage.getTokens();
    if (!tokens) return false;

    // Check if token is expired
    if (Date.now() >= tokens.expiresAt - TOKEN_REFRESH_BUFFER) {
      if (this.config.autoRefresh) {
        try {
          await this.refreshTokens();
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }

    return true;
  }

  /**
   * Get current access token
   */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.storage.getTokens();
    if (!tokens) return null;

    // Auto-refresh if needed
    if (Date.now() >= tokens.expiresAt - TOKEN_REFRESH_BUFFER) {
      if (this.config.autoRefresh) {
        const newTokens = await this.refreshTokens();
        return newTokens.accessToken;
      }
      throw new TokenExpiredError();
    }

    return tokens.accessToken;
  }

  /**
   * Get raw token data
   */
  async getTokens(): Promise<TokenData | null> {
    return this.storage.getTokens();
  }

  /**
   * Manually refresh tokens
   */
  async refreshTokens(): Promise<TokenData> {
    const tokens = await this.storage.getTokens();
    if (!tokens) {
      throw new InvalidTokenError('No tokens available');
    }

    const response = await this.request(ENDPOINTS.refresh, {
      method: 'POST',
      body: {
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      },
    });

    const newTokens: TokenData = {
      accessToken: response.access_token as string,
      refreshToken: (response.refresh_token as string) || tokens.refreshToken,
      expiresAt: Date.now() + (response.expires_in as number) * 1000,
      scope: ((response.scope as string) || '').split(' ') || tokens.scope,
    };

    await this.storage.setTokens(newTokens);
    return newTokens;
  }

  /**
   * Decode JWT claims from access token (without verification)
   * Useful for getting user info without API call
   */
  decodeAccessToken(): Record<string, unknown> | null {
    const tokens = this.storage.getTokens();
    if (!tokens) return null;

    return tokens.then((t) => {
      if (!t) return null;
      try {
        const parts = t.accessToken.split('.');
        if (parts.length !== 3) return null;
        
        // Decode payload (middle part)
        const payload = parts[1];
        const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decoded);
      } catch {
        return null;
      }
    }) as unknown as Record<string, unknown> | null;
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async handleTokenResponse(response: Record<string, unknown>): Promise<AuthResult> {
    const tokens: TokenData = {
      accessToken: response.access_token as string,
      refreshToken: response.refresh_token as string,
      expiresAt: Date.now() + (response.expires_in as number) * 1000,
      scope: ((response.scope as string) || '').split(' '),
    };

    await this.storage.setTokens(tokens);

    if (response.user) {
      this.currentUser = this.transformUser(response.user as Record<string, unknown>);
    }

    return this.transformAuthResult(response, tokens);
  }

  private async handleOtpTokenResponse(response: Record<string, unknown>): Promise<AuthResult> {
    const tokens: TokenData = {
      accessToken: response.access_token as string,
      refreshToken: response.refresh_token as string,
      expiresAt: Date.now() + 3600 * 1000, // 1 hour default for OTP
      scope: this.config.scopes,
    };

    await this.storage.setTokens(tokens);

    // Fetch full user profile
    const user = await this.getUser();

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 3600,
      scope: tokens.scope.join(' '),
      user,
      isNewUser: response.is_new_user as boolean,
    };
  }

  private transformAuthResult(response: Record<string, unknown>, tokens: TokenData): AuthResult {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: Math.floor((tokens.expiresAt - Date.now()) / 1000),
      scope: tokens.scope.join(' '),
      user: this.currentUser!,
      isNewUser: response.is_new_user as boolean | undefined,
    };
  }

  private transformUser(data: Record<string, unknown>): FunUser {
    const user: FunUser = {
      id: (data.sub as string) || (data.id as string),
      funId: data.fun_id as string,
      username: data.username as string,
      fullName: data.full_name as string | undefined,
      avatarUrl: data.avatar_url as string | undefined,
      email: data.email as string | undefined,
      walletAddress: data.wallet_address as string | undefined,
      externalWalletAddress: data.external_wallet_address as string | undefined,
      
      tokenType: data.token_type as 'jwt' | 'opaque' | undefined,
    };

    // Soul NFT data
    if (data.soul_nft) {
      const soul = data.soul_nft as Record<string, unknown>;
      user.soul = {
        element: soul.soul_element as string,
        level: soul.soul_level as number,
        tokenId: soul.token_id as string | undefined,
        mintedAt: soul.minted_at as string | undefined,
        isMinted: soul.is_minted as boolean | undefined,
      };
    }

    // Rewards data
    if (data.rewards) {
      const rewards = data.rewards as Record<string, unknown>;
      user.rewards = {
        pending: (rewards.pending_reward as number) || 0,
        approved: (rewards.approved_reward as number) || 0,
        claimed: (rewards.claimed_reward as number) || 0,
        status: rewards.reward_status as string,
        total: (rewards.total_rewards as number) || 0,
      };
    }

    return user;
  }

  private generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  private async request(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<Record<string, unknown>> {
    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        await this.handleError(response);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof FunProfileError) {
        throw error;
      }
      throw new NetworkError((error as Error).message);
    }
  }

  private async authenticatedRequest(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<Record<string, unknown>> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      throw new InvalidTokenError('Not authenticated');
    }

    return this.request(endpoint, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  }

  private async handleError(response: Response): Promise<never> {
    const contentType = response.headers.get('content-type');
    let errorData: Record<string, unknown> = {};

    if (contentType?.includes('application/json')) {
      try {
        errorData = await response.json();
      } catch {
        // Ignore JSON parse errors
      }
    }

    switch (response.status) {
      case 401:
        throw new InvalidTokenError(errorData.error_description as string);
      case 429: {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        throw new RateLimitError(retryAfter);
      }
      case 400:
        throw new ValidationError(
          (errorData.error_description as string) || 'Validation failed',
          errorData.details as Record<string, unknown>
        );
      default:
        throw new FunProfileError(
          (errorData.error as string) || 'unknown_error',
          (errorData.error_description as string) || `Request failed with status ${response.status}`,
          errorData.details as Record<string, unknown>
        );
    }
  }
}
