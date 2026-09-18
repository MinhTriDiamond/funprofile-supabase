import { useRef, useEffect, useState, memo } from 'react';

interface AutoScaleTextProps {
  children: React.ReactNode;
  className?: string;
  minFontSize?: number; // minimum font size in px
  maxFontSize?: number; // maximum font size in px
}

/**
 * Auto-scaling text component that shrinks font size to fit container
 * Uses a simple approach: measures text and scales down if it overflows
 */
export const AutoScaleText = memo(({ 
  children, 
  className = '', 
  minFontSize = 8,
  maxFontSize = 14 
}: AutoScaleTextProps) => {
  const containerRef = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Reset to max size first
    setFontSize(maxFontSize);

    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      if (!container) return;
      
      const parent = container.parentElement;
      if (!parent) return;

      // Get available width (parent width minus padding)
      const parentStyle = getComputedStyle(parent);
      const paddingLeft = parseFloat(parentStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(parentStyle.paddingRight) || 0;
      const availableWidth = parent.clientWidth - paddingLeft - paddingRight;

      // Binary search for the right font size
      let currentSize = maxFontSize;
      
      while (currentSize > minFontSize && container.scrollWidth > availableWidth) {
        currentSize -= 1;
        setFontSize(currentSize);
      }
    });
  }, [children, minFontSize, maxFontSize]);

  return (
    <span 
      ref={containerRef}
      className={`whitespace-nowrap overflow-hidden text-ellipsis block ${className}`}
      style={{ fontSize: `${fontSize}px` }}
    >
      {children}
    </span>
  );
});

AutoScaleText.displayName = 'AutoScaleText';
