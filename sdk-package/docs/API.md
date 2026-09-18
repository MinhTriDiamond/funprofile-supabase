# API Reference

## FunProfileClient

Main client class for SSO authentication and data synchronization.

### Constructor

```typescript
new FunProfileClient(config: FunProfileConfig)
```

#### FunProfileConfig

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `clientId` | `string` | ✅ | - | OAuth client ID |
| `clientSecret` | `string` | ❌ | - | OAuth client secret (for confidential clients) |
| `redirectUri` | `string` | ✅ | - | OAuth redirect URI |
| `baseUrl` | `string` | ❌ | Fun Profile API | SSO API base URL |
| `scopes` | `string[]` | ❌ | `['profile']` | Requested OAuth scopes |
| `storage` | `TokenStorage` | ❌ | `LocalStorageAdapter` | Token storage adapter |
| `autoRefresh` | `boolean` | ❌ | `true` | Auto-refresh expired tokens |

---

## Authentication Methods

### `startAuth(options?)`

Start OAuth 2.0 + PKCE authorization flow.

```typescript
const authUrl = await client.startAuth({
  prompt: 'login' // 'login' | 'consent' | 'none'
});
window.location.href = authUrl;
```

### `handleCallback(code, state)`

Exchange authorization code for tokens.

```typescript
const result = await client.handleCallback(code, state);
// result: AuthResult
```

### `register(options)`

Register new user via platform.

```typescript
const result = await client.register({
  email: 'user@example.com',
  username: 'newuser',
  platformData: { source: 'fun_farm' }
});
```

### `logout()`

Logout and revoke tokens. Automatically flushes any pending sync data.

```typescript
await client.logout();
```

---

## User Methods

### `getUser()`

Get current user profile from API.

```typescript
const user = await client.getUser();
```

### `getCachedUser()`

Get cached user (no API call).

```typescript
const user = client.getCachedUser();
```

---

## Data Sync Methods

### `syncData(options)`

Sync platform data to Fun Profile.

```typescript
const result = await client.syncData({
  mode: 'merge', // 'merge' | 'replace' | 'append' | 'delta'
  data: {
    farm_stats: { level: 10, gold: 5000 }
  },
  categories: ['farm_stats'],
  clientTimestamp: new Date().toISOString()
});
```

### `getSyncManager(debounceMs?)`

Get debounced sync manager for batching game/platform data.

```typescript
const syncManager = client.getSyncManager(3000);

syncManager.queue('stats', { gold: 100 });
syncManager.queue('stats', { gold: 150 }); // Merged with previous

// Only 1 API call after 3 seconds of inactivity
```

---

## Financial Sync Methods

### `syncFinancialTransaction(options)` ⭐ Recommended

Sync a single financial transaction. **Idempotent** - safe to retry.

```typescript
// Claim reward
await client.syncFinancialTransaction({
  action: 'CLAIM_REWARD',
  amount: 150,
  transactionId: 'reward-claim-123',
  currency: 'CAMLY'
});

// User places a bet
await client.syncFinancialTransaction({
  action: 'BET',
  amount: 1000,
  transactionId: `bet-${Date.now()}-${Math.random().toString(36).slice(2)}`
});

// User wins
await client.syncFinancialTransaction({
  action: 'WIN',
  amount: 2500,
  transactionId: `win-${Date.now()}-${Math.random().toString(36).slice(2)}`
});
```

#### FinancialAction Types

| Action | Description |
|--------|-------------|
| `CLAIM_REWARD` | User claims reward |
| `SEND_MONEY` | User sends money |
| `RECEIVE_MONEY` | User receives money |
| `DEPOSIT` | User deposits funds |
| `WITHDRAW` | User withdraws funds |
| `BET` | User places a bet |
| `WIN` | User wins |
| `LOSS` | User loses |
| `ADJUSTMENT_ADD` | Admin adds balance |
| `ADJUSTMENT_SUB` | Admin subtracts balance |

### `syncFinancialDelta(delta)`

Quick method to sync financial delta (incremental updates).

```typescript
await client.syncFinancialDelta({
  betDelta: 1000,
  lossDelta: 1000
});
```

### `syncFinancialData(data)`

Sync full financial data (replace mode).

```typescript
await client.syncFinancialData({
  totalDeposit: 10000,
  totalWithdraw: 5000,
  totalBet: 50000,
  totalWin: 45000,
  totalLoss: 5000,
  totalProfit: -5000
});
```

### `getFinancialSyncManager(debounceMs?)`

Get debounced sync manager for batching financial deltas.

```typescript
const financialSync = client.getFinancialSyncManager(5000);

// Queue multiple deltas - they will be accumulated
financialSync.queue('deposit_delta', 1000);
financialSync.queue('bet_delta', 500);
financialSync.queue('bet_delta', 300); // Accumulated: 800

// Single API call after 5 seconds
```

---

## Token Methods

### `isAuthenticated()`

Check if user is authenticated.

```typescript
const isAuth = await client.isAuthenticated();
```

### `getAccessToken()`

Get current access token (auto-refreshes if needed).

```typescript
const token = await client.getAccessToken();
```

### `getTokens()`

Get raw token data.

```typescript
const tokens = await client.getTokens();
// tokens: TokenData | null
```

### `refreshTokens()`

Manually refresh tokens.

```typescript
const newTokens = await client.refreshTokens();
```

### `decodeAccessToken()`

Decode JWT claims from access token (without verification).

```typescript
const claims = await client.decodeAccessToken();
// claims: { sub, fun_id, username, scope, ... }
```

---

## Types

### FunUser

