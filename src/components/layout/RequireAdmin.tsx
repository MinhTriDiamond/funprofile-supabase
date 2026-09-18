/**
 * RequireAdmin — layout guard yêu cầu quyền admin.
 * Dùng hook hiện có `useAdminRole()` (đã cache 10 phút). KHÔNG tạo logic mới.
 *
 * ⚠️ B1 SCOPE: CHƯA gắn vào Routes. Không side effect runtime.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminRole } from '@/hooks/useAdminRole';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function RequireAdmin() {
  const { isAuthenticated, isLoading: authLoading } = useCurrentUser();
  const { isAdmin, isLoading: roleLoading } = useAdminRole();

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <Outlet />;
}

export default RequireAdmin;
