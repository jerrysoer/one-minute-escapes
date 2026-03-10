# CLAUDE.md — One Minute Escapes

## Project Overview

A collection of 7 full-screen, generative art experiences arranged as a vertical scroll feed. Each "escape" runs in 60-second cycles that loop with a fresh seed until the user scrolls to the next one. No backend, no database — pure frontend generative art.

**Repo:** `github.com/jerrysoer/one-minute-escapes`
**Deploy:** GitHub Pages at `https://jerrysoer.github.io/one-minute-escapes/`
**Stack:** React (Vite) + Canvas 2D + Three.js (Unfold only) + CSS scroll-snap + Inline styles
**PRD:** See `One-Minute-Escapes-PRD.md` in project root

---

## Step 1: Mandatory Skill Loading

**BEFORE writing any code, read these skill files. Every task, every time.**

```
/read-file /mnt/skills/public/frontend-design/SKILL.md
/read-file /mnt/skills/user/frontend-design/SKILL.md
```

These are always-on. No exceptions. Every escape is a design artifact — visual quality is the entire product.

**Security review before any deployment:**
```
/read-file /vibesec
```

---

## Step 2: Task-Triggered Skills

Load these when the task matches:

| Task | Skill | When |
|------|-------|------|
| Canvas particle systems (Murmuration, Erosion, Letters, Gravity) | `/frontend-developer` | Building or debugging any Canvas 2D escape |
| Three.js origami (Unfold) | `/frontend-developer` | Building the Unfold escape only |
| Raindrop fluid physics (Rain) | `/frontend-developer` | Building the Rain escape |
| Landscape rendering (Migration) | `/frontend-developer` | Building the Migration escape |
| Scroll-snap + IntersectionObserver architecture | `/frontend-developer` | Building App.jsx shell and useVisibility hook |
| Mobile scroll-snap behavior, touch interactions | `/mobile-ux-optimizer` | Mobile testing pass |
| Phase 1 completion review | `/code-reviewer` | After all 7 escapes are built |
| Deployment, README, OG tags | `/project-shipper` | Launch prep |
| Frame rate issues, memory leaks | `/debugger` | When things break |

---

## Step 3: Disabled MCPs

All MCPs are disabled for this project. This is a pure frontend project with zero external data dependencies.

```
disabledMcpServers:
  - supabase
  - replicate
  - seedance
  - searchapi
  - youtube-analytics
  - alpaca
  - exa
  - diffbot
```

---

## Step 4: Model Routing

**Default: Sonnet**

**Use Opus for:**
- Initial scaffold from the PRD (scroll architecture + visibility observer + 7 escape components + cycle logic)
- Unfold escape (Three.js 3D origami fold geometry and sequential animation math)
- Performance optimization pass after all 7 escapes are built

---

## Project Conventions

### No Backend

This project has NO database, NO auth, NO API calls, NO environment variables, NO Supabase. Do not create `.env` files. Do not import Supabase clients. Do not create analytics tables. Everything runs client-side in the browser.

### Interaction Model: Scroll Feed + Loop

**This is the core interaction. Get it right.**

The app is a vertical scroll-snap feed — like TikTok but for generative art. Each escape is a full-viewport section (`100vh`). The user scrolls vertically to move between escapes.

Key behaviors:
1. **Scroll up = advance to next escape.** Scroll down = go back to previous.
2. **If the user stays, the escape loops.** Each escape runs a 60-second cycle, then crossfades (1.5-2s dim → reset → fade in) to a new cycle with a fresh generative seed.
3. **Only the visible escape animates.** Off-screen escapes are paused (rAF cancelled).
4. **Scrolling to any escape starts it fresh** — even one the user has already seen. Every visit is a new seed.
5. **No end card.** No "Again?" button. No interstitial screens between escapes. The loop IS the continuation. Scrolling IS the navigation.

### Scroll Architecture

```html
<div style="height: 100vh; overflow-y: scroll; scroll-snap-type: y mandatory;">
  <section style="height: 100vh; scroll-snap-align: start;">
    <!-- Escape component + overlay UI -->
  </section>
  <!-- ... repeat for each escape -->
</div>
```

**Visibility detection:** `IntersectionObserver` with threshold 0.5 on each section. When an escape becomes visible (>50% in viewport), start its rAF loop. When it leaves (<50%), cancel rAF and release resources.

### File Structure

