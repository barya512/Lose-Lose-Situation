import { describe, it, expect } from 'vitest';
import { stepReelCount } from './slotLogic';

describe('stepReelCount', () => {
  it('steps up and down by one within range', () => {
    expect(stepReelCount(3, +1, 3, 5)).toBe(4);
    expect(stepReelCount(4, +1, 3, 5)).toBe(5);
    expect(stepReelCount(5, -1, 3, 5)).toBe(4);
  });

  it('clamps at the minimum', () => {
    expect(stepReelCount(3, -1, 3, 5)).toBe(3);
  });

  it('clamps at the maximum', () => {
    expect(stepReelCount(5, +1, 3, 5)).toBe(5);
  });

  it('never leaves the 3-5 range even from an out-of-range value', () => {
    expect(stepReelCount(6, +1, 3, 5)).toBe(5);
    expect(stepReelCount(2, -1, 3, 5)).toBe(3);
  });
});
