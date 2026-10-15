/**
 * JWT Utilities for FUN Profile SSO
 * 
 * Derives signing key from SUPABASE_SERVICE_ROLE_KEY to avoid needing a separate secret.
 * Uses HMAC-SHA256 for token signing.
 */

const JWT_ISSUER = "fun_profile";
const ACCESS_TOKEN_EXPIRES_SECONDS = 3600; // 1 hour

interface JWTPayload {
  sub: string;                    // user_id (UUID)
  fun_id: string;                 // FUN ID (username-based identifier)
  username: string;               // Display username
  scope: string[];                // Granted scopes/permissions
  client_id?: string;             // Client the token was issued to (also set as `aud`)
  custodial_wallet?: string | null;
}

interface JWTHeader {
  alg: string;
  typ: string;
}

// Derive a signing key from SUPABASE_SERVICE_ROLE_KEY using HKDF-like approach
async function getSigningKey(): Promise<CryptoKey> {
  // Sau rotate 2026-06-11: ưu tiên SECRET_KEY, fallback SERVICE_ROLE_KEY
  const serviceKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    throw new Error("SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  
  // Use the service key + salt to derive JWT signing key
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(serviceKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  
  // Derive a specific key for JWT signing
  const salt = encoder.encode("fun_profile_jwt_v1");
  const derivedKeyData = await crypto.subtle.sign("HMAC", keyMaterial, salt);
  
  // Import the derived key for HMAC operations
  return await crypto.subtle.importKey(
    "raw",
    derivedKeyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// Base64URL encode
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Base64URL decode
function base64UrlDecode(str: string): Uint8Array {
  // Add padding if needed
  let padded = str.replace(/-/g, "+").replace(/_/g, "/");
  while (padded.length % 4) {
    padded += "=";
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate a JWT Access Token
 */
export async function generateAccessToken(payload: JWTPayload): Promise<string> {
  const signingKey = await getSigningKey();
  const encoder = new TextEncoder();
  
  const now = Math.floor(Date.now() / 1000);
  
  const header: JWTHeader = {
    alg: "HS256",
    typ: "JWT"
  };
  
  const claims = {
    ...payload,
    // Bind the token to the issuing client (C2 fix, SSO hardening 2026-10-15):
    // `aud` is the standard claim, `client_id` kept alongside for consumers.
    ...(payload.client_id ? { aud: payload.client_id, client_id: payload.client_id } : {}),
    iss: JWT_ISSUER,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRES_SECONDS
  };
  
  // Encode header and payload
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  
  // Sign
  const message = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    signingKey,
    encoder.encode(message)
  );
  
  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  
  return `${message}.${signatureB64}`;
}

/**
 * Verify and decode a JWT Access Token
 * Returns null if invalid or expired
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      console.error("[JWT] Invalid token format");
      return null;
    }
    
    const [headerB64, payloadB64, signatureB64] = parts;
    
    // Verify signature
    const signingKey = await getSigningKey();
    const encoder = new TextEncoder();
    const message = `${headerB64}.${payloadB64}`;
    
    const signatureBytes = base64UrlDecode(signatureB64);
    const isValid = await crypto.subtle.verify(
      "HMAC",
      signingKey,
      new Uint8Array(signatureBytes).buffer as ArrayBuffer,
      encoder.encode(message)
    );
    
    if (!isValid) {
      console.error("[JWT] Signature verification failed");
      return null;
    }
    
    // Decode and validate claims
    const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
    const claims = JSON.parse(payloadJson);
    
    // Check issuer
    if (claims.iss !== JWT_ISSUER) {
      console.error("[JWT] Invalid issuer");
      return null;
    }
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
      console.error("[JWT] Token expired");
      return null;
    }
    
    return {
      sub: claims.sub,
      fun_id: claims.fun_id,
      username: claims.username,
      custodial_wallet: claims.custodial_wallet,
      client_id: claims.client_id || claims.aud,
      scope: claims.scope
    };
  } catch (error) {
    console.error("[JWT] Verification error:", error);
    return null;
  }
}

/**
 * Generate an opaque refresh token (secure random string)
 */
export function generateRefreshToken(length = 96): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => chars[b % chars.length]).join("");
}

/**
 * Decode JWT without verification (for debugging/logging only)
 */
export function decodeJwtUnsafe(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    
    const payloadJson = new TextDecoder().decode(base64UrlDecode(parts[1]));
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}
