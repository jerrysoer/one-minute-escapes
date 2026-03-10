import { useRef, useEffect, useCallback } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { useTimer } from '../hooks/useTimer';
import { lerp, clamp, easeInOutCubic, seededRandom, TAU } from '../utils/math';

// ── Constants ────────────────────────────────────────────────────────
const NUM_BOIDS = 420;
const CELL_SIZE = 80;
const MAX_SPEED = 160;
const MIN_SPEED = 40;
const MAX_FORCE = 280;

// Flocking radii
const SEP_RADIUS = 28;
const ALI_RADIUS = 60;
const COH_RADIUS = 60;

// Flocking weights
const SEP_WEIGHT = 1.8;
const ALI_WEIGHT = 1.0;
const COH_WEIGHT = 1.0;

// Cursor
const CURSOR_RADIUS = 200;
const CURSOR_FORCE = 60;

// Phases
const INTRO_END = 2.5;

// ── Spatial hash helpers ─────────────────────────────────────────────
function cellKey(cx, cy) {
  return cy * 10000 + cx;
}

function buildGrid(posX, posY, count) {
  const grid = new Map();
  for (let i = 0; i < count; i++) {
    const cx = (posX[i] / CELL_SIZE) | 0;
    const cy = (posY[i] / CELL_SIZE) | 0;
    const key = cellKey(cx, cy);
    let bucket = grid.get(key);
    if (!bucket) {
      bucket = [];
      grid.set(key, bucket);
    }
    bucket.push(i);
  }
  return grid;
}

function getNeighborIndices(grid, px, py, radius) {
  const result = [];
  const cr = Math.ceil(radius / CELL_SIZE);
  const cx0 = (px / CELL_SIZE) | 0;
  const cy0 = (py / CELL_SIZE) | 0;
  for (let dy = -cr; dy <= cr; dy++) {
    for (let dx = -cr; dx <= cr; dx++) {
      const bucket = grid.get(cellKey(cx0 + dx, cy0 + dy));
      if (bucket) {
        for (let k = 0; k < bucket.length; k++) {
          result.push(bucket[k]);
        }
      }
    }
  }
  return result;
}

// ── Boid simulation state ────────────────────────────────────────────
function createBoids() {
  return {
    posX: new Float32Array(NUM_BOIDS),
    posY: new Float32Array(NUM_BOIDS),
    velX: new Float32Array(NUM_BOIDS),
    velY: new Float32Array(NUM_BOIDS),
    // Scratch arrays for force accumulation
    forceX: new Float32Array(NUM_BOIDS),
    forceY: new Float32Array(NUM_BOIDS),
  };
}

function initBoids(boids, w, h, rng) {
  const cx = w / 2;
  const cy = h / 2;
  const spread = Math.min(w, h) * 0.3;

  for (let i = 0; i < NUM_BOIDS; i++) {
    // Spawn in a loose cluster near center
    const angle = rng() * TAU;
    const r = rng() * spread;
    boids.posX[i] = cx + Math.cos(angle) * r;
    boids.posY[i] = cy + Math.sin(angle) * r;

    // Random initial velocity
    const va = rng() * TAU;
    const vs = MIN_SPEED + rng() * (MAX_SPEED - MIN_SPEED) * 0.5;
    boids.velX[i] = Math.cos(va) * vs;
    boids.velY[i] = Math.sin(va) * vs;
  }
}

