/**
 * Fun Profile SSO SDK - PKCE Utilities
 * Proof Key for Code Exchange (RFC 7636)
 */

/**
 * Generate a cryptographically random code verifier
 * @param length - Length of the verifier (43-128 characters, default 64)
 */
export function generateCodeVerifier(length = 64): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (x) => chars[x % chars.length]).join('');
}

/**
 * Generate a code challenge from a code verifier using S256 method
 * @param verifier - The code verifier string
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);

  // Base64url encode (RFC 4648)
  let base64 = btoa(String.fromCharCode(...hashArray));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Store code verifier temporarily during OAuth flow
 * @param verifier - The code verifier to store
 * @param state - The OAuth state parameter (used as key)
 */
export function storeCodeVerifier(verifier: string, state: string): void {
  try {
    sessionStorage.setItem(`pkce_${state}`, verifier);
  } catch {
    // Fallback to memory if sessionStorage is not available
    (window as unknown as Record<string, string>)[`__pkce_${state}`] = verifier;
  }
}

/**
 * Retrieve and remove code verifier after OAuth callback
 * @param state - The OAuth state parameter
 */
export function retrieveCodeVerifier(state: string): string | null {
  try {
    const verifier = sessionStorage.getItem(`pkce_${state}`);
    sessionStorage.removeItem(`pkce_${state}`);
    return verifier;
  } catch {
    // Fallback to memory
    const key = `__pkce_${state}`;
    const verifier = (window as unknown as Record<string, string>)[key];
    delete (window as unknown as Record<string, string>)[key];
    return verifier || null;
  }
}
