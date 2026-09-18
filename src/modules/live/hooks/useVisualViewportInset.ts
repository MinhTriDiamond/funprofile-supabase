import { useEffect, useState } from 'react';

/**
 * Trả về số pixel keyboard đang chiếm dưới đáy viewport (iOS Safari/Android Chrome).
 * Dùng để đẩy CTA/composer lên trên keyboard.
 */
export function useVisualViewportInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const update = () => {
      const diff = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(diff > 40 ? diff : 0);
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
