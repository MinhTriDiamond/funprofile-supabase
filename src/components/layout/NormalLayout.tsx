/**
 * NormalLayout — layout tiêu chuẩn cho phần lớn page (Feed, Wallet, Profile,
 * Identity, Settings, Pet, ...).
 *
 * ⚠️ B1 SCOPE: Component này CHƯA được import vào `App.tsx`. Không side effect
 * runtime cho tới B3.
 *
 * Nguyên tắc: Layout KHÔNG biết business — chỉ render Navbar + Outlet + BottomNav.
 */
import { Outlet } from 'react-router-dom';
import { FacebookNavbar } from './FacebookNavbar';
import { MobileBottomNav } from './MobileBottomNav';

export function NormalLayout() {
  return (
    <div className="min-h-screen overflow-hidden">
      <FacebookNavbar />
      <main data-app-scroll className="app-main app-pb-nav">
        <Outlet />
      </main>
      <MobileBottomNav />
    </div>
  );
}

export default NormalLayout;
