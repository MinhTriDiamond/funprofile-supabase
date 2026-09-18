const encoder = new TextEncoder();
const decoder = new TextDecoder();

function secret(): string {
  const value = Deno.env.get('STREAM_KEY_ENCRYPTION_SECRET')
    || Deno.env.get('SUPABASE_SECRET_KEY')
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!value) throw new Error('Missing STREAM_KEY_ENCRYPTION_SECRET');
  return value;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function key(): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(secret()));
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptStreamKey(plainText: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await key(),
    encoder.encode(plainText),
  ));
  return `v1.${toBase64(iv)}.${toBase64(encrypted)}`;
}

export async function decryptStreamKey(cipherText: string): Promise<string> {
  const [version, ivB64, dataB64] = cipherText.split('.');
  if (version !== 'v1' || !ivB64 || !dataB64) throw new Error('Invalid encrypted stream key');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64) },
    await key(),
    fromBase64(dataB64),
  );
  return decoder.decode(decrypted);
}

/**
 * Best-effort decrypt: trả null nếu giải mã thất bại (ví dụ ciphertext mã hoá
 * bằng secret cũ đã rotate). KHÔNG throw. Caller dùng để self-heal: tạo lại
 * Live Input/Stream Key mới khi gặp null.
 */
export async function tryDecryptStreamKey(cipherText: string | null | undefined): Promise<string | null> {
  if (!cipherText) return null;
  try {
    return await decryptStreamKey(cipherText);
  } catch (err) {
    console.warn('[streamKeyCrypto] tryDecryptStreamKey failed:', String((err as Error)?.message || err));
    return null;
  }
}
