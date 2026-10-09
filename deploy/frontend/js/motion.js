/*
  Shared motion helpers for the 3D scenes.

  Two kinds of motion are used, on purpose:
  - `tween` for one-off events with a clear start and end (switching scenes, a
    result being revealed);
  - `approach` for values that follow the form while you drag a slider. Each
    frame it moves a fixed share of the remaining distance, so a value can be
    retargeted mid-way without restarting an animation. That is what makes the
    mushroom grow smoothly under a slider instead of stuttering.

  Under prefers-reduced-motion both jump straight to the end.
*/

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ease = {
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  outBack: (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  inBack: (t) => { const c = 1.6; return (c + 1) * t * t * t - c * t * t; },
};

const tweens = new Set();

export function tween(duration, onUpdate, { easing = ease.outCubic, delay = 0, onDone } = {}) {
  if (reducedMotion || duration <= 0) {
    onUpdate(1);
    if (onDone) onDone();
    return;
  }
  tweens.add({ start: performance.now() + delay, duration, onUpdate, easing, onDone });
}

export function runTweens(now) {
  for (const tw of tweens) {
    if (now < tw.start) continue;
    const p = Math.min(1, (now - tw.start) / tw.duration);
    tw.onUpdate(tw.easing(p));
    if (p >= 1) {
      tweens.delete(tw);
      if (tw.onDone) tw.onDone();
    }
  }
}

/* Frame-rate independent step towards a target. `rate` is how fast, roughly
   "per second"; 12 settles in about a quarter of a second. */
export function approach(current, target, dt, rate = 12) {
  if (reducedMotion) return target;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/* Seeded random numbers, so a habitat or a city always looks the same. */
export function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
