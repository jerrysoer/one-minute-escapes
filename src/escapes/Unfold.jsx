import { useRef, useEffect, useCallback, useState } from 'react';
import {
  Scene, OrthographicCamera, WebGLRenderer,
  MeshPhongMaterial, DirectionalLight, AmbientLight, Mesh,
  EdgesGeometry, LineSegments, LineBasicMaterial, DoubleSide,
  IcosahedronGeometry,
} from 'three';
import { useTimer } from '../hooks/useTimer';
import { lerp, clamp, easeInOutCubic, TAU } from '../utils/math';

// ──────────────────────────────────────────────────────
// Platonic solid vertex definitions
// Each returns an array of [x, y, z] on the unit sphere.
// ──────────────────────────────────────────────────────

const PHI = (1 + Math.sqrt(5)) / 2;

function normalize(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / len, v[1] / len, v[2] / len];
}

function sphereVerts(raw) {
  return raw.map(normalize);
}

const SHAPE_GENERATORS = [
  // Tetrahedron — 4 vertices
  () => sphereVerts([
    [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1],
  ]),
  // Octahedron — 6 vertices
  () => sphereVerts([
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ]),
  // Cube — 8 vertices
  () => {
    const v = [];
    for (let x = -1; x <= 1; x += 2)
      for (let y = -1; y <= 1; y += 2)
        for (let z = -1; z <= 1; z += 2)
          v.push([x, y, z]);
    return sphereVerts(v);
  },
  // Icosahedron — 12 vertices
  () => sphereVerts([
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
  ]),
  // Dodecahedron — 20 vertices
  () => {
    const invPhi = 1 / PHI;
    const v = [];
    for (let x = -1; x <= 1; x += 2)
      for (let y = -1; y <= 1; y += 2)
        for (let z = -1; z <= 1; z += 2)
          v.push([x, y, z]);
    for (let s1 = -1; s1 <= 1; s1 += 2)
      for (let s2 = -1; s2 <= 1; s2 += 2) {
        v.push([0, s1 * invPhi, s2 * PHI]);
        v.push([s1 * invPhi, s2 * PHI, 0]);
        v.push([s1 * PHI, 0, s2 * invPhi]);
      }
    return sphereVerts(v);
  },
];

/**
 * Expand a vertex set to `count` vertices by cycling through
 * originals with deterministic angular offsets. This lets every
 * platonic solid map to the same mesh vertex count so we can
 * interpolate positions directly.
 */
function padToCount(verts, count) {
  if (verts.length >= count) return verts.slice(0, count);
  const out = [...verts];
  let i = 0;
  while (out.length < count) {
    const base = verts[i % verts.length];
    // Deterministic small offset so duplicated points pull toward
    // slightly different directions — gives the collapsed shape
    // a subtle organic bloom rather than z-fighting planes.
    const k = out.length;
    const jx = 0.04 * Math.sin(k * 2.39996322);
    const jy = 0.04 * Math.cos(k * 3.14159265);
    const jz = 0.04 * Math.sin(k * 1.61803399);
    out.push(normalize([base[0] + jx, base[1] + jy, base[2] + jz]));
    i++;
  }
  return out;
}

// ──────────────────────────────────────────────────────
// Timing
// ──────────────────────────────────────────────────────

const MORPH_DURATION = 13;   // seconds per shape-to-shape transition
const MORPH_PAUSE   = 2;     // seconds holding completed shape
const SHAPE_RADIUS  = 2.2;   // world-unit scale factor

// ──────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────

