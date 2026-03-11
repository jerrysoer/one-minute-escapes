import { useRef, useEffect, useCallback } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { useTimer } from '../hooks/useTimer';
import { lerp, clamp, seededRandom, dist, TAU, easeInOutCubic } from '../utils/math';
import { applyPixelGlitch } from '../utils/glitch';
import { thump } from '../utils/haptic';

const MAX_ORBS = 16;
const TRAIL_LENGTH = 60;
const G_CONSTANT = 8000;
const SOFTENING = 30;
const MERGE_SPEED_THRESHOLD = 0.3;
const FLASH_DURATION = 0.4;

const ORB_HUES = [340, 200, 40, 280, 160, 20, 300, 100];

function createOrb(rng, w, h, index) {
  const angle = rng() * TAU;
  const radius = 80 + rng() * Math.min(w, h) * 0.25;
  const cx = w / 2, cy = h / 2;
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
    vx: Math.sin(angle) * (40 + rng() * 60),
    vy: -Math.cos(angle) * (40 + rng() * 60),
    mass: 8 + rng() * 12,
    radius: 0, // computed from mass
    hue: ORB_HUES[index % ORB_HUES.length],
    trail: [],
    alive: true,
    flash: 0,
    opacity: 1,
  };
}

function orbRadius(mass) {
  return Math.sqrt(mass) * 2.5;
}

function initOrbs(rng, w, h, count) {
  const orbs = [];
  for (let i = 0; i < count; i++) {
    const orb = createOrb(rng, w, h, i);
    orb.radius = orbRadius(orb.mass);
    orbs.push(orb);
  }
  return orbs;
}

