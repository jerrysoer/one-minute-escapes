import { useRef, useEffect } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { useTimer } from '../hooks/useTimer';

export default function Placeholder({ isVisible, title }) {
  const timerRef = useRef(null);
  const { tick, restart, getState } = useTimer();
  timerRef.current = { tick, restart, getState };

  // Restart timer when becoming visible
  useEffect(() => {
    if (isVisible) {
      restart();
    }
  }, [isVisible, restart]);

  const canvasRef = useCanvas(
    (ctx, w, h, dt) => {
      const state = tick(dt);

      ctx.fillStyle = '#07070E';
      ctx.fillRect(0, 0, w, h);

      // Title
      ctx.fillStyle = 'hsla(38, 30%, 85%, 0.9)';
      ctx.font = 'italic 300 42px "Cormorant Garamond", serif';
      ctx.textAlign = 'center';
      ctx.letterSpacing = '0.08em';
      ctx.fillText(title || 'Escape', w / 2, h / 2 - 20);

      // Timer
      ctx.fillStyle = 'hsla(38, 15%, 55%, 0.3)';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText(
        `${Math.floor(state.elapsed)}s · ${state.phase} · cycle ${state.cycle}`,
        w / 2,
        h / 2 + 60
      );

      // Progress bar
      ctx.fillStyle = 'hsla(38, 15%, 50%, 0.12)';
      ctx.fillRect(w * 0.3, h / 2 + 80, w * 0.4, 2);
      ctx.fillStyle = 'hsla(38, 30%, 75%, 0.5)';
      ctx.fillRect(w * 0.3, h / 2 + 80, w * 0.4 * state.progress, 2);
    },
    isVisible
  );

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}
