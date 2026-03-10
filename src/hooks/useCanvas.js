import { useRef, useEffect, useCallback } from 'react';

/**
 * Canvas setup with DPR handling, ResizeObserver, and rAF loop.
 * The rAF loop is gated by isVisible — off-screen canvases don't tick.
 *
 * @param {Function} draw - Called each frame with (ctx, canvas, dt, time)
 * @param {boolean} isVisible - Whether this escape is currently in viewport
 * @param {Function} onResize - Optional callback when canvas resizes (width, height)
 */
export function useCanvas(draw, isVisible, onResize) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.scale(dpr, dpr);
      if (onResizeRef.current) {
        onResizeRef.current(rect.width, rect.height);
      }
    }

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    resize();

    return () => {
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isVisible) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    lastTimeRef.current = performance.now();

    function loop(now) {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05); // cap at 50ms
      lastTimeRef.current = now;

      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      drawRef.current(ctx, w, h, dt, now / 1000);

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isVisible]);

  return canvasRef;
}
