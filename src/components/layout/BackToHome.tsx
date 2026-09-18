import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getParentRoute } from '@/config/parentRoutes';
import { getPreviousInAppRoute } from './NavigationHistoryTracker';

type BackProps = {
  className?: string;
  /** Override fallback đích nếu logic mặc định không phù hợp. */
  fallback?: string;
  /** Nếu true, không sticky — render inline để luôn nhìn thấy (không bị navbar che). */
  inline?: boolean;
};

function useSmartBack(fallback?: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    const current = location.pathname + location.search;

    // 1. Previous in-app route từ stack (ưu tiên trang gần nhất user đã ghé)
    const prev = getPreviousInAppRoute(current);
    if (prev && prev !== current) {
      navigate(prev);
      return;
    }

    // 2. Parent route theo cấu hình (deep-link / mở tab mới)
    const parent = getParentRoute(location.pathname);
    if (parent && parent !== current) {
      navigate(parent);
      return;
    }

    // 3. Browser history nếu có
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }

    // 4. Fallback
    navigate(fallback ?? '/');
  };
}

/** Nút Quay lại nhỏ — mặc định sticky ở đầu trang con, dùng `inline` để render trong dòng. */
export function BackToHomeBar({ className = '', fallback, inline = false }: BackProps) {
  const goBack = useSmartBack(fallback);
  const wrapperClass = inline
    ? `flex ${className}`
    : `sticky top-2 z-20 -mx-2 px-2 ${className}`;
  return (
    <div className={wrapperClass}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Quay lại"
        onClick={goBack}
        className="backdrop-blur-md bg-background/70 hover:bg-background/90 rounded-full"
      >
        <ArrowLeft className="w-4 h-4" />
      </Button>
    </div>
  );
}

/** Nút lớn gradient cuối trang con — Quay lại trang trước (icon-only). */
export function BackToHomeCTA({ className = '', fallback }: BackProps) {
  const goBack = useSmartBack(fallback);
  return (
    <div className={`pt-4 flex justify-center ${className}`}>
      <Button
        size="icon"
        aria-label="Quay lại"
        onClick={goBack}
        className="rounded-full h-14 w-14 bg-gradient-to-r from-emerald-500/90 via-amber-400/90 to-emerald-500/90 backdrop-blur-md text-white shadow-[0_8px_28px_-8px_hsl(45_95%_55%/0.5)] hover:shadow-[0_8px_36px_-4px_hsl(152_70%_45%/0.6)] transition-all duration-300 hover:scale-105"
      >
        <ArrowLeft className="w-6 h-6" />
      </Button>
    </div>
  );
}

/** Alias mới cho code mới viết. */
export const BackButton = BackToHomeBar;