```
one-minute-escapes/
├── index.html
├── package.json
├── vite.config.js                  ← base: '/one-minute-escapes/'
├── .github/workflows/deploy.yml    ← GitHub Pages deploy
├── public/favicon.svg
├── src/
│   ├── main.jsx
│   ├── App.jsx                     ← Scroll container, IntersectionObserver, state
│   ├── index.css                   ← Reset + scroll-snap base styles
│   ├── data/escapes.ts             ← Escape registry (metadata array)
│   ├── escapes/
│   │   ├── Murmuration.jsx
│   │   ├── Rain.jsx
│   │   ├── Erosion.jsx
│   │   ├── Letters.jsx
│   │   ├── Gravity.jsx
│   │   ├── Migration.jsx
│   │   └── Unfold.jsx
│   ├── components/
│   │   ├── TimerArc.jsx            ← Resets to 0 each cycle
│   │   ├── PositionDots.jsx        ← Vertical, right edge
│   │   ├── ScrollHint.jsx          ← "scroll to explore", first escape only
│   │   └── ShareButton.jsx
│   └── hooks/
│       ├── useTimer.js             ← 60s cycle with auto-loop reset
│       ├── useCanvas.js            ← Canvas setup, DPR, resize
│       └── useVisibility.js        ← IntersectionObserver wrapper
├── README.md
├── CLAUDE.md
└── .gitignore
```

### Rendering Approach

- **Canvas 2D** for 6 of 7 escapes (Murmuration, Rain, Erosion, Letters, Gravity, Migration)
- **Three.js r128** for Unfold only — lazy-load via dynamic `import()` so it doesn't bloat initial bundle
- **Inline styles + `<style>` tags** — no CSS modules, no Tailwind, no styled-components
- **Google Fonts:** `Cormorant Garamond` (italic, weight 300) for titles/UI text. Load via `<link>` in index.html.

### Color System

```
--void:          #07070E          (page background, cycle transitions)
--text-primary:  hsla(38, 30%, 85%, 0.9)   (titles)
--text-muted:    hsla(38, 20%, 65%, 0.5)   (subtitles, scroll hint)
--text-ghost:    hsla(38, 15%, 55%, 0.3)   (attribution, timer)
--timer-track:   hsla(38, 15%, 50%, 0.12)  (timer arc bg)
--timer-fill:    hsla(38, 30%, 75%, 0.5)   (timer arc progress)
```

Each escape defines its own accent palette. The shell chrome uses the tokens above.

### Typography Rules

- **Display:** `Cormorant Garamond`, italic, weight 300. Escape titles, attribution. Letter-spacing 0.08em.
- **Timer only:** `'JetBrains Mono', 'SF Mono', monospace`. 11px. Ghost opacity.
- **NEVER use:** Inter, Roboto, Arial, Space Grotesk, or any generic sans-serif.

### Animation & Performance Rules

1. **Only one escape runs at a time.** The IntersectionObserver pauses off-screen escapes. This is the #1 performance rule.

2. **Every escape MUST cancel its `requestAnimationFrame` when:**
   - The component unmounts
   - The escape scrolls out of view (isVisible becomes false)
   - Store the rAF ID in a ref. Cancel in useEffect cleanup AND in visibility change handler.

3. **Cap devicePixelRatio at 2.**
```javascript
const dpr = Math.min(window.devicePixelRatio || 1, 2);
```

4. **Use spatial hashing** for particle neighbor lookups in Murmuration, Letters, and any escape with >100 particles.

5. **Pre-allocate particle arrays.** No GC pressure per frame.

6. **Target frame budget: <16ms (60fps).** Mobile floor: 33ms (30fps).

7. **Canvas clear strategy:** Semi-transparent fill for motion trails. Full clear for escapes that need clean redraws (Migration landscape).

### Cycle Timer Contract

The `useTimer` hook manages the 60-second looping cycle:

```typescript
interface TimerState {
  progress: number;      // 0 to 1 within current cycle
  phase: 'intro' | 'running' | 'ending' | 'resetting';
  elapsed: number;       // seconds elapsed in current cycle
  cycle: number;         // which cycle we're on (0, 1, 2, ...)
  restart: () => void;   // force restart with new seed
}
```

Phase transitions:
- `intro` (0-2.5s): title displayed on FIRST cycle only. Animation begins gently.
- `running` (2.5-50s): full animation.
- `ending` (50-60s): escape-specific wind-down (dispersal, fade, freeze, etc.)
- `resetting` (60-61.5s): crossfade to black, escape reinitializes with new seed, fade back in. Timer resets to 0. Phase transitions back to `running` (no intro title on subsequent cycles).

### Escape Component Interface

Every escape component follows this contract:

```typescript
interface EscapeProps {
  isVisible: boolean;    // from IntersectionObserver — controls rAF
  progress: number;      // 0 to 1 within current cycle
  phase: 'intro' | 'running' | 'ending' | 'resetting';
  cycle: number;         // which loop iteration
  onCycleEnd: () => void; // triggers reset in useTimer
}
```