// ── Component ────────────────────────────────────────────────────────
export default function Murmuration({ isVisible, title, subtitle, palette, onTimerUpdate }) {
  const boidsRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
  const canvasElRef = useRef(null);
  const firstCycleRef = useRef(true);
  const lastCycleRef = useRef(-1);

  const { tick, restart } = useTimer();

  // Restart timer when escape becomes visible
  useEffect(() => {
    if (isVisible) {
      restart();
      firstCycleRef.current = true;
      lastCycleRef.current = -1;
    }
  }, [isVisible, restart]);

  // Mouse / touch tracking — attach listeners once canvas element is available
  const attachListeners = useCallback((canvas) => {
    if (!canvas) return;

    function updateMouse(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = clientX - rect.left;
      mouseRef.current.y = clientY - rect.top;
      mouseRef.current.active = true;
    }

    function onMouseMove(e) {
      updateMouse(e.clientX, e.clientY);
    }
    function onTouchMove(e) {
      if (e.touches.length > 0) {
        updateMouse(e.touches[0].clientX, e.touches[0].clientY);
      }
    }
    function onMouseLeave() {
      mouseRef.current.active = false;
    }

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('touchmove', onTouchMove, { passive: true });
    canvas.addEventListener('mouseleave', onMouseLeave);

    // Store cleanup for ref callback
    canvas._murmCleanup = () => {
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, []);

  // ── Draw function ──────────────────────────────────────────────────
  const draw = useCallback((ctx, w, h, dt) => {
    const state = tick(dt);
    const { phase, elapsed, cycle, resetProgress } = state;
    if (onTimerUpdate) onTimerUpdate(state.progress, elapsed);

    // Lazy-init boids
    if (!boidsRef.current) {
      boidsRef.current = createBoids();
      const rng = seededRandom(cycle * 7919 + 1);
      initBoids(boidsRef.current, w, h, rng);
    }

    const boids = boidsRef.current;

    // Re-init on new cycle
    if (cycle !== lastCycleRef.current && phase !== 'resetting') {
      lastCycleRef.current = cycle;
      if (cycle > 0) {
        firstCycleRef.current = false;
        const rng = seededRandom(cycle * 7919 + 1);
        initBoids(boids, w, h, rng);
      }
    }

    // ── Motion trail (semi-transparent clear) ──────────────────────
    ctx.fillStyle = 'rgba(7, 7, 14, 0.15)';
    ctx.fillRect(0, 0, w, h);

    // Skip simulation during resetting phase (just draw veil)
    if (phase === 'resetting') {
      // Crossfade veil: fade to black then back
      const veilAlpha = resetProgress < 0.5
        ? easeInOutCubic(resetProgress * 2)
        : easeInOutCubic(1 - (resetProgress - 0.5) * 2);
      ctx.fillStyle = `rgba(7, 7, 14, ${veilAlpha})`;
      ctx.fillRect(0, 0, w, h);
      return;
    }

    // ── Compute flocking forces ──────────────────────────────────
    const grid = buildGrid(boids.posX, boids.posY, NUM_BOIDS);

    // Phase-dependent weight modifiers
    let sepW = SEP_WEIGHT;
    let aliW = ALI_WEIGHT;
    let cohW = COH_WEIGHT;
    let speedMult = 1.0;

    if (phase === 'intro') {
      // Gradually ramp up cohesion during intro
      const introT = clamp(elapsed / INTRO_END, 0, 1);
      cohW *= lerp(0.2, 1.0, easeInOutCubic(introT));
      aliW *= lerp(0.3, 1.0, easeInOutCubic(introT));
    } else if (phase === 'ending') {
      // Dispersal: weaken cohesion and alignment, boost separation
      const endingT = clamp((elapsed - 50) / 10, 0, 1);
      const easedEnd = easeInOutCubic(endingT);
      cohW *= lerp(1.0, 0.0, easedEnd);
      aliW *= lerp(1.0, 0.2, easedEnd);
      sepW *= lerp(1.0, 3.0, easedEnd);
      speedMult = lerp(1.0, 1.5, easedEnd);
    }

    // Zero force accumulators
    boids.forceX.fill(0);
    boids.forceY.fill(0);

    const maxRadius = Math.max(SEP_RADIUS, ALI_RADIUS, COH_RADIUS);

    for (let i = 0; i < NUM_BOIDS; i++) {
      const px = boids.posX[i];
      const py = boids.posY[i];

      const neighbors = getNeighborIndices(grid, px, py, maxRadius);

      // Accumulators
      let sepDx = 0, sepDy = 0, sepCount = 0;
      let aliVx = 0, aliVy = 0, aliCount = 0;
      let cohCx = 0, cohCy = 0, cohCount = 0;

      for (let k = 0; k < neighbors.length; k++) {
        const j = neighbors[k];
        if (j === i) continue;

        const dx = px - boids.posX[j];
        const dy = py - boids.posY[j];
        const dSq = dx * dx + dy * dy;

        // Separation
        if (dSq > 0 && dSq < SEP_RADIUS * SEP_RADIUS) {
          const d = Math.sqrt(dSq);
          const invD = 1 / d;
          sepDx += dx * invD / d; // weight by inverse distance
          sepDy += dy * invD / d;
          sepCount++;
        }

        // Alignment
        if (dSq < ALI_RADIUS * ALI_RADIUS) {
          aliVx += boids.velX[j];
          aliVy += boids.velY[j];
          aliCount++;
        }

        // Cohesion
        if (dSq < COH_RADIUS * COH_RADIUS) {
          cohCx += boids.posX[j];
          cohCy += boids.posY[j];
          cohCount++;
        }
      }

      // Apply separation
      if (sepCount > 0) {
        boids.forceX[i] += sepDx * sepW * MAX_FORCE;
        boids.forceY[i] += sepDy * sepW * MAX_FORCE;
      }

      // Apply alignment (steer toward average velocity)
      if (aliCount > 0) {
        const avgVx = aliVx / aliCount;
        const avgVy = aliVy / aliCount;
        boids.forceX[i] += (avgVx - boids.velX[i]) * aliW * 3;
        boids.forceY[i] += (avgVy - boids.velY[i]) * aliW * 3;
      }

      // Apply cohesion (steer toward average position)
      if (cohCount > 0) {
        const avgX = cohCx / cohCount;
        const avgY = cohCy / cohCount;
        const toCohX = avgX - px;
        const toCohY = avgY - py;
        boids.forceX[i] += toCohX * cohW * 1.5;
        boids.forceY[i] += toCohY * cohW * 1.5;
      }

      // Cursor attraction
      if (mouseRef.current.active) {
        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;
        const cdx = mx - px;
        const cdy = my - py;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cdist < CURSOR_RADIUS && cdist > 1) {
          const strength = (1 - cdist / CURSOR_RADIUS);
          boids.forceX[i] += (cdx / cdist) * CURSOR_FORCE * strength * strength;
          boids.forceY[i] += (cdy / cdist) * CURSOR_FORCE * strength * strength;
        }
      }

      // Soft boundary steering — push boids away from edges
      const margin = 80;
      const edgeForce = 120;
      if (px < margin) boids.forceX[i] += (margin - px) / margin * edgeForce;
      if (px > w - margin) boids.forceX[i] -= (px - (w - margin)) / margin * edgeForce;
      if (py < margin) boids.forceY[i] += (margin - py) / margin * edgeForce;
      if (py > h - margin) boids.forceY[i] -= (py - (h - margin)) / margin * edgeForce;
    }

    // ── Integrate velocities and positions ───────────────────────
    const currentMaxSpeed = MAX_SPEED * speedMult;
    const currentMinSpeed = MIN_SPEED;

    for (let i = 0; i < NUM_BOIDS; i++) {
      // Apply forces
      boids.velX[i] += boids.forceX[i] * dt;
      boids.velY[i] += boids.forceY[i] * dt;

      // Clamp speed
      const speed = Math.sqrt(boids.velX[i] * boids.velX[i] + boids.velY[i] * boids.velY[i]);
      if (speed > currentMaxSpeed) {
        boids.velX[i] = (boids.velX[i] / speed) * currentMaxSpeed;
        boids.velY[i] = (boids.velY[i] / speed) * currentMaxSpeed;
      } else if (speed < currentMinSpeed && speed > 0.01) {
        boids.velX[i] = (boids.velX[i] / speed) * currentMinSpeed;
        boids.velY[i] = (boids.velY[i] / speed) * currentMinSpeed;
      }

      // Update position
      boids.posX[i] += boids.velX[i] * dt;
      boids.posY[i] += boids.velY[i] * dt;

      // Wrap around edges (with padding so they don't pop)
      const pad = 20;
      if (boids.posX[i] < -pad) boids.posX[i] += w + pad * 2;
      if (boids.posX[i] > w + pad) boids.posX[i] -= w + pad * 2;
      if (boids.posY[i] < -pad) boids.posY[i] += h + pad * 2;
      if (boids.posY[i] > h + pad) boids.posY[i] -= h + pad * 2;
    }

    // ── Render boids ─────────────────────────────────────────────
    for (let i = 0; i < NUM_BOIDS; i++) {
      const px = boids.posX[i];
      const py = boids.posY[i];
      const vx = boids.velX[i];
      const vy = boids.velY[i];
      const speed = Math.sqrt(vx * vx + vy * vy);

      // Speed-based brightness: faster boids glow brighter
      const speedT = clamp(speed / MAX_SPEED, 0, 1);
      const lightness = lerp(75, 95, speedT);
      const alpha = lerp(0.4, 0.85, speedT);

      // Glow dot
      ctx.beginPath();
      ctx.arc(px, py, lerp(1.0, 1.8, speedT), 0, TAU);
      ctx.fillStyle = `hsla(38, 30%, ${lightness}%, ${alpha})`;
      ctx.fill();

      // Oriented triangle (pointing in velocity direction)
      if (speed > 0.5) {
        const size = 3;
        const nx = vx / speed;
        const ny = vy / speed;

        // Triangle vertices: tip, and two base corners
        const tipX = px + nx * size;
        const tipY = py + ny * size;
        const baseX1 = px - nx * size * 0.5 + ny * size * 0.4;
        const baseY1 = py - ny * size * 0.5 - nx * size * 0.4;
        const baseX2 = px - nx * size * 0.5 - ny * size * 0.4;
        const baseY2 = py - ny * size * 0.5 + nx * size * 0.4;

        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(baseX1, baseY1);
        ctx.lineTo(baseX2, baseY2);
        ctx.closePath();
        ctx.fillStyle = `hsla(38, 30%, ${lightness - 5}%, ${alpha * 0.7})`;
        ctx.fill();
      }
    }

    // ── Title overlay (first cycle, intro phase only) ────────────
    if (firstCycleRef.current && phase === 'intro') {
      // Fade in over first 0.8s, hold, fade out over last 0.6s
      let titleAlpha = 1;
      if (elapsed < 0.8) {
        titleAlpha = easeInOutCubic(elapsed / 0.8);
      } else if (elapsed > INTRO_END - 0.6) {
        titleAlpha = easeInOutCubic((INTRO_END - elapsed) / 0.6);
      }
      titleAlpha = clamp(titleAlpha, 0, 1);

      // Title
      ctx.save();
      ctx.globalAlpha = titleAlpha * 0.9;
      ctx.fillStyle = 'hsla(38, 30%, 85%, 1)';
      ctx.font = 'italic 300 42px "Cormorant Garamond", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = '0.08em';
      ctx.fillText(title || 'Murmuration', w / 2, h / 2 - 14);

      // Subtitle
      ctx.globalAlpha = titleAlpha * 0.5;
      ctx.fillStyle = 'hsla(38, 20%, 65%, 1)';
      ctx.font = 'italic 300 16px "Cormorant Garamond", serif';
      ctx.letterSpacing = '0.04em';
      ctx.fillText(subtitle || '', w / 2, h / 2 + 24);
      ctx.restore();
    }
  }, [tick, title, subtitle]);

  const canvasRef = useCanvas(draw, isVisible);

  return (
    <canvas
      ref={(el) => {
        canvasRef.current = el;
        // Clean up old listeners if element changed
        if (canvasElRef.current && canvasElRef.current !== el && canvasElRef.current._murmCleanup) {
          canvasElRef.current._murmCleanup();
        }
        canvasElRef.current = el;
        if (el && !el._murmCleanup) {
          attachListeners(el);
        }
      }}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    />
  );
}
