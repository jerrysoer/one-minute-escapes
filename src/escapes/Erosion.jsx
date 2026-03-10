import { useRef, useEffect, useCallback } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { useTimer } from '../hooks/useTimer';
import { lerp, clamp, seededRandom, mapRange } from '../utils/math';
import { createNoise2D, fbm } from '../utils/noise';

// ---------- constants ----------
const GRID = 256;
const PARTICLE_COUNT = 500;
const LIGHT_DIR = { x: -0.4, y: -0.6, z: 0.66 }; // normalized below
const AMBIENT = 0.22;

// Normalize light direction
const lLen = Math.sqrt(LIGHT_DIR.x ** 2 + LIGHT_DIR.y ** 2 + LIGHT_DIR.z ** 2);
LIGHT_DIR.x /= lLen;
LIGHT_DIR.y /= lLen;
LIGHT_DIR.z /= lLen;

// ---------- terrain color LUT (sandstone -> terracotta -> deep shadow) ----------
function buildColorLUT() {
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    // Low = deep eroded (dark terracotta), High = sandstone ridge (warm light)
    const h = lerp(15, 30, t);
    const s = lerp(40, 52, t);
    const l = lerp(22, 68, t);
    const [r, g, b] = hslToRgb(h, s, l);
    lut[i * 4] = r;
    lut[i * 4 + 1] = g;
    lut[i * 4 + 2] = b;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

function hslToRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

const COLOR_LUT = buildColorLUT();

// ---------- terrain generation ----------
function generateTerrain(seed) {
  const noise = createNoise2D(seed);
  const noise2 = createNoise2D(seed + 7919);
  const heightmap = new Float32Array(GRID * GRID);
  const hardness = new Float32Array(GRID * GRID);

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const nx = x / GRID;
      const ny = y / GRID;

      // Layered terrain: large ridges + medium detail + fine grit
      let h = fbm(noise, nx * 3, ny * 3, 3, 2.2, 0.5);
      // Add a broad mesa shape
      const cx = (nx - 0.5) * 2;
      const cy = (ny - 0.5) * 2;
      const mesa = 1 - Math.sqrt(cx * cx + cy * cy) * 0.6;
      h = h * 0.7 + clamp(mesa, 0, 1) * 0.3;

      heightmap[y * GRID + x] = clamp(h * 0.5 + 0.5, 0, 1);

      // Hardness: separate noise layer
      const hrd = fbm(noise2, nx * 5, ny * 5, 2, 2, 0.5);
      hardness[y * GRID + x] = clamp(hrd * 0.5 + 0.5, 0.15, 0.95);
    }
  }

  return { heightmap, hardness };
}

// ---------- wind particle ----------
function spawnParticle(rng, windAngle) {
  // Spawn from upwind edge
  const side = (rng() * 4) | 0;
  let x, y;
  switch (side) {
    case 0: x = rng() * GRID; y = 0; break;
    case 1: x = GRID - 1; y = rng() * GRID; break;
    case 2: x = rng() * GRID; y = GRID - 1; break;
    default: x = 0; y = rng() * GRID; break;
  }
  const speed = 0.6 + rng() * 1.0;
  const spread = (rng() - 0.5) * 0.6;
  return {
    x,
    y,
    vx: Math.cos(windAngle + spread) * speed,
    vy: Math.sin(windAngle + spread) * speed,
    sediment: 0,
    life: 0,
    maxLife: 150 + (rng() * 200) | 0,
  };
}

