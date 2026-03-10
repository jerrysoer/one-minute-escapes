import { useRef, useEffect, useCallback } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { useTimer } from '../hooks/useTimer';
import { lerp, clamp, easeInOutCubic, seededRandom, dist, mapRange, TAU } from '../utils/math';
import { createNoise2D, fbm } from '../utils/noise';

/* ───────── HSL color interpolation ───────── */
function lerpHSL(h1, s1, l1, h2, s2, l2, t) {
  return [lerp(h1, h2, t), lerp(s1, s2, t), lerp(l1, l2, t)];
}

function hsl(h, s, l, a = 1) {
  return a < 1
    ? `hsla(${h}, ${s}%, ${l}%, ${a})`
    : `hsl(${h}, ${s}%, ${l}%)`;
}

/* ───────── Terrain generation ───────── */
function generateTerrain(noise, baseY, amplitude, frequency, points) {
  const profile = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const nx = (i / points) * frequency;
    const val = fbm(noise, nx, baseY, 4, 2.1, 0.5);
    profile[i] = val;
  }
  return profile;
}

/* ───────── Recursive tree drawing ───────── */
function drawTree(ctx, x, y, angle, length, depth, maxDepth, progress, rng) {
  if (depth > maxDepth || length < 2) return;

  const sway = Math.sin(angle * 3 + rng() * 2) * 0.05;
  const endX = x + Math.cos(angle + sway) * length;
  const endY = y + Math.sin(angle + sway) * length;

  // Trunk / branch
  const thickness = Math.max(1, (maxDepth - depth + 1) * 1.2);
  const branchGray = lerp(50, 70, depth / maxDepth);
  ctx.strokeStyle = `hsl(30, 8%, ${branchGray}%)`;
  ctx.lineWidth = thickness;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Leaf clusters at branch tips when spring arrives
  if (depth >= maxDepth - 1 && progress > 0.3) {
    const leafAlpha = clamp(mapRange(progress, 0.3, 0.7, 0, 0.85), 0, 0.85);
    const leafSize = lerp(2, 6, clamp(mapRange(progress, 0.3, 0.8, 0, 1), 0, 1));
    const leafHue = lerp(100, 130, rng());
    const leafSat = lerp(25, 50, progress);
    const leafLight = lerp(28, 45, progress);
    ctx.fillStyle = hsl(leafHue, leafSat, leafLight, leafAlpha);
    ctx.beginPath();
    ctx.arc(endX, endY, leafSize, 0, TAU);
    ctx.fill();
  }

  // Branching
  const branches = depth === 0 ? 3 : 2;
  const spread = lerp(0.4, 0.7, rng());
  for (let i = 0; i < branches; i++) {
    const branchAngle = angle + (i - (branches - 1) / 2) * spread + (rng() - 0.5) * 0.3;
    const branchLength = length * lerp(0.6, 0.75, rng());
    drawTree(ctx, endX, endY, branchAngle, branchLength, depth + 1, maxDepth, progress, rng);
  }
}

/* ───────── Snow / rain particles ───────── */
function createWeatherParticle(w, h, rng, type) {
  return {
    x: rng() * w * 1.2 - w * 0.1,
    y: -rng() * h * 0.3,
    vx: type === 'snow' ? (rng() - 0.5) * 15 : (rng() - 0.5) * 8 - 5,
    vy: type === 'snow' ? 20 + rng() * 30 : 200 + rng() * 150,
    size: type === 'snow' ? 1.5 + rng() * 3 : 1,
    length: type === 'rain' ? 6 + rng() * 8 : 0,
    opacity: 0.2 + rng() * 0.5,
    wobble: rng() * TAU,
    wobbleSpeed: 1 + rng() * 2,
  };
}

/* ───────── Creature (boid) ───────── */
function createCreature(w, h, rng, index, total) {
  const row = index % 5;
  const bandY = h * 0.35 + (row / 5) * h * 0.35;
  return {
    x: -50 - rng() * w * 0.8,
    y: bandY + (rng() - 0.5) * h * 0.08,
    vx: 25 + rng() * 25,
    vy: (rng() - 0.5) * 8,
    targetVx: 30 + rng() * 20,
    targetVy: 0,
    size: 3 + rng() * 3,
    hue: lerp(25, 45, rng()),
    saturation: lerp(55, 80, rng()),
    lightness: lerp(50, 70, rng()),
    legPhase: rng() * TAU,
    active: false,
    startTime: 3 + (index / total) * 40,
  };
}