export default function Gravity({ isVisible, title, onTimerUpdate, onCycleChange }) {
  const stateRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const prevCycleRef = useRef(-1);
  const { tick, restart } = useTimer();

  const initState = useCallback((w, h, seed) => {
    const rng = seededRandom(seed);
    const count = 5 + Math.floor(rng() * 3); // 5-7 orbs
    stateRef.current = {
      orbs: initOrbs(rng, w, h, count),
      rng,
      seed,
      flashes: [],
      nextHue: count,
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
    if (!stateRef.current) initState(w, h, Date.now());
  }, [initState]);

  // Click to spawn orb
  const handleClick = useCallback((e) => {
    const state = stateRef.current;
    if (!state) return;
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const aliveCount = state.orbs.filter((o) => o.alive).length;
    if (aliveCount >= MAX_ORBS) return;

    const orb = {
      x: cx,
      y: cy,
      vx: (state.rng() - 0.5) * 80,
      vy: (state.rng() - 0.5) * 80,
      mass: 6 + state.rng() * 8,
      radius: 0,
      hue: ORB_HUES[state.nextHue % ORB_HUES.length],
      trail: [],
      alive: true,
      flash: FLASH_DURATION,
      opacity: 1,
    };
    orb.radius = orbRadius(orb.mass);
    state.orbs.push(orb);
    state.nextHue++;
  }, []);

  const canvasRef = useCanvas(
    (ctx, w, h, dt) => {
      const timer = tick(dt);
      const { progress, phase, cycle, resetProgress, elapsed } = timer;
      if (onTimerUpdate) onTimerUpdate(progress, elapsed);
      if (cycle !== prevCycleRef.current) {
        prevCycleRef.current = cycle;
        if (onCycleChange) onCycleChange(cycle);
      }
      const state = stateRef.current;
      if (!state) return;

      if (phase === 'resetting' && resetProgress < 0.05) {
        initState(w, h, cycle * 6337 + 5);
      }

      // Semi-transparent clear for trails
      ctx.fillStyle = 'rgba(7, 7, 14, 0.08)';
      ctx.fillRect(0, 0, w, h);

      const orbs = state.orbs;
      const alive = orbs.filter((o) => o.alive);

      // N-body gravity
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i], b = alive[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy + SOFTENING * SOFTENING;
          const d = Math.sqrt(distSq);
          const force = G_CONSTANT * a.mass * b.mass / distSq;
          const fx = force * dx / d;
          const fy = force * dy / d;

          a.vx += fx / a.mass * dt;
          a.vy += fy / a.mass * dt;
          b.vx -= fx / b.mass * dt;
          b.vy -= fy / b.mass * dt;
        }
      }

      // Ending phase: orbital decay — pull everything toward center
      if (phase === 'ending') {
        const decayStrength = clamp((elapsed - 50) / 10, 0, 1) * 50;
        for (const orb of alive) {
          const dx = w / 2 - orb.x;
          const dy = h / 2 - orb.y;
          const d = Math.sqrt(dx * dx + dy * dy) + 1;
          orb.vx += (dx / d) * decayStrength * dt;
          orb.vy += (dy / d) * decayStrength * dt;
        }
      }

      // Update positions + trails
      for (const orb of alive) {
        orb.x += orb.vx * dt;
        orb.y += orb.vy * dt;

        // Soft boundary — bounce off edges
        const pad = orb.radius + 20;
        if (orb.x < pad) { orb.x = pad; orb.vx = Math.abs(orb.vx) * 0.6; }
        if (orb.x > w - pad) { orb.x = w - pad; orb.vx = -Math.abs(orb.vx) * 0.6; }
        if (orb.y < pad) { orb.y = pad; orb.vy = Math.abs(orb.vy) * 0.6; }
        if (orb.y > h - pad) { orb.y = h - pad; orb.vy = -Math.abs(orb.vy) * 0.6; }

        // Trail
        orb.trail.push({ x: orb.x, y: orb.y });
        if (orb.trail.length > TRAIL_LENGTH) orb.trail.shift();

        // Flash decay
        if (orb.flash > 0) orb.flash -= dt;
      }

      // Collision merging
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i], b = alive[j];
          if (!a.alive || !b.alive) continue;
          const d = dist(a.x, a.y, b.x, b.y);
          if (d < a.radius + b.radius) {
            // Merge b into a (volume + momentum conserving)
            const totalMass = a.mass + b.mass;
            a.x = (a.x * a.mass + b.x * b.mass) / totalMass;
            a.y = (a.y * a.mass + b.y * b.mass) / totalMass;
            a.vx = (a.vx * a.mass + b.vx * b.mass) / totalMass;
            a.vy = (a.vy * a.mass + b.vy * b.mass) / totalMass;
            a.mass = totalMass;
            a.radius = orbRadius(a.mass);
            a.flash = FLASH_DURATION;
            // Blend hues
            a.hue = (a.hue + b.hue) / 2;
            b.alive = false;
            thump();

            // Flash effect
            state.flashes.push({
              x: a.x, y: a.y,
              radius: a.radius * 3,
              life: FLASH_DURATION,
              hue: a.hue,
            });
          }
        }
      }

      // Update flashes
      for (let i = state.flashes.length - 1; i >= 0; i--) {
        state.flashes[i].life -= dt;
        if (state.flashes[i].life <= 0) state.flashes.splice(i, 1);
      }

      // Draw trails
      for (const orb of alive) {
        if (orb.trail.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(orb.trail[0].x, orb.trail[0].y);
        for (let t = 1; t < orb.trail.length; t++) {
          ctx.lineTo(orb.trail[t].x, orb.trail[t].y);
        }
        ctx.strokeStyle = `hsla(${orb.hue}, 60%, 65%, 0.15)`;
        ctx.lineWidth = orb.radius * 0.3;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Draw orbs
      for (const orb of alive) {
        // Inner glow
        const grad = ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, orb.radius * 2
        );
        grad.addColorStop(0, `hsla(${orb.hue}, 70%, 80%, 0.9)`);
        grad.addColorStop(0.4, `hsla(${orb.hue}, 60%, 65%, 0.6)`);
        grad.addColorStop(0.7, `hsla(${orb.hue}, 50%, 50%, 0.2)`);
        grad.addColorStop(1, `hsla(${orb.hue}, 40%, 40%, 0)`);

        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius * 2, 0, TAU);
        ctx.fillStyle = grad;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius * 0.6, 0, TAU);
        ctx.fillStyle = `hsla(${orb.hue}, 80%, 90%, 0.9)`;
        ctx.fill();
      }

      // Draw merge flashes
      for (const flash of state.flashes) {
        const t = flash.life / FLASH_DURATION;
        ctx.beginPath();
        ctx.arc(flash.x, flash.y, flash.radius * (1 - t * 0.5), 0, TAU);
        ctx.fillStyle = `hsla(${flash.hue}, 70%, 85%, ${t * 0.5})`;
        ctx.fill();
      }

      // Crossfade veil
      if (phase === 'resetting') {
        if (canvasRef.current) applyPixelGlitch(ctx, canvasRef.current, w, h, resetProgress);
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
    canvas.addEventListener('click', handleClick);
    return () => canvas.removeEventListener('click', handleClick);
  }, [canvasRef, handleClick]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}
