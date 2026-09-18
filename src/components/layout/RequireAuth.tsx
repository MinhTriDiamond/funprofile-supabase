/**
 * RequireAuth — layout guard yêu cầu user đăng nhập.
 * Chưa auth → redirect `/auth` kèm `state.from` để post-login quay lại.
 *
 * Dùng hook hiện có `useCurrentUser()`. KHÔNG tạo auth logic mới.
 *
 * ⚠️ B1 SCOPE: CHƯA gắn vào Routes. Không side effect runtime.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function RequireAuth() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const from = location.pathname + location.search;
    return <Navigate to="/auth" replace state={{ from }} />;
  }

  return <Outlet />;
}

export default RequireAuth;
