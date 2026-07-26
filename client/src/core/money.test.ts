import { describe, it, expect } from 'vitest';
import { dollars } from './money';

describe('dollars', () => {
  it('renders whole dollars with two decimals', () => {
    expect(dollars(100)).toBe('$1.00');
  });

  it('groups thousands', () => {
    expect(dollars(100_000_000)).toBe('$1,000,000.00');
  });

  it('keeps the cents visible', () => {
    // The win condition is EXACTLY $0, so a non-zero balance must never
    // round down to "$0" — the player would think the game was broken.
    expect(dollars(40)).toBe('$0.40');
    expect(dollars(1)).toBe('$0.01');
  });

  it('renders an empty wallet as $0.00', () => {
    expect(dollars(0)).toBe('$0.00');
  });

  it('keeps the sign on a negative balance', () => {
    expect(dollars(-250)).toBe('-$2.50');
  });
});
