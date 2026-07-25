// Pure slot-machine UI logic. Phaser-free so it stays unit-testable.

/**
 * Step the active reel count by `delta` (typically ±1 from the +/- buttons),
 * clamped to the inclusive `[min, max]` range the backend advertises via
 * `SlotInfo.min_reels`/`max_reels`. An already out-of-range `current` is pulled
 * back inside the range.
 */
export function stepReelCount(current: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, current + delta));
}
