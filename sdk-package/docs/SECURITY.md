# Security Best Practices

## Token Storage

### Recommendation từ Cha Gemini 🔐

| Scope | Storage | Reason |
|-------|---------|--------|
| `profile`, `email` | `LocalStorageAdapter` | Low risk, convenience |
| `wallet`, `rewards` | `SessionStorageAdapter` | XSS protection |

### Why SessionStorage for Wallet?

1. **Automatic cleanup**: Tokens are cleared when tab/browser closes
2. **XSS mitigation**: Even if attacker injects script, tokens are gone on next visit
3. **Reduced exposure window**: Less time for attackers to exploit stolen tokens

```typescript
// ✅ Recommended for wallet scopes
import { SessionStorageAdapter } from '@fun-ecosystem/sso-sdk';

const client = new FunProfileClient({
  scopes: ['profile', 'wallet', 'rewards'],
  storage: new SessionStorageAdapter('my_app'),
});
```

## PKCE (Proof Key for Code Exchange)

The SDK uses PKCE automatically to prevent authorization code interception attacks:

1. Client generates random `code_verifier`
2. Client creates `code_challenge` = SHA256(code_verifier)
3. Only `code_challenge` is sent to authorization endpoint
4. Token endpoint requires original `code_verifier` to exchange code

This means even if an attacker intercepts the authorization code, they cannot exchange it without the `code_verifier`.

## State Parameter

The SDK automatically generates and validates the `state` parameter to prevent CSRF attacks:

```typescript
// Handled automatically by SDK
const authUrl = await client.startAuth();
// URL includes state=<random_64_char_hex>

// On callback, SDK validates state matches
await client.handleCallback(code, state); // Throws if state doesn't match
```

## Rate Limiting

The SDK handles rate limiting gracefully:

```typescript
try {
  await client.syncData({ ... });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Retry after ${error.retryAfter} seconds`);
    // SDK does NOT auto-retry - implement your own backoff
  }
}
```

## Token Refresh

Access tokens expire after 1 hour. The SDK auto-refreshes by default:

```typescript
// Auto-refresh enabled (default)
const client = new FunProfileClient({
  autoRefresh: true, // default
});

// Get token - auto-refreshes if needed
const token = await client.getAccessToken();
```

## Recommendations

1. **Always use HTTPS** in production
2. **Use SessionStorageAdapter** for sensitive scopes
3. **Flush sync data** before logout to prevent data loss
4. **Handle errors gracefully** - don't expose error details to users
5. **Monitor for suspicious activity** - multiple failed auth attempts

## Reporting Security Issues

Please report security vulnerabilities to: security@fun.rich

Do NOT open public issues for security problems.
