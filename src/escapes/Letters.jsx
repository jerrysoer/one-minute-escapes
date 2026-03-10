import { useRef, useEffect, useCallback } from 'react';
import { useCanvas } from '../hooks/useCanvas';
import { useTimer } from '../hooks/useTimer';
import { lerp, clamp, seededRandom, dist, TAU } from '../utils/math';

const MAX_LETTERS = 220;
const GRAVITY_ACCEL = 60;
const WORD_CHECK_INTERVAL = 10; // seconds between word formation attempts
const WORD_LIFETIME = 8; // seconds before a word dissolves
const SCATTER_RADIUS = 200;
const SCATTER_FORCE = 300;

const WORDS = [
  'dream', 'light', 'river', 'stone', 'flame', 'cloud', 'ocean', 'ghost',
  'bloom', 'ember', 'frost', 'shade', 'drift', 'gleam', 'pulse', 'trace',
  'depth', 'swirl', 'spark', 'glow', 'mist', 'wave', 'dusk', 'dawn',
  'moon', 'star', 'wind', 'rain', 'dust', 'song', 'haze', 'void',
  'silk', 'bone', 'seed', 'root', 'leaf', 'bark', 'tide', 'foam',
  'ash', 'ink', 'ore', 'dew', 'hum', 'arc', 'rim', 'vow',
  'echo', 'myth', 'lore', 'rune', 'sage', 'vale', 'wane', 'zeal',
  'calm', 'wild', 'soft', 'bold', 'warm', 'cool', 'deep', 'vast',
  'hope', 'love', 'time', 'soul', 'mind', 'flow', 'rise', 'fall',
  'blue', 'gold', 'jade', 'ruby', 'onyx', 'opal', 'iron', 'salt',
  'home', 'path', 'gate', 'edge', 'peak', 'cave', 'glen', 'cove',
  'still', 'quiet', 'swift', 'grace', 'truth', 'peace', 'bliss', 'north',
  'south', 'earth', 'water', 'magic', 'honey', 'amber', 'cedar', 'ivory',
  'haven', 'shore', 'marsh', 'field', 'ridge', 'grove', 'brook', 'cliff',
  'wraith', 'cipher', 'gentle', 'wander', 'linger', 'belong', 'listen',
  'breath', 'tender', 'solace', 'wonder', 'hidden', 'silver', 'golden',
  'spirit', 'forest', 'meadow', 'cosmos', 'nebula', 'aurora', 'sunset',
  'velvet', 'marble', 'pebble', 'ripple', 'candle', 'shadow', 'mirror',
];

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

function createLetter(rng, w, h, char) {
  return {
    char: char || ALPHABET[Math.floor(rng() * 26)],
    x: rng() * w,
    y: -20 - rng() * h * 0.3,
    vx: (rng() - 0.5) * 20,
    vy: 10 + rng() * 30,
    rotation: (rng() - 0.5) * 0.5,
    rotationVel: (rng() - 0.5) * 2,
    opacity: 0.4 + rng() * 0.3,
    size: 14 + rng() * 10,
    inWord: false,
    wordGlow: 0,
    targetX: 0,
    targetY: 0,
    springActive: false,
  };
}

