import { Component, Suspense, useMemo, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { lazyNamedWithChunkRecovery } from '@/lib/appUpdateRecovery';
import { isWeb3Rescued } from '@/lib/rescueMode';

const Web3Provider = lazyNamedWithChunkRecovery(
  () => import('./Web3Provider'),
  'Web3Provider',
);

interface ConditionalWeb3ProviderProps {
  children: React.ReactNode;
}

interface Web3BoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface Web3BoundaryState {
  hasError: boolean;
}

class Web3Boundary extends Component<Web3BoundaryProps, Web3BoundaryState> {
  state: Web3BoundaryState = { hasError: false };

  static getDerivedStateFromError(): Web3BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('[ConditionalWeb3Provider] Web3 provider unavailable; rendering without Web3.', error, errorInfo);
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const WEB3_ROUTE_PREFIXES = [
  '/wallet',
  '/donations',
  '/benefactors',
  '/identity',
  '/admin',
  '/founder',
];

// Các route auth/guest tuyệt đối KHÔNG mount Web3 — tránh wagmi/RainbowKit/WalletConnect
// khởi tạo và gây CORS storm tới eth.merkle.io + làm nặng /auth khi user chưa đăng nhập.
const AUTH_ONLY_ROUTES = new Set([
  '/auth',
  '/auth/callback',
  '/set-password',
  '/reset-password',
  '/verify-email',
]);

function needsWeb3(pathname: string): boolean {
  if (AUTH_ONLY_ROUTES.has(pathname) || pathname.startsWith('/auth/')) return false;
  return WEB3_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const ConditionalWeb3Provider = ({ children }: ConditionalWeb3ProviderProps) => {
  const location = useLocation();
  const requiresWeb3 = useMemo(() => {
    // Rescue mode: user chọn "Vào trang chủ không dùng ví" → cấm mọi route
    // mount Web3 trong phiên này, kể cả /wallet (nếu lỡ điều hướng vào).
    if (isWeb3Rescued()) return false;
    return needsWeb3(location.pathname);
  }, [location.pathname]);

  if (!requiresWeb3) {
    return <>{children}</>;
  }

  return (
    <Web3Boundary fallback={<>{children}</>}>
      <Suspense fallback={<>{children}</>}>
        <Web3Provider>{children}</Web3Provider>
      </Suspense>
    </Web3Boundary>
  );
};
