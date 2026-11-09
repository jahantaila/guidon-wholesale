import { Easing, interpolate } from 'remotion';

/** Smooth, unhurried in-out. Nothing bouncy (DESIGN.md: restraint). */
export const smooth = Easing.bezier(0.45, 0, 0.2, 1);
/** Settles quickly, for entrances. Matches DESIGN.md --ease-out. */
export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

export type Key<T> = { at: number } & T;

/**
 * Piecewise-eased value along keyframes. Holds the first value before the
 * first key and the last value after the last key.
 */
export function track<T>(frame: number, keys: Key<T>[], get: (k: Key<T>) => number): number {
  if (keys.length === 0) return 0;
  if (frame <= keys[0].at) return get(keys[0]);
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (frame <= b.at) {
      return interpolate(frame, [a.at, b.at], [get(a), get(b)], { easing: smooth });
    }
  }
  return get(keys[keys.length - 1]);
}

/** 0→1 between two frames, clamped, with easing. */
export function ramp(frame: number, from: number, to: number, easing = easeOut): number {
  return interpolate(frame, [from, to], [0, 1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
