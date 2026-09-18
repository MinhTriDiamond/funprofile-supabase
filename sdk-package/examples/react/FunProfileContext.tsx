/**
 * Fun Profile React Context
 * 
 * Complete example of integrating SSO SDK with React.
 * Includes Camly loading messages! 🐱
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { 
  FunProfileClient, 
  SessionStorageAdapter,
  FunUser,
  FunProfileError,
  DOMAINS,
} from '@fun-ecosystem/sso-sdk';

// ============================================
// Types
// ============================================

interface FunProfileContextType {
  user: FunUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: Error | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ============================================
// Camly Loading Messages 🐱
// ============================================

const CAMLY_MESSAGES = [
  "Camly đang kiểm tra xem bạn có phải là chủ nhân không... 🐱",
  "Đợi Camly tí nha, đang xác thực nè... ✨",
  "Camly đang nói chuyện với Fun Profile... 🎭",
  "Chờ Camly xíu, đang lấy thông tin bạn... 📋",
  "Camly đang làm phép màu đăng nhập... ✨🐱",
];

const getRandomCamlyMessage = () => {
  return CAMLY_MESSAGES[Math.floor(Math.random() * CAMLY_MESSAGES.length)];
};

// ============================================
// SDK Instance
// ============================================

// Initialize once - adjust for your platform
const funProfile = new FunProfileClient({
  clientId: 'fun_farm_production', // Change this for your app
  redirectUri: `${DOMAINS.funFarm}/auth/callback`,
  scopes: ['profile', 'email', 'wallet', 'rewards'],
  storage: new SessionStorageAdapter('fun_farm_client'),
  autoRefresh: true,
});

// ============================================
// Context
// ============================================

const FunProfileContext = createContext<FunProfileContextType | null>(null);

export function FunProfileProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FunUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [camlyMessage, setCamlyMessage] = useState(getRandomCamlyMessage());

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const isAuth = await funProfile.isAuthenticated();
        if (isAuth) {
          const userData = await funProfile.getUser();
          setUser(userData);
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        setError(err instanceof Error ? err : new Error('Authentication failed'));
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Rotate Camly message while loading
  useEffect(() => {
    if (!isLoading) return;
    
    const interval = setInterval(() => {
      setCamlyMessage(getRandomCamlyMessage());
    }, 2000);

    return () => clearInterval(interval);
  }, [isLoading]);

  const login = useCallback(async () => {
    try {
      setIsLoading(true);
      setCamlyMessage(getRandomCamlyMessage());
      const authUrl = await funProfile.startAuth();
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Login failed'));
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await funProfile.logout();
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const userData = await funProfile.getUser();
      setUser(userData);
    } catch (err) {
      if (err instanceof FunProfileError && err.code === 'invalid_token') {
        setUser(null);
      }
      throw err;
    }
  }, []);

  const value: FunProfileContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
    refreshUser,
  };

  return (
    <FunProfileContext.Provider value={value}>
      {isLoading ? (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
          <div className="animate-bounce text-6xl mb-4">🐱</div>
          <p className="text-lg text-gray-700 animate-pulse">{camlyMessage}</p>
        </div>
      ) : (
        children
      )}
    </FunProfileContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useFunProfile(): FunProfileContextType {
  const context = useContext(FunProfileContext);
  if (!context) {
    throw new Error('useFunProfile must be used within FunProfileProvider');
  }
  return context;
}

// Export SDK instance for direct use
export { funProfile };
