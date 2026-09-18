import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LiveMessage } from '../../hooks/useLiveMessages';

interface LiveChatOverlayProps {
  messages: LiveMessage[];
  maxVisible?: number;
}

/**
 * Overlay chat dạng Facebook/TikTok Live: 4-5 dòng cuối nổi bên dưới-trái video,
 * fade-in mềm, không che quá nhiều khung hình.
 */
export function LiveChatOverlay({ messages, maxVisible = 5 }: LiveChatOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const visible = messages.slice(-maxVisible);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  if (visible.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="pointer-events-none flex flex-col gap-1.5 overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to bottom, transparent, black 30%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 30%)',
      }}
    >
      <AnimatePresence initial={false}>
        {visible.map((msg) => {
          const name = msg.profile?.username || 'Khách';
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="self-start max-w-[85%] rounded-2xl bg-black/45 backdrop-blur-sm px-3 py-1.5 text-white text-sm shadow"
            >
              <span className="font-semibold text-white/90 mr-1.5">{name}</span>
              <span className="text-white/95 break-words">{msg.content}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
