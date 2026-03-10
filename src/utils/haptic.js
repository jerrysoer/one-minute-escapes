/**
 * Subtle haptic feedback via Vibration API.
 * Whispers, not shouts. The user should think "did my phone just vibrate?"
 */

export function pulse(ms = 15) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

export function doubleTap() {
  if (navigator.vibrate) navigator.vibrate([10, 30, 10]);
}

export function thump() {
  if (navigator.vibrate) navigator.vibrate(80);
}