export default function Letters({ isVisible, title, subtitle, onTimerUpdate }) {
  const stateRef = useRef(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const { tick, restart } = useTimer();
  const lastWordCheck = useRef(0);
  const formedWords = useRef([]);

  const initState = useCallback((w, h, seed) => {
    const rng = seededRandom(seed);
    const letters = [];
    for (let i = 0; i < MAX_LETTERS; i++) {
      letters.push(createLetter(rng, w, h));
    }
    // Bias: spawn letters that are in common words more frequently
    const commonChars = WORDS.slice(0, 40).join('');
    for (let i = 0; i < 40; i++) {
      const ci = Math.floor(rng() * commonChars.length);
      letters[i].char = commonChars[ci];
    }

    stateRef.current = { letters, rng, seed };
    lastWordCheck.current = -5; // 5s delay before first word attempt
    formedWords.current = [];
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

  // Click to scatter
  const handleClick = useCallback((e) => {
    const state = stateRef.current;
    if (!state) return;
    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    for (const letter of state.letters) {
      const d = dist(letter.x, letter.y, cx, cy);
      if (d < SCATTER_RADIUS) {
        const angle = Math.atan2(letter.y - cy, letter.x - cx);
        const force = (1 - d / SCATTER_RADIUS) * SCATTER_FORCE;
        letter.vx += Math.cos(angle) * force;
        letter.vy += Math.sin(angle) * force;
        letter.inWord = false;
        letter.springActive = false;
        letter.wordGlow = 0;
      }
    }
  }, []);

  const canvasRef = useCanvas(
    (ctx, w, h, dt) => {
      const timer = tick(dt);
      const { progress, phase, cycle, resetProgress, elapsed } = timer;
      if (onTimerUpdate) onTimerUpdate(progress, elapsed);
      const state = stateRef.current;
      if (!state) return;

      if (phase === 'resetting' && resetProgress < 0.05) {
        initState(w, h, cycle * 4919 + 3);
      }

      // Clear
      ctx.fillStyle = '#07070E';
      ctx.fillRect(0, 0, w, h);

      const letters = state.letters;

      // Expire old words — release letters back to freefall
      for (let fi = formedWords.current.length - 1; fi >= 0; fi--) {
        const fw = formedWords.current[fi];
        fw.age += dt;
        if (fw.age > WORD_LIFETIME) {
          // Release all letters in this word
          for (const l of fw.letters) {
            l.inWord = false;
            l.springActive = false;
            l.wordGlow = 0;
            l.vy = 15 + state.rng() * 20;
            l.vx = (state.rng() - 0.5) * 30;
          }
          formedWords.current.splice(fi, 1);
        }
      }

      // Word formation check — every ~10s, max 2 active words
      lastWordCheck.current += dt;
      if (lastWordCheck.current > WORD_CHECK_INTERVAL && phase === 'running' && formedWords.current.length < 2) {
        lastWordCheck.current = 0;
        const formed = tryFormWord(letters, state.rng, w, h, formedWords.current);
        if (formed) formedWords.current.push(formed);
      }

      // Update letters
      for (let i = 0; i < letters.length; i++) {
        const l = letters[i];

        if (l.springActive && l.inWord) {
          // Spring toward target
          const dx = l.targetX - l.x;
          const dy = l.targetY - l.y;
          l.vx += dx * 3;
          l.vy += dy * 3;
          l.vx *= 0.85;
          l.vy *= 0.85;
          l.rotationVel *= 0.9;
          l.wordGlow = Math.min(1, l.wordGlow + dt * 2);
        } else {
          // Gravity + drift
          l.vy += GRAVITY_ACCEL * dt;
          l.vx *= 0.995;
        }

        // Ending phase: freeze
        if (phase === 'ending') {
          l.vx *= 0.95;
          l.vy *= 0.95;
        }

        l.x += l.vx * dt;
        l.y += l.vy * dt;
        l.rotation += l.rotationVel * dt;

        // Wrap
        if (l.y > h + 30) {
          l.y = -20;
          l.x = state.rng() * w;
          l.vy = 10 + state.rng() * 20;
          l.vx = (state.rng() - 0.5) * 15;
          l.inWord = false;
          l.springActive = false;
          l.wordGlow = 0;
        }
        if (l.x < -30) l.x = w + 20;
        if (l.x > w + 30) l.x = -20;
      }

      // Draw letters
      for (const l of letters) {
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.inWord ? 0 : l.rotation);

        if (l.wordGlow > 0) {
          // Gold glow for words
          ctx.shadowColor = 'hsla(38, 50%, 70%, 0.8)';
          ctx.shadowBlur = 12 * l.wordGlow;
          ctx.fillStyle = `hsla(38, 40%, 90%, ${0.7 + l.wordGlow * 0.3})`;
        } else {
          ctx.shadowBlur = 0;
          ctx.fillStyle = `hsla(38, 25%, 90%, ${l.opacity})`;
        }

        ctx.font = `300 ${l.inWord ? l.size + 2 : l.size}px "Cormorant Garamond", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(l.char, 0, 0);
        ctx.restore();
      }

      // Fade word glow as it ages (last 2s of lifetime)
      for (const fw of formedWords.current) {
        const fadeStart = WORD_LIFETIME - 2;
        const fade = fw.age > fadeStart ? 1 - (fw.age - fadeStart) / 2 : 1;
        for (const l of fw.letters) {
          l.wordGlow = Math.max(0, l.wordGlow * clamp(fade, 0, 1));
        }
      }

      // Title overlay
      if (cycle === 0 && phase === 'intro') {
        const titleAlpha = clamp(1 - (elapsed - 1.5), 0, 1);
        if (titleAlpha > 0) {
          ctx.save();
          ctx.globalAlpha = titleAlpha;
          ctx.shadowBlur = 0;
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

      // Crossfade veil
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

function tryFormWord(letters, rng, w, h, existingWords) {
  // Try a few random words until one has available letters
  for (let attempt = 0; attempt < 5; attempt++) {
    const word = WORDS[Math.floor(rng() * WORDS.length)];

    // Find available (non-word) letters matching each character
    const available = letters.filter((l) => !l.inWord && l.y > 0 && l.y < h);
    const assigned = [];
    const used = new Set();
    let success = true;

    for (const char of word) {
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < available.length; i++) {
        if (used.has(i)) continue;
        if (available[i].char === char) {
          const d = Math.abs(available[i].x - w / 2) + Math.abs(available[i].y - h / 2);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
          }
        }
      }
      if (bestIdx === -1) { success = false; break; }
      assigned.push(available[bestIdx]);
      used.add(bestIdx);
    }

    if (!success) continue;

    // Pick a Y position that doesn't overlap existing words (min 60px apart)
    let targetY;
    for (let yAttempt = 0; yAttempt < 10; yAttempt++) {
      targetY = h * (0.2 + rng() * 0.6);
      const tooClose = existingWords.some((ew) => Math.abs(ew.y - targetY) < 60);
      if (!tooClose) break;
    }

    // Slight horizontal offset — not always dead center
    const xOffset = (rng() - 0.5) * w * 0.3;
    const fontSize = 22;
    const totalWidth = word.length * fontSize * 0.65;
    const startX = w / 2 - totalWidth / 2 + xOffset;

    for (let i = 0; i < assigned.length; i++) {
      assigned[i].inWord = true;
      assigned[i].springActive = true;
      assigned[i].targetX = startX + i * fontSize * 0.65 + fontSize * 0.3;
      assigned[i].targetY = targetY;
      assigned[i].size = fontSize;
    }

    return { word, x: w / 2 + xOffset, y: targetY, alpha: 1, age: 0, letters: assigned };
  }

  return null; // couldn't form any word
}
