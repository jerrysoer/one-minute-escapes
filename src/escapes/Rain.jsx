import { useRef, useEffect, useCallback } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { useTimer } from '../hooks/useTimer';
import { lerp, clamp, seededRandom, dist, TAU } from '../utils/math';

const MAX_DROPS = 200;
const TRAIL_LENGTH = 12;
const MERGE_DIST = 8;
const GRAVITY = 120;
const SURFACE_TENSION = 0.92;

function initDrops(rng, w, h) {
  const drops = [];
  for (let i = 0; i < MAX_DROPS; i++) {
    drops.push(createDrop(rng, w, h));
  }
  return drops;
}

function createDrop(rng, w, h) {
  const radius = 1.5 + rng() * 3;
  return {
    x: rng() * w,
    y: rng() * h * 0.3, // spawn in upper third
    vx: (rng() - 0.5) * 0.3,
    vy: 0.2 + rng() * 0.5,
    radius,
    mass: radius * radius,
    wobble: rng() * TAU,
    wobbleSpeed: 0.5 + rng() * 1.5,
    trail: [],
    opacity: 0.3 + rng() * 0.4,
    stuck: true, // starts stuck to glass
    stuckTimer: rng() * 8 + 2, // seconds before starting to slide
    merged: false,
  };
}

