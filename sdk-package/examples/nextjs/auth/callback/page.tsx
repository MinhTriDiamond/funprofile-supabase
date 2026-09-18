/**
 * OAuth Callback Page for Next.js App Router
 * 
 * Place at: app/auth/callback/page.tsx
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { funProfileClient } from '../../FunProfileProvider';

// Camly messages 🐱
const MESSAGES = [
  "Camly đang hoàn tất đăng nhập... 🐱✨",
  "Chút nữa thôi, Camly đang lấy thông tin... 📋",
  "Đợi Camly tí nha, sắp xong rồi... ⏳",
];

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState(MESSAGES[0]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) return;
    
    const interval = setInterval(() => {
      setMessage(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
    }, 2000);

    return () => clearInterval(interval);
  }, [error]);

  useEffect(() => {
    const handleCallback = async () => {
      if (!funProfileClient) {
        setError('SDK not initialized');
        return;
      }

      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError(searchParams.get('error_description') || 'Login cancelled');
        setTimeout(() => router.push('/login'), 3000);
        return;
      }

      if (!code || !state) {
        setError('Missing parameters');
        setTimeout(() => router.push('/login'), 3000);
        return;
      }

      try {
        await funProfileClient.handleCallback(code, state);
        router.push('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Auth failed');
        setTimeout(() => router.push('/login'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-6xl mb-4">😿</div>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="animate-bounce text-6xl">🐱</div>
      <p className="mt-6 text-lg animate-pulse">{message}</p>
    </div>
  );
}
