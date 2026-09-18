/**
 * AdminLayout — wrapper cho AdminShell (sidebar riêng của admin).
 * `AdminShell` đã render `<Outlet />` bên trong.
 *
 * ⚠️ B1 SCOPE: CHƯA gắn vào Routes. Không side effect runtime.
 */
import { AdminShell } from '@/components/admin/shell/AdminShell';

export function AdminLayout() {
  return <AdminShell />;
}

export default AdminLayout;