export default function Rain({ isVisible, title, subtitle, onTimerUpdate }) {
  const stateRef = useRef(null);
  const mouseRef = useRef({ x: -1, y: -1 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const { tick, restart } = useTimer();

  const initState = useCallback((w, h, seed) => {
    const rng = seededRandom(seed);
    stateRef.current = {
      drops: initDrops(rng, w, h),
      rng,
      seed,
    };
  }, []);

  useEffect(() => {
    if (isVisible) {
      restart();
      const { w, h } = sizeRef.current;
      if (w > 0) initState(w, h, Date.now());
    }
  }, [isVisible, restart, initState]);

  const handleResize = useCallback((w, h) => {
    sizeRef.current = { w, h };
    if (!stateRef.current) {
      initState(w, h, Date.now());
    }
  }, [initState]);

  const canvasRef = useCanvas(
    (ctx, w, h, dt) => {
      const timer = tick(dt);
      const { progress, phase, cycle, resetProgress } = timer;
      if (onTimerUpdate) onTimerUpdate(progress, timer.elapsed);
      const state = stateRef.current;
      if (!state) return;

      // Reinit on cycle reset
      if (phase === 'resetting' && resetProgress < 0.05) {
        initState(w, h, cycle * 7919 + 1);
      }

      // Background: gray → gold over 60s
      const bgHue = lerp(220, 38, progress);
      const bgSat = lerp(5, 40, progress);
      const bgLight = lerp(15, 25, progress);
      ctx.fillStyle = `hsl(${bgHue}, ${bgSat}%, ${bgLight}%)`;
      ctx.fillRect(0, 0, w, h);

      // Subtle glass texture
      ctx.fillStyle = `hsla(220, 5%, 50%, 0.02)`;
      for (let i = 0; i < 20; i++) {
        const gx = ((i * 137.5) % w);
        const gy = ((i * 83.7) % h);
        ctx.fillRect(gx, gy, 1, h * 0.3);
      }

      const drops = state.drops;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Update drops
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (d.merged) continue;

        // Stuck timer
        if (d.stuck) {
          d.stuckTimer -= dt;
          if (d.stuckTimer <= 0) {
            d.stuck = false;
          }
          // Slight wobble while stuck
          d.wobble += d.wobbleSpeed * dt;
          d.x += Math.sin(d.wobble) * 0.05;
          continue;
        }

        // Gravity + surface tension
        d.vy += GRAVITY * dt * (d.mass * 0.15);
        d.vy *= SURFACE_TENSION;

        // Wobble drift
        d.wobble += d.wobbleSpeed * dt;
        d.vx += Math.sin(d.wobble) * 0.2 * dt;
        d.vx *= 0.98;

        // Cursor bias
        if (mx >= 0 && my >= 0) {
          const cdist = dist(d.x, d.y, mx, my);
          if (cdist < 150) {
            d.x += (mx - d.x) * 0.001;
          }
        }

        d.x += d.vx;
        d.y += d.vy;

        // Trail
        d.trail.push({ x: d.x, y: d.y });
        if (d.trail.length > TRAIL_LENGTH) d.trail.shift();

        // Wrap/reset drops that fall off screen
        if (d.y > h + 20) {
          Object.assign(d, createDrop(state.rng, w, h));
          d.y = -10;
          d.stuck = false;
          d.stuckTimer = 0;
        }
      }

      // Merge nearby drops
      for (let i = 0; i < drops.length; i++) {
        if (drops[i].merged) continue;
        for (let j = i + 1; j < drops.length; j++) {
          if (drops[j].merged) continue;
          const a = drops[i], b = drops[j];
          const d2 = dist(a.x, a.y, b.x, b.y);
          if (d2 < (a.radius + b.radius) * 0.8) {
            // Volume-conserving merge
            const totalMass = a.mass + b.mass;
            a.x = (a.x * a.mass + b.x * b.mass) / totalMass;
            a.y = (a.y * a.mass + b.y * b.mass) / totalMass;
            a.radius = Math.sqrt(a.radius * a.radius + b.radius * b.radius);
            a.mass = a.radius * a.radius;
            a.vx = (a.vx * a.mass + b.vx * b.mass) / totalMass;
            a.vy = (a.vy * a.mass + b.vy * b.mass) / totalMass;
            a.opacity = Math.min(0.8, a.opacity + 0.05);
            a.stuck = false;
            b.merged = true;
          }
        }
      }

      // Replace merged drops with new ones
      for (let i = 0; i < drops.length; i++) {
        if (drops[i].merged) {
          drops[i] = createDrop(state.rng, w, h);
          // Reduce new drop spawn rate as cycle progresses
          if (progress > 0.75) {
            drops[i].y = -100; // delay appearance
            drops[i].stuckTimer = 5 + state.rng() * 10;
          }
        }
      }

      // Draw drops
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        if (d.merged || d.y < -20) continue;

        // Trail (rivulet)
        if (d.trail.length > 2 && !d.stuck) {
          ctx.beginPath();
          ctx.moveTo(d.trail[0].x, d.trail[0].y);
          for (let t = 1; t < d.trail.length; t++) {
            ctx.lineTo(d.trail[t].x, d.trail[t].y);
          }
          ctx.strokeStyle = `hsla(210, 15%, 80%, ${d.opacity * 0.15})`;
          ctx.lineWidth = d.radius * 0.4;
          ctx.stroke();
        }

        // Drop body — radial gradient for glass refraction
        const grad = ctx.createRadialGradient(
          d.x - d.radius * 0.3, d.y - d.radius * 0.3, 0,
          d.x, d.y, d.radius * 1.5
        );

        const warmth = progress;
        const specHue = lerp(210, 40, warmth);
        const specSat = lerp(15, 30, warmth);

        grad.addColorStop(0, `hsla(${specHue}, ${specSat}%, 95%, ${d.opacity * 0.6})`);
        grad.addColorStop(0.4, `hsla(${specHue}, ${specSat - 5}%, 80%, ${d.opacity * 0.3})`);
        grad.addColorStop(1, `hsla(${specHue}, ${specSat - 10}%, 60%, 0)`);

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius * 1.5, 0, TAU);
        ctx.fillStyle = grad;
        ctx.fill();

        // Specular highlight
        ctx.beginPath();
        ctx.arc(d.x - d.radius * 0.25, d.y - d.radius * 0.25, d.radius * 0.35, 0, TAU);
        ctx.fillStyle = `hsla(0, 0%, 100%, ${d.opacity * 0.5})`;
        ctx.fill();
      }

      // Title overlay (first cycle, intro phase)
      if (timer.cycle === 0 && phase === 'intro') {
        const titleAlpha = clamp(1 - (timer.elapsed - 1.5), 0, 1);
        if (titleAlpha > 0) {
          ctx.save();
          ctx.globalAlpha = titleAlpha;
          ctx.fillStyle = 'hsla(38, 30%, 85%, 0.9)';
          ctx.font = 'italic 300 42px "Cormorant Garamond", serif';
          ctx.textAlign = 'center';
          ctx.fillText(title, w / 2, h / 2 - 20);

          ctx.fillStyle = 'hsla(38, 20%, 65%, 0.5)';
          ctx.font = 'italic 300 16px "Cormorant Garamond", serif';
          ctx.fillText(subtitle, w / 2, h / 2 + 20);
          ctx.restore();
        }
      }

      // Crossfade veil during reset
      if (phase === 'resetting') {
        const veilAlpha = resetProgress < 0.5
          ? resetProgress * 2
          : 2 - resetProgress * 2;
        ctx.fillStyle = `rgba(7, 7, 14, ${veilAlpha * 0.9})`;
        ctx.fillRect(0, 0, w, h);
      }
    },
    isVisible,
    handleResize
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouse = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const handleTouch = (e) => {
      if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        mouseRef.current = {
          x: e.touches[0].clientX - rect.left,
          y: e.touches[0].clientY - rect.top,
        };
      }
    };
    const handleLeave = () => {
      mouseRef.current = { x: -1, y: -1 };
    };

    canvas.addEventListener('mousemove', handleMouse);
    canvas.addEventListener('touchmove', handleTouch, { passive: true });
    canvas.addEventListener('mouseleave', handleLeave);

    return () => {
      canvas.removeEventListener('mousemove', handleMouse);
      canvas.removeEventListener('touchmove', handleTouch);
      canvas.removeEventListener('mouseleave', handleLeave);
    };
  }, [canvasRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}
