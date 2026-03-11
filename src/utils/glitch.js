/**
 * Pixel glitch effect during cycle reset crossfade.
 * Captures current canvas, downscales to blocky pixels, then renders at full size.
 * Duration: 0.3s within the 1.5s reset window.
 */

const GLITCH_RES_W = 80;
const GLITCH_RES_H = 45;
const GLITCH_DURATION = 0.3; // seconds
const GLITCH_START = 0.15; // start at 15% into reset (just before peak blackout)
const GLITCH_END = GLITCH_START + (GLITCH_DURATION / 1.5); // normalized

// Reusable offscreen canvas for downscaling
let _offscreen = null;
let _offCtx = null;

function getOffscreen() {
  if (!_offscreen) {
    _offscreen = document.createElement('canvas');
    _offscreen.width = GLITCH_RES_W;
    _offscreen.height = GLITCH_RES_H;
    _offCtx = _offscreen.getContext('2d');
  }
  return { canvas: _offscreen, ctx: _offCtx };
}

/**
 * Apply pixel glitch effect during reset phase.
 * Call this BEFORE drawing the veil overlay.
 *
 * @param {CanvasRenderingContext2D} ctx - Main canvas context
 * @param {HTMLCanvasElement} sourceCanvas - The canvas element to capture from
 * @param {number} w - Logical width
 * @param {number} h - Logical height
 * @param {number} resetProgress - 0 to 1 progress through the reset phase
 * @returns {boolean} Whether the glitch was applied this frame
 */
export function applyPixelGlitch(ctx, sourceCanvas, w, h, resetProgress) {
  if (resetProgress < GLITCH_START || resetProgress > GLITCH_END) {
    return false;
  }

  const { canvas: off, ctx: offCtx } = getOffscreen();

  // Downscale: nearest-neighbor (no smoothing)
  offCtx.imageSmoothingEnabled = false;
  offCtx.drawImage(sourceCanvas, 0, 0, GLITCH_RES_W, GLITCH_RES_H);

  // Clear and render blocky pixels at full size
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(off, 0, 0, GLITCH_RES_W, GLITCH_RES_H, 0, 0, w, h);
  ctx.restore();

  return true;
}
