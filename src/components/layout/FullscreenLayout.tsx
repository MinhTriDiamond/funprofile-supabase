/**
 * FullscreenLayout — layout không Navbar, không BottomNav.
 * Dành cho Reels, Live Host, Live Setup, RTMP.
 *
 * ⚠️ B1 SCOPE: Component CHƯA gắn vào Routes. Không side effect runtime.
 */
import { Outlet } from 'react-router-dom';

export function FullscreenLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Outlet />
    </div>
  );
}

export default FullscreenLayout;
