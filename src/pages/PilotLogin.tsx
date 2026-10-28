// PILOT cua account.fun.rich - trang bat dau luong 1 (cua -> fun.rich).
// Chi cong them, KHONG sua trang Auth cu, KHONG cham dang nhap goc.
// Trang nay tu sinh PKCE (S256) roi dua trinh duyet ve cua de lay ma code.
import { useEffect, useRef } from 'react';

const DOOR_URL =
  (import.meta.env.VITE_FUN_PILOT_DOOR_URL as string | undefined) || 'https://account.fun.rich';
const CLIENT_ID = 'fun_profile_pilot_client';

function randomHex(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => ('0' + b.toString(16)).slice(-2)).join('');
}

function base64url(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < arr.length; i++) {
    s += String.fromCharCode(arr[i]);
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64url(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64url(hash);
}

export default function PilotLogin() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const verifier = randomHex(64);
      const challenge = await sha256Base64url(verifier);
      const state = randomHex(32);
      sessionStorage.setItem('fun_pilot_pkce', JSON.stringify({ verifier, state }));
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: `${window.location.origin}/sso-callback`,
        response_type: 'code',
        scope: 'profile email',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      window.location.href = `${DOOR_URL.replace(/\/$/, '')}/sso-authorize?${params.toString()}`;
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-bold mb-2">Đang chuyển tới cửa pilot...</h1>
        <p className="text-muted-foreground">
          Redirecting to the pilot door (account.fun.rich)...
        </p>
      </div>
    </div>
  );
}
