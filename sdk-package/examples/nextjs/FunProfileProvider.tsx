/**
 * Fun Profile Provider for Next.js
 * 
 * SSR-compatible provider with client-side only authentication.
 * 
 * @example app/layout.tsx
 * ```tsx
 * import { FunProfileProvider } from '@/lib/FunProfileProvider';
 * 
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <FunProfileProvider>
 *           {children}
 *         </FunProfileProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */

'use client';

import React, { 
  createContext, 
  useContext, 
  useState, 
  useEffect, 
  useCallback,
  ReactNode 
} from 'react';

// Only import on client side
let funProfileClient: any = null;

if (typeof window !== 'undefined') {
  const { 
    FunProfileClient, 
    SessionStorageAdapter,
    DOMAINS 
  } = require('@fun-ecosystem/sso-sdk');
  
  funProfileClient = new FunProfileClient({
    clientId: process.env.NEXT_PUBLIC_FUN_CLIENT_ID || 'fun_farm_production',
    redirectUri: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    scopes: ['profile', 'email', 'wallet', 'rewards'],
    storage: new SessionStorageAdapter('fun_nextjs_client'),
    autoRefresh: true,
  });
}

// ============================================
// Types
// ============================================

interface FunUser {
  id: string;
  funId: string;
  username: string;
  fullName?: string;
  avatarUrl?: string;
  email?: string;
  walletAddress?: string;
}

interface FunProfileContextType {
  user: FunUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

// ============================================
// Context
// ============================================

const FunProfileContext = createContext<FunProfileContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
});

// ============================================
// Provider
// ============================================

export function FunProfileProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<FunUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Only run on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Check auth on mount (client only)
  useEffect(() => {
    if (!mounted || !funProfileClient) return;

    const checkAuth = async () => {
      try {
        const isAuth = await funProfileClient.isAuthenticated();
        if (isAuth) {
          const userData = await funProfileClient.getUser();
          setUser(userData);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [mounted]);

  const login = useCallback(async () => {
    if (!funProfileClient) return;
    
    const authUrl = await funProfileClient.startAuth();
    window.location.href = authUrl;
  }, []);

  const logout = useCallback(async () => {
    if (!funProfileClient) return;
    
    await funProfileClient.logout();
    setUser(null);
  }, []);

  // SSR: Show loading state
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <FunProfileContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </FunProfileContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useFunProfile() {
  return useContext(FunProfileContext);
}

// Export client for direct use
export { funProfileClient };
