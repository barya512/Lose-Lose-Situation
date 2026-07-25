// Client-side playtest knobs. Phaser-free on purpose so the pure helpers here
// stay trivially unit-testable. Editing these constants hot-reloads via Vite —
// no backend restart — which is exactly what mid-playtest tuning wants.

/**
 * Probability that a celebrated (money-LOST) slot spin also plays the
 * squash-and-stretch win reaction. Kept here so it can be tweaked live during
 * playtests. See `juice.winReaction`.
 */
export const WIN_JUICE_CHANCE = 0.35;

/**
 * Pure probability gate: true iff `rng()` lands below `chance`.
 * `chance <= 0` never fires; `chance >= 1` always fires.
 * The rng is injectable so callers (and tests) control the roll.
 */
export function rollChance(chance: number, rng: () => number = Math.random): boolean {
  return rng() < chance;
}
