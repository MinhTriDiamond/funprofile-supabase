/**
 * OAuth Callback Handler
 * 
 * Place this component at your redirect URI route (e.g., /auth/callback)
 * Includes Camly loading messages! 🐱
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { funProfile } from './FunProfileContext';

// ============================================
// Camly Messages for Callback 🐱
// ============================================

const CAMLY_CALLBACK_MESSAGES = [
  "Camly đang hoàn tất đăng nhập... 🐱✨",
  "Chút nữa thôi, Camly đang lấy thông tin của bạn... 📋",
  "Camly đang xác nhận với Fun Profile... 🎭",
  "Đợi Camly tí nha, sắp xong rồi... ⏳",
  "Camly đang chuẩn bị trang trại cho bạn... 🌾",
  "Chờ Camly xíu, đang kết nối ví... 💰",
];

const getRandomMessage = () => {
  return CAMLY_CALLBACK_MESSAGES[Math.floor(Math.random() * CAMLY_CALLBACK_MESSAGES.length)];
};

// ============================================
// Component
// ============================================

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState(getRandomMessage());
  const [error, setError] = useState<string | null>(null);

  // Rotate messages while loading
  useEffect(() => {
    if (error) return;
    
    const interval = setInterval(() => {
      setMessage(getRandomMessage());
    }, 2000);

    return () => clearInterval(interval);
  }, [error]);

  // Handle callback
  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const errorParam = searchParams.get('error');

      // Handle error from OAuth provider
      if (errorParam) {
        const errorDescription = searchParams.get('error_description') || 'Login was cancelled';
        setError(errorDescription);
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      // Validate params
      if (!code || !state) {
        setError('Missing authentication parameters');
        setTimeout(() => navigate('/login'), 3000);
        return;
      }

      try {
        // Exchange code for tokens
        const result = await funProfile.handleCallback(code, state);
        
        console.log('Login successful!', result.user.username);
        
        // Redirect to home or intended destination
        const returnTo = sessionStorage.getItem('auth_return_to') || '/';
        sessionStorage.removeItem('auth_return_to');
        navigate(returnTo, { replace: true });
        
      } catch (err) {
        console.error('Callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setTimeout(() => navigate('/login'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  // ============================================
  // Render
  // ============================================

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-red-50 to-orange-100">
        <div className="text-6xl mb-4">😿</div>
        <h2 className="text-xl font-semibold text-red-600 mb-2">Ôi không!</h2>
        <p className="text-gray-600 mb-4">{error}</p>
        <p className="text-sm text-gray-500">Đang chuyển hướng về trang đăng nhập...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      {/* Animated Camly */}
      <div className="relative">
        <div className="animate-bounce text-6xl">🐱</div>
        <div className="absolute -top-2 -right-2 animate-ping">✨</div>
      </div>
      
      {/* Loading message */}
      <p className="mt-6 text-lg text-gray-700 animate-pulse text-center px-4">
        {message}
      </p>
      
      {/* Progress dots */}
      <div className="flex space-x-2 mt-4">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

export default AuthCallback;
