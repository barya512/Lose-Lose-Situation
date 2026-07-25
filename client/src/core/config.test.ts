import { describe, it, expect } from 'vitest';
import { rollChance } from './config';

describe('rollChance', () => {
  it('fires when the roll is below the chance', () => {
    expect(rollChance(0.5, () => 0.49)).toBe(true);
  });

  it('does not fire when the roll is at or above the chance', () => {
    expect(rollChance(0.5, () => 0.5)).toBe(false);
    expect(rollChance(0.5, () => 0.9)).toBe(false);
  });

  it('never fires at chance 0', () => {
    expect(rollChance(0, () => 0)).toBe(false);
  });

  it('always fires at chance 1', () => {
    expect(rollChance(1, () => 0.999999)).toBe(true);
  });
});
