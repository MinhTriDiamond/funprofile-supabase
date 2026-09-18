/**
 * Login Button Component
 * 
 * Simple login/logout button using Fun Profile SSO.
 */

import React from 'react';
import { useFunProfile } from './FunProfileContext';

interface LoginButtonProps {
  className?: string;
}

export function LoginButton({ className = '' }: LoginButtonProps) {
  const { user, isLoading, login, logout } = useFunProfile();

  if (isLoading) {
    return (
      <button
        disabled
        className={`px-4 py-2 rounded-lg bg-gray-200 text-gray-500 cursor-not-allowed ${className}`}
      >
        <span className="animate-pulse">Loading...</span>
      </button>
    );
  }

  if (user) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        {/* User Avatar */}
        <div className="flex items-center gap-2">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold">
              {user.username.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm font-medium text-gray-700">
            {user.fullName || user.username}
          </span>
        </div>

        {/* Logout Button */}
        <button
          onClick={logout}
          className="px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
        >
          Đăng xuất
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={login}
      className={`px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium hover:from-green-600 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl ${className}`}
    >
      <span className="flex items-center gap-2">
        <span>🐱</span>
        <span>Đăng nhập với Fun Profile</span>
      </span>
    </button>
  );
}

export default LoginButton;
