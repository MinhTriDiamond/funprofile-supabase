import { createPortal } from 'react-dom';

/**
 * Floating "RICH" text animation overlay for celebration cards.
 * Uses createPortal to render directly into document.body,
 * bypassing any stacking context from Dialog portals.
 */
const RICH_COLORS = [
  '#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#00FFFF',
  '#0000FF', '#8B00FF', '#FF1493', '#FFD700',
];

const RICH_POSITIONS = [
  { left: '3%', top: '8%', delay: '0s', size: 'text-3xl' },
  { left: '78%', top: '3%', delay: '0.5s', size: 'text-4xl' },
  { left: '88%', top: '35%', delay: '1s', size: 'text-2xl' },
  { left: '8%', top: '55%', delay: '1.5s', size: 'text-5xl' },
  { left: '72%', top: '70%', delay: '0.3s', size: 'text-3xl' },
  { left: '35%', top: '88%', delay: '0.8s', size: 'text-2xl' },
  { left: '18%', top: '30%', delay: '1.2s', size: 'text-4xl' },
  { left: '62%', top: '20%', delay: '0.6s', size: 'text-5xl' },
  { left: '48%', top: '50%', delay: '1.8s', size: 'text-3xl' },
  { left: '50%', top: '5%', delay: '0.55s', size: 'text-5xl' },
];

export const RichTextOverlay = () =>
  createPortal(
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-[9999]">
      {RICH_POSITIONS.map((pos, i) => (
        <span
          key={i}
          className={`absolute font-black ${pos.size} animate-rich-float select-none`}
          style={{
            left: pos.left,
            top: pos.top,
            animationDelay: pos.delay,
            color: RICH_COLORS[i % RICH_COLORS.length],
            textShadow: `0 0 20px ${RICH_COLORS[i % RICH_COLORS.length]}DD, 0 0 40px ${RICH_COLORS[i % RICH_COLORS.length]}AA, 0 0 60px ${RICH_COLORS[i % RICH_COLORS.length]}80, 0 0 80px ${RICH_COLORS[i % RICH_COLORS.length]}60, 0 0 100px ${RICH_COLORS[i % RICH_COLORS.length]}40, 0 0 120px ${RICH_COLORS[i % RICH_COLORS.length]}30, 0 2px 4px rgba(0,0,0,0.8)`,
            WebkitTextStroke: '1px rgba(0,0,0,0.4)',
            filter: 'brightness(1.4)',
          }}
        >
          RICH
        </span>
      ))}
    </div>,
    document.body,
  );
