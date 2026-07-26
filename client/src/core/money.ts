// Money formatting. Phaser-free so it stays trivially unit-testable, and shared
// by every widget that shows a figure. Balances travel as integer cents
// end-to-end (see docs/adr/0002-money-as-cents.md); this is the only place they
// become something a player reads.

/**
 * Render integer `cents` as a grouped dollar string, e.g. `$1,000,000.00`.
 *
 * The cents are ALWAYS shown. Reaching exactly $0 is the win condition, so a
 * balance of 40 cents must read `$0.40` and not `$0` — a rounded-down `$0` on a
 * wallet that hasn't won yet looks like a broken game.
 */
export function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const amount = Math.abs(cents) / 100;
  return `${sign}$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