When `isVisible` becomes false → cancel rAF immediately.
When `isVisible` becomes true → reinitialize with fresh seed, start rAF.
When `phase` becomes `'resetting'` → dim canvas, reinitialize state, prepare for new cycle.

### Scroll Behavior Rules

- `scroll-snap-type: y mandatory` on the outer container
- `scroll-snap-align: start` on each section
- **Test on iOS Safari** — scroll-snap behavior varies. Use `-webkit-overflow-scrolling: touch`.
- The scroll hint ("scroll to explore") appears only on the first escape, only during the first visit. It disappears after the first scroll event and never returns.
- Position dots on the right edge are clickable — they use `element.scrollIntoView({ behavior: 'smooth' })` to jump.
- **No horizontal scrolling.** No carousel. Strictly vertical feed.

### Build Order

Build in this order (validated prototype first, hardest last):

1. **App shell** — scroll container, IntersectionObserver, useTimer with loop, section layout
2. **Murmuration** — port approved prototype into component architecture with loop support
3. **Rain** — emotionally resonant, straightforward physics
4. **Letters** — crowd-pleasing word emergence, moderate complexity
5. **Gravity** — satisfying click interaction, n-body physics
6. **Erosion** — heightmap erosion, novel technique
7. **Migration** — most rendering layers (landscape + creatures + season transition)
8. **Unfold** — Three.js, most complex, build last. Has a fallback plan.
9. **Polish pass** — scroll hint, position dots, share button, OG tags, README

### What NOT to Build

- No localStorage or sessionStorage (not supported in artifact environment)
- No analytics tables or tracking
- No auth or user accounts
- No external API calls at runtime
- No service workers or PWA manifest
- No dark/light mode toggle (dark only, always)
- No settings panel or configuration UI
- No audio in Phase 1 (MusicGen tracks + Web Audio API integration is Phase 2 — full spec in PRD)
- No end cards or interstitial screens between escapes
- No arrow key navigation (scroll only)
- No horizontal navigation or carousel

---

## Current Work: Phase 1

Build the scroll-feed shell + all 7 escapes + looping cycle logic + overlay UI.

### Phase 1 Acceptance Criteria

- [ ] All 7 escapes render at 60fps on desktop Chrome, Safari, Firefox
- [ ] Vertical scroll-snap navigates between escapes cleanly
- [ ] Only the visible escape runs its animation loop
- [ ] Each escape loops with a 1.5-2s crossfade and fresh seed on cycle end
- [ ] Each cycle is visually distinct from the previous
- [ ] Timer arc fills over 60s and resets on each cycle
- [ ] "Scroll to explore" hint on first escape, disappears after first scroll
- [ ] Position dots on right edge reflect current escape
- [ ] Share button after 2+ escapes viewed
- [ ] Page loads in <2s on 4G (<500KB gzipped excluding Three.js)
- [ ] Mobile scroll-snap works on iOS Safari and Chrome Android
- [ ] Mobile escapes at 30fps minimum
- [ ] No console errors in production build
- [ ] OG meta tags set
- [ ] README complete
- [ ] GitHub Actions deploys to GitHub Pages on push to main

### Escape-Specific Criteria

| Escape | Must Demonstrate |
|--------|------------------|
| Murmuration | Flock self-organizes. Cursor attracts. Last 10s: dispersal. Loop: reforms from chaos. |
| Rain | Drops merge into rivulets. Light gray → gold in final 15s. Loop: glass clears, restarts. |
| Erosion | Channels carved by wind. Lace-like final frame. Loop: surface rebuilds, new wind. |
| Letters | Words emerge 2-3×/cycle. Click scatters. Loop: new letter rain, different words. |
| Gravity | N-body orbits. Click adds orbs. Final merge. Loop: merged orb splits into fresh set. |
| Migration | Winter → spring over 60s. Loop: snap to winter, new terrain, restart. |
| Unfold | 2+ shape transformations. Loop: continues from previous cycle's incomplete form. |

---

## Context Hygiene

- This is a **STATIC SITE with a SCROLL FEED**. If you find yourself reaching for Supabase, a database, an API route, or server-side logic — stop.
- The scroll-snap + IntersectionObserver architecture is the foundation. Get this working FIRST (in the App shell build step) before building any individual escape.
- Every escape is **SELF-CONTAINED**. Escapes do not share state. The only shared state lives in App.jsx (which escape is visible, which have been viewed, cycle count per escape).
- The **cycle crossfade** must feel like a breath, not a glitch. Test it by watching a single escape loop 3-4 times. If the reset is jarring, the whole experience falls apart.
- The visual quality of each escape IS the product. Spend time on easing curves, color palettes, particle behavior, and the emotional arc of each 60-second cycle.
- When in doubt about a design decision, choose the option that makes the experience feel more like a film and less like an app.
