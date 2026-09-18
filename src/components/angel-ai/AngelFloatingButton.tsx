import { memo, useState, useRef, useCallback, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { AngelChatWidget } from './AngelChatWidget';

const STORAGE_KEY = 'angel-btn-pos';
const BUTTON_SIZE = 56;
const HIT_SIZE = 72;
const DRAG_THRESHOLD = 4;
const CHAT_Y_THRESHOLD = 180; // clearance for bottom nav + chat input

function getDefaultPosition() {
  return {
    x: window.innerWidth - BUTTON_SIZE - 16,
    y: window.innerHeight - BUTTON_SIZE - CHAT_Y_THRESHOLD,
  };
}

function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const pos = JSON.parse(raw);
      if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
    }
  } catch { /* localStorage parse — safe to ignore, use default position */ }
  return null;
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

interface AngelFloatingButtonProps {
  showOnDesktop?: boolean;
}

export const AngelFloatingButton = memo(({ showOnDesktop = false }: AngelFloatingButtonProps) => {
  const [isChatOpen, setIsChatOpen] = useState(false);
  const isFirstRender = useRef(!localStorage.getItem(STORAGE_KEY));
  const [showHint, setShowHint] = useState(isFirstRender.current);
  const location = useLocation();
  const [position, setPosition] = useState<{ x: number; y: number }>(() => loadPosition() || getDefaultPosition());
  const [isDragging, setIsDragging] = useState(false);
  const suppressClickRef = useRef(false);

  const dragRef = useRef({
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
    moved: false,
    pointerId: null as number | null,
  });

  const isOnChat = location.pathname.startsWith('/chat');

  // Auto-move up when on chat route to avoid blocking send button
  useEffect(() => {
    if (isOnChat) {
      const maxY = window.innerHeight - BUTTON_SIZE - CHAT_Y_THRESHOLD;
      setPosition((prev) => {
        if (prev.y > maxY) {
          const adjusted = { ...prev, y: maxY };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(adjusted));
          return adjusted;
        }
        return prev;
      });
    }
  }, [isOnChat]);

  // Hide hint animation after 3 seconds
  useEffect(() => {
    if (showHint) {
      const timer = setTimeout(() => setShowHint(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showHint]);

  // Recalculate on resize to keep in viewport
  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => ({
        x: clamp(prev.x, 0, window.innerWidth - BUTTON_SIZE),
        y: clamp(prev.y, 0, window.innerHeight - BUTTON_SIZE),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const savePosition = useCallback((next: { x: number; y: number }) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const clampPosition = useCallback((x: number, y: number) => ({
    x: clamp(x, 8, window.innerWidth - BUTTON_SIZE - 8),
    y: clamp(y, 8, window.innerHeight - BUTTON_SIZE - 8),
  }), []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - position.x,
      offsetY: e.clientY - position.y,
      moved: false,
      pointerId: e.pointerId,
    };
  }, [position]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;

    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;

    if (!dragRef.current.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      dragRef.current.moved = true;
      suppressClickRef.current = true;
      setIsDragging(true);
    }

    if (dragRef.current.moved) {
      e.preventDefault();
      setPosition(clampPosition(
        e.clientX - dragRef.current.offsetX,
        e.clientY - dragRef.current.offsetY,
      ));
    }
  }, [clampPosition]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;

    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (dragRef.current.moved) {
      setPosition((prev) => {
        const finalPos = clampPosition(prev.x, prev.y);
        savePosition(finalPos);
        return finalPos;
      });
    } else {
      setIsChatOpen(true);
    }
    dragRef.current.pointerId = null;
    dragRef.current.moved = false;
    setIsDragging(false);
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [clampPosition, savePosition]);

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current.pointerId !== e.pointerId) return;
    dragRef.current.pointerId = null;
    dragRef.current.moved = false;
    setIsDragging(false);
    setPosition((prev) => {
      const finalPos = clampPosition(prev.x, prev.y);
      savePosition(finalPos);
      return finalPos;
    });
  }, [clampPosition, savePosition]);

  return (
    <>
      <div
        className={`fixed z-50 ${showOnDesktop ? '' : 'lg:hidden'}`}
        style={{
          left: position.x,
          top: position.y,
          touchAction: 'none',
          transition: isDragging ? 'none' : 'transform 0.15s ease',
        }}
      >
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onClick={(e) => {
            if (suppressClickRef.current) {
              e.preventDefault();
              return;
            }
            // Desktop click fallback
            if (!('ontouchstart' in window)) setIsChatOpen(true);
          }}
          className={`relative group flex items-center justify-center rounded-full ${showHint ? 'animate-bounce' : ''} ${isDragging ? 'scale-110 cursor-grabbing' : 'cursor-grab'}`}
          style={{ width: HIT_SIZE, height: HIT_SIZE }}
          aria-label="ANGEL AI Chat"
        >
          <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-amber-400/50 to-yellow-500/50 blur-md animate-pulse" />
          <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-amber-400 shadow-lg shadow-amber-500/50 group-hover:border-amber-300 group-hover:scale-105 transition-all duration-300">
            <img src="/angel-ai-logo-36.png" alt="ANGEL AI" className="w-full h-full object-cover" />
          </div>
          <Sparkles className="absolute right-2 top-2 w-4 h-4 text-amber-400 animate-ping opacity-75" />
          <div className="absolute bottom-2 left-2 w-2 h-2 bg-amber-200 rounded-full animate-pulse" />
          <div className="absolute bottom-2 right-2 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full" />
        </button>
      </div>

      <AngelChatWidget isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </>
  );
});

AngelFloatingButton.displayName = 'AngelFloatingButton';