/* ───────── Bird in V-formation ───────── */
function createBird(rng, cx, cy, index) {
  const side = index % 2 === 0 ? 1 : -1;
  const row = Math.ceil(index / 2);
  return {
    baseX: cx - row * 30 * side,
    baseY: cy - row * 18,
    wingPhase: rng() * TAU,
    wingSpeed: 3 + rng() * 2,
    size: 8 + rng() * 4,
  };
}

/* ═════════════════════════════════════════════ */
export default function Migration({ isVisible, title, subtitle, palette, onTimerUpdate }) {
  const timerRef = useRef(null);
  const { tick, restart, getState } = useTimer();
  timerRef.current = { tick, restart, getState };

  const stateRef = useRef({
    seed: 42,
    initialized: false,
    terrain: [],
    trees: [],
    weather: [],
    creatures: [],
    birds: [],
    noise: null,
    rng: null,
    mouseX: 0.5,
    mouseY: 0.5,
    prevCycle: -1,
    titleOpacity: 1,
  });

  // Mouse tracking
  const handleMouseMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    stateRef.current.mouseX = (e.clientX - rect.left) / rect.width;
    stateRef.current.mouseY = (e.clientY - rect.top) / rect.height;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      stateRef.current.mouseX = (e.touches[0].clientX - rect.left) / rect.width;
      stateRef.current.mouseY = (e.touches[0].clientY - rect.top) / rect.height;
    }
  }, []);

  // Restart timer when becoming visible
  useEffect(() => {
    if (isVisible) {
      restart();
      stateRef.current.initialized = false;
    }
  }, [isVisible, restart]);

  function initScene(w, h, seed) {
    const st = stateRef.current;
    st.seed = seed;
    st.rng = seededRandom(seed);
    st.noise = createNoise2D(seed);
    const rng = st.rng;

    // Generate terrain profiles — one per layer
    const terrainPoints = 200;
    st.terrain = [
      generateTerrain(st.noise, 0.0, 1, 3, terrainPoints),  // layer 1: far mountains
      generateTerrain(st.noise, 5.0, 1, 4, terrainPoints),  // layer 2: mid hills
      generateTerrain(st.noise, 10.0, 1, 5, terrainPoints), // layer 3: near ground
      generateTerrain(st.noise, 15.0, 1, 6, terrainPoints), // layer 4: foreground
    ];

    // Trees on layer 3
    st.trees = [];
    const treeCount = 8 + Math.floor(rng() * 6);
    for (let i = 0; i < treeCount; i++) {
      st.trees.push({
        xFrac: 0.05 + rng() * 0.9,
        depthFrac: rng(),
        trunkHeight: 30 + rng() * 45,
        maxDepth: 3 + Math.floor(rng() * 2),
        seed: Math.floor(rng() * 10000),
      });
    }

    // Weather particles
    st.weather = [];
    const weatherCount = 120;
    for (let i = 0; i < weatherCount; i++) {
      st.weather.push(createWeatherParticle(w, h, rng, 'snow'));
    }

    // Creatures
    const creatureCount = 30;
    st.creatures = [];
    for (let i = 0; i < creatureCount; i++) {
      st.creatures.push(createCreature(w, h, rng, i, creatureCount));
    }

    // Birds (appear later)
    st.birds = [];
    const birdCount = 9;
    for (let i = 0; i < birdCount; i++) {
      st.birds.push(createBird(rng, w * 0.7, h * 0.15, i));
    }

    st.initialized = true;
    st.titleOpacity = 1;
  }

  const canvasRef = useCanvas(
    (ctx, w, h, dt, time) => {
      const state = tick(dt);
      if (onTimerUpdate) onTimerUpdate(state.progress, state.elapsed);
      const st = stateRef.current;
      const { progress, elapsed, cycle, phase, resetProgress } = state;

      // Re-init on first frame or new cycle
      if (!st.initialized || cycle !== st.prevCycle) {
        initScene(w, h, 42 + cycle * 137);
        st.prevCycle = cycle;
      }

      // Season progress: smooth ease so transitions feel organic
      const season = easeInOutCubic(clamp(progress, 0, 1));

      // ─── FULL CLEAR ───
      ctx.clearRect(0, 0, w, h);

      // ═══════════ LAYER 0: SKY ═══════════
      const [skyH, skyS, skyL] = lerpHSL(220, 30, 12, 200, 50, 55, season);
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0, hsl(skyH - 10, skyS - 5, skyL - 8));
      skyGrad.addColorStop(0.5, hsl(skyH, skyS, skyL));
      skyGrad.addColorStop(1, hsl(skyH + 10, skyS + 5, skyL + 12));
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // Sun / moon glow
      const sunAlpha = clamp(mapRange(season, 0.3, 0.8, 0, 0.3), 0, 0.3);
      if (sunAlpha > 0.01) {
        const sunX = lerp(w * 0.8, w * 0.7, season);
        const sunY = lerp(h * 0.15, h * 0.12, season);
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.3);
        sunGrad.addColorStop(0, `hsla(45, 80%, 90%, ${sunAlpha * 1.5})`);
        sunGrad.addColorStop(0.3, `hsla(45, 60%, 80%, ${sunAlpha * 0.6})`);
        sunGrad.addColorStop(1, `hsla(45, 40%, 70%, 0)`);
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 0, w, h);

        // Sun disc
        ctx.fillStyle = `hsla(48, 90%, 92%, ${sunAlpha * 2})`;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 15 + season * 8, 0, TAU);
        ctx.fill();
      }

      // Winter moon (fades out)
      const moonAlpha = clamp(mapRange(season, 0, 0.35, 0.25, 0), 0, 0.25);
      if (moonAlpha > 0.01) {
        const moonX = w * 0.75;
        const moonY = h * 0.12;
        ctx.fillStyle = `hsla(220, 15%, 85%, ${moonAlpha})`;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 12, 0, TAU);
        ctx.fill();
        // Moon glow
        const moonGrad = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 60);
        moonGrad.addColorStop(0, `hsla(220, 15%, 85%, ${moonAlpha * 0.4})`);
        moonGrad.addColorStop(1, `hsla(220, 15%, 85%, 0)`);
        ctx.fillStyle = moonGrad;
        ctx.fillRect(moonX - 60, moonY - 60, 120, 120);
      }

      // ═══════════ TERRAIN HELPERS ═══════════
      const terrainPoints = st.terrain[0].length;

      function getTerrainY(layerIndex, xPixel, baseY, amplitude, parallaxOffset) {
        const profile = st.terrain[layerIndex];
        let xNorm = ((xPixel + parallaxOffset) / w) % 1;
        if (xNorm < 0) xNorm += 1;
        const idx = xNorm * (terrainPoints - 1);
        const i0 = Math.floor(idx);
        const i1 = Math.min(i0 + 1, terrainPoints - 1);
        const frac = idx - i0;
        const val = lerp(profile[i0], profile[i1], frac);
        return baseY + val * amplitude;
      }

      function drawTerrainLayer(layerIndex, baseYFrac, amplitude, parallax, colorWinter, colorSpring, alpha) {
        const [wh, ws, wl] = colorWinter;
        const [sh, ss, sl] = colorSpring;
        const [ch, cs, cl] = lerpHSL(wh, ws, wl, sh, ss, sl, season);
        const baseY = h * baseYFrac;
        const pOffset = (st.mouseX - 0.5) * 40 * parallax;

        ctx.fillStyle = hsl(ch, cs, cl, alpha);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 3) {
          const y = getTerrainY(layerIndex, x, baseY, amplitude, pOffset);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();

        return { baseY, pOffset };
      }

      // ═══════════ LAYER 1: FAR MOUNTAINS ═══════════
      drawTerrainLayer(
        0, 0.42, h * 0.18, 0.1,
        [220, 15, 20], [150, 25, 35], 1
      );
      // Snow caps in winter
      if (season < 0.7) {
        const snowCapAlpha = clamp(mapRange(season, 0.3, 0.7, 0.3, 0), 0, 0.3);
        const pOffset1 = (st.mouseX - 0.5) * 40 * 0.1;
        ctx.fillStyle = `hsla(220, 10%, 90%, ${snowCapAlpha})`;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const y = getTerrainY(0, x, h * 0.42, h * 0.18, pOffset1);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let x = w; x >= 0; x -= 3) {
          const y = getTerrainY(0, x, h * 0.42, h * 0.18, pOffset1) + 8;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }

      // ═══════════ LAYER 2: MID HILLS ═══════════
      drawTerrainLayer(
        1, 0.52, h * 0.15, 0.3,
        [220, 20, 25], [120, 35, 40], 1
      );

      // ═══════════ CREATURES (on layers 2-3) ═══════════
      const windBiasX = (st.mouseX - 0.5) * 15;
      const windBiasY = (st.mouseY - 0.5) * 8;

      for (let i = 0; i < st.creatures.length; i++) {
        const c = st.creatures[i];

        // Activate creatures over time
        if (!c.active && elapsed >= c.startTime) {
          c.active = true;
          c.x = -20 - st.rng() * 40;
        }
        if (!c.active) continue;

        // Simple flocking: steer toward average of nearby creatures + wind
        let avgX = 0, avgY = 0, count = 0;
        let sepX = 0, sepY = 0;
        for (let j = 0; j < st.creatures.length; j++) {
          if (i === j || !st.creatures[j].active) continue;
          const other = st.creatures[j];
          const d = dist(c.x, c.y, other.x, other.y);
          if (d < 80) {
            avgX += other.vx;
            avgY += other.vy;
            count++;
            if (d < 25) {
              sepX += (c.x - other.x) / Math.max(d, 1);
              sepY += (c.y - other.y) / Math.max(d, 1);
            }
          }
        }

        // Get terrain Y for creature's approximate position
        const terrainBaseY = h * 0.52;
        const terrainAmp = h * 0.15;
        const pOff = (st.mouseX - 0.5) * 40 * 0.3;
        const groundY = getTerrainY(1, c.x, terrainBaseY, terrainAmp, pOff) - 10;

        // Target above terrain
        const targetY = groundY - 10 - (i % 5) * (h * 0.06);

        c.targetVx = 30 + season * 15 + windBiasX;
        c.targetVy = (targetY - c.y) * 0.5 + windBiasY;

        if (count > 0) {
          c.targetVx = lerp(c.targetVx, avgX / count, 0.15);
          c.targetVy = lerp(c.targetVy, avgY / count, 0.1);
        }
        c.targetVx += sepX * 3;
        c.targetVy += sepY * 3;

        c.vx = lerp(c.vx, c.targetVx, 0.03);
        c.vy = lerp(c.vy, c.targetVy, 0.05);
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.legPhase += dt * 8;

        // Wrap creatures that go off right edge
        if (c.x > w + 60) {
          c.x = -40;
          c.y = h * 0.35 + st.rng() * h * 0.3;
        }

        // Draw creature — simplified quadruped silhouette
        const cAlpha = clamp(mapRange(c.x, -40, 30, 0, 0.85), 0, 0.85);
        if (cAlpha < 0.01) continue;

        ctx.save();
        ctx.translate(c.x, c.y);
        const bodyLen = c.size * 2.5;
        const bodyH = c.size * 1.2;

        // Body
        ctx.fillStyle = hsl(c.hue, c.saturation, c.lightness, cAlpha);
        ctx.beginPath();
        ctx.ellipse(0, 0, bodyLen, bodyH, 0, 0, TAU);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(bodyLen * 0.8, -bodyH * 0.4, c.size * 0.7, 0, TAU);
        ctx.fill();

        // Legs (animated)
        ctx.strokeStyle = hsl(c.hue, c.saturation, c.lightness - 10, cAlpha);
        ctx.lineWidth = Math.max(1, c.size * 0.3);
        const legSwing = Math.sin(c.legPhase) * 3;
        const legY = bodyH * 0.6;
        const legLen = c.size * 1.5;

        // Front legs
        ctx.beginPath();
        ctx.moveTo(bodyLen * 0.4, legY);
        ctx.lineTo(bodyLen * 0.4 + legSwing, legY + legLen);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bodyLen * 0.2, legY);
        ctx.lineTo(bodyLen * 0.2 - legSwing, legY + legLen);
        ctx.stroke();

        // Back legs
        ctx.beginPath();
        ctx.moveTo(-bodyLen * 0.3, legY);
        ctx.lineTo(-bodyLen * 0.3 - legSwing, legY + legLen);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-bodyLen * 0.5, legY);
        ctx.lineTo(-bodyLen * 0.5 + legSwing, legY + legLen);
        ctx.stroke();

        ctx.restore();
      }

      // ═══════════ LAYER 3: NEAR GROUND + TREES ═══════════
      drawTerrainLayer(
        2, 0.65, h * 0.12, 0.6,
        [220, 20, 25], [110, 35, 38], 1
      );

      // Trees
      for (let i = 0; i < st.trees.length; i++) {
        const tree = st.trees[i];
        const pOff3 = (st.mouseX - 0.5) * 40 * 0.6;
        const treeX = tree.xFrac * w;
        const treeBaseY = getTerrainY(2, treeX, h * 0.65, h * 0.12, pOff3);

        ctx.save();
        const treeRng = seededRandom(tree.seed);
        drawTree(
          ctx,
          treeX + pOff3 * 0.3,
          treeBaseY,
          -Math.PI / 2,
          tree.trunkHeight * (0.6 + season * 0.4),
          0,
          tree.maxDepth,
          season,
          treeRng
        );
        ctx.restore();
      }

      // ═══════════ LAYER 4: FOREGROUND ═══════════
      drawTerrainLayer(
        3, 0.82, h * 0.08, 1.0,
        [0, 0, 85], [100, 40, 45], 1
      );

      // Foreground grass / snow texture
      const fgPOff = (st.mouseX - 0.5) * 40 * 1.0;
      const grassCount = 60;
      for (let i = 0; i < grassCount; i++) {
        const gx = (i / grassCount) * w;
        const gy = getTerrainY(3, gx, h * 0.82, h * 0.08, fgPOff);

        if (season > 0.4) {
          // Grass blades
          const grassAlpha = clamp(mapRange(season, 0.4, 0.7, 0, 0.5), 0, 0.5);
          const bladeHeight = lerp(3, 12, season);
          const sway = Math.sin(time * 2 + gx * 0.1) * 3 * season;
          ctx.strokeStyle = hsl(110, 40, 40, grassAlpha);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.lineTo(gx + sway, gy - bladeHeight);
          ctx.stroke();
        }
      }

      // ═══════════ WEATHER PARTICLES ═══════════
      // Determine weather type based on season
      const isSnow = season < 0.35;
      const isRain = season >= 0.35 && season < 0.65;
      const weatherAlpha = isSnow
        ? clamp(mapRange(season, 0, 0.35, 1, 0.2), 0.2, 1)
        : isRain
          ? clamp(mapRange(season, 0.35, 0.5, 0, 0.6), 0, 0.6)
            * clamp(mapRange(season, 0.55, 0.65, 1, 0), 0, 1)
          : 0;

      if (weatherAlpha > 0.01) {
        for (let i = 0; i < st.weather.length; i++) {
          const p = st.weather[i];

          if (isSnow) {
            // Snow behavior
            p.wobble += p.wobbleSpeed * dt;
            p.x += p.vx * dt + Math.sin(p.wobble) * 0.8 + windBiasX * 0.3;
            p.y += p.vy * dt;

            if (p.y > h + 10 || p.x < -20 || p.x > w + 20) {
              p.x = st.rng() * w * 1.2 - w * 0.1;
              p.y = -st.rng() * 20;
              p.vx = (st.rng() - 0.5) * 15;
            }

            ctx.fillStyle = `hsla(220, 20%, 95%, ${p.opacity * weatherAlpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, TAU);
            ctx.fill();
          } else if (isRain) {
            // Rain behavior
            p.x += (p.vx - 20) * dt + windBiasX * 0.5;
            p.y += (p.vy + 150) * dt;

            if (p.y > h + 10) {
              p.x = st.rng() * w * 1.3 - w * 0.15;
              p.y = -st.rng() * 30;
            }

            ctx.strokeStyle = `hsla(210, 30%, 75%, ${p.opacity * weatherAlpha * 0.5})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - 2, p.y + p.length + 4);
            ctx.stroke();
          }
        }
      }

      // ═══════════ BIRDS (V-formation, spring phase) ═══════════
      if (season > 0.6) {
        const birdAlpha = clamp(mapRange(season, 0.6, 0.75, 0, 0.7), 0, 0.7);
        const flockX = lerp(-w * 0.3, w * 1.3, mapRange(season, 0.6, 1, 0, 1));
        const flockY = h * 0.12 + Math.sin(time * 0.5) * h * 0.03;

        for (let i = 0; i < st.birds.length; i++) {
          const b = st.birds[i];
          const bx = flockX + (b.baseX - w * 0.7);
          const by = flockY + (b.baseY - h * 0.15);
          const wingAngle = Math.sin(time * b.wingSpeed + b.wingPhase) * 0.5;

          ctx.strokeStyle = `hsla(0, 0%, 15%, ${birdAlpha})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          // Left wing
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(
            bx - b.size * 0.5, by - b.size * wingAngle,
            bx - b.size, by + b.size * 0.3 * (1 - wingAngle)
          );
          ctx.stroke();
          // Right wing
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(
            bx + b.size * 0.5, by - b.size * wingAngle,
            bx + b.size, by + b.size * 0.3 * (1 - wingAngle)
          );
          ctx.stroke();
        }
      }

      // ═══════════ ATMOSPHERIC FOG ═══════════
      const fogAlpha = lerp(0.08, 0.02, season);
      const fogGrad = ctx.createLinearGradient(0, h * 0.4, 0, h);
      const [fH, fS, fL] = lerpHSL(220, 20, 20, 200, 15, 60, season);
      fogGrad.addColorStop(0, `hsla(${fH}, ${fS}%, ${fL}%, 0)`);
      fogGrad.addColorStop(0.5, hsl(fH, fS, fL, fogAlpha));
      fogGrad.addColorStop(1, hsl(fH, fS, fL, fogAlpha * 2));
      ctx.fillStyle = fogGrad;
      ctx.fillRect(0, 0, w, h);

      // ═══════════ TITLE OVERLAY (intro phase, first cycle) ═══════════
      if (phase === 'intro') {
        st.titleOpacity = 1;
      } else if (elapsed < 5) {
        st.titleOpacity = clamp(mapRange(elapsed, 2.5, 4.5, 1, 0), 0, 1);
      } else {
        st.titleOpacity = 0;
      }

      if (st.titleOpacity > 0.01) {
        const tAlpha = st.titleOpacity;
        // Dark vignette behind text
        const vigGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
        vigGrad.addColorStop(0, `hsla(220, 30%, 8%, ${tAlpha * 0.6})`);
        vigGrad.addColorStop(1, `hsla(220, 30%, 8%, 0)`);
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Title
        ctx.fillStyle = `hsla(38, 30%, 85%, ${tAlpha * 0.9})`;
        ctx.font = 'italic 300 42px "Cormorant Garamond", serif';
        ctx.letterSpacing = '0.08em';
        ctx.fillText(title || 'Migration', w / 2, h / 2 - 16);

        // Subtitle
        ctx.fillStyle = `hsla(38, 20%, 65%, ${tAlpha * 0.5})`;
        ctx.font = 'italic 300 16px "Cormorant Garamond", serif';
        ctx.letterSpacing = '0.12em';
        ctx.fillText(subtitle || 'winter fades \u00b7 spring arrives', w / 2, h / 2 + 22);
      }

      // ═══════════ RESET CROSSFADE VEIL ═══════════
      if (phase === 'resetting') {
        const veilAlpha = resetProgress < 0.5
          ? easeInOutCubic(resetProgress * 2)
          : easeInOutCubic(1 - (resetProgress - 0.5) * 2);
        ctx.fillStyle = `hsla(220, 30%, 8%, ${veilAlpha * 0.95})`;
        ctx.fillRect(0, 0, w, h);
      }

      // ═══════════ SUBTLE SEASON INDICATOR ═══════════
      const indicatorAlpha = phase === 'intro' ? 0 : 0.15;
      if (indicatorAlpha > 0) {
        const barW = w * 0.12;
        const barH = 2;
        const barX = (w - barW) / 2;
        const barY = h - 28;

        ctx.fillStyle = `hsla(38, 15%, 50%, ${indicatorAlpha * 0.4})`;
        ctx.fillRect(barX, barY, barW, barH);

        const [bH, bS, bL] = lerpHSL(210, 30, 70, 120, 50, 55, season);
        ctx.fillStyle = hsl(bH, bS, bL, indicatorAlpha);
        ctx.fillRect(barX, barY, barW * progress, barH);

        // Season label
        let seasonLabel;
        if (season < 0.25) seasonLabel = 'winter';
        else if (season < 0.5) seasonLabel = 'thaw';
        else if (season < 0.75) seasonLabel = 'spring';
        else seasonLabel = 'bloom';

        ctx.fillStyle = `hsla(38, 15%, 65%, ${indicatorAlpha * 0.6})`;
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(seasonLabel, w / 2, barY + 6);
      }
    },
    isVisible
  );

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    />
  );
}