// ---------- main component ----------
export default function Erosion({ isVisible, title, subtitle, palette, onTimerUpdate }) {
  const { tick, restart } = useTimer();
  const stateRef = useRef(null);

  // Persistent state across frames (not React state to avoid re-renders)
  const simRef = useRef(null);

  // Track mouse/touch for wind direction
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });
  const firstCycleShownRef = useRef(false);

  // Initialize simulation
  const initSim = useCallback((seed) => {
    const rng = seededRandom(seed);
    const { heightmap, hardness } = generateTerrain(seed);

    // Offscreen canvas for terrain rendering
    const offscreen = document.createElement('canvas');
    offscreen.width = GRID;
    offscreen.height = GRID;
    const offCtx = offscreen.getContext('2d');
    const imageData = offCtx.createImageData(GRID, GRID);

    // Particles
    const windAngle = rng() * Math.PI * 2;
    const particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(spawnParticle(rng, windAngle));
    }

    return {
      heightmap,
      hardness,
      offscreen,
      offCtx,
      imageData,
      particles,
      rng,
      windAngle,
      seed,
      totalErosion: 0,
    };
  }, []);

  // Restart timer & rebuild terrain when becoming visible
  useEffect(() => {
    if (isVisible) {
      restart();
      firstCycleShownRef.current = false;
      simRef.current = initSim(Date.now());
    }
  }, [isVisible, restart, initSim]);

  // Pointer tracking
  useEffect(() => {
    if (!isVisible) return;

    const handleMove = (ex, ey) => {
      pointerRef.current.x = ex / window.innerWidth;
      pointerRef.current.y = ey / window.innerHeight;
      pointerRef.current.active = true;
    };

    const onMouse = (e) => handleMove(e.clientX, e.clientY);
    const onTouch = (e) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onLeave = () => { pointerRef.current.active = false; };

    window.addEventListener('mousemove', onMouse);
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('mouseleave', onLeave);

    return () => {
      window.removeEventListener('mousemove', onMouse);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('mouseleave', onLeave);
    };
  }, [isVisible]);

  // Main draw function
  const draw = useCallback((ctx, w, h, dt) => {
    const state = tick(dt);
    if (onTimerUpdate) onTimerUpdate(state.progress, state.elapsed);
    const sim = simRef.current;
    if (!sim) return;

    // ---- Handle resetting: rebuild terrain ----
    if (state.phase === 'resetting') {
      // Draw existing terrain
      renderTerrain(sim);
      ctx.fillStyle = '#07070E';
      ctx.fillRect(0, 0, w, h);

      // Draw terrain scaled
      const scale = Math.min(w, h);
      const ox = (w - scale) / 2;
      const oy = (h - scale) / 2;
      ctx.drawImage(sim.offscreen, ox, oy, scale, scale);

      // Black veil crossfade
      const veilAlpha = state.resetProgress < 0.5
        ? state.resetProgress * 2
        : 2 - state.resetProgress * 2;
      ctx.fillStyle = `rgba(7, 7, 14, ${clamp(veilAlpha, 0, 1)})`;
      ctx.fillRect(0, 0, w, h);

      // Rebuild at midpoint
      if (state.resetProgress > 0.48 && state.resetProgress < 0.55) {
        simRef.current = initSim(Date.now() + state.cycle * 9973);
      }
      return;
    }

    // ---- Determine wind direction from pointer ----
    const ptr = pointerRef.current;
    let targetAngle = sim.windAngle;
    if (ptr.active) {
      // Wind blows from center toward pointer
      const dx = ptr.x - 0.5;
      const dy = ptr.y - 0.5;
      if (Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02) {
        targetAngle = Math.atan2(dy, dx);
      }
    }
    // Smooth wind direction transition
    let angleDiff = targetAngle - sim.windAngle;
    // Wrap to [-PI, PI]
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    sim.windAngle += angleDiff * 0.03;

    // ---- Erosion rate scaling by phase ----
    let erosionScale = 1.0;
    let windScale = 1.0;
    if (state.phase === 'intro') {
      // Gentle wind ramp-up during intro
      const introT = clamp(state.elapsed / 2.5, 0, 1);
      erosionScale = introT * 0.3;
      windScale = 0.3 + introT * 0.7;
    } else if (state.phase === 'ending') {
      // Accelerated erosion in the ending phase
      const endT = clamp((state.elapsed - 50) / 10, 0, 1);
      erosionScale = 1.5 + endT * 3.0;
      windScale = 1.0 + endT * 0.5;
    }

    // ---- Simulate wind particles ----
    const { heightmap, hardness, particles, rng } = sim;
    const windCos = Math.cos(sim.windAngle);
    const windSin = Math.sin(sim.windAngle);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.life++;

      // Out of bounds or expired -> respawn
      if (p.x < 0 || p.x >= GRID - 1 || p.y < 0 || p.y >= GRID - 1 || p.life > p.maxLife) {
        particles[i] = spawnParticle(rng, sim.windAngle);
        continue;
      }

      const ix = p.x | 0;
      const iy = p.y | 0;
      const idx = iy * GRID + ix;

      // Terrain height at particle position
      const hHere = heightmap[idx];

      // Compute gradient (slope) for deflection
      const hRight = ix < GRID - 1 ? heightmap[idx + 1] : hHere;
      const hDown = iy < GRID - 1 ? heightmap[idx + GRID] : hHere;
      const gradX = (hRight - hHere) * GRID * 0.15;
      const gradY = (hDown - hHere) * GRID * 0.15;

      // Wind force + slope deflection
      const windForce = 0.08 * windScale;
      p.vx += (windCos * windForce - gradX * 0.04) * dt * 60;
      p.vy += (windSin * windForce - gradY * 0.04) * dt * 60;

      // Damping
      p.vx *= 0.96;
      p.vy *= 0.96;

      // Move
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;

      // Bounds check after move
      if (p.x < 0 || p.x >= GRID - 1 || p.y < 0 || p.y >= GRID - 1) continue;

      const newIdx = (p.y | 0) * GRID + (p.x | 0);
      const hNew = heightmap[newIdx];
      const hard = hardness[newIdx];

      // Speed
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);

      // Erosion: proportional to velocity^2 * (1 - hardness)
      const erosionAmount = speed * speed * (1 - hard) * 0.0008 * erosionScale * dt * 60;

      if (erosionAmount > 0 && hNew > 0.05) {
        const eroded = Math.min(erosionAmount, hNew - 0.05);
        heightmap[newIdx] -= eroded;
        p.sediment += eroded;
        sim.totalErosion += eroded;
      }

      // Deposition: when particle slows or has lots of sediment
      if (p.sediment > 0) {
        const depositRate = 0.15 * dt * 60;
        // Deposit more when slow, in low areas
        const depositAmount = p.sediment * depositRate * (1 - clamp(speed * 0.8, 0, 0.9));
        if (depositAmount > 0.00001) {
          heightmap[newIdx] += depositAmount * 0.3; // Only partial deposit to maintain erosion look
          p.sediment -= depositAmount;
        }
      }
    }

    // ---- Render terrain to offscreen canvas ----
    renderTerrain(sim);

    // ---- Draw to display canvas ----
    ctx.fillStyle = '#07070E';
    ctx.fillRect(0, 0, w, h);

    // Center terrain, maintaining square aspect
    const scale = Math.min(w, h);
    const ox = (w - scale) / 2;
    const oy = (h - scale) / 2;

    // Smooth upscale
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sim.offscreen, ox, oy, scale, scale);

    // Subtle vignette
    const vGrad = ctx.createRadialGradient(w / 2, h / 2, scale * 0.25, w / 2, h / 2, scale * 0.7);
    vGrad.addColorStop(0, 'rgba(7, 7, 14, 0)');
    vGrad.addColorStop(1, 'rgba(7, 7, 14, 0.6)');
    ctx.fillStyle = vGrad;
    ctx.fillRect(0, 0, w, h);

    // Wind particles visualization: subtle streaks
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < particles.length; i += 3) {
      const p = particles[i];
      if (p.x < 0 || p.x >= GRID || p.y < 0 || p.y >= GRID) continue;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed < 0.2) continue;

      const px = ox + (p.x / GRID) * scale;
      const py = oy + (p.y / GRID) * scale;
      const len = speed * 3;

      ctx.strokeStyle = p.sediment > 0.001
        ? 'hsla(28, 50%, 70%, 0.4)'
        : 'hsla(38, 20%, 80%, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - (p.vx / speed) * len, py - (p.vy / speed) * len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---- Title overlay (first cycle, intro phase only) ----
    if (state.phase === 'intro' && !firstCycleShownRef.current) {
      const introT = clamp(state.elapsed / 2.5, 0, 1);
      // Fade in then out
      let titleAlpha;
      if (introT < 0.3) {
        titleAlpha = introT / 0.3;
      } else if (introT < 0.7) {
        titleAlpha = 1;
      } else {
        titleAlpha = 1 - (introT - 0.7) / 0.3;
      }
      titleAlpha = clamp(titleAlpha, 0, 1);

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Title
      ctx.fillStyle = `hsla(38, 30%, 85%, ${titleAlpha * 0.9})`;
      ctx.font = 'italic 300 42px "Cormorant Garamond", serif';
      ctx.letterSpacing = '0.08em';
      ctx.fillText(title || 'Erosion', w / 2, h / 2 - 16);

      // Subtitle
      ctx.fillStyle = `hsla(28, 25%, 65%, ${titleAlpha * 0.5})`;
      ctx.font = 'italic 300 16px "Cormorant Garamond", serif';
      ctx.letterSpacing = '0.06em';
      ctx.fillText(subtitle || 'guide the wind \u00b7 carve the stone', w / 2, h / 2 + 24);

      ctx.restore();
    }

    // Mark first cycle title as shown once we leave intro
    if (state.phase !== 'intro' && state.cycle === 0) {
      firstCycleShownRef.current = true;
    }
  }, [tick, title, subtitle, initSim]);

  const canvasRef = useCanvas(draw, isVisible);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}