```typescript
interface FunUser {
  id: string;
  funId: string;
  username: string;
  fullName?: string;
  avatarUrl?: string;
  email?: string;
  walletAddress?: string;
  externalWalletAddress?: string;
  custodialWalletAddress?: string;
  soul?: SoulNft;
  rewards?: UserRewards;
  financialData?: FinancialData;
  tokenType?: 'jwt' | 'opaque';
}
```

### FinancialData

```typescript
interface FinancialData {
  totalDeposit: number;
  totalWithdraw: number;
  totalBet: number;
  totalWin: number;
  totalLoss: number;
  totalProfit: number;
}
```

### FinancialDelta

```typescript
interface FinancialDelta {
  depositDelta?: number;
  withdrawDelta?: number;
  betDelta?: number;
  winDelta?: number;
  lossDelta?: number;
  profitDelta?: number;
}
```

### FinancialTransactionOptions

```typescript
interface FinancialTransactionOptions {
  action: FinancialAction;
  amount: number;
  transactionId: string;  // Must be unique for idempotency
  currency?: string;
  platformKey?: string;
  metadata?: Record<string, unknown>;
}
```

### FinancialTransactionResult

```typescript
interface FinancialTransactionResult {
  success: boolean;
  alreadyProcessed: boolean;  // True if transaction was already synced
  transactionId: string;
  action: FinancialAction;
  amount: number;
  currency?: string;
  internalId?: string;
  syncedAt: string;
  newBalance?: FinancialData;  // Updated balance after transaction
  message?: string;
}
```

### AuthResult

```typescript
interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  user: FunUser;
  isNewUser?: boolean;
}
```

### SyncResult

```typescript
interface SyncResult {
  success: boolean;
  syncedAt: string;
  syncMode: string;
  syncCount: number;
  categoriesUpdated: string[];
  dataSize: number;
  financialData?: FinancialData;
}
```

### JWTClaims

```typescript
interface JWTClaims {
  sub: string;         // user_id
  fun_id: string;      // FUN ID
  username: string;    // Display username
  custodial_wallet: string | null;
  scope: string[];     // Granted scopes
  iss: string;         // Issuer (fun_profile)
  iat: number;         // Issued at
  exp: number;         // Expiration
}
```

---

## Storage Adapters

### LocalStorageAdapter

Persistent storage across browser sessions.

```typescript
import { LocalStorageAdapter } from '@fun-ecosystem/sso-sdk';
new LocalStorageAdapter(clientId: string)
```

### SessionStorageAdapter

Cleared when tab/browser closes. **Recommended for sensitive scopes** (wallet, rewards).

```typescript
import { SessionStorageAdapter } from '@fun-ecosystem/sso-sdk';
new SessionStorageAdapter(clientId: string)
```

### MemoryStorageAdapter

In-memory storage for testing/SSR.

```typescript
import { MemoryStorageAdapter } from '@fun-ecosystem/sso-sdk';
new MemoryStorageAdapter()
```

---

## Error Classes

| Class | Code | Description |
|-------|------|-------------|
| `FunProfileError` | varies | Base error class |
| `TokenExpiredError` | `token_expired` | Access token expired |
| `InvalidTokenError` | `invalid_token` | Invalid or revoked token |
| `RateLimitError` | `rate_limit_exceeded` | Rate limit hit (has `retryAfter`) |
| `ValidationError` | `validation_failed` | Request validation failed |
| `NetworkError` | `network_error` | Network request failed |

```typescript
import { RateLimitError, TokenExpiredError } from '@fun-ecosystem/sso-sdk';

try {
  await client.syncFinancialTransaction({ ... });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Retry after ${error.retryAfter}s`);
  }
  if (error instanceof TokenExpiredError) {
    // Redirect to login
  }
}
```

---

## Constants

```typescript
import { DOMAINS, ENDPOINTS, SDK_VERSION } from '@fun-ecosystem/sso-sdk';

DOMAINS.funProfile  // 'https://fun.rich'
DOMAINS.funFarm     // 'https://farm.fun.rich'
DOMAINS.funPlay     // 'https://play.fun.rich'
DOMAINS.funPlanet   // 'https://planet.fun.rich'

SDK_VERSION         // '1.0.2'
```

---

## Complete Integration Example

```typescript
import { 
  FunProfileClient, 
  SessionStorageAdapter,
  DOMAINS,
  TokenExpiredError 
} from '@fun-ecosystem/sso-sdk';

// Initialize client
const funProfile = new FunProfileClient({
  clientId: 'fun_farm_client',
  redirectUri: `${DOMAINS.funFarm}/auth/callback`,
  scopes: ['profile', 'email', 'wallet', 'rewards'],
  storage: new SessionStorageAdapter('fun_farm_client'),
});

// Login
async function login() {
  const authUrl = await funProfile.startAuth();
  window.location.href = authUrl;
}

// Handle callback
async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  
  if (code && state) {
    const result = await funProfile.handleCallback(code, state);
    console.log('Logged in as', result.user.username);
  }
}

// Sync game data with debouncing
const syncManager = funProfile.getSyncManager(3000);

function onGameProgress(stats: object) {
  syncManager.queue('game_stats', stats);
}

// Sync financial transaction
async function onUserBet(amount: number, txId: string) {
  const result = await funProfile.syncFinancialTransaction({
    action: 'BET',
    amount,
    transactionId: txId,
  });
  
  if (result.alreadyProcessed) {
    console.log('Transaction already synced');
  }
}

// Flush on page unload
window.addEventListener('beforeunload', () => {
  syncManager.flush();
});
```