export default function Unfold({ isVisible, title, subtitle, palette, onTimerUpdate }) {
  const containerRef = useRef(null);
  const threeRef     = useRef(null);
  const rafRef       = useRef(null);
  const prevTimeRef  = useRef(0);
  const mouseRef     = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const { tick, restart } = useTimer();
  const timerRef = useRef({ tick, restart });
  timerRef.current = { tick, restart };

  const [showTitle, setShowTitle] = useState(true);

  // ── Mouse / touch tracking ──────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      mouseRef.current.tx = (e.clientX / window.innerWidth)  * 2 - 1;
      mouseRef.current.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onTouch = (e) => {
      if (e.touches.length) {
        const t = e.touches[0];
        mouseRef.current.tx = (t.clientX / window.innerWidth)  * 2 - 1;
        mouseRef.current.ty = (t.clientY / window.innerHeight) * 2 - 1;
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onTouch, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onTouch);
    };
  }, []);

  // ── Three.js bootstrap ──────────────────────────────

  const buildShapeTargets = useCallback((vertexCount, icoPositions) => {
    // Generate each platonic solid's vertex set, padded to vertexCount
    const raw = SHAPE_GENERATORS.map((fn) => padToCount(fn(), vertexCount));

    // For every mesh vertex, find the nearest shape vertex (by angular
    // proximity to the original icosahedron direction) and store the
    // target position. This keeps the mapping stable across morphs.
    return raw.map((shapeVerts) => {
      const targets = new Float32Array(vertexCount * 3);
      for (let i = 0; i < vertexCount; i++) {
        const i3 = i * 3;
        const mx = icoPositions[i3];
        const my = icoPositions[i3 + 1];
        const mz = icoPositions[i3 + 2];
        const mLen = Math.sqrt(mx * mx + my * my + mz * mz);
        const dx = mx / mLen;
        const dy = my / mLen;
        const dz = mz / mLen;

        let bestDot = -2;
        let bestJ = 0;
        for (let j = 0; j < shapeVerts.length; j++) {
          const dot = dx * shapeVerts[j][0] + dy * shapeVerts[j][1] + dz * shapeVerts[j][2];
          if (dot > bestDot) { bestDot = dot; bestJ = j; }
        }

        targets[i3]     = shapeVerts[bestJ][0] * SHAPE_RADIUS;
        targets[i3 + 1] = shapeVerts[bestJ][1] * SHAPE_RADIUS;
        targets[i3 + 2] = shapeVerts[bestJ][2] * SHAPE_RADIUS;
      }
      return targets;
    });
  }, []);

  const initThree = useCallback(() => {
    const el = containerRef.current;
    if (!el || threeRef.current) return;

    const rect = el.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const aspect = w / h;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // --- Scene ---
    const scene = new Scene();

    // --- Camera (orthographic) ---
    const frust = 5;
    const camera = new OrthographicCamera(
      -frust * aspect / 2, frust * aspect / 2,
       frust / 2,         -frust / 2,
       0.1, 100,
    );
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);

    // --- Renderer ---
    const renderer = new WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x07070E, 1);
    el.insertBefore(renderer.domElement, el.firstChild); // before title overlay

    // --- Lights ---
    const ambient = new AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    const keyLight = new DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(3, 5, 7);
    scene.add(keyLight);

    const fillLight = new DirectionalLight(0xC8B8A8, 0.3);
    fillLight.position.set(-4, -2, 3);
    scene.add(fillLight);

    // --- Geometry (icosahedron detail=2) ---
    const geo = new IcosahedronGeometry(SHAPE_RADIUS, 2);
    const posAttr = geo.getAttribute('position');
    const vertexCount = posAttr.count;
    const icoPositions = new Float32Array(posAttr.array); // snapshot

    // --- Material ---
    const mat = new MeshPhongMaterial({
      color: 0xF5EDE0,
      side: DoubleSide,
      flatShading: true,
      shininess: 20,
      specular: 0x222222,
    });
    const mesh = new Mesh(geo, mat);
    scene.add(mesh);

    // --- Edge wireframe ---
    let edgesGeo = new EdgesGeometry(geo, 15);
    const edgeMat = new LineBasicMaterial({
      color: 0xF5EDE0,
      transparent: true,
      opacity: 0.08,
    });
    const edges = new LineSegments(edgesGeo, edgeMat);
    scene.add(edges);

    // --- Shape morph targets ---
    const shapeTargets = buildShapeTargets(vertexCount, icoPositions);

    // --- Resize ---
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const a = r.width / r.height;
      renderer.setSize(r.width, r.height);
      camera.left   = -frust * a / 2;
      camera.right  =  frust * a / 2;
      camera.top    =  frust / 2;
      camera.bottom = -frust / 2;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    // Frame counter for throttled edge updates
    let edgeFrame = 0;

    threeRef.current = {
      scene, camera, renderer, mesh, edges,
      geo, mat, edgeMat, edgesGeo,
      shapeTargets, icoPositions, vertexCount,
      ro, frust,
      get edgeFrame() { return edgeFrame; },
      set edgeFrame(v) { edgeFrame = v; },
    };
  }, [buildShapeTargets]);

  const disposeThree = useCallback(() => {
    const t = threeRef.current;
    if (!t) return;

    t.ro.disconnect();
    t.geo.dispose();
    t.edges.geometry.dispose();
    t.mat.dispose();
    t.edgeMat.dispose();
    t.renderer.dispose();
    t.renderer.forceContextLoss();
    if (t.renderer.domElement?.parentNode) {
      t.renderer.domElement.parentNode.removeChild(t.renderer.domElement);
    }
    threeRef.current = null;
  }, []);

  // ── Core animation tick ─────────────────────────────

  const animateFrame = useCallback((t, state, dt) => {
    const { elapsed, phase, cycle, resetProgress } = state;
    const {
      camera, renderer, scene, mesh, edges,
      geo, shapeTargets, vertexCount, edgeMat,
    } = t;

    const posAttr = geo.getAttribute('position');
    const positions = posAttr.array;
    const numShapes = shapeTargets.length;

    // -- Title visibility --
    if (phase === 'intro') {
      setShowTitle(elapsed < 2.0);
    } else if (phase === 'running' || phase === 'ending') {
      setShowTitle(false);
    }

    // -- Reset crossfade veil --
    if (phase === 'resetting') {
      renderer.domElement.style.opacity = String(clamp(1 - resetProgress, 0, 1));
      renderer.render(scene, camera);
      return;
    }
    renderer.domElement.style.opacity = '1';

    // -- Morph calculation --
    const shapeOffset = cycle % numShapes;
    const segLen = MORPH_DURATION + MORPH_PAUSE;
    const morphTime = Math.max(0, elapsed - 0.5); // slight initial hold
    const seg = Math.floor(morphTime / segLen);
    const segProg = morphTime - seg * segLen;

    const fromIdx = (shapeOffset + seg) % numShapes;
    const toIdx   = (shapeOffset + seg + 1) % numShapes;
    const from = shapeTargets[fromIdx];
    const to   = shapeTargets[toIdx];

    // Raw morph t: ease within the transition, hold at 1 during pause
    let morphT = segProg < MORPH_DURATION
      ? easeInOutCubic(clamp(segProg / MORPH_DURATION, 0, 1))
      : 1;

    // Ending: gradually freeze morph and slow rotation
    if (phase === 'ending') {
      const endProg = clamp((elapsed - 50) / 10, 0, 1);
      const freeze = easeInOutCubic(endProg);
      // Blend morphT toward a frozen value (wherever we were at t=50)
      morphT = lerp(morphT, clamp(morphT, 0, 0.95), freeze * 0.9);
    }

    // -- Breathing (subtle radial pulsation) --
    const breathSpeed = 0.4;
    const breathAmp = 0.03 + 0.015 * Math.sin(elapsed * 0.13);
    const breath = 1 + Math.sin(elapsed * breathSpeed * TAU) * breathAmp;

    // -- Vertex update --
    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      positions[i3]     = lerp(from[i3],     to[i3],     morphT) * breath;
      positions[i3 + 1] = lerp(from[i3 + 1], to[i3 + 1], morphT) * breath;
      positions[i3 + 2] = lerp(from[i3 + 2], to[i3 + 2], morphT) * breath;
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    // -- Edge wireframe update (throttled — every 6 frames) --
    t.edgeFrame++;
    if (t.edgeFrame % 6 === 0) {
      edges.geometry.dispose();
      edges.geometry = new EdgesGeometry(geo, 15);
    }

    // -- Rotation (slow, meditative) --
    const rotY = elapsed * 0.08;
    const rotX = elapsed * 0.05 * 0.3;
    mesh.rotation.set(rotX, rotY, 0);
    edges.rotation.set(rotX, rotY, 0);

    // -- Camera orbit from cursor --
    const m = mouseRef.current;
    m.x = lerp(m.x, m.tx, dt * 2.5);
    m.y = lerp(m.y, m.ty, dt * 2.5);

    const orbitMax = Math.PI / 9; // ~20 deg
    const camDist = 10;
    camera.position.set(
      Math.sin(m.x * orbitMax) * camDist,
      -Math.sin(m.y * orbitMax) * camDist * 0.6,
      Math.cos(m.x * orbitMax) * camDist,
    );
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    // -- Edge opacity pulse --
    edgeMat.opacity = 0.06 + 0.04 * Math.sin(elapsed * 0.5);

    renderer.render(scene, camera);
  }, []);

  // ── Lifecycle: mount / unmount on visibility ────────

  useEffect(() => {
    if (!isVisible) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      disposeThree();
      return;
    }

    restart();
    setShowTitle(true);
    initThree();
    prevTimeRef.current = performance.now();

    const loop = (now) => {
      const dt = Math.min((now - prevTimeRef.current) / 1000, 0.05);
      prevTimeRef.current = now;

      const t = threeRef.current;
      if (t) {
        const state = timerRef.current.tick(dt);
        if (onTimerUpdate) onTimerUpdate(state.progress, state.elapsed);
        animateFrame(t, state, dt);
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      disposeThree();
    };
  }, [isVisible, initThree, disposeThree, restart, animateFrame]);

  // ── Render ──────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        background: '#07070E',
      }}
    >
      {/* Three.js canvas is inserted as first child */}

      {/* Title overlay (first cycle intro only) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 10,
          opacity: showTitle ? 1 : 0,
          transition: 'opacity 1.2s ease',
        }}
      >
        <h2
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 42,
            letterSpacing: '0.08em',
            color: palette?.accent || 'hsla(38, 25%, 85%, 0.8)',
            margin: 0,
            textShadow: '0 0 40px rgba(0,0,0,0.8)',
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: 'italic',
            fontWeight: 300,
            fontSize: 16,
            letterSpacing: '0.06em',
            color: 'hsla(38, 20%, 65%, 0.5)',
            margin: '12px 0 0',
            textShadow: '0 0 30px rgba(0,0,0,0.8)',
          }}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