// ---------- render terrain with normal-based shading ----------
function renderTerrain(sim) {
  const { heightmap, imageData } = sim;
  const data = imageData.data;

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = y * GRID + x;
      const h = heightmap[idx];

      // ---- compute surface normal from height gradient ----
      const hL = x > 0 ? heightmap[idx - 1] : h;
      const hR = x < GRID - 1 ? heightmap[idx + 1] : h;
      const hU = y > 0 ? heightmap[idx - GRID] : h;
      const hD = y < GRID - 1 ? heightmap[idx + GRID] : h;

      // Tangent vectors
      // dh/dx and dh/dy, scaled for visual depth
      const dzdx = (hR - hL) * 4.0;
      const dzdy = (hD - hU) * 4.0;

      // Normal = (-dzdx, -dzdy, 1) normalized
      const nx = -dzdx;
      const ny = -dzdy;
      const nz = 1.0;
      const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const nnx = nx / nLen;
      const nny = ny / nLen;
      const nnz = nz / nLen;

      // ---- directional light (diffuse) ----
      const diffuse = clamp(nnx * LIGHT_DIR.x + nny * LIGHT_DIR.y + nnz * LIGHT_DIR.z, 0, 1);

      // ---- specular highlight (Blinn-Phong) ----
      // Half vector between light and view (view = 0, 0, 1)
      const hx = LIGHT_DIR.x;
      const hy = LIGHT_DIR.y;
      const hz = LIGHT_DIR.z + 1;
      const hLen = Math.sqrt(hx * hx + hy * hy + hz * hz);
      const nhDot = clamp((nnx * hx + nny * hy + nnz * hz) / hLen, 0, 1);
      const specular = Math.pow(nhDot, 32) * 0.25;

      // ---- combine lighting ----
      const lighting = AMBIENT + diffuse * 0.7 + specular;

      // ---- color from height LUT ----
      const lutIdx = clamp((h * 255) | 0, 0, 255) * 4;
      const baseR = COLOR_LUT[lutIdx];
      const baseG = COLOR_LUT[lutIdx + 1];
      const baseB = COLOR_LUT[lutIdx + 2];

      // Apply lighting
      const pixelIdx = idx * 4;
      data[pixelIdx] = clamp((baseR * lighting) | 0, 0, 255);
      data[pixelIdx + 1] = clamp((baseG * lighting) | 0, 0, 255);
      data[pixelIdx + 2] = clamp((baseB * lighting) | 0, 0, 255);
      data[pixelIdx + 3] = 255;
    }
  }

  sim.offCtx.putImageData(imageData, 0, 0);
}
