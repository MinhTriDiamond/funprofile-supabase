/**
 * PublicOnlyLayout — layout cho các trang chỉ dành cho khách (auth flow).
 * Nếu user đã đăng nhập, redirect về `/`.
 *
 * ⚠️ B1 SCOPE: CHƯA gắn vào Routes. Không side effect runtime.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function PublicOnlyLayout() {
  const { isAuthenticated, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export default PublicOnlyLayout;
