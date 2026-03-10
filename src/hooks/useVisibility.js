import { useRef, useState, useEffect } from 'react';

/**
 * IntersectionObserver wrapper. Returns [ref, isVisible].
 * threshold 0.5 = element must be 50% in viewport to be "visible".
 */
export function useVisibility(threshold = 0.5) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, isVisible];
}
